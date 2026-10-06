"""Review studio for the Rhine Lab emblem asset.

Same conventions as art/setup_studio.py — orthographic review camera, warm studio
world, three disk softboxes, Cycles. The one deliberate difference is the camera
angle: the archive asset is tall, so its studio looks down on it steeply, whereas a
flat crest needs a near-frontal view or it foreshortens into a smear.

Run after art/build_emblem.py:
    exec(open(r"D:/rinelive/art/setup_emblem_studio.py").read())
"""

import bpy
from mathutils import Vector
from pathlib import Path

try:
    ROOT = Path(__file__).resolve().parents[1]
except NameError:      # exec(open(...).read()) has no __file__
    ROOT = Path(r"D:\rinelive")

s = bpy.context.scene

for obj in list(s.objects):
    if obj.type in ['CAMERA', 'LIGHT']:
        bpy.data.objects.remove(obj, do_unlink=True)

bpy.ops.object.camera_add(location=(-3.6, -8.0, 3.2))
c = bpy.context.object
c.name = 'Emblem_Review_Camera'
c.rotation_euler = ((Vector((0, 0, 0)) - c.location).to_track_quat('-Z', 'Y').to_euler())
c.data.type = 'ORTHO'
c.data.ortho_scale = 3.2
s.camera = c

s.world = bpy.data.worlds.new('Warm_Studio_World')
s.world.use_nodes = True
nt = s.world.node_tree
bg = nt.nodes['Background']
# A vertical gradient rather than flat grey: surfaces then pick up a gentle
# top-to-bottom falloff instead of being lit by one uniform dome.
tc = nt.nodes.new('ShaderNodeTexCoord')
gr = nt.nodes.new('ShaderNodeTexGradient')
gr.gradient_type = 'LINEAR'
mp = nt.nodes.new('ShaderNodeMapping')
mp.inputs['Rotation'].default_value = (0.0, 1.5708, 0.0)
ramp = nt.nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].position = 0.25
ramp.color_ramp.elements[0].color = (.30, .29, .275, 1)
ramp.color_ramp.elements[1].position = 0.85
ramp.color_ramp.elements[1].color = (.92, .89, .85, 1)
nt.links.new(tc.outputs['Generated'], mp.inputs['Vector'])
nt.links.new(mp.outputs['Vector'], gr.inputs['Vector'])
nt.links.new(gr.outputs['Fac'], ramp.inputs['Fac'])
nt.links.new(ramp.outputs['Color'], bg.inputs[0])
bg.inputs[1].default_value = .85

# A wide, weak fill plus a small hot rim — the archive studio uses three similar
# energies, which leaves a flat face looking like grey plastic.
for name, loc, power, size in [('Softbox_Key', (-4, -5, 8), 260, 5),
                               ('Softbox_Rim', (5, 1, 6), 340, 3.5),
                               ('Softbox_Fill', (1, -7, 3), 34, 8)]:
    bpy.ops.object.light_add(type='AREA', location=loc)
    light = bpy.context.object
    light.name = name
    light.data.energy = power
    light.data.shape = 'DISK'
    light.data.size = size
    light.rotation_euler = ((Vector((0, 0, 0)) - light.location).to_track_quat('-Z', 'Y').to_euler())

s.render.engine = 'CYCLES'
s.cycles.samples = 96
s.cycles.use_denoising = True
s.render.resolution_x = 1000
s.render.resolution_y = 1100
s.render.film_transparent = False
s.view_settings.exposure = -0.12
s.render.filepath = str(ROOT / 'art/emblem-studio.png')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'art/emblem.blend'))
