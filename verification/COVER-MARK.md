# 封面标志的闪烁（印刷面改为单层薄片）

2026-10-02。

用户反馈：档案封面上印的莱茵生命标志，在两条弧板相交的中间位置会闪。

## 原因

`art/build_archive.py` 把 `src/brand.ts` 的 `paths` 当作**实体板**挤出来：每条描边都是带侧壁、带封口的闭合板，五条板只按 `MARK_STEP`（0.0016）逐个错开深度。板厚是 0.006，远大于这个错位量，所以两条弧板在中心相交处（以及 + 的两笔、笔画端头与弧板内缘）大面积互相穿透，穿透出来的内侧壁面本身又只是比相邻板近/远千分之几。远摄详情镜头下深度精度不足以分开这两层，像素就在“朝外的印刷面”和“内侧灰面”之间跳，表现为交叉处的灰色三角闪烁。

用三角相交检测量化：原模型在标志内部有 **915 对三角面互相穿透**（用“交点必须落在两个三角形内部”的严格判据为 81 对），全部集中在中心交叉处（x 0.70–0.82、y 2.96–3.10）与 + 的交叉、端头处。

## 修改

- `art/build_archive.py`：`mark_band` 不再生成实体板，只生成朝外的一个**印刷面**（四边形条带），五条描边保留原有深度顺序，印刷面仍落在原来的前表面平面上。相交处只是面与面重叠，不再有侧壁穿出。
- 资产用本机 Steam 版 Blender 5.2（`E:\SteamLibrary\steamapps\common\Blender\blender.exe`，即产出这批资产的同一导出器版本）按项目流程重新生成：`art/build_archive.py` 后再 `art/build_assembly.py`，更新 `public/assets/archive-cassette.glb`、`archive-assembly.glb` 与两个 `.blend` 源文件。
- 材质本身仍是 `doubleSided`，所以透过清透盖板从背面看仍然可读。

## 验证

`scripts/check-cover-mark.mjs`（对两个 GLB，各 336 个印刷面）：

| 项目 | 修改前 | 修改后 |
| --- | --- | --- |
| 标志内部互相穿透的三角面对 | 81（宽松判据 915） | **0** |
| 共面重叠 | 33 | 16，全部落在同一张印刷面上（描边自身的偏移在急转处自交，同面同材质，不参与深度竞争） |
| 印刷轮廓指纹（封面平面、0.0012 网格） | `a69c7f7b…`，459450 px，宽 1.75、高 0.795 | 完全相同 |
| 印刷层厚度 | — | 0.0128（五条描边各自的印刷平面） |

轮廓指纹由“印刷面 + 印刷平面”的栅格化得出，修改前后逐像素一致，说明只删掉了穿透的壳，标志本身没有变形。原导出保留在 `.tools/mark-before/`，与新导出用同一脚本对比，见 `verification/cover-mark/results.json`。

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
