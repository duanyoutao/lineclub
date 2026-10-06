"""X-044 大炎 — per-document cassette variant (the detail close-up model).

The shared archive-cassette.glb is one merged mesh per material, so the detail
camera shows the same moulded optical cavities for every document. This variant
rebuilds art/build_archive.py minus the two optical groups — the same swap the
six-group viewer asset (art/build_yan_assembly.py) makes — so a document that
declares `assembly` can show the emblem crests in the close-up too.

The scene keeps its stock meshes untouched; src/scene.ts hides the stock
optical surfaces and shows this asset's meshes only while a variant document is
selected. Surfaces involved in the swap:

    removed   Embedded optical cavity / Subsurface refractive shoulder /
              Inner optical bevel / Concentric optical machining (Subsurface_
              Optics + part of Optical_Edges) and Embedded amber annulus
              (Champagne_Index — used nowhere else)
    kept      every other use of Optical_Edges (channel lips, perimeter,
              mating seams, vent footings), so the box itself is unchanged
    added     Emblem_Ivory / Emblem_Titanium crests at the cavity centres

Run inside Blender:
    path = r"D:/rinelive/art/build_yan_cassette.py"
    exec(compile(open(path, encoding="utf-8").read(), path, "exec"),
         {"__file__": path, "__name__": "__main__"})
"""

import bpy
import json
from pathlib import Path

ROOT = Path(r"D:\rinelive")
OUTLINE = ROOT / "art" / "emblem-outline.json"
ARCHIVE = ROOT / "art" / "build_archive.py"

# --- 1. the stock cassette, up to (not including) its merge/export tail -----
source = ARCHIVE.read_text(encoding="utf-8")
SPLIT = "# Convert text, bake modifiers"
head, tail = source.split(SPLIT, 1)
exec(compile(head, str(ARCHIVE), "exec"))
ROOT = str(Path(r"D:\rinelive"))

# --- 2. drop the two optical groups ----------------------------------------
REMOVED = (
    "Embedded optical cavity",
    "Subsurface refractive shoulder",
    "Inner optical bevel",
    "Concentric optical machining",
    "Embedded amber annulus",
    # The film ribbons bridging the two cavities belong to the refractive
    # group too (build_assembly.py files them under optical-lenses).
    "Optical ribbon",
)
for obj in [
    o
    for o in scene.objects
    # No type filter: the radial seams and ribbons are curves at this stage and
    # only become meshes in the merge tail below.
    if o.name.startswith(REMOVED)
]:
    bpy.data.objects.remove(obj, do_unlink=True)

# --- 3. the two crests, at the same cavity centres as the viewer asset ------
HERE = Path(__file__).resolve().parent
exec(compile((HERE / "emblem_geometry.py").read_text(encoding="utf-8"), str(HERE / "emblem_geometry.py"), "exec"))
build_emblems(scene, str(OUTLINE))

# --- 4. merge by material, stretch and export ------------------------------
# Same steps as the shared script, only the output paths differ: the stock
# cassette stays untouched for the other 43 documents.
tail = (
    tail.replace("'art/.cache/archive-cassette.glb'", "'art/.cache/archive-cassette-yan.glb'")
    .replace("ROOT+'/public/assets/archive-cassette.glb'", "ROOT+'/public/assets/archive-cassette-yan.glb'")
    .replace("ROOT+'/art/rhine-archive.blend'", "ROOT+'/art/rhine-archive-yan.blend'")
)
assert "archive-cassette-yan.glb" in tail, "output paths were not rewritten"
# os.replace can fail with a sharing violation while a dev server watches the
# destination; copying the bytes is just as good.
tail = tail.replace(
    "os.replace(str(export_path),ROOT+'/public/assets/archive-cassette-yan.glb')",
    "try:\n    os.replace(str(export_path),ROOT+'/public/assets/archive-cassette-yan.glb')\nexcept OSError:\n    import shutil; shutil.copyfile(str(export_path),ROOT+'/public/assets/archive-cassette-yan.glb')",
)
exec(compile(SPLIT + tail, str(ARCHIVE), "exec"))
