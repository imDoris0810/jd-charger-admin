# 视觉回归修复轮 · 快照与验证记录

> 冻结时间：2026-09-20 12:31 CST
> 说明：本目录为**本轮修复后的只读快照**，未覆盖 `backup/m9-final/`、`backup/m9-acceptance/`。

## 一、文件与校验

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `docs/prototype.html` | 556 | `37648a8a49b51e304e02d4894886fb9446162baee47d7037df2c4cbe4d5871bd` |
| `docs/prototype.css` | 1124 | `6419942138704fd33e9c3408bc83637bfe9ba0be85ad22792aa9cde298e52865` |
| `docs/prototype.js` | 2721 | `3338c305bbec02c6957f69d62b94f84f0ff2700be3562abe1277564f49975d7f` |
| `docs/prototype.data.js` | 2211 | `4945be3db5eebe7bab73845a595d0cb23bd1032aca9a1343c8596ab54dac360d` |

## 二、备份关系

| 备份 | 内容 |
| --- | --- |
| `backup/m0/` | M0 基线锁定 |
| `backup/m9-final/` | M9 全量回归通过版本 |
| `backup/m9-acceptance/` | 最终体验收口版本（交互修复 + 视觉优化） |
| `backup/m9-ui-fix-3/` | **本目录** — 三项视觉回归修复 + C5/C6 链路可达性修复 |
| `backup/m9-ui-fix-3/screenshots/` | 本轮验收截图 A / B / C 三组 |

## 三、校验与回退

```bash
shasum -a 256 backup/m9-ui-fix-3/prototype.*
cp backup/m9-ui-fix-3/prototype.* docs/
```

## 四、本轮改动（相对 backup/m9-acceptance）

| # | 位置 | 改动 |
| --- | --- | --- |
| 1 | `prototype.css` `.w6-cat-row` / `.w6-cat-chip`；`prototype.html:232-235`；`prototype.js` `renderW6` | 五类差异改为紧凑可点击筛选标签：栅格列数 5 / 3 / 2 决定换行点（宽屏一行、中屏 3+2、小屏换行）；说明文字移出标签栅格，避免长文本把标签轨道撑宽 |
| 2 | `prototype.html:236-258`；`prototype.css` `.data.w6-d` 区块；`prototype.js` `renderW6` | 待对账数据重建为固定栅格：表头 10 列 = 子行 10 列，父级整行 `colspan=10` 做工单组头，列宽由 `colgroup` + `table-layout:fixed` 固定 |
| 3 | `prototype.css` `#page-l3 .data` 待办列规则 | 待办列 88px + `nowrap`，「N 项」不再折成两行；最窄档位隐藏「最近更新」以保持无卡片内滚动 |
| 4 | `prototype.js` `aiDraftCard` 动作区判断 | 修复 C5 人工确认区**不渲染采纳/修改/拒绝按钮**的缺陷（缺省 `opts` 时被误判为隐藏） |
| 5 | `prototype.data.js` `c6Submit` | 提交后立即重绘「提交中 · 等待回执」；此前点击后到回执返回前界面无反馈 |

## 五、验证结果

| 项 | 结果 |
| --- | --- |
| 程序化断言（6 角色 × 5 页 × 4 宽度 + 5 工单 × 4 阶段 × 4 宽度 + 导航真实点击 + 深链接 + W6 交互 + 前进后退 + 角色隔离） | **780 / 780 通过** |
| 控制台错误 / 未捕获异常 | **0** |
| 文档级横向溢出（1440 / 1280 / 1100 / 900） | **0 处** |
| W6 栅格子行重叠（只比较可见单元格） | **0 处**；表头与子行逐列对齐全部 `ok` |
| L3 待办列行数（1440 / 1280 / 1100 / 900） | **均为 1 行** |
| L4 三栏栅格 | 1440 `300/1fr/320` ｜ 1280 `240/1fr/280` ｜ 1100 `56/1fr/280` ｜ 900 `56/1fr` + 右栏摘要条 |
