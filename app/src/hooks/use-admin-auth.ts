import { useCallback, useEffect, useState } from "react";

/** 登录态（本地 UI 状态） */
const AUTH_KEY = "openlist-image-host-admin-auth";
/** 管理员凭据缓存（用于 /api/config 写入鉴权，仅存在管理员自己的浏览器） */
export const CREDENTIAL_KEY = "openlist-image-host-admin-credential";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 分钟

interface AdminAuthState {
  isLoggedIn: boolean;
  failedAttempts: number;
  lockedUntil: number; // 毫秒时间戳
}

interface LoginResult {
  ok: boolean;
  error?: string;
  locked?: boolean;
  remainingLockSeconds?: number;
}

const getDefaultState = (): AdminAuthState => ({
  isLoggedIn: false,
  failedAttempts: 0,
  lockedUntil: 0,
});

/**
 * 取出本机缓存的管理员凭据，拼成服务端鉴权请求头。
 * 仅用于调用需要管理员权限的接口（写配置、测试连接）。
 */
export function adminAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  try {
    const cred = JSON.parse(
      localStorage.getItem(CREDENTIAL_KEY) || "null"
    ) as { username?: string; password?: string } | null;
    if (cred?.username && cred?.password) {
      headers["x-admin-username"] = cred.username;
      headers["x-admin-password"] = cred.password;
    }
  } catch {
    // ignore
  }
  return headers;
}

export function useAdminAuth() {
  const [state, setState] = useState<AdminAuthState>(getDefaultState);
  /** 服务端是否已初始化管理员凭据；null = 检查中，false = 需要首次设置 */
  const [serverInitialized, setServerInitialized] = useState<boolean | null>(null);

  // 加载本地登录态 + 检查服务端凭据状态
  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (raw) {
        setState((prev) => ({ ...prev, ...JSON.parse(raw) }));
      }
    } catch {
      // ignore
    }
    fetch("/api/admin/status")
      .then((r) => r.json())
      .then((d) => setServerInitialized(Boolean(d?.initialized)))
      .catch(() => setServerInitialized(null));
  }, []);

  const save = useCallback((next: Partial<AdminAuthState>) => {
    setState((prev) => {
      const merged = { ...prev, ...next };
      try {
        localStorage.setItem(AUTH_KEY, JSON.stringify(merged));
      } catch {
        // ignore
      }
      return merged;
    });
  }, []);

  /** 首次设置管理员账户（服务端尚无凭据时允许） */
  const setup = useCallback(
    async (username: string, password: string): Promise<LoginResult> => {
      if (!username || !password) return { ok: false, error: "请输入用户名和密码" };
      if (password.length < 6) return { ok: false, error: "密码至少 6 位" };
      try {
        const res = await fetch("/api/admin/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          return { ok: false, error: data.error || "设置失败" };
        }
        try {
          localStorage.setItem(
            CREDENTIAL_KEY,
            JSON.stringify({ username, password })
          );
        } catch {
          // ignore
        }
        save({ isLoggedIn: true, failedAttempts: 0, lockedUntil: 0 });
        return { ok: true };
      } catch {
        return { ok: false, error: "网络错误，无法连接服务器" };
      }
    },
    [save]
  );

  /** 登录（服务端验证凭据，5 次失败锁定 15 分钟） */
  const login = useCallback(
    async (username: string, password: string): Promise<LoginResult> => {
      if (state.lockedUntil > Date.now()) {
        return {
          ok: false,
          locked: true,
          error: "登录已锁定",
          remainingLockSeconds: Math.ceil((state.lockedUntil - Date.now()) / 1000),
        };
      }
      if (!username || !password) return { ok: false, error: "请输入用户名和密码" };
      try {
        const res = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          try {
            localStorage.setItem(
              CREDENTIAL_KEY,
              JSON.stringify({ username, password })
            );
          } catch {
            // ignore
          }
          save({ isLoggedIn: true, failedAttempts: 0, lockedUntil: 0 });
          return { ok: true };
        }
        // 服务端锁定
        if (res.status === 429 && data.lockedUntil) {
          save({ isLoggedIn: false, failedAttempts: MAX_ATTEMPTS, lockedUntil: data.lockedUntil });
          return {
            ok: false,
            locked: true,
            error: "登录失败次数过多",
            remainingLockSeconds: Math.ceil((data.lockedUntil - Date.now()) / 1000),
          };
        }
        const attempts = state.failedAttempts + 1;
        const lockedUntil =
          attempts >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0;
        save({ isLoggedIn: false, failedAttempts: attempts, lockedUntil });
        return {
          ok: false,
          error: lockedUntil ? "登录失败次数过多，已锁定" : "用户名或密码错误",
          locked: Boolean(lockedUntil),
          remainingLockSeconds: lockedUntil ? Math.ceil(LOCKOUT_MS / 1000) : 0,
        };
      } catch {
        return { ok: false, error: "网络错误，无法连接服务器" };
      }
    },
    [state, save]
  );

  const logout = useCallback(() => {
    save({ isLoggedIn: false });
    try {
      localStorage.removeItem(CREDENTIAL_KEY);
    } catch {
      // ignore
    }
  }, [save]);

  /** 服务端未初始化时，本地旧登录态一律视为未登录 */
  const isLoggedIn = serverInitialized === false ? false : state.isLoggedIn;
  const isLocked = state.lockedUntil > Date.now();
  const remainingLockSeconds = isLocked
    ? Math.ceil((state.lockedUntil - Date.now()) / 1000)
    : 0;

  return {
    isLoggedIn,
    isLocked,
    remainingLockSeconds,
    failedAttempts: state.failedAttempts,
    serverInitialized,
    setup,
    login,
    logout,
  };
}
