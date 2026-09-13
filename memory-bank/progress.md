# 项目进度

> 京东充电桩安装费用核对平台 · 进度记录（更新于 2026-09-13）

## 当前状态

项目已完成**需求与原型评审**、**数据库设计（Step 4）**、**架构与技术栈文档（Step 5）**、**主 PRD 定稿（Step 6）**、**F04 详细设计（Step 7）**及**实现计划（Step 8）**。Phase 1（脚手架）、Phase 2（核心数据层 + API）已完成，**Phase 3 前端六页面全部完成**：F04 核对工作台、F03 服务商提交页、F02 工单列表、F05 结算账单、F07 标准费用库、F06 数据看板均已实现并通过 `tsc -b`、`vite build` 与本地 `wrangler pages dev` 端到端联调验证。

## 已完成

| 日期 | 产出 | 说明 |
| --- | --- | --- |
| 2026-09-13 | `AGENTS.md` | 项目宪法：简介 / 角色 / 技术栈锁定 / 目录约定 / 禁区 / 工作约定 |
| 2026-09-13 | `docs/brd.md` | 业务需求文档：背景、典型案例、5 项标准费用项、F01–F07、Out of Scope、成功标准 |
| 2026-09-13 | `docs/prototype.html` | 可交互前端原型（单文件、零依赖），覆盖全部 7 个 In-Scope 功能，已迭代两轮 |
| 2026-09-13 | `memory-bank/schema.md` | 数据库设计：5 张表定义、字段/类型/说明、ER 关系、状态枚举映射 |
| 2026-09-13 | `migrations/0001_init.sql` | D1 建表迁移：5 张表 + 主键/外键/索引，金额以分存储 |
| 2026-09-13 | `memory-bank/design-document.md` | 设计决策文档：7 项已确认决策（D1–D7）、五状态核对、账单三种输出 |
| 2026-09-13 | `memory-bank/tech-stack.md` | 技术栈：前端 Vite + React18 + TS + Tailwind v3 + Router v6 + TanStack Table + Recharts + jsPDF；后端 Workers；D1；部署 Pages；开发命令 |
| 2026-09-13 | `memory-bank/architecture.md` | 架构：浏览器 → Pages → Workers → D1；`/api/*` 路径；`/submit/:token` 免登录路由；核对数据流 |
| 2026-09-13 | `docs/prd.md` | 主 PRD v1.0：产品概述 / 功能范围 F01–F07 / 模块说明（含用户故事 + 验收标准）/ 数据流程 / 非功能需求 |
| 2026-09-13 | `docs/prd-f04.md` | F04 费用核对工作台详细设计：自动匹配算法 / 五状态触发条件 / 人工处理状态流转 / 数据库字段对应 |
| 2026-09-13 | `memory-bank/implementation-plan.md` | 实现计划：4 阶段（脚手架 / API / 前端 / 部署）、禁止事项、开发约定（金额分存储、硬编码匹配 matcher.ts） |
| 2026-09-13 | 脚手架 | Vite + React 18 + TS + Tailwind v3 + React Router v6 初始化；`src/features/` 六模块目录 + `src/config/schema.ts`（禁区，已建立） |
| 2026-09-13 | `migrations/seed.sql` | 5 条标准费用项种子数据（金额分存储）；D1 本地迁移 + 种子数据已执行验证 |
| 2026-09-13 | Phase 2 API | `functions/api/`（Cloudflare Pages Functions + D1）：5 个核心端点（work-orders / submissions / reconciliation-items / settlements / standard-fee-items）+ `lib/matcher.ts` 硬编码关键词映射 + `lib/reconcile.ts` 五状态自动核对；本地端到端联调通过（含 BRD 660/720 典型案例） |

`memory-bank/` 全部文件已填充（Step 4–8）。

## 原型页面清单（docs/prototype.html）

| 页面 | 对应功能 | 关键交互 |
| --- | --- | --- |
| 工单列表 | F02 | 今日待办 3 色卡（待核对/争议中/超3天未提交，点击筛选）、6 Tab 栏、工单号/服务商模糊搜索、分页（20 条/页）、发起核对弹窗 |
| 费用核对工作台 | F04 | 面包屑「工单列表 › 工单号」、统计卡 + 对照表五状态标注、确认完成/驳回 |
| 结算账单 | F05 | 工单信息 + 费用明细 + 金额汇总 + 调整记录（可追溯）、导出 PDF / 复制链接 |
| 数据看板 | F06 | 5 张统计卡、近 6 月金额柱状图、服务商占比横条、待处理差异表 |
| 标准费用库 | F07 | 5 个标准项列表、新增标准项弹窗、停用/启用切换 |
| 服务商提交（链接视图） | F03 | 按计算逻辑分区（基础安装仅确认 + 桥架/电缆/断路器填数 + 其他增项填名+金额）、金额实时计算、提交 |

导航采用 **hash 路由**：`#/orders`（默认）等六条路由；启动无 hash 自动落到 `#/orders`；侧栏「工单列表」始终返回列表根路由。

### 核对工作台五状态（本轮确定）

一致（绿）/ 合并一致（青）/ 金额差异（黄）/ 合同已含（红）/ 未识别（灰）。

- **合同已含**：专门对应服务商单独列「搬运费」的情况，系统自动标记并提示已含在基础安装中（复用 BRD 典型案例：搬运费 60 元）。
- 示例同时覆盖：桥架材料+安装费 → 合并一致；电缆穿管单价 34 vs 32 → 金额差异；高空作业费 → 未识别。

## 变更记录

| 轮次 | 日期 | 内容 |
| --- | --- | --- |
| v1 | 2026-09-13 | 初版：6 页面、导航切换、新建工单、服务商表单实时计算 |
| v2 | 2026-09-13 | 核对工作台状态改五态；服务商提交页按计算逻辑分区；工单列表增加待办卡/Tab/搜索/分页；导航改 hash 路由 + 面包屑 + 默认路由 |
| v3 | 2026-09-13 | UI 美化（飞书工作台 / Stripe 风格）：全局配色与字体层级（侧栏 #1C2536、主背景 #F5F7FA、强调 #0065BD、危险 #E74242、成功 #27AE60）；工单列表状态圆点标签 + 48px 行高 + 操作 hover 显隐 + 新增「申报金额」右对齐列；核对工作台竖向分隔线 / 差异行 4px 色条 / 吸顶操作区 / 差额 +- 符号；看板 KPI 去边框 + 32px 数字 + 柱状渐变蓝；服务商提交页白色卡片 + 灰底工单信息 + 实时总额 + 红色全宽提交 |
| v4 | 2026-09-13 | 工单列表新增「发起核对」：右上角按钮改为「+ 发起核对」；弹窗表单（京东工单号 / 服务商名称 / 项目地址 / 安装完成日期默认今天）；提交后新增「待提交」记录置顶、该行「复制提交链接」点击后 toast「链接已复制，请发送给服务商」 |
| v5 | 2026-09-13 | Step 4 数据库设计：`memory-bank/schema.md`（5 张表 + 关系 + 枚举映射）+ `migrations/0001_init.sql`（D1 建表，金额分存储、主外键、索引） |
| v6 | 2026-09-13 | Step 5：填充 memory-bank 设计决策 / 技术栈 / 架构三文档（design-document、tech-stack、architecture），确认 D1–D7 决策与 TanStack Table / Recharts / jsPDF 技术选型 |
| v7 | 2026-09-13 | Step 6：生成主 PRD `docs/prd.md` v1.0（产品概述 / F01–F07 模块说明含用户故事与验收标准 / 数据流程 / 非功能需求）；补 F04「确认核对完成」按钮置灰校验 |
| v8 | 2026-09-13 | PRD 定稿（补 F03 submit_token 一次性有效 / F07 停用边界条件）；Step 7：F04 详细设计 `docs/prd-f04.md`（匹配算法 / 触发条件 / 状态流转 / 字段对应） |
| v9 | 2026-09-13 | 确认关键词映射简化方案（硬编码，不新增配置表）；Step 8：实现计划 `memory-bank/implementation-plan.md`（4 阶段 + 禁止事项 + 开发约定） |
| v10 | 2026-09-13 | Phase 1 脚手架：Vite + React 18 + TS + Tailwind v3 + Router v6 初始化；`src/features/` 六模块；`src/config/schema.ts`（禁区）；D1 本地迁移 + 5 条种子数据；`npm run dev` 与 tsc 验证通过 |
| v11 | 2026-09-13 | Phase 2 核心数据层 + API：`functions/api/`（Pages Functions + D1 binding）5 端点 + `matcher.ts` 关键词映射 + 自动核对；`@cloudflare/workers-types` 入库；`tsconfig.json` 纳入 functions 类型检查；AGENTS.md 目录约定改 orders/reconciliation/settlement/dashboard/fee-library/submit（删 auth/）；本地联调验证五状态 + 结算门控 + token 一次性 |
| v12 | 2026-09-13 | Phase 3 F04 核对工作台：`src/shared/`（api.ts 类型化客户端 / format.ts 金额格式化 / status.ts 状态色板）+ `vite.config.ts` 代理 `/api`→8788；重写 `src/features/reconciliation/index.tsx`（统计卡 + 五状态图例 + 需人工处理/已处理分区 + 接受差额/驳回/手动匹配 + 确认完成生成账单）；后端补 `reconcile.ts` 输出 `summary`（申报/通过/待处理差异/待处理项数）+ `GET /api/work-orders/:id` + `POST /api/reconciliation-items/:id` 人工处理；`settlements.ts` 门控纳入 contract_included、核减纳入 manual_note 含「驳回」项；端到端验证五状态 + 人工处理 + 结算门控 + 账单金额 |
| v13 | 2026-09-13 | Phase 3 F03 服务商提交页：后端补 `GET /api/submit/:token`（只读解析 token → 工单 + 标准项，不消耗 token）；重写 `src/features/submit/index.tsx`（按标准项 calc_method 分区：fixed 勾选确认 / per_meter、per_unit 填数 / actual 填名称+金额，实时总额，提交后只读「已提交等待核对」）；`App.tsx` 服务商页隐藏管理端导航；端到端验证 token 解析 + 提交 + 一次性（重复提交 409） |
| v14 | 2026-09-13 | Phase 3 F02 工单列表：重写 `src/features/orders/index.tsx`（3 待办卡 + 6 状态 Tab + 搜索 + 客户端分页 20/页 + 状态圆点 + 按状态行操作 + 发起核对弹窗 4 字段默认今天）；验证 list/filter/search + 重复工单号 409 |
| v15 | 2026-09-13 | Phase 3 F05 结算账单 + F07 标准费用库：重写 `src/features/settlement/index.tsx`（账单头 bill_no + 复制链接 + 导出 PDF 走 `window.print()` / 工单信息 KV / 申报·核减·应付汇总 / 费用明细 / 核减明细 / 调整记录留痕）；重写 `src/features/fee-library/index.tsx`（标准项表格 + 新增/编辑弹窗 calc_method 四选 + 停用/启用 `window.confirm`）；后端补 `PATCH /api/standard-fee-items/:id`（动态 SET 子句，校验唯一名 + calc_method）；验证结算账单渲染 + 标准项启停 |
| v16 | 2026-09-13 | Phase 3 F06 数据看板：后端补 `functions/api/dashboard/summary.ts`（`GET /api/dashboard/summary`，JS 内聚合避免 SQLite 日期解析差异，`monthOf=iso.slice(0,7)` 兼容两种时间戳格式）；`api.ts` 补 `getDashboard` + Dashboard* 类型；重写 `src/features/dashboard/index.tsx`（5 KPI 卡 / 近 6 月金额 CSS 渐变柱状图 / 服务商占比横条 / 待处理差异表 → 进入核对链接）；端到端验证 KPI + monthly + provider_share + pending_items（amount_diff 差异项正确入表）

## 下一步建议

> Phase 1、Phase 2、Phase 3 已完成：六个前端页面（F04/F03/F02/F05/F07/F06）全部实现并通过类型检查、构建与端到端联调。

1. ~~F04 费用核对工作台~~ ✅ 已完成（含 `POST /api/reconciliation-items/:id` 人工处理、核对摘要、结算门控）。
2. ~~F03 服务商提交页~~ ✅ 已完成（`GET /api/submit/:token` + 按计算逻辑分区 + 金额实时计算 + 一次性只读态）。
3. ~~F02 工单列表~~ ✅ 已完成（待办卡 + 6 Tab + 搜索 + 分页 + 发起核对弹窗）。
4. ~~F05 结算账单~~ ✅ 已完成（账单汇总 + 明细 + 调整记录 + 导出 PDF 走 `window.print()`）。
5. ~~F07 标准费用库~~ ✅ 已完成（表格 + 新增/编辑 + 停用/启用，`PATCH /api/standard-fee-items/:id`）。
6. ~~F06 数据看板~~ ✅ 已完成（5 KPI + 近 6 月柱状图 + 服务商占比 + 待处理差异表，`GET /api/dashboard/summary`）。
7. Phase 4 部署：`/api/auth/login`（管理端登录，schema 无账号表，需评估会话方案）、PDF 导出（当前 `window.print()` 为务实替代，因 CJK 字体 jsPDF 需嵌入中文字体）、`docs/test-cases.md` 测试用例。
