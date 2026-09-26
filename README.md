# OpenList 图床

基于 [OpenList](https://github.com/OpenListTeam/OpenList) Web API 的轻量图床前端。前端 + Vite 服务端插件提供**配置存储**、**管理员鉴权**与 **API 代理**，适合已有自建 OpenList 的用户快速获得一个可内网/公网访问的图床。

## 功能

- 🖼 图库浏览、灯箱预览、拖拽上传（带进度）
- 📋 一键复制：URL / Markdown / HTML / BBCode
- 👤 管理员与游客权限分离：游客仅可查看，管理员可上传、删除、修改配置
- 🔐 管理员账户服务端校验（SHA-256 加盐哈希），连续 5 次失败锁定 15 分钟
- 🛡 OpenList 账号密码仅存服务端，配置接口只返回脱敏数据，浏览器不接触凭据
- 🌐 配置保存于服务器，所有设备自动读取，无需逐台配置
- 🔀 Vite 代理 `/openlist/**` 转发至内网 OpenList，公网无需暴露 OpenList 端口；受限账号的 `base_path` 前缀由代理自动补齐
- 🖼 代理响应头内联化（`Content-Disposition: inline`），图片可直接用于 Markdown 外链

## 技术栈

React 19 · TypeScript · Vite 7 · Tailwind CSS v3 · shadcn/ui · sonner · lucide-react

## 目录结构

```
.
├── start.ps1 / start.bat        一键启动脚本（Windows）
├── preview.ps1 / preview.bat    预览已构建产物
├── config.example.json          配置模板（实际配置由服务端写 app/data/config.json）
└── app/
    ├── src/
    │   ├── lib/openlist.ts      OpenList API 封装与 URL 生成
    │   ├── hooks/               use-settings / use-admin-auth
    │   └── components/          UI 组件（图库、卡片、灯箱、设置、登录）
    ├── data/                    运行时生成：config.json（OpenList 凭据）+ admin-credential.json（管理员密码哈希），已 gitignore，且不参与静态资源服务
    └── vite.config.ts           dev server + 配置存储 + 管理员鉴权 + API 代理
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
3. 填写后点「测试连接」，确认能列目录再保存：
   - **服务器地址**：`http://<OpenList 地址>:5244`（务必带 `http://` 或 `https://`）
   - **用户名 / 密码**：上一步创建的受限账号（保存后**仅存服务端**，不回传浏览器；留空表示不修改）
   - **上传路径**：**相对于该账号根目录**的路径。账号根目录被限制在某个文件夹时填 `/`
   - **自定义域名（可选）**：仅用于生成对外分享链接；图片加载始终走本站代理
4. 保存后配置写入服务端 `app/data/config.json`，其他设备打开即自动读取

### 3. 公网部署

- 通过端口转发或反向代理，把公网域名指向 `6173` 端口
- 修改 `app/vite.config.ts` 中 `server.allowedHosts`，加入你的域名
- OpenList 本身无需暴露公网：所有 API 与图片请求都经本站 `/openlist/**` 代理转发

## 受限账号与路径说明

OpenList 对受限账号（`base_path` 非 `/`）的路径处理有两套命名空间，这也是配置图床时最容易踩的坑：

| 操作 | 使用的路径 |
|------|-----------|
| `fs/list`、`fs/get`、`fs/put`、`fs/remove` 等接口 | **账号相对路径**（`base_path` 之后） |
| `/d/`、`/p/` 图片直链 | **全局真实路径**（`base_path` + 相对路径） |

举例如账号 `base_path` 为 `/图床`：列目录要用 `/`，但直链必须是 `/d/图床/xxx.png`，写成 `/d/xxx.png` 会返回 **401**。

本项目已把这个差异收在服务端代理里：前端统一使用账号相对路径，代理在转发直链时自动补上 `base_path`（通过 `GET /api/me` 获取并缓存）。所以**设置里的「上传路径」应填账号相对路径**（账号被限制在图床目录时填 `/`）。

## 安全说明

- **OpenList 账号密码只存在服务端** `app/data/config.json`（位于 `public/` 之外，不参与静态资源服务，无法通过 URL 下载）
- 浏览器侧的 `GET /api/config` 只返回**脱敏配置**（服务器地址、上传路径、自定义域名、命名策略），不含账号密码
- OpenList 的 `Authorization` 由服务端代理注入；前端不再持有、也不缓存 OpenList token
- 管理员密码以 SHA-256 加盐哈希存放于 `app/data/admin-credential.json`
- `POST /api/config`（写配置）与 `POST /api/config/test`（测试连接）均需管理员凭据，未授权返回 401
- 登录失败锁定为**进程内存态**，服务重启即重置
- `app/data/` 已在 `.gitignore` 中排除，**切勿提交**
- 本项目面向内网 / 自建场景，公网暴露前请自行加固（HTTPS、访问控制等）

## 说明

- dev server 同时承担后端职责（配置存储 / 鉴权 / 代理），生产环境请以 `vite preview` 或自建 Node 服务加载同一份 `vite.config.ts` 插件。

## 许可

本项目采用 **GNU General Public License v3.0** 许可，详见 [LICENSE](./LICENSE)。

```
Copyright (C) 2026 仇博文 (qbw101)

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.
```
