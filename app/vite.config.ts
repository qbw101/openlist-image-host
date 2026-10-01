import path from "path"
import fs from "fs"
import crypto from "crypto"
import http from "http"
import https from "https"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

/**
 * 完整配置（含 OpenList 账号密码）
 * 刻意放在 data/ 而非 public/：public/ 下的文件会被 Vite 静态服务，公网可直接下载。
 */
const CONFIG_PATH = path.resolve(__dirname, "./data/config.json")
/** 管理员凭据（哈希存储，同样不对外提供静态访问） */
const CREDENTIAL_PATH = path.resolve(__dirname, "./data/admin-credential.json")

/** 服务端登录失败锁定（5 次失败锁 15 分钟，进程内存态） */
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000
const failures = { count: 0, lockedUntil: 0 }

/** 请求体缓冲上限，超过则流式转发（此时不做 401 重试） */
const MAX_BUFFER = 2 * 1024 * 1024

interface AdminCredential {
  username: string
  salt: string
  hash: string
}

interface StoredConfig {
  serverUrl?: string
  username?: string
  password?: string
  uploadPath?: string
  customDomain?: string
  namingStrategy?: string
}

/** OpenList 会话：token 与账号根目录均由服务端持有，浏览器永不接触 */
const session = {
  serverUrl: "",
  username: "",
  token: "",
  basePath: "",
  basePathFor: "",
}

/**
 * 直链签名（sign）缓存。
 *
 * OpenList 的 /d/、/p/ 直链必须带 sign，而 sign 由「文件路径 + 签发时的 token」派生：
 * token 一旦轮换（OpenList 重启 / token 过期 / 更换账号 / 改密码），
 * 此前签发过的所有 sign 立即失效并返回 401 —— 这正是「图片加载失败」的根因，
 * 也是已经复制到 Markdown 里的老链接会突然挂掉的原因。
 *
 * 因此代理层不再信任客户端带来的 sign，而是统一用「当前 token 现取现用」，
 * 并按 (token, 账号相对路径) 缓存；token 变了 key 就变，自然淘汰旧值。
 */
const signCache = new Map<string, string>()
const signInflight = new Map<string, Promise<string>>()

const trimSlash = (s: string) => s.replace(/\/+$/, "")

/** 账号根目录："/" 或 "" 视为无前缀 */
function normalizeBasePath(bp: string): string {
  if (!bp || bp === "/") return ""
  return trimSlash(bp)
}

// ---------------------------------------------------------------- 配置读写

function readConfig(): StoredConfig | null {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"))
    if (raw && typeof raw === "object") return raw as StoredConfig
  } catch {
    /* 未配置 */
  }
  return null
}

function writeConfig(cfg: StoredConfig) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8")
}

/** 对外暴露的脱敏配置——绝不包含 username / password */
function sanitizeConfig(cfg: StoredConfig | null) {
  return {
    configured: Boolean(cfg?.serverUrl && cfg?.username && cfg?.password && cfg?.uploadPath),
    serverUrl: cfg?.serverUrl ?? "",
    uploadPath: cfg?.uploadPath ?? "/",
    customDomain: cfg?.customDomain ?? "",
    namingStrategy: cfg?.namingStrategy ?? "timestamp",
    hasCredential: Boolean(cfg?.username && cfg?.password),
  }
}

/** 凭据或地址变更后重置会话 */
function resetSession() {
  session.serverUrl = ""
  session.username = ""
  session.token = ""
  session.basePath = ""
  session.basePathFor = ""
  signCache.clear()
}

// ---------------------------------------------------------------- 管理员凭据

function readCredential(): AdminCredential | null {
  try {
    const raw = JSON.parse(fs.readFileSync(CREDENTIAL_PATH, "utf-8"))
    if (raw?.username && raw?.salt && raw?.hash) return raw as AdminCredential
  } catch {
    /* 未设置 */
  }
  return null
}

function hashPassword(salt: string, password: string): string {
  return crypto.createHash("sha256").update(salt + password).digest("hex")
}

function isAdminAuthorized(req: http.IncomingMessage): boolean {
  const cred = readCredential()
  if (!cred) return false
  const username = req.headers["x-admin-username"]
  const password = req.headers["x-admin-password"]
  if (typeof username !== "string" || typeof password !== "string") return false
  return username === cred.username && hashPassword(cred.salt, password) === cred.hash
}

// ---------------------------------------------------------------- HTTP 工具

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ""
    req.on("data", (chunk: Buffer) => { body += chunk })
    req.on("end", () => resolve(body))
  })
}

function readAll(stream: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    stream.on("end", () => resolve(Buffer.concat(chunks)))
    stream.on("error", reject)
  })
}

function sendJson(res: http.ServerResponse, code: number, obj: unknown) {
  res.statusCode = code
  res.setHeader("Content-Type", "application/json")
  res.end(JSON.stringify(obj))
}

// ---------------------------------------------------------------- OpenList 会话

/** OpenList 接口返回体（仅取用到的字段） */
interface OpenListJson {
  code?: number
  message?: string
  data?: {
    token?: string
    base_path?: string
    content?: Array<{ is_dir?: boolean; name?: string }>
  }
}

async function openlistLogin(serverUrl: string, username: string, password: string): Promise<string> {
  const res = await fetch(`${serverUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })
  const data = (await res.json().catch(() => null)) as OpenListJson | null
  if (!res.ok || data?.code !== 200) {
    throw new Error(data?.message || `HTTP ${res.status}`)
  }
  const token: string = data.data?.token ?? ""
  if (!token) throw new Error("登录成功但未返回 token")
  return token
}

async function ensureToken(cfg: StoredConfig): Promise<string> {
  const serverUrl = trimSlash(cfg.serverUrl || "")
  if (!serverUrl) throw new Error("OpenList 服务器未配置")
  if (session.token && session.serverUrl === serverUrl && session.username === cfg.username) {
    return session.token
  }
  const token = await openlistLogin(serverUrl, cfg.username || "", cfg.password || "")
  session.serverUrl = serverUrl
  session.username = cfg.username || ""
  session.token = token
  session.basePath = ""
  session.basePathFor = ""
  return token
}

/**
 * 取账号根目录（base_path）。
 * 受限账号（根目录被限制为 /图床 之类）的 fs/* 接口用「账号相对路径」，
 * 但 /d/、/p/ 直链接口必须使用「全局真实路径」= base_path + 相对路径。
 */
async function ensureBasePath(cfg: StoredConfig, token: string): Promise<string> {
  if (session.basePathFor === token) return session.basePath
  const serverUrl = trimSlash(cfg.serverUrl || "")
  try {
    const res = await fetch(`${serverUrl}/api/me`, { headers: { Authorization: token } })
    const data = (await res.json()) as OpenListJson
    session.basePath = normalizeBasePath(String(data?.data?.base_path ?? ""))
  } catch {
    session.basePath = ""
  }
  session.basePathFor = token
  return session.basePath
}

// ---------------------------------------------------------------- OpenList 代理

function encodePathSegments(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/")
}

/** 逐段解码（失败则原样保留），用于把 URL 里的编码路径还原成真实路径 */
function decodePathSegments(p: string): string {
  return p
    .split("/")
    .map((seg) => {
      try {
        return decodeURIComponent(seg)
      } catch {
        return seg
      }
    })
    .join("/")
}

/** 目录 + 文件名 → 账号相对路径 */
function joinFsPath(dir: string, name: string): string {
  const d = dir && dir !== "/" ? trimSlash(dir) : ""
  return `${d}/${name}`
}

const signKey = (token: string, accountPath: string) => `${token}\n${accountPath}`

/**
 * 用当前 token 现取一个有效签名（并发去重 + 按 token 缓存）。
 * path 必须是「账号相对路径」，与 fs/get 的入参一致。
 */
async function fetchSign(cfg: StoredConfig, token: string, accountPath: string): Promise<string> {
  const key = signKey(token, accountPath)
  const hit = signCache.get(key)
  if (hit) return hit

  let inflight = signInflight.get(key)
  if (!inflight) {
    inflight = (async () => {
      const serverUrl = trimSlash(cfg.serverUrl || "")
      const res = await fetch(`${serverUrl}/api/fs/get`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ path: accountPath, password: "" }),
      })
      const data = (await res.json().catch(() => null)) as
        | { code?: number; message?: string; data?: { sign?: string } }
        | null
      const sign = data?.data?.sign
      if (!sign) {
        const err = new Error(data?.message || `HTTP ${res.status}`) as Error & {
          upstreamStatus?: number
          authFailed?: boolean
        }
        // OpenList 的 token 失效表现为 HTTP 200 + {"code":401,"message":"token is expired"}
        err.authFailed = res.status === 401 || data?.code === 401
        // 上游 200 + 业务错误码（如「object not found」）= 文件不存在 → 404；其余 → 502
        err.upstreamStatus =
          data?.code === 401 || res.status === 401
            ? 502
            : res.status === 200 && data?.code
              ? 404
              : 502
        throw err
      }
      signCache.set(key, sign)
      return sign
    })()
    signInflight.set(key, inflight)
    inflight.catch(() => undefined).finally(() => signInflight.delete(key))
  }
  return inflight
}

/**
 * 顺手从 fs/list、fs/get 的响应里收割每个文件的签名。
 * fs/list 已经返回了每个条目的 sign，提前收下就能省掉后续逐张 fs/get 的往返。
 */
function harvestSigns(token: string, apiPath: string, body: unknown, json: unknown) {
  try {
    const reqPathRaw = (body as { path?: unknown } | null)?.path
    const reqPath = typeof reqPathRaw === "string" && reqPathRaw ? reqPathRaw : "/"
    const data = (json as { data?: Record<string, unknown> } | null)?.data
    if (!data) return

    if (apiPath.endsWith("/fs/list")) {
      const content = data.content
      if (Array.isArray(content)) {
        for (const f of content as Array<Record<string, unknown>>) {
          if (f && !f.is_dir && f.name && f.sign) {
            signCache.set(signKey(token, joinFsPath(reqPath, String(f.name))), String(f.sign))
          }
        }
      }
    } else if (apiPath.endsWith("/fs/get")) {
      if (data.sign) signCache.set(signKey(token, reqPath), String(data.sign))
    }
  } catch {
    /* 收割失败不影响主流程 */
  }
}

async function proxyOpenList(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const cfg = readConfig()
  const serverUrl = trimSlash(cfg?.serverUrl || "")
  if (!serverUrl) {
    sendJson(res, 502, { code: 502, message: "OpenList 服务器未配置" })
    return
  }

  // 剥掉 /openlist 前缀，再拆出 path 与 query
  const raw = (req.url || "/").replace(/^\/openlist/, "") || "/"
  const qIndex = raw.indexOf("?")
  const pathOnly = qIndex >= 0 ? raw.slice(0, qIndex) : raw
  const rawQuery = qIndex >= 0 ? raw.slice(qIndex + 1) : ""

  // /d/ 与 /p/ 是直链接口，需要补 base_path 前缀并注入有效签名；其余为 API，走 token
  const directMatch = pathOnly.match(/^\/(d|p)(\/.*)?$/)
  const isDirect = Boolean(directMatch)

  // 非直链且带 body：小体积先缓冲（便于 token 失效时重试 / 收割签名）
  let bodyBuf: Buffer | null = null
  let bodyJson: unknown = null
  if (!isDirect && req.method !== "GET" && req.method !== "HEAD") {
    const len = Number(req.headers["content-length"] || 0)
    if (!len || len <= MAX_BUFFER) {
      bodyBuf = await readAll(req)
      try {
        bodyJson = JSON.parse(bodyBuf.toString("utf-8"))
      } catch {
        bodyJson = null
      }
    }
  }

  for (let attempt = 0; attempt <= 1; attempt++) {
    if (attempt > 0) resetSession()

    let token = ""
    try {
      token = await ensureToken(cfg as StoredConfig)
    } catch (e) {
      sendJson(res, 502, { code: 502, message: `OpenList 登录失败：${(e as Error).message}` })
      return
    }

    let upstreamPath: string
    if (isDirect) {
      const kind = directMatch![1]
      const basePath = await ensureBasePath(cfg as StoredConfig, token)

      // 客户端传的是「账号相对路径」（/a.png）；同时兼容已经带了 base_path 的全局路径（/图床/a.png）
      const reqFull = decodePathSegments(directMatch![2] ?? "/")
      let accountPath = reqFull
      if (basePath && (reqFull === basePath || reqFull.startsWith(`${basePath}/`))) {
        accountPath = reqFull.slice(basePath.length) || "/"
      }
      if (!accountPath.startsWith("/")) accountPath = `/${accountPath}`
      const globalPath = `${basePath}${accountPath}`

      // ★ 关键修复：忽略客户端携带的 sign。
      //   它绑定的是签发时的 token，token 轮换后必然 401（表现为「图片加载失败」）。
      //   这里改用当前 token 现取一个有效签名，因此老链接、无 sign 的链接都能继续用。
      let sign = ""
      try {
        sign = await fetchSign(cfg as StoredConfig, token, accountPath)
      } catch (e) {
        const err = e as Error & { upstreamStatus?: number; authFailed?: boolean }
        // token 过期导致取签失败：重登一次再来（否则图片会一路 404/502）
        if (err.authFailed && attempt === 0) {
          resetSession()
          continue
        }
        const status = err.upstreamStatus ?? 502
        sendJson(res, status, { code: status, message: `获取图片签名失败：${err.message}` })
        return
      }
      const sp = new URLSearchParams(rawQuery)
      sp.delete("sign")
      sp.set("sign", sign)
      upstreamPath = `/${kind}${encodePathSegments(globalPath)}?${sp.toString()}`
    } else {
      upstreamPath = pathOnly + (rawQuery ? `?${rawQuery}` : "")
    }

    const u = new URL(serverUrl)
    const isHttps = u.protocol === "https:"
    const lib = isHttps ? https : http

    const headers: http.OutgoingHttpHeaders = { ...req.headers, host: u.host }
    if (isDirect) {
      // 直链只认 sign 参数，带上 Authorization 反而无效
      delete headers.authorization
    } else {
      headers.authorization = token
      // 关闭压缩：接口响应体都很小，原样缓冲便于解析/收割签名
      headers["accept-encoding"] = "identity"
    }

    const options: http.RequestOptions = {
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      method: req.method,
      path: upstreamPath,
      headers,
    }

    const outcome = await new Promise<{ retry: boolean }>((resolve) => {
      const preq = lib.request(options, (pres) => {
        const status = pres.statusCode || 502
        const ctype = String(pres.headers["content-type"] || "")

        // ① HTTP 层 401：token 失效，清会话后重登重试
        const httpAuthFail =
          status === 401 && attempt === 0 &&
          (bodyBuf !== null || req.method === "GET" || req.method === "HEAD")
        if (httpAuthFail) {
          pres.resume()
          resolve({ retry: true })
          return
        }

        const outHeaders: http.OutgoingHttpHeaders = { ...pres.headers }

        // OpenList 对未知路径会回退到 SPA 首页并返回 200 + HTML。
        // 接口请求拿到 HTML 说明上游路径没对上，转成明确错误，避免把网页丢给前端解析。
        if (!isDirect && ctype.startsWith("text/html")) {
          pres.resume()
          sendJson(res, 502, {
            code: 502,
            message: "OpenList 返回了网页而非接口数据，请检查服务器地址是否正确",
          })
          resolve({ retry: false })
          return
        }

        // 图片经代理时内联展示，避免 Markdown 渲染器按附件处理
        if (isDirect && ctype.startsWith("image/")) {
          outHeaders["content-disposition"] = "inline"
          outHeaders["x-content-type-options"] = "nosniff"
        }

        // 非直链的 JSON 响应一律先缓冲：既要收割签名，也要识别
        // ② OpenList 特有的「伪 200」——token 过期时它返回 HTTP 200 +
        //    {"code":401,"message":"token is expired"}，只看状态码会漏掉，
        //    结果前端拿到这条错误直接显示「加载失败」。这里必须解包判断。
        const clen = Number(pres.headers["content-length"] || 0)
        const inspectable =
          !isDirect && ctype.startsWith("application/json") &&
          (!clen || clen <= MAX_BUFFER)
        if (!inspectable) {
          res.writeHead(status, outHeaders)
          pres.pipe(res)
          resolve({ retry: false })
          return
        }

        const chunks: Buffer[] = []
        pres.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
        pres.on("error", () => {
          if (!res.headersSent) res.destroy()
          resolve({ retry: false })
        })
        pres.on("end", () => {
          const buf = Buffer.concat(chunks)
          let json: unknown = null
          try {
            json = JSON.parse(buf.toString("utf-8"))
          } catch {
            /* 非 JSON：原样透传 */
          }

          const code = (json as { code?: unknown } | null)?.code
          const bodyAuthFail = typeof code === "number" && code === 401
          if (bodyAuthFail && attempt === 0) {
            resolve({ retry: true })
            return
          }

          if (json) harvestSigns(token, pathOnly, bodyJson, json)

          if (!res.headersSent) res.writeHead(status, outHeaders)
          res.end(buf)
          resolve({ retry: false })
        })
      })

      preq.on("error", (err) => {
        console.error(`[openlist-proxy] ${req.method} ${upstreamPath} -> ${err.message}`)
        if (!res.headersSent) {
          sendJson(res, 502, { code: 502, message: `代理请求失败：${err.message}` })
        }
        resolve({ retry: false })
      })

      if (bodyBuf !== null) preq.end(bodyBuf)
      else req.pipe(preq)
    })

    if (!outcome.retry) return
  }
}

// ---------------------------------------------------------------- 插件

function serverPlugin(): Plugin {
  return {
    name: "openlist-server",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // GET /api/config —— 脱敏配置，供任意设备读取（不含账号密码）
        if (req.method === "GET" && req.url === "/api/config") {
          sendJson(res, 200, sanitizeConfig(readConfig()))
          return
        }

        // GET /api/admin/status —— 服务端是否已初始化管理员
        if (req.method === "GET" && req.url === "/api/admin/status") {
          sendJson(res, 200, {
            initialized: Boolean(readCredential()),
            locked: failures.lockedUntil > Date.now(),
          })
          return
        }

        // POST /api/admin/setup —— 首次设置管理员账户（已设置后禁止覆盖）
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

        // POST /api/admin/login —— 管理员登录（服务端校验 + 锁定）
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

        // POST /api/config/test —— 服务端实测 OpenList 连接（需管理员）
        if (req.method === "POST" && req.url === "/api/config/test") {
          if (!isAdminAuthorized(req)) {
            sendJson(res, 401, { ok: false, error: "需要管理员权限" })
            return
          }
          readBody(req).then(async (body) => {
            try {
              const incoming = JSON.parse(body)
              const prev = readConfig() || {}
              const serverUrl = trimSlash(String(incoming.serverUrl || prev.serverUrl || ""))
              const username = incoming.username ? String(incoming.username) : (prev.username || "")
              const password = incoming.password ? String(incoming.password) : (prev.password || "")
              const uploadPath = String(incoming.uploadPath || prev.uploadPath || "/")
              if (!serverUrl || !username || !password) {
                sendJson(res, 400, { ok: false, error: "请填写服务器地址、用户名和密码" })
                return
              }

              const token = await openlistLogin(serverUrl, username, password)

              // 顺带把账号根目录探出来，便于排查直链 401
              let basePath = ""
              try {
                const meRes = await fetch(`${serverUrl}/api/me`, { headers: { Authorization: token } })
                const me = (await meRes.json()) as OpenListJson
                basePath = normalizeBasePath(String(me?.data?.base_path ?? ""))
              } catch {
                /* 忽略 */
              }

              const listRes = await fetch(`${serverUrl}/api/fs/list`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: token },
                body: JSON.stringify({ path: uploadPath, page: 1, per_page: 0, refresh: false, password: "" }),
              })
              const listData = (await listRes.json().catch(() => null)) as OpenListJson | null
              if (listData?.code !== 200) {
                sendJson(res, 400, {
                  ok: false,
                  error: `列目录失败：${listData?.message || `HTTP ${listRes.status}`}`,
                })
                return
              }
              const files = (listData.data?.content || []).filter((x) => !x.is_dir)
              sendJson(res, 200, {
                ok: true,
                basePath,
                uploadPath,
                fileCount: files.length,
                sample: files[0]?.name ?? "",
              })
            } catch (e) {
              sendJson(res, 400, { ok: false, error: `连接失败：${(e as Error).message}` })
            }
          })
          return
        }

        // POST /api/config —— 保存配置（需管理员鉴权）
        if (req.method === "POST" && req.url === "/api/config") {
          if (!isAdminAuthorized(req)) {
            sendJson(res, 401, { ok: false, error: "需要管理员权限" })
            return
          }
          readBody(req).then((body) => {
            try {
              const incoming = JSON.parse(body)
              const prev = readConfig() || {}
              // 账号密码留空表示「保持服务端已有值」，避免脱敏回显后被误清空
              const merged: StoredConfig = {
                serverUrl: trimSlash(String(incoming.serverUrl ?? prev.serverUrl ?? "")),
                username: incoming.username ? String(incoming.username) : (prev.username ?? ""),
                password: incoming.password ? String(incoming.password) : (prev.password ?? ""),
                uploadPath: String(incoming.uploadPath || prev.uploadPath || "/"),
                customDomain: trimSlash(String(incoming.customDomain ?? prev.customDomain ?? "")),
                namingStrategy: incoming.namingStrategy === "original" ? "original" : "timestamp",
              }
              writeConfig(merged)
              resetSession()
              sendJson(res, 200, { ok: true, config: sanitizeConfig(merged) })
            } catch {
              sendJson(res, 400, { ok: false, error: "Invalid JSON" })
            }
          })
          return
        }

        // /openlist/** —— 代理到 OpenList（注入 token / 补 base_path）
        if (req.url?.startsWith("/openlist/")) {
          void proxyOpenList(req, res)
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
