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
| `vite.config.ts` | dev server 插件：配置存储、管理员鉴权、`/openlist/**` API 代理 |
| `src/lib/openlist.ts` | OpenList API 封装与图片 URL 生成 |
| `src/hooks/use-settings.ts` | 配置读写（localStorage + 服务器 config.json） |
| `src/hooks/use-admin-auth.ts` | 管理员登录状态（服务端校验） |
| `src/components/` | 图库、图片卡片、灯箱、设置弹窗、登录弹窗等 |
| `public/config.example.json` | 配置模板；实际使用的 `config.json` 运行时生成且已被 gitignore |
| `data/` | 管理员凭据（运行时生成，已被 gitignore） |
