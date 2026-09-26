import { useState } from "react";
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
import { Lock, User, AlertCircle, KeyRound } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 登录（已初始化）或首次设置（未初始化） */
  onLogin: (username: string, password: string) => Promise<{
    ok: boolean;
    error?: string;
    locked?: boolean;
    remainingLockSeconds?: number;
  }>;
  isLocked: boolean;
  remainingLockSeconds: number;
  /** true = 首次设置管理员账户 */
  setupMode?: boolean;
}

export function AdminLoginDialog({
  open,
  onOpenChange,
  onLogin,
  isLocked,
  remainingLockSeconds,
  setupMode = false,
}: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked || submitting) return;

    if (!username || !password) {
      setError("请输入用户名和密码");
      return;
    }
    if (setupMode) {
      if (password.length < 6) {
        setError("密码至少 6 位");
        return;
      }
      if (password !== confirmPassword) {
        setError("两次输入的密码不一致");
        return;
      }
    }

    setSubmitting(true);
    const result = await onLogin(username, password);
    setSubmitting(false);

    if (result.ok) {
      setUsername("");
      setPassword("");
      setConfirmPassword("");
      setError("");
      onOpenChange(false);
    } else if (result.locked) {
      setError(result.error || "登录已锁定");
    } else {
      setError(result.error || "用户名或密码错误");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {setupMode ? (
              <>
                <KeyRound className="size-5" />
                设置管理员账户
              </>
              ) : (
                <>
                  <Lock className="size-5" />
                  管理员登录
                </>
              )}
          </DialogTitle>
          <DialogDescription>
            {setupMode
              ? "首次使用，请设置管理员用户名和密码"
              : "登录后可上传图片、修改服务器配置"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {isLocked && !setupMode && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 flex-shrink-0" />
              <div>
                <p className="font-medium">登录已锁定</p>
                <p>失败次数过多，请 {formatRemaining(remainingLockSeconds)} 后再试。</p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="size-4" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <User className="size-3.5 text-muted-foreground" />
              用户名
            </Label>
            <Input
              placeholder="管理员用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLocked || submitting}
              autoComplete="username"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Lock className="size-3.5 text-muted-foreground" />
              密码
            </Label>
            <Input
              type="password"
              placeholder={setupMode ? "至少 6 位" : "管理员密码"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLocked || submitting}
              autoComplete={setupMode ? "new-password" : "current-password"}
            />
          </div>

          {setupMode && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Lock className="size-3.5 text-muted-foreground" />
                确认密码
              </Label>
              <Input
                type="password"
                placeholder="再次输入密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={submitting}
                autoComplete="new-password"
              />
            </div>
          )}

          <DialogFooter>
            {!setupMode && (
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
            )}
            <Button type="submit" disabled={isLocked || submitting}>
              {submitting ? "验证中..." : setupMode ? "完成设置" : "登录"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formatRemaining(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins} 分 ${secs} 秒`;
  }
  return `${secs} 秒`;
}
