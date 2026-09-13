# 架构说明（architecture）

> 项目：京东充电桩安装费用核对平台
> 更新日期：2026-09-13

## 1. 整体架构

```
浏览器
  │
  ├── Cloudflare Pages（静态前端：Vite + React 18 构建产物）
  │
  └── Cloudflare Workers（后端 API，functions/api/）
        │
        └── Cloudflare D1（数据库，binding 名称 DB）
```

- **Cloudflare Pages**：托管前端静态资源（React 单页应用）。
- **Cloudflare Workers**：无服务器 API，路径统一 ` /api/*`，读写 D1。
- **Cloudflare D1**：SQLite 数据库，binding 名称 `DB`（见 schema.md / tech-stack.md）。

## 2. 请求流程

### 管理端（admin / operator，需登录）

```
浏览器 ──加载──> Cloudflare Pages（静态前端）
浏览器 ──fetch /api/* ──> Cloudflare Workers ──SQL──> Cloudflare D1
```

### 服务商端（免登录）

```
服务商 ──打开 /submit/:token──> Cloudflare Pages（提交页，独立路由，无鉴权）
服务商 ──POST /api/submissions──> Cloudflare Workers（校验 token）──> 写入 D1
```

> 服务商提交页走独立路由 `/submit/:token`，无需登录；Worker 通过 token 反查工单并校验有效性。

## 3. 路由设计

| 端 | 路由 | 说明 |
| --- | --- | --- |
| 管理端 | `/orders` | 工单列表（默认） |
| 管理端 | `/reconcile/:id` | 费用核对工作台 |
| 管理端 | `/settlements/:id` | 结算账单 |
| 管理端 | `/dashboard` | 数据看板 |
| 管理端 | `/standards` | 标准费用库 |
| 服务商端 | `/submit/:token` | 服务商提交（免登录） |

## 4. API 路径（`/api/*`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` | admin / operator 登录 |
| GET | `/api/work-orders` | 工单列表（筛选 / 搜索 / 分页） |
| POST | `/api/work-orders` | 发起核对（创建工单 + 生成 submit_token） |
| GET | `/api/work-orders/:id` | 工单详情 |
| GET | `/api/submit/:token` | 服务商按 token 获取工单与标准项 |
| POST | `/api/submissions` | 服务商提交费用明细 |
| GET | `/api/work-orders/:id/reconciliation` | 核对明细 |
| POST | `/api/reconciliation-items/:id` | 人工处理（匹配 / 接受 / 驳回） |
| POST | `/api/work-orders/:id/reconcile` | 确认核对完成 |
| POST | `/api/settlements` | 生成结算账单 |
| GET | `/api/settlements/:id` | 账单详情 |
| GET | `/api/settlements/:id/pdf` | 导出 PDF |
| GET | `/api/standard-fee-items` | 标准费用库列表 |
| POST | `/api/standard-fee-items` | 新增标准项 |
| PATCH | `/api/standard-fee-items/:id` | 更新 / 停用标准项 |
| GET | `/api/dashboard/summary` | 看板统计数据 |

## 5. 核心数据流（核对流程）

1. operator 在工单列表「发起核对」→ `POST /api/work-orders` 建工单并生成 `submit_token`。
2. 服务商访问 `/submit/{token}` → 填写费用明细 → `POST /api/submissions`（写入 `provider_submissions`）。
3. 系统自动映射标准库 → 生成 `reconciliation_items`（五状态）。
4. operator 在核对工作台处理异常项 → `POST /api/reconciliation-items/:id`。
5. 确认核对完成 → 生成 `settlement_bills` → 锁定相关 `provider_submissions`（`is_locked=1`）。
6. 业务侧通过页面 / PDF / 链接三种方式获取账单。

## 6. 目录结构

见 AGENTS.md：`src/features/`（功能模块）、`src/shared/`（公共组件与工具）、`functions/api/`（Workers 后端）、`migrations/`（D1 迁移）、`memory-bank/`、`docs/`。
