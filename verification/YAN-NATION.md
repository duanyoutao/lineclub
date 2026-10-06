# X-044 大炎档案与逐文档文档模型 · 2026-10-05

用户要求按顺序新建一份介绍《明日方舟》世界观中大炎（炎国）的档案，并把这份档案的文档模型（详情页 360° 查看器的六组结构）中的「折射环组」与「光学核心」两组替换成 2026-10-05 建好的莱茵生命徽记。

## 档案内容

- `content/archives.json` 末尾追加 `X-044 大炎 / YAN`，分类「机构档案」（该列 10 → 11 份，低于 20 份上限），科室「地区资料组」，`lead` 为「大炎资料组」。正文六个章节：疆域与驰道、真龙与炎律、天师与考校、钦天监与司岁台、四座城、编目说明。设定事实经检索 PRTS 泰拉大典等公开资料核对（敕封神明、十二岁相碎片、宣政司—府—州县、卫所改募兵、1096 切城-龙门事件等），全文为档案式改写并保留来源链接。
- 校验要求 `lead` 中的每个名字都必须出现在人员名录里，因此 `content/personnel.json` 同步追加 `P-027 大炎资料组`（unit，地区资料组，records 指向 X-044）；登录凭据由 `npm run export:credentials` 派生（账号 `yan.archive.section`）；`content/assignments.json` 追加 `A-038`（归档确认），满足「每个账号至少一条排期」的跨文件校验。
- `npm run export:archives` 重新生成 44 份 TXT；`npm run check:content` 56 项测试全部通过。三个 JSON 均以文本级插入维护，未触碰既有记录的字节。

## 逐文档文档模型

- `data.ts` 新增可选字段 `assembly`（与既有 `substrate` 同类的逐文档资产声明，存相对 public/ 的路径）；X-044 声明 `assets/archive-assembly-yan.glb`。
- `scene.ts` 的 `createAssemblyModel` 接受该字段，模板缓存改为按资产名分键的 Map——此前单一缓存会让先打开的其它档案占住缓存，导致 X-044 的变体永远不加载；场景释放时遍历清理。
- `appearance.ts` 新增 `ensure(name, material)`：变体 glb 携带了共享 cassette 没有的材质（`Emblem_Ivory` / `Emblem_Titanium`），不注册会在 prepare() 里退化为印刷画布路径；`theme-material.ts` 的 surfaces 表补了这两个名字的暗色锚点（取值对齐象牙边与标准钛）。
- `main.ts` 打开查看器时传入当前档案的 `assembly`。

## 详情特写与拆解分组（用户反馈后的第二轮）

- **拆解分组错误**：徽记带两个材质槽（正面 + 侧壁），Blender 导出为「组 + 每槽一个网格」，`assemblyPart` 标在组上，而查看器扁平化时只读网格自身——标记丢失后徽记被默认归入盖板组，拆解时跟着盖板走。修复为沿父链找回标记（`scene.ts` 的 traverse 向上查），这同时修掉了共享资产里被 Blender 拆分的 Titanium_Fasteners 螺丝一直被误归盖板组的老问题。
- **详情特写仍是共享盒**：详情页的档案盒是全局共享的单体 cassette，`assembly` 此前只影响 360° 查看器。新增逐文档交换：
  - `art/build_yan_cassette.py`（共用 `art/emblem_geometry.py` 的徽记构建）重建共享 cassette，删去全部光学腔及其内构（含 `internal_architecture.py` 的环体、琥珀嵌片、膜与光带），插入同样的两枚徽记。逐材质顶点数对比确认：变体与共享资产除光学面外完全一致，`Optical_Edges` 的盒体模具件（通道唇、周边、接缝）原样保留。
  - `scene.ts` 照 `updateSubstrateDecal` 的模式实现 `updateAssemblyVariant`：选中档案变化时隐藏共享盒的五个光学面（`OPTICAL_SURFACES`），挂载变体的徽记与盒体模具面；变体模型按资产名缓存、ticket 防竞态、离开变体档案立即还原共享面（只切 visible，不销毁几何）。变体资产名由 `assembly` 字段把 `archive-assembly-` 换成 `archive-cassette-` 派生，一个字段驱动两个模型。
- 产物新增 `public/assets/archive-cassette-yan.glb` 与源工程 `art/rhine-archive-yan.blend`、审阅图 `art/yan-cassette-detail.png`（徽记透过磨砂盖板可见）。

## 模型生成

- `art/build_yan_assembly.py`：复用 `build_archive.py` 的几何前缀与 `build_assembly.py` 的分组合并导出流程，在两者之间删去 `optical-lenses` 与 `optical-core` 两组原部件，改为从 `art/emblem-outline.json` 生成两枚徽记——大的（高 1.58）落在原宽光学腔 (x=-0.44, z=1.92)，小的（高 0.87）落在原窄光学腔 (x=1.13, z=2.48)，保持替换前的部件位置关系。
- 徽记在 XZ 平面、正面朝 -Y，与档案盒正面同向；厚度 Solidify 0.05（导出时 y×2 后为 0.10），整体位于磨砂盖板（-0.19）与信息基板（0.05）之间，不穿透。
- 产物：`public/assets/archive-assembly-yan.glb`（1.4 MB，原共享 glb 未改动）与源工程 `art/archive-assembly-yan.blend`；`art/setup_yan_assembly_studio.py` 从零重建模型并渲染两张审阅图。
- 装配态审阅图存 `public/media/yan-assembly.jpg`，同时作为 X-044「编目说明」一章的配图；拆解审阅图存 `art/yan-assembly-exploded.png`。

## 验证

- `node --experimental-strip-types scripts/check-assembly.mjs`：通过。共享资产六组顶点误差 2.666e-7、高度 3.7 不变；新增对变体的检查——六组契约相同、顶组节点均带 `assemblyPart`、`Emblem_Ivory` 与 `Emblem_Titanium` 两个面存在。
- `npx tsc` 通过；`npm run build` 通过（沙箱内需 `ESBUILD_BINARY_PATH` 指向 Temp 下的 esbuild 副本，产物含变体 glb、X-044 TXT 与配图）。
- `.tools/verify-yan-assembly.mjs`（gitignored）：对运行中的 dev server 打穿「X-044 字段 → publicAsset 拼接 → HTTP 加载变体 glb → glb 内含六组与徽记材质」的链路；并逐材质对比共享与变体 cassette——交换集之外的所有面顶点数一致、包围盒重合（切交换不露接缝）、徽记位于盖板与基板之间；共享资产不含徽记材质。全部通过。
- **浏览器实测曾报「模型载入失败」**：首版实现把字段当纯文件名再拼一层 `assets/`，而档案里存的是相对 public/ 的完整路径，实际请求变成 `assets/assets/…` 404。修复为字段直通 `publicAsset`（与 `substrate` 约定一致）。教训：链路验证脚本当时复刻的是"我以为的拼接"而不是 `scene.ts` 的真实代码，404 因此漏网；验证必须取真实源码的拼接行为，而不是重新实现一遍。
- 渲染复核：装配态下两枚徽记透过磨砂盖板可见；拆解态顶视图中六层沿厚度轴展开，两枚徽记完整显形。注意审阅相机的角度选择：正视拆解会被磨砂盖板糊住全部内层，斜 45° 侧视只能看到徽记的侧壁，唯有顶视能同时呈现分层与徽记正面。

模型源文件与脚本均已保留；共享资产 `archive-assembly.glb`、其余 43 份档案与既有校验行为未变。
