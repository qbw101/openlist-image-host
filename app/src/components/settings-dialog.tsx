import { useEffect, useState } from "react";
import {
  Server,
  User,
  Lock,
  FolderOpen,
  Globe,
  Loader2,
  CheckCircle2,
  XCircle,
  Hash,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OpenListSettings } from "@/types";
import { login, listFiles } from "@/lib/openlist";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: OpenListSettings;
  onSave: (next: Partial<OpenListSettings>) => void;
  isConfigured: boolean;
  isAdmin?: boolean;
  onRequireAuth?: () => void;
}

type TestState = "idle" | "testing" | "success" | "error";

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onSave,
  isConfigured,
  isAdmin = true,
  onRequireAuth,
}: Props) {
  const [form, setForm] = useState<OpenListSettings>(settings);
  const [testState, setTestState] = useState<TestState>("idle");
  const [testMsg, setTestMsg] = useState("");

  useEffect(() => {
    if (open) {
      setForm(settings);
      setTestState("idle");
      setTestMsg("");
    }
  }, [open, settings]);

  const update = (key: keyof OpenListSettings, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setTestState("idle");
  };

  const handleTest = async () => {
    if (!form.serverUrl || !form.username || !form.password) {
      toast.error("请填写服务器地址、用户名和密码");
      return;
    }
    setTestState("testing");
    setTestMsg("");
    try {
      const token = await login(form.serverUrl, form.username, form.password);
      // 尝试列出上传目录
      await listFiles(
        { ...form, token },
        form.uploadPath || "/"
      );
      setTestState("success");
      setTestMsg("连接成功！");
      // 保存 token
      onSave({ ...form, token });
      toast.success("连接测试成功");
    } catch (e) {
      setTestState("error");
      setTestMsg(e instanceof Error ? e.message : "连接失败");
    }
  };

  const handleSave = () => {
    if (!form.serverUrl || !form.username || !form.password) {
      toast.error("请填写完整的服务器信息");
      return;
    }
    // 未登录管理员时要求验证
    if (!isAdmin) {
      onRequireAuth?.();
      toast.info("保存配置需要管理员验证");
      return;
    }
    const toSave: Partial<OpenListSettings> = {
      serverUrl: form.serverUrl.replace(/\/+$/, ""),
      username: form.username,
      password: form.password,
      uploadPath: form.uploadPath || "/images",
      customDomain: form.customDomain.replace(/\/+$/, ""),
      namingStrategy: form.namingStrategy,
    };
    // 如果服务器地址或密码变了，清除旧 token
    if (
      form.serverUrl !== settings.serverUrl ||
      form.username !== settings.username ||
      form.password !== settings.password
    ) {
      toSave.token = "";
    }
    onSave(toSave);
    toast.success("设置已保存");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="size-5" />
            OpenList 服务器配置
          </DialogTitle>
          <DialogDescription>
            配置你的 OpenList 服务器信息，用于图片上传和管理
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 服务器地址 */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Server className="size-3.5 text-muted-foreground" />
              服务器地址
            </Label>
            <Input
              placeholder="https://pan.example.com"
              value={form.serverUrl}
              onChange={(e) => update("serverUrl", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              你的 OpenList 服务地址，不要带尾部斜杠
            </p>
          </div>

          {/* 用户名 & 密码 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <User className="size-3.5 text-muted-foreground" />
                用户名
              </Label>
              <Input
                placeholder="admin"
                value={form.username}
                onChange={(e) => update("username", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Lock className="size-3.5 text-muted-foreground" />
                密码
              </Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
              />
            </div>
          </div>

          {/* 上传路径 */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <FolderOpen className="size-3.5 text-muted-foreground" />
              上传目录路径
            </Label>
            <Input
              placeholder="/images"
              value={form.uploadPath}
              onChange={(e) => update("uploadPath", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              图片上传到的目录路径，建议设置为公开访问
            </p>
          </div>

          {/* 自定义域名 */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Globe className="size-3.5 text-muted-foreground" />
              自定义域名 / CDN（可选）
            </Label>
            <Input
              placeholder="https://cdn.example.com"
              value={form.customDomain}
              onChange={(e) => update("customDomain", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              用于生成图片链接的域名，留空则使用服务器地址
            </p>
          </div>

          {/* 命名策略 */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Hash className="size-3.5 text-muted-foreground" />
              文件命名策略
            </Label>
            <Select
              value={form.namingStrategy}
              onValueChange={(v) => update("namingStrategy", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="timestamp">时间戳命名（避免冲突）</SelectItem>
                <SelectItem value="original">保持原文件名</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 测试结果 */}
          {testState !== "idle" && (
            <div
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                testState === "success"
                  ? "bg-green-500/10 text-green-600 dark:text-green-400"
                  : testState === "error"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {testState === "testing" && (
                <Loader2 className="size-4 animate-spin" />
              )}
              {testState === "success" && (
                <CheckCircle2 className="size-4" />
              )}
              {testState === "error" && <XCircle className="size-4" />}
              <span>{testState === "testing" ? "正在测试连接..." : testMsg}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleTest} disabled={testState === "testing"}>
            <Loader2 className={`size-4 ${testState === "testing" ? "animate-spin" : "hidden"}`} />
            测试连接
          </Button>
          <Button onClick={handleSave}>
            {isConfigured ? "保存设置" : "保存并开始使用"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
