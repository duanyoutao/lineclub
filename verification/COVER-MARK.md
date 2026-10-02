# 封面标志的闪烁（印刷面改为单层薄片）

2026-10-02。

用户反馈：档案封面上印的莱茵生命标志，在两条弧板相交的中间位置会闪。

## 原因

`art/build_archive.py` 把 `src/brand.ts` 的 `paths` 当作**实体板**挤出来：每条描边都是带侧壁、带封口的闭合板，五条板只按 `MARK_STEP`（0.0016）逐个错开深度。板厚是 0.006，远大于这个错位量，所以两条弧板在中心相交处（以及 + 的两笔、笔画端头与弧板内缘）大面积互相穿透，穿透出来的内侧壁面本身又只是比相邻板近/远千分之几。远摄详情镜头下深度精度不足以分开这两层，像素就在“朝外的印刷面”和“内侧灰面”之间跳，表现为交叉处的灰色三角闪烁。

用三角相交检测量化：原模型在标志内部有 **915 对三角面互相穿透**（用“交点必须落在两个三角形内部”的严格判据为 81 对），全部集中在中心交叉处（x 0.70–0.82、y 2.96–3.10）与 + 的交叉、端头处。

## 修改

- `art/build_archive.py`：`mark_band` 只生成朝外的一个**印刷面**（四边形条带），五条描边与 +/− 全部落在同一个平面，随后合并成一个对象并做一次精确自并集（`mesh.intersect_boolean(operation='UNION', solver='EXACT', use_self=True)`）。相交处与急转处自交的折边都被并入轮廓，整张印刷面不再有任何互相重叠的面。
- 第一次只去掉实体侧壁后，用户在放大视图里仍看到闪烁：同一条描边在急转处的偏移会折回自身，折边与本体共面、绕向相反，仍然抢像素。本轮的自并集正是去掉这层多余的折边。
- 资产用本机 Steam 版 Blender 5.2（`E:\SteamLibrary\steamapps\common\Blender\blender.exe`，即产出这批资产的同一导出器版本）按项目流程重新生成：`art/build_archive.py` 后再 `art/build_assembly.py`，更新 `public/assets/archive-cassette.glb`、`archive-assembly.glb` 与两个 `.blend` 源文件。
- 材质本身仍是 `doubleSided`，所以透过清透盖板从背面看仍然可读。

## 验证

`scripts/check-cover-mark.mjs`（对两个 GLB，各 336 个印刷面）：

| 项目 | 修改前 | 修改后 |
| --- | --- | --- |
| 标志内部互相穿透的三角面对 | 81（宽松判据 915） | **0** |
| 同一平面上互相重叠的面 | 33 | **0**（自并集把折边并入轮廓） |
| 印刷轮廓（封面平面、0.0012 网格） | 459450 px，宽 1.75、高 0.795 | 460140 px（+0.15%），宽高一致 |
| 印刷层 | 五条描边各自的深度平面 | 单一平面 |

轮廓由印刷面的栅格化得出：并集只删掉叠层的面，区域本身没有改动，0.15% 的差异来自重新三角化后边界像素的判定。修改前的原导出保留在 `.tools/mark-before/`，两次导出用同一脚本对比，见 `verification/cover-mark/results.json`。

真实浏览器中已确认：`npm run build` 通过，360° 查看器中封面标志的十字与加减号完整、相交处无三角缺口。本轮没有做逐帧闪烁像素统计。

## 复现

```sh
node scripts/check-cover-mark.mjs             # 几何与轮廓检查
```

重新生成模型（本机 Steam 版 Blender 5.2）：

```sh
"C:\Program Files\...\blender.exe" --background --factory-startup --python-expr "import runpy; runpy.run_path(r'<repo>/art/build_archive.py', run_name='__main__')"
"C:\Program Files\...\blender.exe" --background --factory-startup --python-expr "import runpy; runpy.run_path(r'<repo>/art/build_assembly.py', run_name='__main__')"
```

`art/build_archive.py` 已直接产出单层印刷面，不需要任何后处理脚本。
