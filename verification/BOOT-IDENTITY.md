# 开场身份行跟随登录者

2026-10-02。用户要求：保留开场动画，把身份行的名字换成每次登录的人。

## 做法

三件事让它成立：

1. **时间轴与名字解耦**。`bootMotion(appTime, operator)` 只替换揭示用的字符串；`typed()` 按窗口比例揭示，所以 `ID CONFIRMED : ` 之后的姓名一律在**原来的 321–339 帧**内走完，后续节拍（367 的 `REQUEST RECEIVED` 等）不动。名字长短只改变每秒出字数。
2. **字排器支持「烘焙前缀 + 动态尾段」**。`BootLettering` 原本按整句烘焙固定数量的字形格（`identity` 正好 26 格），`setText()` 靠 `startsWith` 匹配；换个名字就匹配不上、会掉进降级分支。现在短语可声明静态前缀 `ID CONFIRMED : `：前缀继续用原来的 15 格烘焙字形，**其后的姓名单独成段**，在字体可用时按运行时测量的字形宽度建格（`canvas.measureText`，按字符缓存），没有授权字体包时降级为文本，不会整行失效。
3. **打字音效跟着重建**。`typing-rhythm.ts` 的帧表原本在模块加载时按原文算一次；现在 `setTypingOperator(name)` 按实际名字重算 321–339 区间内的击键帧，避免音画不同步。

长度分档（`#auth-message .boot-phrase[data-tail]`）：姓名 ≤11 字符原尺寸，12–15 字符 0.88em，>15 字符 0.78em，保证长名不撑出行宽。用 `en` 字段而不是中文名，因为这一行是 Novecento（只有拉丁字形）。

壁纸端与 `?scene=`／`?time=`／`?review=1` 对照入口不登录，`setOperator()` 从不调用，因此仍显示原片原文 `JOYCE MOORE`。

## 验证

`dist` 生产构建 + Edge 1600×900，三组（脚本 `.tools/operator-shot.mjs`，结果 `verification/boot-identity/results.json`）：

| 场景 | 结果 |
| --- | --- |
| 登录 `KRISTEN WRIGHT`（14 字符，命中 medium 档） | 揭示序列 `KR → KRIS → KRISTE → KRISTEN  → KRISTEN WRI → KRISTEN WRIGH → KRISTEN WRIGHT`，前缀格数恒为 15，`data-tail="medium"`（字号 21.35 → 18.79px），右边界 957 / 1600，未走降级分支 |
| 登录 `MAYLANDER FOUNDATION`（20 字符，命中 long 档） | `data-tail="long"`（16.65px），右边界 836 / 1600 |
| `?time=7.84&freeze=1`（不登录，逐帧对照） | 仍走**整句烘焙**路径：可见 16 格、无动态尾段、字号 21.35px，即原片文本与对齐未被改动 |

截图：`verification/boot-identity/mid-typing.png`（`▪ ID CONFIRMED : KRISTEN WRIGHT`）、`long-name.png`、`review-reference.png`。三组均无页面异常。

## 已知限制

- 本机检出没有授权 Novecento 字体包（该 kit 不入 Git），所以尾段走的是**文本降级**路径：视觉上与前面的向量前缀同基线、同色，但字形来自 MiSans；正式构建恢复字体包后尾段改用同一字体的实测字宽建格。
- 逐帧对照（`reference/boot-check.html`、`verification/BOOT-MOTION.md` 的标准）继续以 `JOYCE MOORE` 为准，因为对照入口不登录；登录后的开场不参与逐帧断言。
