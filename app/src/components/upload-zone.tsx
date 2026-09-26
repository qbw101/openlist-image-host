import { useCallback, useRef, useState } from "react";
import {
  CloudUpload,
  Loader2,
  CheckCircle2,
  XCircle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { OpenListSettings, UploadTask } from "@/types";
import {
  uploadFile,
  generateTimestampName,
  formatSize,
  buildFilePath,
  getFileSign,
  getShareUrl,
} from "@/lib/openlist";
import { isImageFile } from "@/types";

interface Props {
  settings: OpenListSettings;
  onUploaded: () => void;
  disabled?: boolean;
}

export function UploadZone({ settings, onUploaded, disabled }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const doUpload = useCallback(
    async (task: UploadTask) => {
      const filename =
        settings.namingStrategy === "timestamp"
          ? generateTimestampName(task.file.name)
          : task.file.name;
      const filePath = buildFilePath(settings.uploadPath, filename);

      try {
        await uploadFile(settings, filePath, task.file, (loaded, total) => {
          const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
          setTasks((prev) =>
            prev.map((t) => (t.id === task.id ? { ...t, progress: pct } : t))
          );
        });

        // OpenList 直链必须带 sign，上传后取一次签名以生成可用的分享链接
        let resultUrl: string | undefined;
        try {
          const sign = await getFileSign(settings, filePath);
          resultUrl = getShareUrl(settings, filePath, sign);
        } catch {
          // 取签名失败不影响上传结果，仅不显示链接
        }

        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id
              ? { ...t, status: "success", progress: 100, resultUrl }
              : t
          )
        );
      } catch (e) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  status: "error",
                  error: e instanceof Error ? e.message : "上传失败",
                }
              : t
          )
        );
      }
    },
    [settings]
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArr = Array.from(files).filter((f) => isImageFile(f.name));

      if (fileArr.length === 0) {
        toast.error("请选择图片文件（JPG/PNG/GIF/WebP/SVG/BMP/AVIF）");
        return;
      }

      const newTasks: UploadTask[] = fileArr.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        progress: 0,
        status: "uploading" as const,
      }));

      setTasks((prev) => [...newTasks, ...prev]);

      // 逐个上传
      for (const task of newTasks) {
        await doUpload(task);
      }

      onUploaded();
      toast.success(`${fileArr.length} 张图片上传完成`);
    },
    [doUpload, onUploaded]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles, disabled]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (disabled) return;
      const items = e.clipboardData.items;
      const files: File[] = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        handleFiles(files);
      }
    },
    [handleFiles, disabled]
  );

  const removeTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  /** HTTP 环境下 navigator.clipboard 不可用，回退到 execCommand */
  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("链接已复制");
      return;
    } catch {
      // fallthrough
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast.success("链接已复制");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  return (
    <div className="space-y-4" onPaste={handlePaste} tabIndex={0}>
      {/* 上传区域 */}
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all sm:p-12 ${
          dragOver
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
        } ${disabled ? "pointer-events-none opacity-50" : ""}`}
      >
        <div className="mb-3 rounded-full bg-primary/10 p-4">
          <CloudUpload className="size-10 text-primary" />
        </div>
        <p className="text-lg font-semibold">拖拽图片到此处上传</p>
        <p className="mt-1 text-sm text-muted-foreground">
          或点击选择文件 · 按 Ctrl+V 粘贴剪贴板图片
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          支持 JPG / PNG / GIF / WebP / SVG / BMP / AVIF
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* 上传任务列表 */}
      {tasks.length > 0 && (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 rounded-lg border bg-card p-3"
            >
              {/* 状态图标 */}
              <div className="flex-shrink-0">
                {task.status === "uploading" && (
                  <Loader2 className="size-5 animate-spin text-blue-500" />
                )}
                {task.status === "success" && (
                  <CheckCircle2 className="size-5 text-green-500" />
                )}
                {task.status === "error" && (
                  <XCircle className="size-5 text-destructive" />
                )}
              </div>

              {/* 文件信息 + 进度 */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {task.file.name}
                  </span>
                  <span className="flex-shrink-0 text-xs text-muted-foreground">
                    {formatSize(task.file.size)}
                  </span>
                </div>
                {task.status === "uploading" && (
                  <Progress value={task.progress} className="mt-1.5 h-1.5" />
                )}
                {task.status === "success" && task.resultUrl && (
                  <div className="mt-1 flex items-center gap-2">
                    <code className="truncate rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {task.resultUrl}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => task.resultUrl && copyUrl(task.resultUrl)}
                    >
                      复制
                    </Button>
                  </div>
                )}
                {task.status === "error" && (
                  <p className="mt-0.5 text-xs text-destructive">
                    {task.error}
                  </p>
                )}
              </div>

              {/* 关闭按钮 */}
              <Button
                size="icon"
                variant="ghost"
                className="size-7 flex-shrink-0"
                onClick={() => removeTask(task.id)}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
