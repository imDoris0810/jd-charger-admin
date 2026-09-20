# M9 最终交付 · 冻结快照（含视觉验收修复）

> 冻结时间：2026-09-20 11:10:00 CST
> 说明：本目录为**只读最终快照**，任何后续批次不得修改其中文件。

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `docs/prototype.html` | 552 | `37f6b92ee77307cf35525cd333fbb473dad57c3d09b47c4dead750df709af979` |
| `docs/prototype.css` | 1038 | `83a7417e915451fbcd6a1996d3383827b9b56084c5db08e683e4b98150033097` |
| `docs/prototype.js` | 2633 | `3e4bf518b8286ff8c11233cf0b367cc860973f495c7d271bc3658e9a565b5d7d` |
| `docs/prototype.data.js` | 2189 | `1f64e5c7b805e541396363064b514d6f6e7348a2aaa920782b745438bcf97767` |

## 校验

```bash
shasum -a 256 backup/m9-final/prototype.*
diff backup/m9-final/prototype.html docs/prototype.html
```

## 依据

`AGENTS.md` ｜ `docs/requirements-baseline.md` ｜ `docs/brd.md` ｜ `docs/wireframe-spec-v2.1.docx`
