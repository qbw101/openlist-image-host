import path from "path"
import fs from "fs"
import crypto from "crypto"
import http from "http"
import https from "https"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

const CONFIG_PATH = path.resolve(__dirname, "./public/config.json")
/** 管理员凭据（哈希存储，gitignore，不对外提供静态访问） */
const CREDENTIAL_PATH = path.resolve(__dirname, "./data/admin-credential.json")

/** 服务端登录失败锁定（5 次失败锁 15 分钟，进程内存态） */
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000
const failures = { count: 0, lockedUntil: 0 }

interface AdminCredential {
  username: string
  salt: string
  hash: string
}

function readCredential(): AdminCredential | null {
  try {
    const raw = JSON.parse(fs.readFileSync(CREDENTIAL_PATH, "utf-8"))
    if (raw?.username && raw?.salt && raw?.hash) return raw as AdminCredential
  } catch { /* 未设置 */ }
  return null
}

function hashPassword(salt: string, password: string): string {
  return crypto.createHash("sha256").update(salt + password).digest("hex")
}

/** 校验请求头中的管理员凭据 */
function isAdminAuthorized(req: http.IncomingMessage): boolean {
  const cred = readCredential()
  if (!cred) return false
  const username = req.headers["x-admin-username"]
  const password = req.headers["x-admin-password"]
  if (typeof username !== "string" || typeof password !== "string") return false
  return username === cred.username && hashPassword(cred.salt, password) === cred.hash
}

/** 读取请求体为字符串 */
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ""
    req.on("data", (chunk: Buffer) => { body += chunk })
    req.on("end", () => resolve(body))
  })
}

function sendJson(res: http.ServerResponse, code: number, obj: unknown) {
  res.statusCode = code
  res.setHeader("Content-Type", "application/json")
  res.end(JSON.stringify(obj))
}

/** 读取 config.json 获取 OpenList 服务器地址 */
function getOpenListServer(): string {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"))
    if (cfg?.serverUrl) return cfg.serverUrl.replace(/\/+$/, "")
  } catch { /* empty */ }
  return ""
}

/** 服务端插件：配置存储 + 管理员鉴权 + OpenList API 代理 */
function serverPlugin(): Plugin {
  return {
    name: "openlist-server",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // GET /api/admin/status — 服务端是否已初始化管理员
        if (req.method === "GET" && req.url === "/api/admin/status") {
          sendJson(res, 200, {
            initialized: Boolean(readCredential()),
            locked: failures.lockedUntil > Date.now(),
          })
          return
        }

        // POST /api/admin/setup — 首次设置管理员账户（已设置后禁止覆盖）
        if (req.method === "POST" && req.url === "/api/admin/setup") {
          if (readCredential()) {
            sendJson(res, 403, { ok: false, error: "管理员已设置，请直接登录" })
            return
          }
          readBody(req).then((body) => {
            try {
              const { username, password } = JSON.parse(body)
              if (typeof username !== "string" || typeof password !== "string" || !username || password.length < 6) {
                sendJson(res, 400, { ok: false, error: "用户名必填，密码至少 6 位" })
                return
              }
              const salt = crypto.randomBytes(16).toString("hex")
              fs.mkdirSync(path.dirname(CREDENTIAL_PATH), { recursive: true })
              fs.writeFileSync(
                CREDENTIAL_PATH,
                JSON.stringify({ username, salt, hash: hashPassword(salt, password) }, null, 2),
                "utf-8"
              )
              failures.count = 0
              failures.lockedUntil = 0
              sendJson(res, 200, { ok: true })
            } catch {
              sendJson(res, 400, { ok: false, error: "Invalid JSON" })
            }
          })
          return
        }

        // POST /api/admin/login — 管理员登录（服务端校验 + 锁定）
        if (req.method === "POST" && req.url === "/api/admin/login") {
          if (failures.lockedUntil > Date.now()) {
            sendJson(res, 429, { ok: false, lockedUntil: failures.lockedUntil })
            return
          }
          readBody(req).then((body) => {
            try {
              const cred = readCredential()
              if (!cred) {
                sendJson(res, 400, { ok: false, error: "管理员尚未设置" })
                return
              }
              const { username, password } = JSON.parse(body)
              if (
                typeof username === "string" && typeof password === "string" &&
                username === cred.username && hashPassword(cred.salt, password) === cred.hash
              ) {
                failures.count = 0
                failures.lockedUntil = 0
                sendJson(res, 200, { ok: true })
                return
              }
              failures.count += 1
              if (failures.count >= MAX_ATTEMPTS) {
                failures.lockedUntil = Date.now() + LOCKOUT_MS
                failures.count = 0
                sendJson(res, 429, { ok: false, lockedUntil: failures.lockedUntil })
                return
              }
              sendJson(res, 401, { ok: false })
            } catch {
              sendJson(res, 400, { ok: false, error: "Invalid JSON" })
            }
          })
          return
        }

        // POST /api/config — 保存配置到 config.json（需管理员鉴权）
        if (req.method === "POST" && req.url === "/api/config") {
          if (!isAdminAuthorized(req)) {
            sendJson(res, 401, { ok: false, error: "需要管理员权限" })
            return
          }
          readBody(req).then((body) => {
            try {
              const parsed = JSON.parse(body)
              fs.writeFileSync(CONFIG_PATH, JSON.stringify(parsed, null, 2), "utf-8")
              sendJson(res, 200, { ok: true })
            } catch {
              sendJson(res, 400, { ok: false, error: "Invalid JSON" })
            }
          })
          return
        }

        // /openlist/** — 代理到 OpenList 服务器
        if (req.url?.startsWith("/openlist/")) {
          const target = getOpenListServer()
          if (!target) {
            res.statusCode = 502
            res.end(JSON.stringify({ code: 502, message: "OpenList 服务器未配置" }))
            return
          }

          const upstreamPath = req.url.replace(/^\/openlist/, "") || "/"
          const isHttps = target.startsWith("https")
          const url = new URL(upstreamPath, target + "/")
          const lib = isHttps ? https : http

          const proxyReq = lib.request(
            url,
            {
              method: req.method,
              headers: { ...req.headers, host: url.host },
            },
            (proxyRes) => {
              const headers = { ...proxyRes.headers }
              // 图片经代理时应内联展示，避免 Markdown 渲染器按附件处理
              if (upstreamPath.startsWith("/d/") && headers["content-type"]?.startsWith("image/")) {
                headers["content-disposition"] = "inline"
                headers["x-content-type-options"] = "nosniff"
              }
              res.writeHead(proxyRes.statusCode || 502, headers)
              proxyRes.pipe(res)
            }
          )

          proxyReq.on("error", (err) => {
            if (!res.headersSent) {
              res.statusCode = 502
              res.end(JSON.stringify({ code: 502, message: `代理请求失败: ${err.message}` }))
            }
          })

          req.pipe(proxyReq)
          return
        }

        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), serverPlugin()],
  server: {
    port: 6173,
    strictPort: true,
    allowedHosts: ["image.qbwnas.top"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
