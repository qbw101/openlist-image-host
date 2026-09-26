/** OpenList 服务器配置 */
export interface OpenListSettings {
  /** 服务器地址，如 https://pan.example.com */
  serverUrl: string;
  /**
   * OpenList 用户名。
   * 仅作为设置表单的输入项：提交给服务端后由服务端持有，
   * 不会随脱敏配置回传到浏览器，也不写入 localStorage。
   */
  username: string;
  /** OpenList 密码。同上，留空表示保持服务端已有值 */
  password: string;
  /** 上传目录路径（账号相对路径），如 / 或 /images */
  uploadPath: string;
  /** 自定义域名（CDN），仅用于生成分享链接 */
  customDomain: string;
  /** 文件命名策略：original = 保持原名，timestamp = 时间戳命名 */
  namingStrategy: "original" | "timestamp";
}

/** 服务端返回的脱敏配置（不含账号密码） */
export interface ServerConfig {
  configured: boolean;
  serverUrl: string;
  uploadPath: string;
  customDomain: string;
  namingStrategy: "original" | "timestamp";
  hasCredential: boolean;
}

/** OpenList 文件列表项 */
export interface OpenListFile {
  name: string;
  size: number;
  is_dir: boolean;
  modified: string;
  sign: string;
  thumb: string;
  type: number;
}

/** 图片项（带直链） */
export interface ImageItem {
  name: string;
  size: number;
  modified: string;
  /** 图片加载/预览 URL（走代理） */
  url: string;
  /** 缩略图 URL（走代理） */
  thumb: string;
  /** 分享/复制 URL（有自定义域名时走自定义域名） */
  shareUrl: string;
  path: string;
}

/** 上传任务状态 */
export interface UploadTask {
  id: string;
  file: File;
  progress: number;
  status: "uploading" | "success" | "error";
  error?: string;
  resultUrl?: string;
}

/** 支持的图片格式 */
export const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".ico",
  ".avif",
];

/** 判断文件是否为图片 */
export function isImageFile(filename: string): boolean {
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  return IMAGE_EXTENSIONS.includes(ext);
}
