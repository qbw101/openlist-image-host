import type { ImageItem, OpenListFile, OpenListSettings } from "@/types";
import { adminAuthHeaders } from "@/hooks/use-admin-auth";

/** 去除尾部斜杠 */
function trimSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

/**
 * 规范化服务器地址：确保带协议头、去除首尾空白与尾部斜杠。
 * 若用户只填了 IP:端口（如 192.168.1.1:5244），自动补 http://，
 * 否则浏览器会把该字符串当成相对路径拼到当前页面域名后，导致 404。
 */
function normalizeServerUrl(serverUrl: string): string {
  const url = (serverUrl || "").trim();
  if (!url) return "";
  const withScheme = /^https?:\/\//i.test(url) ? url : `http://${url}`;
  return withScheme.replace(/\/+$/, "");
}

/** 拼接路径 */
function joinPath(base: string, name: string): string {
  const b = trimSlash(base);
  return b.endsWith("/") ? `${b}${name}` : `${b}/${name}`;
}

/** 对 URL 路径逐段编码，同时保留斜杠 */
function encodeUrlPath(filePath: string): string {
  const normalized = filePath.startsWith("/") ? filePath : `/${filePath}`;
  return normalized
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

/** 统一解析代理响应：非 2xx 或 code != 200 时抛出可读错误 */
async function parseProxyResponse(res: Response, fallback: string): Promise<unknown> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || `${fallback}（HTTP ${res.status}）`);
  }
  if (data && typeof data.code === "number" && data.code !== 200) {
    throw new Error(data.message || fallback);
  }
  return data;
}

/**
 * 服务端实测 OpenList 连接（管理员）
 */
export async function testConnection(
  settings: Pick<OpenListSettings, "serverUrl" | "username" | "password" | "uploadPath">
): Promise<{ basePath: string; fileCount: number; sample: string }> {
  const res = await fetch("/api/config/test", {
    method: "POST",
    headers: adminAuthHeaders(),
    body: JSON.stringify({
      serverUrl: settings.serverUrl,
      username: settings.username,
      password: settings.password,
      uploadPath: settings.uploadPath || "/",
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `测试失败（HTTP ${res.status}）`);
  }
  return {
    basePath: String(data.basePath ?? ""),
    fileCount: Number(data.fileCount ?? 0),
    sample: String(data.sample ?? ""),
  };
}

/**
 * 上传文件（流式 PUT /api/fs/put），支持进度回调。
 * OpenList 凭据由服务端代理注入，浏览器不再持有 token。
 */
export function uploadFile(
  _settings: OpenListSettings,
  filePath: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `/openlist/api/fs/put`;

    xhr.open("PUT", url);
    xhr.setRequestHeader("File-Path", encodeURIComponent(filePath));
    xhr.setRequestHeader("Content-Type", "application/octet-stream");

    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) {
        onProgress(e.loaded, e.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.code === 200) {
            resolve();
          } else {
            reject(new Error(res.message || "上传失败"));
          }
        } catch {
          reject(new Error("服务器返回格式异常"));
        }
      } else if (xhr.status === 401) {
        reject(new Error("OpenList 认证失败，请在设置中检查账号密码"));
      } else {
        reject(new Error(`上传失败 (HTTP ${xhr.status})`));
      }
    };

    xhr.onerror = () => {
      reject(new Error("网络请求失败，请检查 OpenList 服务器是否可访问"));
    };

    xhr.send(file);
  });
}

/**
 * 获取文件列表（路径为「账号相对路径」）
 */
export async function listFiles(
  _settings: OpenListSettings,
  path: string,
  refresh = false
): Promise<OpenListFile[]> {
  const res = await fetch(`/openlist/api/fs/list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path,
      page: 1,
      per_page: 0,
      refresh,
      password: "",
    }),
  });

  const data = (await parseProxyResponse(res, "获取文件列表失败")) as {
    data?: { content?: OpenListFile[] };
  };
  return (data?.data?.content ?? []) as OpenListFile[];
}

/**
 * 删除文件
 */
export async function deleteFiles(
  _settings: OpenListSettings,
  dir: string,
  names: string[]
): Promise<void> {
  const res = await fetch(`/openlist/api/fs/remove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dir, names }),
  });
  await parseProxyResponse(res, "删除失败");
}

/**
 * 创建目录
 */
export async function makeDir(
  _settings: OpenListSettings,
  path: string
): Promise<void> {
  const res = await fetch(`/openlist/api/fs/mkdir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  await parseProxyResponse(res, "创建目录失败");
}

/**
 * 构造代理 URL（始终走服务器代理，用于图片加载/预览）
 * 服务端会补上账号 base_path 前缀，前端只需给「账号相对路径」。
 */
export function getDirectUrl(filePath: string, sign = ""): string {
  const p = encodeUrlPath(filePath);
  const signParam = sign ? `?sign=${encodeURIComponent(sign)}` : "";
  return `/openlist/d${p}${signParam}`;
}

/**
 * 拼接上传用的文件路径。
 * 用 joinPath 而非模板字符串，避免 uploadPath 为 "/" 时拼出 "//name"。
 */
export function buildFilePath(uploadPath: string, filename: string): string {
  return joinPath(uploadPath, filename);
}

/**
 * 取单个文件的签名（OpenList 的 /d/ 直链必须带 sign）。
 * 用于上传完成后立刻生成可用的复制链接。
 */
export async function getFileSign(
  _settings: OpenListSettings,
  filePath: string
): Promise<string> {
  const res = await fetch(`/openlist/api/fs/get`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: filePath, password: "" }),
  });
  const data = (await parseProxyResponse(res, "获取文件信息失败")) as {
    data?: { sign?: string };
  };
  return data?.data?.sign ?? "";
}

/**
 * 构造分享 URL（用于复制到 Markdown/HTML 等外部页面）
 * 分享地址必须是绝对公网 URL，并始终通过本站 /openlist 代理读取图片。
 */
export function getShareUrl(
  settings: OpenListSettings,
  filePath: string,
  sign = ""
): string {
  const p = encodeUrlPath(filePath);
  const signParam = sign ? `?sign=${encodeURIComponent(sign)}` : "";
  const origin = settings.customDomain
    ? normalizeServerUrl(settings.customDomain)
    : window.location.origin;
  return `${origin}/openlist/d${p}${signParam}`;
}

/**
 * 获取上传目录下所有图片
 */
export async function listImages(settings: OpenListSettings): Promise<ImageItem[]> {
  const files = await listFiles(settings, settings.uploadPath);
  return files
    .filter((f) => !f.is_dir)
    .filter((f) => {
      const ext = f.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
      return [
        ".jpg", ".jpeg", ".png", ".gif", ".webp",
        ".svg", ".bmp", ".ico", ".avif",
      ].includes(ext);
    })
    .map((f) => {
      const fullPath = joinPath(settings.uploadPath, f.name);
      return {
        name: f.name,
        size: f.size,
        modified: f.modified,
        url: getDirectUrl(fullPath, f.sign),
        thumb: getDirectUrl(fullPath, f.sign),
        shareUrl: getShareUrl(settings, fullPath, f.sign),
        path: fullPath,
      } as ImageItem;
    })
    .sort((a, b) => b.modified.localeCompare(a.modified));
}

/**
 * 生成时间戳文件名
 */
export function generateTimestampName(originalName: string): string {
  const ext = originalName.match(/\.[^.]+$/)?.[0] ?? "";
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}${ext}`;
}

/**
 * 格式化文件大小
 */
export function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

/**
 * 格式化日期
 */
export function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}
