"""Rhine Lab emblem — 3D asset built from a traced reference outline.

Pipeline:
    reference art  ->  art/emblem-outline.json   (traced + simplified, 26 loops)
                   ->  art/build_emblem.py       (this script)
                   ->  art/emblem.blend

Run inside Blender:
    exec(open(r"D:/rinelive/art/build_emblem.py").read())

Design notes
------------
The reference is a flat two-colour crest. Extruding the traced polygons keeps the
silhouette exact while giving it real depth, and the project's material language
(frosted polymer / ivory / titanium) supplies the finish, so the result reads as a
Rhine Lab asset rather than a traced flat graphic.
"""

import bpy
import json
import os

ROOT = r"D:\rinelive"
OUTLINE = os.path.join(ROOT, "art", "emblem-outline.json")
BLEND = os.path.join(ROOT, "art", "emblem.blend")

TARGET_HEIGHT = 2.60   # world units — matches the project's asset scale
DEPTH = 0.130          # extrusion thickness
BEVEL = 0.0075         # edge break, keeps the crest from looking like flat card


# ---------------------------------------------------------------- palette
def material(name, color, rough=0.3, metal=0.0, transmission=0.0, coat=0.0, coat_rough=0.06):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1.0)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*color, 1.0)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    for key in ("Transmission Weight", "Transmission"):
        if key in p.inputs:
            p.inputs[key].default_value = transmission
            break
    # clearcoat gives the flat face a tight secondary highlight; without it the
    # crest reads as grey plastic no matter how the lights are set
    for key in ("Coat Weight", "Clearcoat"):
        if key in p.inputs:
            p.inputs[key].default_value = coat
            break
    for key in ("Coat Roughness", "Clearcoat Roughness"):
        if key in p.inputs:
            p.inputs[key].default_value = coat_rough
            break
    return m


# Solid pieces, so transmission stays at 0 — the project's high-transmission values
# belong to the archive's see-through shell and only make a flat crest look hazy.
ivory = material("Emblem_Ivory", (0.952, 0.936, 0.918), 0.21, 0.06, 0.00, coat=0.38, coat_rough=0.06)
# Sidewalls are much darker than the project's stock titanium (.58/.60/.61): viewed
# head-on they are the only thing separating one spike from the next.
titanium = material("Emblem_Titanium", (0.115, 0.125, 0.140), 0.16, 0.95, 0.00, coat=0.10, coat_rough=0.12)


# ---------------------------------------------------------------- geometry
with open(OUTLINE, "r", encoding="utf-8") as f:
    loops = json.load(f)

flat = [p for lp in loops for p in lp]
xs = [p[0] for p in flat]
ys = [p[1] for p in flat]
cx = (min(xs) + max(xs)) / 2.0
cy = (min(ys) + max(ys)) / 2.0
scale = TARGET_HEIGHT / (max(ys) - min(ys))

verts, faces = [], []
for lp in loops:
    base = len(verts)
    for x, y in lp:
        # Lay the crest in the XZ plane with its face pointing along -Y, which is
        # Blender's convention for "front", and matches how the project's review
        # camera looks at an asset. (Building it in XY instead makes it lie flat,
        # so a front-on camera only sees its edge.)
        # Reference y grows downward, Blender z grows up -> negate.
        verts.append(((x - cx) * scale, 0.0, -(y - cy) * scale))
    faces.append(list(range(base, base + len(lp))))

mesh = bpy.data.meshes.new("Emblem_Mesh")
mesh.from_pydata(verts, [], faces)
mesh.validate()
mesh.update()

obj = bpy.data.objects.new("Rhine_Emblem", mesh)
bpy.context.collection.objects.link(obj)

# traced loops have mixed winding; make normals consistent before solidifying
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode="OBJECT")

# ---------------------------------------------------------------- finish
obj.data.materials.append(ivory)      # slot 0 — face
obj.data.materials.append(titanium)   # slot 1 — extruded rim

solid = obj.modifiers.new("Thickness", "SOLIDIFY")
solid.thickness = DEPTH
solid.offset = 0.0
solid.material_offset_rim = 1

bevel = obj.modifiers.new("EdgeBreak", "BEVEL")
bevel.width = BEVEL
bevel.segments = 2
bevel.limit_method = "ANGLE"
bevel.angle_limit = 0.5

bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj

# shade smoothing: the operator kept changing name across 4.x, so probe for it
for op_name in ("shade_smooth_by_angle", "shade_auto_smooth"):
    op = getattr(bpy.ops.object, op_name, None)
    if op is not None:
        try:
            op()
            break
        except Exception:
            pass
if hasattr(obj.data, "use_auto_smooth"):
    obj.data.use_auto_smooth = True

bpy.ops.wm.save_as_mainfile(filepath=BLEND)

print("emblem built: %d loops, %d verts, %d faces" % (len(loops), len(mesh.vertices), len(mesh.polygons)))
print("saved ->", BLEND)
