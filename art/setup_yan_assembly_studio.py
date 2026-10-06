"""Review studio for the X-044 document model variant.

Rebuilds art/build_yan_assembly.py from scratch, then renders it twice in the
project's review setup (orthographic camera, warm studio world, three disk
softboxes, Cycles):

    public/media/yan-assembly.jpg        assembled, seen through the frosted cover
    art/yan-assembly-exploded.png         the six groups separated by their
                                          exploded depths, as the viewer does it

The exploded shot is the one that proves the swap: 折射环组 and 光学核心 are the
two crest plates, and they sit where the two moulded optical cavities used to be.

Run inside Blender:
    path = r"D:/rinelive/art/setup_yan_assembly_studio.py"
    exec(compile(open(path, encoding="utf-8").read(), path, "exec"),
         {"__file__": path, "__name__": "__main__"})
"""

import bpy
from mathutils import Vector
from pathlib import Path

try:
    ROOT = Path(__file__).resolve().parents[1]
except NameError:      # exec(compile(...)) carries its own __file__ here
    ROOT = Path(r"D:\rinelive")

# --- 0. clean slate ---------------------------------------------------------
for s in [x for x in list(bpy.data.scenes) if x.name.startswith("Rhine_Assembly_")]:
    for o in list(s.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.scenes.remove(s)

# --- 1. the model -----------------------------------------------------------
BUILD = ROOT / "art" / "build_yan_assembly.py"
exec(
    compile(BUILD.read_text(encoding="utf-8"), str(BUILD), "exec"),
    {"__file__": str(BUILD), "__name__": "__main__"},
)
scene = bpy.context.window.scene

# --- 2. studio --------------------------------------------------------------
for obj in list(scene.objects):
    if obj.type in ["CAMERA", "LIGHT"]:
        bpy.data.objects.remove(obj, do_unlink=True)

bpy.ops.object.camera_add(location=(-3.2, -8.4, 2.1))
camera = bpy.context.object
camera.name = "Yan_Review_Camera"
camera.rotation_euler = (
    (Vector((0, 0, 1.85)) - camera.location).to_track_quat("-Z", "Y").to_euler()
)
camera.data.type = "ORTHO"
camera.data.ortho_scale = 6.4
scene.camera = camera

scene.world = bpy.data.worlds.new("Warm_Studio_World")
scene.world.use_nodes = True
nt = scene.world.node_tree
bg = nt.nodes["Background"]
tc = nt.nodes.new("ShaderNodeTexCoord")
gr = nt.nodes.new("ShaderNodeTexGradient")
gr.gradient_type = "LINEAR"
mp = nt.nodes.new("ShaderNodeMapping")
mp.inputs["Rotation"].default_value = (0.0, 1.5708, 0.0)
ramp = nt.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].position = 0.25
ramp.color_ramp.elements[0].color = (.30, .29, .275, 1)
ramp.color_ramp.elements[1].position = 0.85
ramp.color_ramp.elements[1].color = (.92, .89, .85, 1)
nt.links.new(tc.outputs["Generated"], mp.inputs["Vector"])
nt.links.new(mp.outputs["Vector"], gr.inputs["Vector"])
nt.links.new(gr.outputs["Fac"], ramp.inputs["Fac"])
nt.links.new(ramp.outputs["Color"], bg.inputs[0])
bg.inputs[1].default_value = .85

for name, loc, power, size in [
    ("Softbox_Key", (-4, -5, 8), 260, 5),
    ("Softbox_Rim", (5, 1, 6), 340, 3.5),
    ("Softbox_Fill", (1, -7, 3), 34, 8),
]:
    bpy.ops.object.light_add(type="AREA", location=loc)
    light = bpy.context.object
    light.name = name
    light.data.energy = power
    light.data.shape = "DISK"
    light.data.size = size
    light.rotation_euler = (
        (Vector((0, 0, 1.85)) - light.location).to_track_quat("-Z", "Y").to_euler()
    )

scene.render.engine = "CYCLES"
scene.cycles.samples = 64
scene.cycles.use_denoising = True
scene.view_settings.exposure = -0.12
scene.render.resolution_percentage = 100
scene.render.film_transparent = False

# Pass {"RENDER": False} to set the studio up without rendering, then render each
# view from its own call — one Cycles pass per view keeps the round trip short.
RENDER = globals().get("RENDER", True)

# --- 3. assembled -----------------------------------------------------------
if RENDER:
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 1000
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 92
    scene.render.filepath = str(ROOT / "public" / "media" / "yan-assembly.jpg")
    bpy.ops.render.render(write_still=True)

    # --- 4. exploded --------------------------------------------------------
    # src/viewer-parts.ts offsets each group along glTF z, which is -y in Blender
    # (the glTF exporter maps Blender (x, y, z) to (x, z, -y)).
    DEPTHS = {
        "fasteners": 2.75,
        "cover": 1.85,
        "optical-lenses": 0.75,
        "optical-core": -0.15,
        "substrate": -1.1,
        "carrier": -2.05,
    }
    for obj in scene.objects:
        if "assemblyPart" in obj:
            obj.location.y = -DEPTHS[obj["assemblyPart"]]

    # Overhead instead of frontal: every other group is an XY-plane plate, so a
    # frontal view buries the two crests behind the substrate, while from above
    # the six layers fan out along the depth axis and the crests — lying flat in
    # XZ — show their full faces.
    camera.location = (0.0, 5.0, 14.0)
    camera.rotation_euler = (
        (Vector((0, 0, 0)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    )
    camera.data.ortho_scale = 8.0
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 1000
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(ROOT / "art" / "yan-assembly-exploded.png")
    bpy.ops.render.render(write_still=True)

    bpy.ops.wm.save_as_mainfile(
        filepath=str(ROOT / "art" / "archive-assembly-yan.blend")
    )
    print("rendered yan document model:", len(scene.objects), "meshes")
