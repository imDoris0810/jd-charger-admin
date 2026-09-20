# M0 基线备份清单

> 备份时间：2026-09-19 18:06:47 CST
> 备份目的：M0 基线锁定。此目录为**只读历史快照**，任何批次不得修改其中文件。
> 目录位置：仓库根目录 `backup/m0/`（**不在 `docs/` 内**，不会被页面加载）

## 备份文件

| 原路径 | 备份路径 | 行数 | SHA-256 |
| --- | --- | --- | --- |
| `docs/prototype.html` | `backup/m0/prototype.html` | 941 | `ed506fdfabc2d536b8d390b653f18063ea12d324f895d821b3de95482f0856d9` |
| `docs/prototype.css` | `backup/m0/prototype.css` | 485 | `55356cbd8af83b922be918ec0e17c3e785105a8b2dc254e71841c611fa1c454a` |
| `docs/prototype.js` | `backup/m0/prototype.js` | 490 | `d72b8b243f0964a4b6d4bc0d3de53f14f1dbef7f9aea3a61c938ac6eb5849eef` |

## 校验命令

```bash
# 备份完整性（应与上表一致）
shasum -a 256 backup/m0/prototype.*

# 与源文件比对（M0 完成后应无差异）
diff backup/m0/prototype.html docs/prototype.html
diff backup/m0/prototype.css  docs/prototype.css
diff backup/m0/prototype.js   docs/prototype.js
```

## 回退方法

任一批次失败时，从此目录复制回 `docs/`：

```bash
cp backup/m0/prototype.html backup/m0/prototype.css backup/m0/prototype.js docs/
```

> 注意：M0 之后新增了 `docs/prototype.data.js`。回退到 M0 前状态时，
> 还需移除 `docs/prototype.html` 中对 `prototype.data.js` 的引用行，
> 否则页面会因数据重复定义而报错。

## 依据

- `AGENTS.md`（项目宪法）
- `docs/requirements-baseline.md`（需求基线）
- `docs/brd.md`（BRD R-01～R-15）
- `docs/wireframe-spec-v2.1.docx`（已冻结的实现依据）
- `docs/frontend-migration-plan-v1.md`（迁移计划）
