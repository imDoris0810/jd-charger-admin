# 技术栈（tech-stack）

> 项目：京东充电桩安装费用核对平台
> 依据：AGENTS.md 锁定技术栈 + Step 5 确认补充
> 更新日期：2026-09-13

## 1. 总览

| 层 | 技术 | 说明 |
| --- | --- | --- |
| 前端框架 | React | 18 |
| 构建工具 | Vite | 最新稳定版 |
| 语言 | TypeScript | strict 模式 |
| 样式 | Tailwind CSS | v3 |
| 路由 | React Router | v6 |
| 表格 | TanStack Table | headless，工单/核对/账单列表 |
| 图表 | Recharts | 数据看板柱状图 / 占比横条 |
| PDF | jsPDF | 结算账单导出 |
| 后端 | Cloudflare Workers | `functions/api/` 目录 |
| 数据库 | Cloudflare D1 | binding 名称 `DB` |
| 部署 | Cloudflare Pages | 前端 + Workers 同仓部署 |

> 注：AGENTS.md 规定「不得安装未确认的 UI 库」。TanStack Table、Recharts、jsPDF 三项已于 Step 5 由需求方确认，加入技术栈。

## 2. 前端

- **React 18** + **TypeScript** + **Vite**，按 `src/features/` 功能模块划分。
- **Tailwind CSS v3** 承载全局设计 token（侧栏 `#1C2536`、主背景 `#F5F7FA`、强调 `#0065BD`、危险 `#E74242`、成功 `#27AE60`）。
- **React Router v6**：
  - 管理端路由：`/orders`、`/reconcile/:id`、`/settlements/:id`、`/dashboard`、`/standards`
  - 服务商端：`/submit/:token`（免登录）
- **TanStack Table**：工单列表 / 核对明细 / 账单明细的表格渲染与排序分页。
- **Recharts**：数据看板近 6 月金额柱状图、服务商占比横条。
- **jsPDF**：结算账单 PDF 导出（客户端生成或经 Workers 生成）。

## 3. 后端

- **Cloudflare Workers**，代码统一在 `functions/api/`（见 AGENTS.md 目录约定）。
- 提供 REST 风格 API，路径统一 ` /api/*`（详见 architecture.md）。
- 鉴权：admin / operator 登录；服务商提交接口凭 token 免登录。

## 4. 数据库

- **Cloudflare D1**（SQLite），binding 名称 **`DB`**。
- 迁移文件：`migrations/0001_init.sql`（5 张表，见 schema.md）。
- 金额以「分」存 `INTEGER`；时间戳 `TEXT`（UTC）；布尔 `INTEGER 0/1`。

## 5. 部署

- **Cloudflare Pages**：托管前端静态产物。
- **Cloudflare Workers**：同仓部署 `functions/`。
- 数据库迁移经 `wrangler d1 execute` 应用到本地（`--local`）与线上（`--remote`）。

## 6. 开发命令

| 命令 | 用途 |
| --- | --- |
| `npm install` | 安装依赖 |
| `npm run dev` | 启动 Vite 本地开发服务器 |
| `npm run build` | 类型检查 + 构建（`tsc && vite build`） |
| `wrangler d1 execute DB --local --file=migrations/0001_init.sql` | 本地 D1 应用迁移 |
| `wrangler d1 execute DB --remote --file=migrations/0001_init.sql` | 线上 D1 应用迁移 |
| `wrangler pages dev` | 本地联调 Pages + Workers |

## 7. 目录结构

```
src/features/               # 按功能模块划分
  auth/                     # 登录鉴权（admin / operator）
  workorders/               # 工单管理
  reconciliation/           # 费用核对
  settlements/              # 结算账单
  standards/                # 标准库维护
  provider-submit/          # 服务商提交（无账号）
src/shared/                 # 公共组件与工具
src/config/schema.ts        # 标准核对核心数据结构（禁区，勿改）
functions/api/              # Cloudflare Workers 后端
migrations/                 # D1 迁移 SQL
memory-bank/                # 项目记忆
docs/                       # 需求文档
```

## 8. 依赖清单（package.json 概览）

```jsonc
{
  "dependencies": {
    "react": "^18",
    "react-dom": "^18",
    "react-router-dom": "^6",
    "@tanstack/react-table": "^8",
    "recharts": "^2",
    "jspdf": "^2"
  },
  "devDependencies": {
    "vite": "^5",
    "typescript": "^5",
    "tailwindcss": "^3",
    "@cloudflare/workers-types": "^4",
    "wrangler": "^3"
  }
}
```
