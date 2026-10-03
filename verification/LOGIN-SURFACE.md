# 登录页版式重做

2026-10-03：用户提供参考版式并指出原登录页「太难看」。原来的实现是一个居中的米色方框面板（Logo / 身份验证 / 两个白底方框输入 / 深色按钮 / 底部说明），与终端其余部分和开场背景都不连续。

## 做了什么

- **去面板化**：登录页改为整屏铺开，直接使用开场背景的同一组渐变数值（`ellipse at 51% 48%, var(--theme-panel) → var(--theme-paper) 76%`），因此登录结束接开场没有接缝。参考图的深色观感由暗色主题给出。
- **双栏构图**：左侧标志（`.login-mark`，含 172% 宽度的微弱环形光晕），右侧表单；整组居中。`#viewport` 内不受 `#stage` 缩放影响，用真实视口像素。
- **下划线输入**：输入框只剩一条底线；聚焦时用 `inset` 阴影加粗到 2px，不产生重排。失败时底线与状态文字转红（暗色下用更亮的 `#dd8874`）。
- **整宽按钮**：`--theme-ink` 底 + `--theme-paper` 字，两种主题下都是实心条；未填完两项时退化为描边空条（原先的半透明填充会读成「坏掉了」）。按钮文案改回 `LOGIN`，等待声音时显示 `PREPARING AUDIO…`。
- **左上标志复用 `.brand`**：沿用既有的 44px / 19px / 35px 字距校准，只覆写锚点与 `transform: scale()`，不产生第二份字距参数。选择器写作 `.login .login-brand`，与 `style.css` 的加载顺序无关。
- **底栏链接行**：左侧 `DEMO ACCESS`（取代参考图的 `REGISTER`，本项目没有注册流程）展开三条示例账号，点选直接填表并聚焦提交；右侧 `ENTER WITHOUT AUDIO` 仍是声音失败时的无声通道，默认隐藏。
- **配色不写死**：`paintTheme()` 在构造登录页之前就已写入 `--theme-*`，所以同一套版式在亮色下是浅色版。原先 `login.css` 里「此屏早于会话，读不到主题变量」的注释是错的，已删除。

## 行为层未改动

`LoginGate` 的构造参数、`Session` 接口，以及 `scripts/check-*.mjs` 与 `scripts/sign-in.mjs` 依赖的选择器（`.login-form`、`.login-submit`、`.login-silent`、`.login-status`、`#login-account`、`#login-secret`）全部保持。唯一的行为修正是：声音解锁抛错后按钮文案会被还原（原先会一直停在 `PREPARING AUDIO…`）。

## 验证

- `tsc --noEmit` 通过（682 个文件）;`npm run check:content` 46/46 通过。
- 本机未安装 playwright，`scripts/check-*.mjs` 无法运行。改用临时 harness：用 `esbuild.transform()` 逐文件转译后手工拼接（沙箱里 esbuild 的 service 进程读不到磁盘），链接**真实的 `style.css`**（不手抄片段），静态服务把 `/fonts/*` 映射到 `public/`，再在真实 Chrome 中驱动 `LoginGate`。
- 结果见 `behaviour.json`：27 项断言全部通过，覆盖空提交、大小写与空格容错、失败计数与清空、DEMO 展开与填表、声音成功／被拒／抛错三种回执、无声通道。
- 截图见同目录：暗色桌面（默认态 / 已填 / 示例账号）、亮色桌面（默认态 / 失败态）、暗色手机 390×844。
- 手机档通过 390×844 的 iframe 取得真实窄视口（Windows 上 Chrome/Edge 的窗口宽有约 500px 下限，`--force-device-scale-factor` 在 `--headless=new` 下不生效）。该档下两项输入、`LOGIN` 按钮、链接行与说明全部落在视口内。

## 未覆盖

- 未做逐像素对照：参考图来自另一个应用，配色、字号与间距沿用本项目规范，只取版式。
- 开场接续只在数值上对齐（同一组渐变），没有逐帧录制登录结束到开场首帧的过渡。
- 未在真实 iPhone / Safari 上验证。
- `verification/login-surface/*.png` 由临时 harness 生成，harness 本身在 `.tools/login-review/`（不进入 Git）。
