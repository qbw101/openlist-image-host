import { useCallback, useEffect, useState } from "react";
import type { OpenListSettings, ServerConfig } from "@/types";
import { adminAuthHeaders } from "@/hooks/use-admin-auth";

const DEFAULT_SETTINGS: OpenListSettings = {
  serverUrl: "",
  username: "",
  password: "",
  uploadPath: "/",
  customDomain: "",
  namingStrategy: "timestamp",
};

export function useSettings() {
  const [settings, setSettings] = useState<OpenListSettings>(DEFAULT_SETTINGS);
  const [isConfigured, setIsConfigured] = useState(false);
  const [hasCredential, setHasCredential] = useState(false);
  const [loaded, setLoaded] = useState(false);

  /**
   * 从服务端读取脱敏配置。
   * 刻意不使用 localStorage 缓存：配置以服务端为唯一真相来源，
   * 否则换了配置后旧设备的本地缓存会一直生效。
   */
  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/config", { cache: "no-store" });
      const cfg = (await res.json()) as ServerConfig;
      setIsConfigured(Boolean(cfg?.configured));
      setHasCredential(Boolean(cfg?.hasCredential));
      setSettings((prev) => ({
        ...prev,
        serverUrl: cfg?.serverUrl ?? "",
        uploadPath: cfg?.uploadPath ?? "/",
        customDomain: cfg?.customDomain ?? "",
        namingStrategy: cfg?.namingStrategy === "original" ? "original" : "timestamp",
      }));
    } catch {
      setIsConfigured(false);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  /**
   * 保存配置到服务端（需管理员权限）。
   * username / password 留空表示保持服务端已有值。
   */
  const saveSettings = useCallback(
    async (next: Partial<OpenListSettings>): Promise<boolean> => {
      setSettings((prev) => ({ ...prev, ...next }));

      const payload: Record<string, unknown> = {
        serverUrl: next.serverUrl,
        uploadPath: next.uploadPath,
        customDomain: next.customDomain,
        namingStrategy: next.namingStrategy,
      };
      if (next.username) payload.username = next.username;
      if (next.password) payload.password = next.password;

      try {
        const res = await fetch("/api/config", {
          method: "POST",
          headers: adminAuthHeaders(),
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) return false;

        const cfg = data.config as ServerConfig | undefined;
        if (cfg) {
          setIsConfigured(Boolean(cfg.configured));
          setHasCredential(Boolean(cfg.hasCredential));
          setSettings((prev) => ({
            ...prev,
            serverUrl: cfg.serverUrl ?? prev.serverUrl,
            uploadPath: cfg.uploadPath ?? prev.uploadPath,
            customDomain: cfg.customDomain ?? prev.customDomain,
            namingStrategy:
              cfg.namingStrategy === "original" ? "original" : "timestamp",
            // 凭据只留在服务端，清掉表单里的明文
            username: "",
            password: "",
          }));
        }
        return true;
      } catch {
        return false;
      }
    },
    []
  );

  return { settings, saveSettings, isConfigured, hasCredential, loaded, reload };
}
