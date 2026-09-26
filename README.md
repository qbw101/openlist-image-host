# OpenList 图床

基于 [OpenList](https://github.com/OpenListTeam/OpenList) Web API 的轻量图床前端。前端 + Vite 服务端插件提供**配置存储**、**管理员鉴权**与 **API 代理**，适合已有自建 OpenList 的用户快速获得一个可内网/公网访问的图床。

## 功能

- 🖼 图库浏览、灯箱预览、拖拽上传（带进度）
- 📋 一键复制：URL / Markdown / HTML / BBCode
- 👤 管理员与游客权限分离：游客仅可查看，管理员可上传、删除、修改配置
- 🔐 管理员账户服务端校验（SHA-256 加盐哈希），连续 5 次失败锁定 15 分钟
- 🌐 配置保存于服务器，所有设备自动读取，无需逐台配置
- 🔀 Vite 代理 `/openlist/**` 转发至内网 OpenList，公网无需暴露 OpenList 端口
- 🖼 代理响应头内联化（`Content-Disposition: inline`），图片可直接用于 Markdown 外链

## 技术栈

React 19 · TypeScript · Vite 7 · Tailwind CSS v3 · shadcn/ui · sonner · lucide-react

## 目录结构

```
.
├── start.ps1 / start.bat        一键启动脚本（Windows）
├── preview.ps1 / preview.bat    预览已构建产物
└── app/
    ├── src/
    │   ├── lib/openlist.ts      OpenList API 封装与 URL 生成
    │   ├── hooks/               use-settings / use-admin-auth
    │   └── components/          UI 组件（图库、卡片、灯箱、设置、登录）
    ├── public/
    │   └── config.example.json  配置模板
    ├── data/                    管理员凭据（运行时生成，已 gitignore）
    └── vite.config.ts           dev server + 配置存储 + 鉴权 + API 代理
```

## 快速开始

```bash
cd app
npm install
npm run dev
```

默认监听 `6173` 端口。

## 配置流程

### 1. OpenList 端准备

在 OpenList 中创建存储（本地 / S3 / 阿里云 OSS 等），并建立挂载目录（例如 `/images`）。

> ⚠️ 建议为图床单独创建一个**仅有该目录读写权限的受限账号**，不要使用 OpenList 管理员账号。

### 2. 首次使用图床

1. 打开图床页面 → 点击顶部「登录」→ 首次会提示**设置管理员账户**（用户名 + 密码，密码至少 6 位）
2. 用管理员账户登录 → 打开「设置」
3. 填写并保存：
   - **服务器地址**：`http://<OpenList 地址>:5244`（务必带 `http://` 或 `https://`）
   - **用户名 / 密码**：上一步创建的受限账号
   - **上传路径**：`/images`（与 OpenList 挂载目录一致）
   - **自定义域名（可选）**：仅用于生成分享链接；图片加载始终走本站代理
4. 保存后配置写入服务器 `app/public/config.json`，其他设备打开即自动读取

### 3. 公网部署

- 通过端口转发或反向代理，把公网域名指向 `6173` 端口
- 修改 `app/vite.config.ts` 中 `server.allowedHosts`，加入你的域名
- OpenList 本身无需暴露公网：所有 API 与图片请求都经本站 `/openlist/**` 代理转发

## 安全说明

- `app/public/config.json`（含 OpenList 凭据）与 `app/data/`（管理员凭据哈希）**已在 `.gitignore` 中排除，切勿提交**
- 管理员密码以 SHA-256 加盐哈希存放于服务端，前端源码不含任何明文凭据
- `POST /api/config` 需要管理员凭据，未授权请求返回 401
- 登录失败锁定为**进程内存态**，服务重启即重置
- 本项目面向内网 / 自建场景，公网暴露前请自行加固（HTTPS、访问控制等）

## 说明

- dev server 同时承担后端职责（配置存储 / 鉴权 / 代理），生产环境请以 `vite preview` 或自建 Node 服务加载同一份 `vite.config.ts` 插件。
