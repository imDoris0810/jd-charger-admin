# M2 验收截图

| 文件 | 内容 | 验证点 |
| --- | --- | --- |
| 01-canvas-3col-1600.png | 三栏协同画布（1600px） | 左=工单事实 / 中=当前工作 / 右=正式记录；右栏三区块空态 |
| 02-bp-1440.png | 1440px | 三栏全展开 300 / flex / 320 |
| 03-bp-1280.png | 1280px | 左栏 240 + 右栏 280 |
| 04-bp-1100.png | 1100px | 左栏折叠为 56px 图标条；右栏保持 280 |
| 05-bp-900.png | 900px | 左栏图标条；右栏折叠为顶部「正式版本摘要条」 |

命令（可复现）：

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
U="file://$PWD/docs/prototype.html?role=verifier#w4/JD202409130001/handover"
for w in 1440 1280 1100 900; do
  "$CHROME" --headless=new --disable-gpu --no-sandbox --allow-file-access-from-files \
    --hide-scrollbars --virtual-time-budget=6000 --window-size=$w,1100 \
    --screenshot=bp-$w.png "$U"
done
```
