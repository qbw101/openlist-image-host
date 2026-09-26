# app — OpenList 图床前端

本目录是图床的前端工程（React 19 + TypeScript + Vite 7 + Tailwind CSS v3 + shadcn/ui）。

项目完整说明、配置流程与安全须知见仓库根目录的 [`README.md`](../README.md)。

## 常用命令

```bash
npm install      # 安装依赖
npm run dev      # 启动开发服务器（默认 6173 端口）
npm run build    # 构建生产产物到 dist/
npm run preview  # 预览构建产物
```

## 关键文件

| 文件 | 说明 |
|------|------|
| `vite.config.ts` | dev server 插件：配置存储、管理员鉴权、OpenList 会话管理、`/openlist/**` API 代理与 `base_path` 补齐 |
| `src/lib/openlist.ts` | OpenList API 封装与图片 URL 生成（不再持有 token） |
| `src/hooks/use-settings.ts` | 配置读写（只读服务端脱敏配置，不缓存到 localStorage） |
| `src/hooks/use-admin-auth.ts` | 管理员登录状态（服务端校验）与 `adminAuthHeaders()` |
| `src/components/` | 图库、图片卡片、灯箱、设置弹窗、登录弹窗等 |
| `data/` | 运行时生成的 `config.json`（OpenList 凭据）与 `admin-credential.json`（管理员密码哈希），已被 gitignore，且不参与静态资源服务 |

配置模板见仓库根目录的 [`config.example.json`](../config.example.json)。
