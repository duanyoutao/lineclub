import bpy, math, os
from mathutils import Vector
from pathlib import Path

ROOT = str(Path(__file__).resolve().parents[1])
scene = bpy.data.scenes.new('Rhine_Archive_Work')
bpy.context.window.scene = scene
for old in list(bpy.data.scenes):
    if old != scene and old.name.startswith('Rhine_Archive_Asset'):
        for obj in list(old.objects):
            if len(obj.users_scene)==1:bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.scenes.remove(old)
scene.name='Rhine_Archive_Asset'
for m in list(bpy.data.materials):
    if m.users==0:bpy.data.materials.remove(m)

def material(name, color, rough=.3, metal=0, transmission=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough
    p.inputs['Metallic'].default_value=metal
    p.inputs['Transmission Weight'].default_value=transmission
    p.inputs['IOR'].default_value=1.46
    return m

shell=material('Frosted_Polymer',(.985,.975,.963),.36,0,.78)
edge=material('Ivory_Edges',(.94,.916,.892),.28,.02,.72)
core=material('Internal_Ceramic',(.74,.705,.68),.52,.06)
metal=material('Titanium_Fasteners',(.58,.60,.61),.19,.82)
gold=material('Champagne_Index',(.64,.46,.29),.33,.48)
paper=material('Printed_Label',(.91,.89,.84),.65)
diffuser=material('Optical_Diffuser',(.925,.902,.881),.67,0,0)
optics=material('Subsurface_Optics',(.70,.675,.66),.39,.12)
optical_edge=material('Optical_Edges',(.94,.92,.90),.3,.03,.45)
ink=material('Carbon_Ink',(.025,.026,.023),.75)

def cube(name, loc, size, mat, bevel=.015):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o=bpy.context.object; o.name=name; o.dimensions=size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    if bevel:
        m=o.modifiers.new('Precision radiused edge','BEVEL'); m.width=bevel; m.segments=3
        bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=m.name)
        o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
    return o

def torus(name,x,z,radius,tube,mat,y=-.091):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius,minor_radius=tube,major_segments=64,minor_segments=10,location=(x,y,z),rotation=(math.pi/2,0,0))
    o=bpy.context.object; o.name=name; o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    return o

def text(name, body,x,z,size,mat=ink):
    c=bpy.data.curves.new(name,'FONT'); c.body=body;c.size=size;c.extrude=.0002;c.space_character=1.05
    o=bpy.data.objects.new(name,c);scene.collection.objects.link(o)
    o.location=(x,-.123,z);o.rotation_euler=(math.pi/2,0,0);c.materials.append(mat)
    return o

def annular_profile(name, x, z, profile, mat, segments=128, start=0, end=2*math.pi, sharp=False):
    # Closed revolved cross-section: a shallow moulded lens, not a round tube.
    vertices=[]; faces=[]; n=len(profile)
    closed=abs(end-start-2*math.pi)<1e-6
    segments=max(8,math.ceil(segments*(end-start)/(2*math.pi)))
    rows=segments if closed else segments+1
    for i in range(rows):
        a=start+(end-start)*i/segments
        for r,y in profile: vertices.append((x+r*math.cos(a),y,z+r*math.sin(a)))
    for i in range(segments):
        for j in range(n):
            faces.append((i*n+j,((i+1)%rows)*n+j,((i+1)%rows)*n+(j+1)%n,i*n+(j+1)%n))
    if not closed:
        faces.extend([tuple(reversed(range(n))),tuple(segments*n+j for j in range(n))])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj);mesh.materials.append(mat)
    # The clockwise section above yields outward normals, including the bore.
    for p in mesh.polygons:p.use_smooth=len(p.vertices)==4
    if sharp:
        # Keep each section edge hard, but interpolate around the circumference.
        # Flat shading alone would facet the circle; all-smooth shading balloons
        # the roof/wall junction into a rounded tube.
        normals=[]
        for face in mesh.polygons:
            if face.index>=segments*n:
                face.use_smooth=False
                normals.extend([tuple(face.normal)]*len(face.loop_indices))
                continue
            j=face.index%n
            dr=profile[(j+1)%n][0]-profile[j][0]
            dy=profile[(j+1)%n][1]-profile[j][1]
            for loop in face.loop_indices:
                row=mesh.loops[loop].vertex_index//n
                angle=start+(end-start)*row/segments
                normal=Vector((-dy*math.cos(angle),dr,-dy*math.sin(angle))).normalized()
                normals.append(tuple(normal))
        mesh.normals_split_custom_set(normals)
    return obj

def channel(name, points, depth, radius, mat):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D'
    curve.resolution_u=8;curve.bevel_depth=radius;curve.bevel_resolution=2
    spline=curve.splines.new('POLY');spline.points.add(len(points)-1)
    for point,(x,z) in zip(spline.points,points):point.co=(x,depth,z,1)
    obj=bpy.data.objects.new(name,curve);scene.collection.objects.link(obj);curve.materials.append(mat)
    return obj

front_cover=cube('Front frosted optical cover',(0,-.095,1.85),(5,.016,3.7),shell,.007)
cube('Rear translucent carrier',(0,.055,1.85),(4.97,.02,3.68),edge,.009)
cube('Information substrate',(0,.025,1.86),(4.80,.012,3.47),diffuser,.006)
for z in [.028,3.672]:cube('Polished perimeter rail',(0,-.021,z),(4.95,.155,.034),edge,.009)
for x in [-2.476,2.476]:cube('Polished perimeter rail',(x,-.021,1.85),(.034,.155,3.66),edge,.009)
# Wide optical cavities sit BEHIND the frosted cover. Their lenticular profiles
# are shallow; no torus protrudes from the exterior face.
for x,z,r in [(-.44,1.92,.79),(1.13,2.48,.435)]:
    width=.145 if r>.5 else .102
    annular_profile('Embedded optical cavity',x,z,[
        (r-width,.016),(r+width,.016),(r+width+.012,.003),
        (r+width,-.014),(r+width-.022,-.027),(r+.032,-.040),
        (r-.012,-.039),(r-.045,-.052),(r-width+.025,-.054),
        (r-width,-.036)],optics)
    annular_profile('Subsurface refractive shoulder',x,z,[
        (r+.028,-.031),(r+width+.025,-.009),(r+width+.029,-.020),
        (r+width+.012,-.032),(r+.056,-.053),(r+.028,-.049)],optical_edge)
    annular_profile('Inner optical bevel',x,z,[
        (r-width-.012,-.017),(r-width+.036,-.041),
        (r-width+.041,-.057),(r-width+.023,-.064),
        (r-width+.004,-.061),(r-width-.012,-.036)],optical_edge)
    for offset,tube,y in [(width+.009,.006,-.031),(.030,.007,-.054),(-width+.022,.006,-.064)]:
        o=torus('Concentric optical machining',x,z,r+offset,tube,optical_edge,y)
        o.scale.z=.42
    if r<.5:
        annular_profile('Embedded amber annulus',x,z,[
            (r-.170,-.047),(r-.070,-.047),(r-.067,-.060),
            (r-.077,-.071),(r-.156,-.071),(r-.170,-.060)],gold)
cube('Serial label',(-1.36,-.099,3.04),(.99,.02,.41),paper,.003)
cube('Label top rule',(-1.36,-.116,3.23),(.98,.004,.008),ink,0)
cube('Label bottom rule',(-1.36,-.116,2.847),(.98,.004,.005),ink,0)
text('Company label','RHINE LAB, LLC.',-1.825,3.105,.105)
text('Database label','INTERNAL DATABASE',-1.825,3.017,.042,core)
text('Serial number','NO.001',-1.825,2.875,.148)
text('Information label','INFO',-.99,3.075,.076)
text('Symbol label','+ / -',-.99,2.9,.095)

# --- Rhine Lab mark printed on the frosted front cover ------------------------
# Geometry is the interface's own shared mark: the two subpaths and the tick
# strokes of the `paths` constant in src/brand.ts, which is also what the printed
# archive label draws. Coordinates are svg user units of that 310-wide viewBox,
# so the cover mark and the on-screen mark stay the same geometry instead of a
# redrawn approximation. Built as flat bands rather than bevelled curves: a round
# bevel is isotropic and would protrude out of the glass by half the stroke
# width. The lobes and the ticks cross each other, so each band carries a small
# depth epsilon; coincident coplanar faces otherwise render as black patches.
mark=material('Cover_Mark',(.042,.040,.036),.5,.04)
MARK_SCALE=1.75/(310.0-4.0)              # 1.75 blender units of visual width
MARK_AT=(.78,3.04);MARK_DEPTH=-.110      # printed just in front of the cover face
MARK_THICK=.003;MARK_STEP=.0016
def mark_xyz(px,py,y):return ((px-155.0)*MARK_SCALE+MARK_AT[0],y,(71.5-py)*MARK_SCALE+MARK_AT[1])

# The interface's shared mark, in the SVG's own draw order: the two lobes of
# src/brand.ts's `paths` (which is also what the printed label draws), then the
# + as two strokes and the - tick. Coordinates are svg user units of that
# 310-wide viewBox. Each entry is one continuous stroke; separate strokes must
# stay separate bands, or the outline jumps between them.
MARK_STROKES=[
  (26,[((156,75),(127,48),(103,15),(70,15)),((70,15),(37,15),(15,39),(15,70)),
       ((15,70),(15,101),(38,128),(70,128)),((70,128),(103,128),(127,96),(176,52))]),
  (26,[((155,75),(182,99),(208,128),(240,128)),((240,128),(273,128),(295,105),(295,73)),
       ((295,73),(295,41),(273,15),(240,15)),((240,15),(221,15),(207,23),(192,38))]),
  (15,[((44,70),(44,70),(94,70),(94,70))]),
  (15,[((69,45),(69,45),(69,95),(69,95))]),
  (15,[((219,70),(219,70),(263,70),(263,70))]),
]

def mark_outline(segments,steps=16):
    points=[]
    for p0,c1,c2,p3 in segments:
        for i in range(steps):
            t=i/steps;u=1-t
            points.append(tuple(u**3*p0[k]+3*u*u*t*c1[k]+3*u*t*t*c2[k]+t**3*p3[k] for k in (0,1)))
    return points

def mark_band(name,outline,stroke,y):
    # Flat quad strip: half the stroke across the cover plane, thickness along Y.
    # Capped at both ends so each band is a closed solid for the fuse below.
    pts=[mark_xyz(px,py,y) for px,py in outline];n=len(pts);verts=[];faces=[]
    for i in range(n):
        a,b=pts[i-1],pts[(i+1)%n];tx,tz=b[0]-a[0],b[2]-a[2]
        length=math.hypot(tx,tz) or 1.0
        ux,uz=-tz/length,tx/length;half=stroke*MARK_SCALE/2
        for sy in (-MARK_THICK,MARK_THICK):
            verts.append((pts[i][0]+ux*half,pts[i][1]+sy,pts[i][2]+uz*half))
            verts.append((pts[i][0]-ux*half,pts[i][1]+sy,pts[i][2]-uz*half))
    for i in range(n-1):
        a=i*4;b=(i+1)*4
        faces.extend([(a,b,b+1,a+1),(a+3,a+2,b+2,b+3),(a,a+2,b+2,b),(a+1,b+1,b+3,a+3)])
    last=(n-1)*4
    faces.extend([(0,1,3,2),(last,last+2,last+3,last+1)])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj)
    mesh.materials.append(mark)
    # Closed solid now that the ends are capped, so outward orientation is
    # unambiguous; without this the open-ended strokes wind inside out and render
    # unlit next to the lobes.
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    return obj

for i,(stroke,segments) in enumerate(MARK_STROKES):
    mark_band('Cover mark %d'%i,mark_outline(segments),stroke,MARK_DEPTH+i*MARK_STEP)

for i in range(16):
    o=cube('Laser etched vent',(1.04+i*.054,-.111,.57),(.023,.009,.1),core,.003);o.rotation_euler.y=.4
for i in range(25):cube('Calibration mark',(-2.23,-.108,.61+i*.052),(.035 if i%5 else .075,.005,.006),core,0)
text('Edge inscription','R H I N E  L A B',-1.81,.28,.063,core)
for z,x1,x2 in [(3.36,-1.8,.2),(3.36,.4,1.55),(.4,-1.45,1.75)]:
    cube('Engraved circuit trace',((x1+x2)/2,-.108,z),(x2-x1,.004,.005),core,.002)
# Two sides of a shallow pressed channel, observed in the 37–39 second close-up.
# Keep the entire channel behind the front cover to avoid coplanar stippling.
top=[(-2.27,3.06),(-2.27,3.30),(-2.10,3.45),(-1.72,3.45),(-1.61,3.51),
     (-.65,3.51),(-.55,3.46),(.37,3.46),(.43,3.52),(.49,3.46),
     (1.08,3.46),(1.17,3.52),(1.20,3.50),(1.13,3.42),
     (1.79,3.42),(1.89,3.51),(2.19,3.51),(2.29,3.41),(2.29,3.03)]
channel('Moulded circuit channel shadow',top,-.071,.005,core)
channel('Moulded circuit channel lip',[(x,z-.018) for x,z in top],-.075,.008,optical_edge)
perimeter=[(-2.18,2.85),(-2.23,2.72),(-2.23,.43),(-2.12,.30),
           (2.08,.30),(2.24,.44),(2.24,2.97)]
channel('Moulded inner perimeter',perimeter,-.067,.008,optical_edge)
for z in [.080,3.620]:
    cube('Carrier mating seam',(0,.002,z),(4.82,.012,.010),optical_edge,.003)
for x in [-2.420,2.420]:
    cube('Carrier mating seam',(x,.002,1.85),(.010,.012,3.54),optical_edge,.003)
# Small raised pads under the diagonal calibration vents.
for i in range(16):
    cube('Moulded vent footing',(1.04+i*.054,-.071,.435),(.015,.014,.018),optical_edge,.004)

detail_script=Path(ROOT)/'art/clear_reference_details.py'
exec(compile(detail_script.read_text(encoding='utf-8-sig'),str(detail_script),'exec'))

# Convert text, bake modifiers, and group by material for efficient instancing.
bpy.ops.object.select_all(action='SELECT')
for o in list(scene.objects):
    bpy.context.view_layer.objects.active=o
    if o.type in ['FONT','CURVE']:bpy.ops.object.convert(target='MESH')
    for m in list(o.modifiers):
        try:bpy.ops.object.modifier_apply(modifier=m.name)
        except:pass
for mat in list(dict.fromkeys(o.data.materials[0] for o in scene.objects if o.type=='MESH' and o.data.materials)):
    bpy.ops.object.select_all(action='DESELECT')
    obs=[o for o in scene.objects if o.type=='MESH' and o.data.materials and o.data.materials[0]==mat]
    if not obs:continue
    for o in obs:o.select_set(True)
    bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join()
    o=bpy.context.object;o.name=mat.name
    scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    # Bake orientation to make every exported group share the same coordinate frame.
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
# Annotated reference: the visible end face occupies roughly half a row pitch.
for obj in scene.objects:
    if obj.type=='MESH':
        if obj.data.materials[0].name.startswith(('Optical_Glass_', 'Optical_Bridge_Glass', 'Amber_Optical_Inlay')):
            bpy.context.view_layer.objects.active=obj
            bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
            obj.scale.y *= 2.0
            bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        else:
            for vertex in obj.data.vertices:vertex.co.y *= 2.0
bpy.ops.object.select_all(action='SELECT')
export_path=Path(ROOT)/'art/.cache/archive-cassette.glb'
export_path.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(export_path),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True)
os.replace(str(export_path),ROOT+'/public/assets/archive-cassette.glb')
bpy.data.libraries.write(ROOT+'/art/rhine-archive.blend', {scene}, fake_user=True)
print('Exported archive cassette:',len(scene.objects),'material groups')


