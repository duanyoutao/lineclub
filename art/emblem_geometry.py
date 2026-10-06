"""Shared emblem geometry for the per-document model variants.

Both art/build_yan_assembly.py (the 360° viewer's six-group asset) and
art/build_yan_cassette.py (the detail close-up) place the same two crests at the
same two cavity centres, so the builder lives here once. It expects to run
inside a namespace that already has `bpy`, `json` and a `scene` — the variants
exec it after build_archive.py's prefix has created those.

The crest data comes from art/emblem-outline.json (traced reference, 26 loops).
The face is laid in XZ pointing along -Y, the archive box's own front, and the
material split (slot 0 face / slot 1 rim after Solidify's material_offset_rim)
matches art/emblem.blend.
"""

IVORY = (0.952, 0.936, 0.918)
TITANIUM = (0.115, 0.125, 0.140)


def emblem_material(name, color, rough=0.3, metal=0.0, coat=0.0, coat_rough=0.06):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1.0)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*color, 1.0)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    for key in ("Coat Weight", "Clearcoat"):
        if key in p.inputs:
            p.inputs[key].default_value = coat
            break
    for key in ("Coat Roughness", "Clearcoat Roughness"):
        if key in p.inputs:
            p.inputs[key].default_value = coat_rough
            break
    return m


def build_emblems(scene, outline_path):
    """Two crests at the two optical-cavity centres; returns nothing.

    The wide cavity (radius .79 at x=-.44, z=1.92) becomes the 折射环组 crest,
    the narrow one (radius .435 at x=1.13, z=2.48) the 光学核心 crest. Both sit
    half-thickness centred on y=-0.035: the cassette tail doubles every y, so
    the exported plate spans y=-0.12..-0.02, inside the cover (-0.19) and the
    substrate (0.05).
    """

    def emblem(name, height, cx, cz, cy, depth):
        flat = [p for lp in loops for p in lp]
        xs = [p[0] for p in flat]
        ys = [p[1] for p in flat]
        bx = (min(xs) + max(xs)) / 2.0
        by = (min(ys) + max(ys)) / 2.0
        scale = height / (max(ys) - min(ys))
        verts, faces = [], []
        for lp in loops:
            base = len(verts)
            for x, y in lp:
                # Reference y grows downward, Blender z grows up -> negate.
                verts.append((cx + (x - bx) * scale, cy, cz - (y - by) * scale))
            faces.append(list(range(base, base + len(lp))))
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(verts, [], faces)
        mesh.validate()
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        scene.collection.objects.link(obj)
        # traced loops carry mixed winding; solidify needs outward normals
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode="OBJECT")
        mesh.materials.append(ivory)      # slot 0 — face
        mesh.materials.append(titanium)   # slot 1 — extruded rim
        solid = obj.modifiers.new("Thickness", "SOLIDIFY")
        solid.thickness = depth
        solid.offset = 0.0
        solid.material_offset_rim = 1
        bevel = obj.modifiers.new("EdgeBreak", "BEVEL")
        bevel.width = 0.004
        bevel.segments = 2
        bevel.limit_method = "ANGLE"
        bevel.angle_limit = 0.5
        return obj

    loops = json.loads(open(outline_path, encoding="utf-8").read())
    # Same finish as art/emblem.blend: a tight clearcoat on the face, and a rim
    # far darker than the project's stock titanium so one spike reads against
    # the next instead of melting into the ivory.
    ivory = emblem_material("Emblem_Ivory", IVORY, 0.21, 0.06, 0.38, 0.06)
    titanium = emblem_material("Emblem_Titanium", TITANIUM, 0.16, 0.95, 0.10, 0.12)
    wide = emblem("Refractive ring crest", 1.58, -0.44, 1.92, -0.035, 0.050)
    narrow = emblem("Optical core crest", 0.87, 1.13, 2.48, -0.035, 0.040)
    return wide, narrow
