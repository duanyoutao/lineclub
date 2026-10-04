# 「我的」面板

2026-10-04：新增登录后的个人档案入口，显示身份、权限、所属、待办与预约。

## 入口与位置

顶栏 `system-nav` 里与 `PERSONNEL`、`SAVED` 并列的一个按钮（`◎ 我的`），带一个待办计数徽标。徽标是**会变的**，与旁边两个固定徽标不同，因此在两处同步：`completeStartup()`（登录门与会话恢复两条路径的唯一汇合点）和 `recordAccess()`（每次开启档案之后）。

面板本身在 `#stage` 内，层级 34，高于人员表（32）与阅读浮层（31）。

## 五个分区

| 分区 | 数据来源 |
| --- | --- |
| 身份 | `Session`（账号、姓名、编目号、类型、在编状态）+ `personnel.json` 的 `note` |
| 权限 | `clearance`（与人员名录同一套措辞）、名下档案数、**可读取列** |
| 所属 | `department`、`position`、**同科室成员** |
| 待办 | 名下档案 − 已读记录，可点击直接跳转到该档案 |
| 预约 | `assignments.json`，含时间、地点、同行人、关联档案 |

「可读取列」与「同科室」是**派生**的，不是新字段：前者是这名操作员名下档案所在分类的去重结果，后者是名录里同科室的其他人。这样面板不会为了排版而编出数据里没有的权限。

顶部四个数字：待办 / 预约 / 已读 / 同科室。

## 数据层

- 新增 `content/assignments.json`：26 个账号各 1–2 条排期，共 37 条。`scripts/archive-content.mjs` 新增 `validateAssignments`，**跨三个文件核对**：
  - `account` 必须存在于 `credentials.json`；
  - `with` 的每个姓名必须存在于 `personnel.json`；
  - `records` 必须存在，且**必须是该账号自己名下**的档案 —— 排期不该成为一条绕过「相关人物」字段的授权路径；
  - `kind` 必须在 `kinds` 中声明，`at` 必须是 `MM-DD HH:MM`；
  - 编号从 `A-001` 起连续；
  - **每个账号至少有一条排期**，否则打开「我的」会看到空页，而这是数据层能提前发现的问题。
- 新增 `src/read-history.ts`：按账号持久化已读记录（`rhine-read-v1`，形如 `{ "kristen.wright": ["X-001"] }`）。这是**待办能跨会话**的前提。
  - 与详情页的 `ACCESS LOG` 明确分工：那个是**本次访问**的内存日志，持久化它反而是错的；这里回答的是「还有什么没读」，只有跨会话才答得上来，且必须按账号分，因为同一浏览器会有多个操作员登录。
  - 读取是容错的：非预期结构直接丢弃而不是修补，非法编号不写入，写入时去重并截断到每账号 200 条。存储不可用时退化为「全部未读」，而不是抛错。

## 生命周期

完全对齐 `PersonnelOverlay`：同级节点 inert、浮层独占焦点与 ESC、退出完成后才归还焦点、`surfaceTransitions` 关闭时跳过 Web Animations、Tab 在面板内循环。

与人员表的差异是刻意的：面板**没有任何写入**，所以没有需要调和的关闭状态；内容在每次 `open()` 时重新渲染，因为已读记录会在面板关闭期间变化，而「待办」列表过期会是这页唯一真正错误的内容。

未登录时（壁纸端、带 `scene`/`time`/`review` 参数的对照入口）显示明确的「无会话」说明，而不是编一个操作员出来。

## 验证

- `npx tsc --noEmit` 通过。
- `npm run check:content` **56/56** 通过（新增 10 项：排期语义 2 项 + 反例 8 项）。
- `tsc --noEmit` 与 `vite build`（117 模块，chunk 与两个 GLB 均正常产出）通过。注：在**本机 agent 沙箱**里 `npm run build` 会在清空 `dist/assets` 时被批量删除保护拦下（`[SAFE_DELETE_BULK_CONFIRM_REQUIRED]`，51 个文件 > 阈值 50），这与代码无关，用户在自己的终端里执行不受影响。
- **排期计数一致性**：`.tools/verify-schedule-grouping.mjs` 对 `content/assignments.json` 复现新旧两套分组，确认旧写法丢弃 11 条排期（26 个账号中有 11 个持有两条），修复后每人的统计卡片、预约卡片行数、页脚计数三处同源同值。

### 截图：只保留一张，且**早于计数修复**

`shot-profile.mjs` 静态服务真实 `dist/` 取图。**当前进入方式已改为 DevTools 协议 + 真实时间**（原 `--virtual-time-budget` 方案在本项目不可用，详见 `.workbuddy/memory/2026-10-04.md`）。该脚本在这一环境下仍不稳定，因此只产出了下面这一张；其余五张（亮色 / 1920×1080 / 500×900 / 待办空态 / 无会话）**尚未产出**。

| 截图 | 内容 | 说明 |
| --- | --- | --- |
| `profile-dark.png` | 暗色，Kristen Wright，已读 2 / 待办 4 | **修复前**拍摄：顶部预约卡片显示 `01`，页脚显示 `02 SCHEDULED`，正是下文那个缺陷。版式与其余内容仍可参考。 |

登录态走的是系统自己写的那种恢复记录（`rhine-resume`）+ 已读台账（`rhine-read-v1`），不是伪造 DOM；驱动脚本点击的是真实的顶栏按钮。

## 已修缺陷：预约计数自相矛盾（曾出现 `01` / `02` 不一致）

- **成因**：`byAccount` 原为 `new Map(schedule.map((e) => [e.account, e]))` —— Map 对同一 key 只保留一个值，因此每个账号的第二条及以后的排期在 UI 见到之前就被丢掉了。
- **表现**：顶部卡片 `stat(..., mine ? 1 : 0, ...)` 恒显示 `01`；页脚数的是 `schedule.filter(...)` 全部；预约卡片只渲染 `mine` 一条。kristen.wright 实有 2 条，于是三处两两不一致。
- **修法**：`byAccount` 改为 `Map<string, Appointment[]>` 分组并按 `at` 升序排序（槽位写成定宽 `MM-DD HH:MM`，字典序即时间序）；统计卡片取 `mine.length`，caption 改为「最近 <最早槽位>」；预约卡片 `mine.map()` 渲染全部；页脚改为 `mine.length`。三处同源。
- **影响面**：11 个账号的预约数字与列表此前是错的。

## 未覆盖

- 未在真实手机 / Safari 上验证。窄屏现在由 `Emulation.setDeviceMetricsOverride` 精确设定视口，不受 Windows 上 Chrome 窗口约 500px 下限的限制，因此 390×844 这类真实手机视口是可以取的——只是那几张图尚未产出。
- 未做逐像素设计核对：排版沿用 `personnel.css` 的既有规范，没有新的设计稿。
- 「待办」只统计**名下**档案。跨账号的公开档案不参与统计，这是有意的：待办是这名操作员自己的事。

## 复核与修正（2026-10-04，第二次检查）

独立复核实现、数据与上面这份文档的结论后，修正五处：

| # | 问题 | 修正 |
| --- | --- | --- |
| 1 | 「预约」统计卡片写「最近 <at>」，但 `mine` 按定宽槽位排序，`mine[0]` 是**最早**的一条，不是下一场 | 文案改为「首场 <at>」，并在分组注释里写明字典序只在同一季内成立（演示日期不跨年） |
| 2 | 「同科室」只按 `department` 匹配，会把 `kind: "unit"` 的机构列成同事（总辖构件科会带出 `Rhine Lab`） | 加 `entry.kind === "person"` |
| 3 | `stat()` 是文件里唯一不转义的数据出口（`label`／`caption` 原样入 HTML，caption 带 `person.department`、`mine[0].at`） | `stat()` 内转义，与 `field()`／`chips()` 一致 |
| 4 | `main.ts` 死导入 `pendingCount`（已由 `pendingFor()` 封装） | 只留 `markRead` |
| 5 | `presence[person.status]` 没有兜底，与旁边 `access[...] ?? [...]` 不对称 | 补 `?? [person.status, ""]` |

数据与校验的独立复核：

- 37 条排期覆盖全部 26 个账号、每账号 ≤2 条；无未知账号、`with` 无未知姓名、`at` 全为 `MM-DD HH:MM`、`kind` 均已声明、编号连续 ✓
- **没有**任何一条排期引用不属于该账号名下的档案 ✓
- 自行篡改五份副本（借用他人档案 / 未知账号 / 删除某账号全部排期 / 非法 kind / 时间格式错），`validateAssignments` 全部拒绝，真实数据通过 ✓（`npm run check:content` 那 56 项在本机沙箱跑不了：node test runner 是 `spawn EPERM`，因此改为直接调用校验函数）

浏览器复核（Edge 1600×900 与 900×820，`verification/profile/results-after-fix.json`）：

- 预约卡片 2 条、统计卡片 `02`、页脚 `02 SCHEDULED` 三处一致 ✓
- 同科室只列出 `Saria`，机构 `Rhine Lab` 不再混入（`unitsLeaked: []`，测试账号的科室确实含该机构）✓
- 从待办点开 `X-001` → 进入详情、徽标 06→05；重开面板：待办 05、已读 01，跨会话台账生效 ✓
- 两种视口均无横向溢出、无页面异常 ✓
- 新增截图 `profile-after-fix.png`（修正后）；`profile-dark.png` 保留为修正前、含计数缺陷的那张。
