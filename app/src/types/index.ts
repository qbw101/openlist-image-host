/** OpenList 服务器配置 */
export interface OpenListSettings {
  /** 服务器地址，如 https://pan.example.com */
  serverUrl: string;
  /** 用户名 */
  username: string;
  /** 密码 */
  password: string;
  /** 上传目录路径，如 /images */
  uploadPath: string;
  /** 自定义域名（CDN），留空则使用 serverUrl */
  customDomain: string;
  /** 登录后缓存的 token */
  token: string;
  /** 文件命名策略：original = 保持原名，timestamp = 时间戳命名 */
  namingStrategy: "original" | "timestamp";
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
