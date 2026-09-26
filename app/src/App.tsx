import { useCallback, useEffect, useState } from "react";
import { Settings, ImageIcon, RefreshCw, CloudUpload, LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SettingsDialog } from "@/components/settings-dialog";
import { UploadZone } from "@/components/upload-zone";
import { ImageGallery } from "@/components/image-gallery";
import { ImageLightbox } from "@/components/image-lightbox";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useSettings } from "@/hooks/use-settings";
import { AdminLoginDialog } from "@/components/admin-login-dialog";
import { listImages, deleteFiles } from "@/lib/openlist";
import type { ImageItem } from "@/types";
import "./App.css";

function AppContent() {
  const { settings, saveSettings, isConfigured, hasCredential, loaded } = useSettings();
  const {
    isLoggedIn: isAdmin,
    serverInitialized,
    setup: adminSetup,
    login: adminLogin,
    logout: adminLogout,
    isLocked,
    remainingLockSeconds,
  } = useAdminAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<ImageItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ImageItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 首次加载：未配置且是管理员则打开设置
  useEffect(() => {
    if (loaded && !isConfigured && isAdmin) {
      setSettingsOpen(true);
    }
  }, [loaded, isConfigured, isAdmin]);

  // 服务端管理员凭据未初始化时，自动弹出首次设置
  useEffect(() => {
    if (serverInitialized === false) {
      setAdminLoginOpen(true);
    }
  }, [serverInitialized]);

  // 加载图片列表（OpenList 鉴权由服务端代理处理，前端不持有 token）
  const loadImages = useCallback(async () => {
    if (!isConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const imgs = await listImages(settings);
      setImages(imgs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载图片列表失败");
    } finally {
      setLoading(false);
    }
  }, [isConfigured, settings]);

  // 配置好后自动加载
  useEffect(() => {
    if (isConfigured && loaded) {
      loadImages();
    }
  }, [isConfigured, loaded, settings.serverUrl, settings.uploadPath, settings.customDomain]);

  // 删除确认
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteFiles(settings, settings.uploadPath, [deleteTarget.name]);
      setImages((prev) => prev.filter((i) => i.path !== deleteTarget.path));
      toast.success("图片已删除");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
              <CloudUpload className="size-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-none">OpenList 图床</h1>
              <p className="text-[10px] text-muted-foreground">基于 OpenList 对象存储</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {isAdmin && isConfigured && (
              <Button
                variant="ghost"
                size="sm"
                onClick={loadImages}
                disabled={loading}
                className="hidden sm:flex"
              >
                <RefreshCw className={`mr-1.5 size-4 ${loading ? "animate-spin" : ""}`} />
                刷新
              </Button>
            )}
            <ThemeToggle />
            {isAdmin ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSettingsOpen(true)}
                  title="设置"
                >
                  <Settings className="size-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={adminLogout}
                  title="退出登录"
                >
                  <LogOut className="size-5" />
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setAdminLoginOpen(true)}
                title="管理员登录"
              >
                <LogIn className="size-5" />
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {/* 统计卡片 */}
        {isConfigured && images.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-2xl font-bold">{images.length}</p>
              <p className="text-xs text-muted-foreground">图片总数</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-2xl font-bold">
                {formatTotalSize(images)}
              </p>
              <p className="text-xs text-muted-foreground">占用空间</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="truncate text-sm font-medium">
                {settings.uploadPath}
              </p>
              <p className="text-xs text-muted-foreground">存储路径</p>
            </div>
          </div>
        )}

        {/* 上传区域 / 未配置提示 */}
        {isConfigured ? (
          isAdmin ? (
            <UploadZone
              settings={settings}
              onUploaded={loadImages}
              disabled={!isConfigured}
            />
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-8 text-center">
              <p className="text-sm text-muted-foreground">
                游客模式：仅可查看图片。管理员登录后可上传、修改配置。
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setAdminLoginOpen(true)}
              >
                <LogIn className="mr-1.5 size-4" />
                管理员登录
              </Button>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed py-16 text-center">
            <div className="mb-3 rounded-full bg-primary/10 p-4">
              <ImageIcon className="size-10 text-primary" />
            </div>
            <h2 className="text-xl font-bold">欢迎使用 OpenList 图床</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              基于 OpenList 对象存储的图床服务，支持拖拽上传、一键复制链接
            </p>
            {isAdmin ? (
              <Button onClick={() => setSettingsOpen(true)} className="mt-4">
                <Settings className="mr-2 size-4" />
                配置 OpenList 服务器
              </Button>
            ) : (
              <>
                <p className="mt-4 text-sm text-muted-foreground">
                  图床尚未配置，请联系管理员
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setAdminLoginOpen(true)}
                >
                  <LogIn className="mr-1.5 size-4" />
                  管理员登录
                </Button>
              </>
            )}
          </div>
        )}

        {/* 图库 */}
        <ImageGallery
          images={images}
          loading={loading}
          error={error}
          onImageClick={setLightbox}
          onDelete={setDeleteTarget}
          onRefresh={loadImages}
          onConfigure={() => setSettingsOpen(true)}
          isConfigured={isConfigured}
          canDelete={isAdmin}
        />
      </main>

      {/* Footer */}
      <footer className="border-t py-4">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-muted-foreground">
          OpenList 图床 · 基于 React + Tailwind CSS + shadcn/ui 构建
        </div>
      </footer>

      {/* 设置弹窗 */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSave={saveSettings}
        isConfigured={isConfigured}
        hasCredential={hasCredential}
        isAdmin={isAdmin}
        onRequireAuth={() => {
          setSettingsOpen(false);
          setAdminLoginOpen(true);
        }}
      />

      {/* 管理员登录 / 首次设置弹窗 */}
      <AdminLoginDialog
        open={adminLoginOpen}
        onOpenChange={setAdminLoginOpen}
        onLogin={serverInitialized === false ? adminSetup : adminLogin}
        isLocked={isLocked}
        remainingLockSeconds={remainingLockSeconds}
        setupMode={serverInitialized === false}
      />

      {/* 灯箱预览 */}
      <ImageLightbox
        image={lightbox}
        onClose={() => setLightbox(null)}
        onDelete={(img) => setDeleteTarget(img)}
        canDelete={isAdmin}
      />

      {/* 删除确认 */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除？</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除图片 <span className="font-medium">{deleteTarget?.name}</span> 吗？
              此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** 计算总大小 */
function formatTotalSize(images: ImageItem[]): string {
  const total = images.reduce((sum, img) => sum + img.size, 0);
  if (total === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(total) / Math.log(k));
  return `${(total / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
