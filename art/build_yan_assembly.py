"""X-044 大炎 — per-document assembly variant.

The archive's 360° document model separates into six physical groups
(`src/viewer-parts.ts`). This variant keeps four of them exactly as
`art/build_assembly.py` builds them and swaps the two optical groups for the
Rhine Lab emblem traced from the reference crest (`art/emblem-outline.json`):

    optical-lenses  折射环组   -> the larger crest, at the wide cavity
    optical-core    光学核心   -> the smaller crest, at the narrow cavity

Both sit where the two moulded optical cavities used to be, so the replacement
keeps the original layout instead of relocating the parts. The crest is built in
the XZ plane facing -Y, which is the archive box's own front direction, and its
thickness stays inside the gap between the frosted cover (y=-0.095) and the
information substrate (y=0.025) — remember that the tail below doubles every y
coordinate, so the numbers here are half of what the exported model shows.

Run inside Blender:
    path = r"D:/rinelive/art/build_yan_assembly.py"
    exec(compile(open(path, encoding="utf-8").read(), path, "exec"),
         {"__file__": path, "__name__": "__main__"})
"""

import bpy
import json
from pathlib import Path

ROOT = Path(r"D:\rinelive")
OUTLINE = ROOT / "art" / "emblem-outline.json"

# --- 1. the four unchanged groups, straight from the shared script ---------
# build_assembly.py is split at its merge step: everything before it builds and
# tags the cassette, everything after it merges by (part, surface), stretches the
# thickness axis and exports. The emblem has to be inserted in between, or the
# tagging loop would file it under `cover` by default.
ASSEMBLY = ROOT / "art" / "build_assembly.py"
source = ASSEMBLY.read_text(encoding="utf-8")
head, tail = source.split("pairs = {}", 1)
exec(compile(head, str(ASSEMBLY), "exec"))
ROOT = Path(r"D:\rinelive")

# --- 2. drop the two groups the emblem takes over --------------------------
for obj in [
    o
    for o in scene.objects
    if o.get("assemblyPart") in ("optical-lenses", "optical-core")
]:
    bpy.data.objects.remove(obj, do_unlink=True)


# --- 3. the emblem ---------------------------------------------------------
# The crest builder is shared with art/build_yan_cassette.py; this variant then
# bakes the modifiers itself and tags each crest with its six-group part, since
# the assembly script's own baking pass already ran in the head above.
exec(
    compile(
        (Path(__file__).resolve().parent / "emblem_geometry.py").read_text(
            encoding="utf-8"
        ),
        str(Path(__file__).resolve().parent / "emblem_geometry.py"),
        "exec",
    )
)
for crest, part in zip(
    build_emblems(scene, str(OUTLINE)),
    ("optical-lenses", "optical-core"),
):
    # The merge step below only walks finished meshes, so bake here. Applying
    # the modifiers keeps the rim in material slot 1.
    bpy.context.view_layer.objects.active = crest
    crest.select_set(True)
    for mod in list(crest.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for op_name in ("shade_smooth_by_angle", "shade_auto_smooth"):
        op = getattr(bpy.ops.object, op_name, None)
        if op is not None:
            try:
                op()
                break
            except Exception:
                pass
    if hasattr(crest.data, "use_auto_smooth"):
        crest.data.use_auto_smooth = True
    # Claim the group before the merge step reads it.
    crest["assemblyPart"] = part

# --- 4. merge, stretch and export -----------------------------------------
# Same steps as the shared script, only the output paths differ: this variant is
# loaded by the one document that asks for it, so the stock asset stays as is.
tail = (
    tail.replace(
        "'art/.cache/archive-assembly.glb'",
        "'art/.cache/archive-assembly-yan.glb'",
    )
    .replace(
        "'public/assets/archive-assembly.glb'",
        "'public/assets/archive-assembly-yan.glb'",
    )
    .replace("'art/archive-assembly.blend'", "'art/archive-assembly-yan.blend'")
)
assert "archive-assembly-yan.glb" in tail, "output paths were not rewritten"
# os.replace can fail with a sharing violation while a dev server watches the
# destination; copying the bytes is just as good.
tail = tail.replace(
    "os.replace(str(export_path),str(ROOT/'public/assets/archive-assembly-yan.glb'))",
    "try:\n    os.replace(str(export_path),str(ROOT/'public/assets/archive-assembly-yan.glb'))\nexcept OSError:\n    import shutil; shutil.copyfile(str(export_path),str(ROOT/'public/assets/archive-assembly-yan.glb'))",
)
exec(compile("pairs = {}" + tail, str(ASSEMBLY), "exec"))
