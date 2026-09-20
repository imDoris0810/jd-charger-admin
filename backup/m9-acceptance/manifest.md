# 最终体验收口 · 验收快照

> 冻结时间：2026-09-20 11:24:14 CST
> 说明：本目录为**只读验收快照**，不覆盖 `backup/m9-final/` 历史备份。

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `docs/prototype.html` | 547 | `0e5a87d1f81faebbd9321d5796b40ce6e5be810c60e079633edf99c90fbcec36` |
| `docs/prototype.css` | 1067 | `dcbc7a63aeab043d1985269acd42fd3a0677560b80036c2d23ce81427b882a24` |
| `docs/prototype.js` | 2709 | `d7c83468c3df8d4c3efd335c9b90d3186b01c7e092991a60570d6a59742f0ec0` |
| `docs/prototype.data.js` | 2206 | `5a2656a1ead5a11f754bccb5529d01b77ce636f1b470c352de592c10d2fce1de` |

## 与历史备份的关系

| 备份 | 内容 |
| --- | --- |
| `backup/m0/` | M0 基线锁定 |
| `backup/m9-final/` | M9 全量回归通过版本 |
| `backup/m9-acceptance/` | **本目录** — 最终体验收口版本（交互修复 + 视觉优化） |

## 校验与回退

```bash
shasum -a 256 backup/m9-acceptance/prototype.*
cp backup/m9-acceptance/prototype.* docs/
```
