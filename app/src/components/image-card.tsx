import { useState } from "react";
import {
  Copy,
  Trash2,
  Maximize2,
  Check,
  Link2,
  Code2,
  FileCode,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { ImageItem } from "@/types";
import { formatSize } from "@/lib/openlist";

interface Props {
  image: ImageItem;
  onClick: () => void;
  onDelete: (image: ImageItem) => void;
  canDelete?: boolean;
}

export function ImageCard({ image, onClick, onDelete, canDelete = true }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (format: "url" | "markdown" | "html" | "bbcode") => {
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
      // fallback: textarea + execCommand（兼容非 HTTPS / HTTP 环境）
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

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          onClick={onClick}
          className="group relative aspect-square cursor-pointer overflow-hidden rounded-xl border bg-muted/30"
        >
          {/* 加载中 */}
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* 图片 */}
          <img
            src={image.thumb}
            alt={image.name}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            className={`size-full object-cover transition-all duration-300 group-hover:scale-105 ${
              loaded ? "opacity-100" : "opacity-0"
            }`}
          />

          {/* hover 遮罩 */}
          <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/70 via-transparent to-black/20 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            {/* 顶部操作按钮 */}
            <div className="flex justify-end gap-1 p-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  copy("url");
                }}
                className="flex size-8 items-center justify-center rounded-lg bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/40"
                title="复制链接"
              >
                {copied === "url" ? (
                  <Check className="size-4" />
                ) : (
                  <Link2 className="size-4" />
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  copy("markdown");
                }}
                className="flex size-8 items-center justify-center rounded-lg bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/40"
                title="复制 Markdown"
              >
                {copied === "markdown" ? (
                  <Check className="size-4" />
                ) : (
                  <Code2 className="size-4" />
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClick();
                }}
                className="flex size-8 items-center justify-center rounded-lg bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/40"
                title="预览"
              >
                <Maximize2 className="size-4" />
              </button>
              {canDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(image);
                  }}
                  className="flex size-8 items-center justify-center rounded-lg bg-red-500/40 text-white backdrop-blur-sm transition-colors hover:bg-red-500/70"
                  title="删除"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>

            {/* 底部文件信息 / 点击复制 URL */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                copy("url");
              }}
              className="w-full p-2 text-left text-white transition-colors hover:bg-white/10"
              title="点击复制图片地址"
            >
              <p className="truncate text-xs font-medium">{image.name}</p>
              <p className="text-[10px] opacity-80">{formatSize(image.size)} · 点击复制 URL</p>
            </button>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => copy("url")}>
          <Link2 className="mr-2 size-4" /> 复制链接
        </ContextMenuItem>
        <ContextMenuItem onClick={() => copy("markdown")}>
          <Code2 className="mr-2 size-4" /> 复制 Markdown
        </ContextMenuItem>
        <ContextMenuItem onClick={() => copy("html")}>
          <FileCode className="mr-2 size-4" /> 复制 HTML
        </ContextMenuItem>
        <ContextMenuItem onClick={() => copy("bbcode")}>
          <Copy className="mr-2 size-4" /> 复制 BBCode
        </ContextMenuItem>
        {canDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => onDelete(image)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 size-4" /> 删除图片
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
