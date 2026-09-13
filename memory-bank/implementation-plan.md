# 实现计划（implementation-plan）

> 项目：京东充电桩安装费用核对平台
> 更新日期：2026-09-13
> 状态：Step 8 完成
> 依据：`docs/prd.md`、`docs/prd-f04.md`、`memory-bank/architecture.md`、`memory-bank/tech-stack.md`

## 总览

共 4 个阶段，预计 7 个工作日：

| 阶段 | 内容 | 预计 |
| --- | --- | --- |
| Phase 1 | 脚手架与基础设施 | 1 天 |
| Phase 2 | 核心数据层 + API | 2 天 |
| Phase 3 | 前端页面开发 | 3 天 |
| Phase 4 | 集成测试 + 部署 | 1 天 |

## 开发阶段划分（4 个阶段）

### Phase 1：脚手架与基础设施（预计 1 天）

**目标**：搭建可运行的前后端骨架，数据库就绪。

**任务**

1. Vite + React 18 + TypeScript + Tailwind CSS v3 + React Router v6 初始化。
2. 目录结构按 `src/features/` 搭建：`auth / workorders / reconciliation / settlements / standards / provider-submit` + `src/shared/`。
3. Cloudflare D1 本地初始化（binding 名称 `DB`），执行 `migrations/0001_init.sql`。
4. 写入种子数据：5 条标准费用项（基础安装 / 桥架综合施工 / 电缆穿管 / 断路器安装 / 其他增项）。
5. 建立 `src/config/schema.ts`（标准核对核心数据结构，**此后为禁区**）。

**验收**

- `npm run dev` 可启动，空页面可路由。
- D1 本地建表成功，5 条标准项可查。
- 目录结构符合 AGENTS.md 约定。

### Phase 2：核心数据层 + API（预计 2 天）

**目标**：Workers API 打通 D1，自动匹配逻辑完成。

**任务**

1. Cloudflare Workers 搭建，`functions/api/` 目录，配置 D1 binding。
2. 实现 5 个核心 API 端点（对应 5 张核心实体，完整端点表见 architecture.md）：
   - `POST /api/work-orders` —— 发起核对，生成 `submit_token`
   - `POST /api/submissions` —— 服务商提交（token 校验，一次性有效）
   - `GET/POST /api/reconciliation-items` —— 核对明细 + 自动匹配
   - `POST /api/settlements` —— 生成结算账单
   - `GET/POST /api/standard-fee-items` —— 标准库维护
3. **重点**：`/api/reconciliation-items` 的自动匹配逻辑（硬编码关键词，见「开发约定」）。

**验收**

- 本地联调走通：发起核对 → 服务商提交 → 自动生成五状态核对明细。
- 金额 API 传输以「分」为单位。

### Phase 3：前端页面开发（预计 3 天）

**目标**：按优先级完成 6 个页面。

优先级从高到低：

1. **F04 费用核对工作台**（最复杂，核心价值）
2. **F03 服务商提交页**（外部链接）
3. **F02 工单列表**（含发起核对弹窗）
4. **F05 结算账单**
5. **F07 标准费用库**
6. **F06 数据看板**

**验收**：每个页面符合 PRD 对应模块的验收标准。

### Phase 4：集成测试 + 部署（预计 1 天）

**任务**

1. 本地端到端测试（覆盖 F03 token 一次性、F04 确认按钮门控等边界条件）。
2. Cloudflare Pages 部署前端 + Workers。
3. D1 生产环境初始化（执行迁移 + 种子数据）。

**验收**：线上全流程走通，满足 PRD 非功能需求（性能 / 安全 / 兼容）。

## 禁止事项

- 不得修改 `migrations/0001_init.sql`（已定稿）。
- 不得修改 `src/config/schema.ts`（建立后为禁区）。
- 不新增关键词映射配置表（采用硬编码简化方案）。

## 开发约定

- **金额**：API 传输以「分」为单位（INTEGER），前端显示时 `/100` 转元。
- **自动匹配**：硬编码关键词写在 `functions/api/lib/matcher.ts`（如「搬运」→ 合同已含、「桥架」→ 桥架综合施工）；MVP 阶段够用，后续再扩展。
- 目录结构与命名遵循 AGENTS.md、tech-stack.md。
