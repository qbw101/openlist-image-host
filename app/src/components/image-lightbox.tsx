import { useEffect, useState } from "react";
import {
  X,
  Copy,
  Check,
  Link2,
  Code2,
  FileCode,
  Trash2,
  Download,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ImageItem } from "@/types";
import { formatSize, formatDate } from "@/lib/openlist";

interface Props {
  image: ImageItem | null;
  onClose: () => void;
  onDelete: (image: ImageItem) => void;
  canDelete?: boolean;
}

export function ImageLightbox({ image, onClose, onDelete, canDelete = true }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!image) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [image, onClose]);

  useEffect(() => {
    if (image) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [image]);

  if (!image) return null;

  const copy = async (format: string) => {
    let text = "";
    switch (format) {
      case "url":
        text = image.shareUrl;
        break;
      case "markdown":
        text = `![${image.name}](${image.shareUrl})`;
        break;
      case "html":
        text = `<img src="${image.shareUrl}" alt="${image.name}" />`;
        break;
      case "bbcode":
        text = `[img]${image.shareUrl}[/img]`;
        break;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;left:-9999px;top:-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(format);
    toast.success("已复制到剪贴板");
    setTimeout(() => setCopied(null), 1500);
  };

  const handleDelete = () => {
    onDelete(image);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* 顶部栏 */}
      <div
        className="flex items-center justify-between p-4 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{image.name}</p>
          <p className="text-xs text-white/60">
            {formatSize(image.size)} · {formatDate(image.modified)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/10"
            onClick={() => window.open(image.url, "_blank")}
            title="在新标签页打开"
          >
            <ExternalLink className="size-5" />
          </Button>
          {canDelete && (
            <Button
              size="icon"
              variant="ghost"
              className="text-white hover:bg-white/10"
              onClick={handleDelete}
              title="删除"
            >
              <Trash2 className="size-5" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/10"
            onClick={onClose}
            title="关闭"
          >
            <X className="size-5" />
          </Button>
        </div>
      </div>

      {/* 图片主体 */}
      <div
        className="flex min-h-0 flex-1 items-center justify-center p-4"
        onClick={onClose}
      >
        <img
          src={image.url}
          alt={image.name}
          className="max-h-full max-w-full rounded-lg object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* 底部操作栏 */}
      <div
        className="p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
          {/* URL */}
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-white/10 px-3 py-2">
            <code className="truncate text-sm text-white/80">{image.shareUrl}</code>
          </div>

          {/* 复制按钮组 */}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => copy("url")}
              className="gap-1.5"
            >
              {copied === "url" ? (
                <Check className="size-4" />
              ) : (
                <Link2 className="size-4" />
              )}
              URL
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => copy("markdown")}
              className="gap-1.5"
            >
              {copied === "markdown" ? (
                <Check className="size-4" />
              ) : (
                <Code2 className="size-4" />
              )}
              Markdown
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => copy("html")}
              className="gap-1.5"
            >
              {copied === "html" ? (
                <Check className="size-4" />
              ) : (
                <FileCode className="size-4" />
              )}
              HTML
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => copy("bbcode")}
              className="gap-1.5"
            >
              {copied === "bbcode" ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
              BBCode
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const a = document.createElement("a");
                a.href = image.url;
                a.download = image.name;
                a.click();
              }}
              className="gap-1.5"
            >
              <Download className="size-4" />
              下载
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
