import { useCallback, useEffect, useState } from "react";
import type { OpenListSettings } from "@/types";
import { CREDENTIAL_KEY } from "@/hooks/use-admin-auth";

const STORAGE_KEY = "openlist-image-host-settings";

const DEFAULT_SETTINGS: OpenListSettings = {
  serverUrl: "",
  username: "",
  password: "",
  uploadPath: "/images",
  customDomain: "",
  token: "",
  namingStrategy: "timestamp",
};

export function useSettings() {
  const [settings, setSettings] = useState<OpenListSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // 1. 优先从 localStorage 读取（本地缓存）
    let localSettings: OpenListSettings | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.serverUrl) {
          localSettings = { ...DEFAULT_SETTINGS, ...parsed };
        }
      }
    } catch {
      // ignore
    }

    if (localSettings) {
      setSettings(localSettings);
      setLoaded(true);
      return;
    }

    // 2. localStorage 为空，从服务器 config.json 加载
    fetch("./config.json")
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then((cfg) => {
        if (cfg && cfg.serverUrl) {
          const remote: OpenListSettings = { ...DEFAULT_SETTINGS, ...cfg };
          setSettings(remote);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {
        // config.json 不存在或格式错误，忽略
      })
      .finally(() => setLoaded(true));
  }, []);

  const saveSettings = useCallback((next: Partial<OpenListSettings>) => {
    setSettings((prev) => {
      const merged = { ...prev, ...next };
      // 写入 localStorage（本地缓存）
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch {
        // ignore
      }
      // 同步写入服务器 config.json（不含 token，token 由各设备自行获取）
      const { token: _token, ...configForServer } = merged;
      // 附带管理员凭据，服务端校验后才允许写入
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
      fetch("/api/config", {
        method: "POST",
        headers,
        body: JSON.stringify(configForServer),
      }).catch(() => {
        // 写入服务器失败不阻塞本地保存
      });
      return merged;
    });
  }, []);

  const isConfigured = Boolean(
    settings.serverUrl && settings.username && settings.password && settings.uploadPath
  );

  return { settings, saveSettings, isConfigured, loaded };
}
