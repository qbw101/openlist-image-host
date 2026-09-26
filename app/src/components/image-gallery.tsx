import { ImageIcon, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageCard } from "@/components/image-card";
import type { ImageItem } from "@/types";

interface Props {
  images: ImageItem[];
  loading: boolean;
  error: string | null;
  onImageClick: (image: ImageItem) => void;
  onDelete: (image: ImageItem) => void;
  onRefresh: () => void;
  onConfigure: () => void;
  isConfigured: boolean;
  canDelete?: boolean;
}

export function ImageGallery({
  images,
  loading,
  error,
  onImageClick,
  onDelete,
  onRefresh,
  onConfigure,
  isConfigured,
  canDelete = true,
}: Props) {
  // 未配置
  if (!isConfigured) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
        <div className="mb-3 rounded-full bg-muted p-4">
          <AlertCircle className="size-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">尚未配置 OpenList 服务器</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          请先配置你的 OpenList 服务器信息，然后就可以开始上传图片了
        </p>
        <Button onClick={onConfigure} className="mt-4">
          配置服务器
        </Button>
      </div>
    );
  }

  // 加载中
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">图片列表</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // 错误
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
        <div className="mb-3 rounded-full bg-destructive/10 p-4">
          <AlertCircle className="size-8 text-destructive" />
        </div>
        <h3 className="text-lg font-semibold">加载失败</h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{error}</p>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" onClick={onRefresh}>
            <RefreshCw className="mr-2 size-4" /> 重试
          </Button>
          <Button variant="ghost" onClick={onConfigure}>
            修改配置
          </Button>
        </div>
      </div>
    );
  }

  // 空状态
  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
        <div className="mb-3 rounded-full bg-muted p-4">
          <ImageIcon className="size-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">还没有上传过图片</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          把图片拖到上方区域，或点击选择文件开始上传
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          图片列表
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            共 {images.length} 张
          </span>
        </h2>
        <Button variant="ghost" size="sm" onClick={onRefresh}>
          <RefreshCw className="mr-1.5 size-4" /> 刷新
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {images.map((image) => (
          <ImageCard
            key={image.path}
            image={image}
            onClick={() => onImageClick(image)}
            onDelete={onDelete}
            canDelete={canDelete}
          />
        ))}
      </div>
    </div>
  );
}
