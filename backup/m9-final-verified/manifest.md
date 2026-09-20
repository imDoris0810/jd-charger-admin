# 不可变快照 · M9 视觉回归修复轮复验版

> 冻结时间：2026-09-20
> 性质：**只读不可变快照**。本目录文件一经冻结不得修改；如需变更请另建新快照目录。
> 本目录**未覆盖**任何历史备份：`backup/m0/`、`backup/m9-final/`、`backup/m9-acceptance/` 及其余 `backup/m9-*-screenshots/` 均保持原样。

## 一、快照内容与校验

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `prototype.html` | 556 | `37648a8a49b51e304e02d4894886fb9446162baee47d7037df2c4cbe4d5871bd` |
| `prototype.css` | 1124 | `6419942138704fd33e9c3408bc83637bfe9ba0be85ad22792aa9cde298e52865` |
| `prototype.js` | 2721 | `3338c305bbec02c6957f69d62b94f84f0ff2700be3562abe1277564f49975d7f` |
| `prototype.data.js` | 2211 | `4945be3db5eebe7bab73845a595d0cb23bd1032aca9a1343c8596ab54dac360d` |

**校验命令**

```bash
shasum -a 256 backup/m9-final-verified/prototype.*
diff -r backup/m9-final-verified/prototype.html docs/prototype.html
diff -r backup/m9-final-verified/prototype.css docs/prototype.css
diff -r backup/m9-final-verified/prototype.js docs/prototype.js
diff -r backup/m9-final-verified/prototype.data.js docs/prototype.data.js
```

## 二、回退方式

```bash
cp backup/m9-final-verified/prototype.* docs/
```

回退到上一冻结版（M9 体验收口）：

```bash
cp backup/m9-acceptance/prototype.* docs/
```

## 三、备份关系

| 备份 | 内容 |
| --- | --- |
| `backup/m0/` | M0 基线锁定 |
| `backup/m9-final/` | M9 全量回归通过版本 |
| `backup/m9-acceptance/` | M9 最终体验收口版本 |
| `backup/m9-ui-fix-3/` | 本轮修复过程目录：四项源码副本 + `manifest.md` + `screenshots/`（A / B / C 三组验收截图 + 四档回归证据） |
| `backup/m9-final-verified/` | **本目录** — 本轮复验通过后的不可变快照（仅源码，不含截图） |

`backup/m9-ui-fix-3/prototype.*` 与本目录四个文件**逐字节一致**，两者是同一次冻结的源码副本；本目录为官方最终快照，`m9-ui-fix-3/` 保留为含截图的修复过程记录。

## 四、本快照对应的验证结论

完整报告见 `docs/prototype-final-test-report.md`（第八节为本轮修复明细与四档实测）。

| 维度 | 结果 |
| --- | --- |
| 程序化断言 | **780 / 780 通过** |
| 控制台错误 / 未捕获异常 | **0**（54 条路由全扫） |
| 文档级横向溢出（1440 / 1280 / 1100 / 900） | **0 处** |
| W6 差异子行可见单元格重叠 | **0 处**；表头与子行逐列对齐全部一致 |
| L3 待办列「N 项」折行 | **0 处**（四档均 1 行） |
| L4 三栏栅格 | 1440 `300/1fr/320`｜1280 `240/1fr/280`｜1100 `56/1fr/280`｜900 `56/1fr` + 右栏摘要条 |

本轮相对 `backup/m9-acceptance/` 的源码改动共 5 处：三项视觉回归修复 + 两项关键流程缺陷修复（C5 人工确认区按钮未渲染、C6 提交后未即时展示「提交中 · 等待回执」）。业务规则、数据模型、状态语义与权限模型均未改动。
