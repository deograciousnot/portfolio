# Exploded view of a dual magneto (Bendix-style), built procedurally for Cycles.
# Run:  blender -b -P magneto.py -- [preview|final] [output.png]
import bpy, bmesh, math, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MODE = argv[0] if argv else "preview"
OUT = argv[1] if len(argv) > 1 else "//magneto.png"

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
TAU = math.tau

# ---------------- materials ----------------
def material(name, color, metal=0.0, rough=0.4, bump=0.0, bump_scale=40.0, coat=0.0, emit=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    if coat:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = 0.08
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*emit[0], 1)
        bsdf.inputs["Emission Strength"].default_value = emit[1]
    if bump:
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = bump_scale
        noise.inputs["Detail"].default_value = 8
        b = nt.nodes.new("ShaderNodeBump")
        b.inputs["Strength"].default_value = bump
        b.inputs["Distance"].default_value = 0.02
        nt.links.new(noise.outputs["Fac"], b.inputs["Height"])
        nt.links.new(b.outputs["Normal"], bsdf.inputs["Normal"])
    return m

M = {
    "alu":      material("cast aluminium", (0.62, 0.62, 0.61), 1.0, 0.36, bump=0.08, bump_scale=120),
    "alu_mach": material("machined aluminium", (0.91, 0.91, 0.90), 1.0, 0.18),
    "steel":    material("steel", (0.56, 0.57, 0.58), 1.0, 0.22),
    "dark":     material("dark steel", (0.10, 0.10, 0.11), 1.0, 0.35, bump=0.15, bump_scale=200),
    "copper":   material("copper", (0.955, 0.56, 0.40), 1.0, 0.20),
    "brass":    material("brass", (0.91, 0.72, 0.38), 1.0, 0.25),
    "bakelite": material("bakelite", (0.035, 0.022, 0.016), 0.0, 0.25, coat=0.6),
    "fibre":    material("fibre gear", (0.23, 0.11, 0.05), 0.0, 0.45, bump=0.1),
    "red":      material("enamel red", (0.22, 0.02, 0.015), 0.0, 0.35, coat=0.6),
    "cloth":    material("varnished cloth", (0.05, 0.025, 0.012), 0.0, 0.35, bump=0.2, bump_scale=300, coat=0.5),
    "floor":    material("floor", (0.018, 0.018, 0.02), 0.0, 0.55),
    "guide":    material("guide line", (0.0, 0.0, 0.0), 0.0, 1.0, emit=((0.75, 0.62, 0.42), 1.6)),
}

# ---------------- helpers ----------------
def finish(obj, mat, smooth=0.6, bevel=0.0, segs=3):
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=smooth)
    except Exception:
        bpy.ops.object.shade_smooth()
    obj.select_set(False)
    if bevel:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width, mod.segments, mod.limit_method = bevel, segs, "ANGLE"
        mod.harden_normals = True
    return obj

def cyl(r, depth, loc, axis="X", mat=None, verts=64, bevel=0.0):
    rot = {"X": (0, math.pi / 2, 0), "Y": (math.pi / 2, 0, 0), "Z": (0, 0, 0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    return finish(bpy.context.object, mat, bevel=bevel)

def box(size, loc, mat, bevel=0.0, segs=3):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.object
    o.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(scale=True)
    return finish(o, mat, bevel=bevel, segs=segs)

def cut(obj, cutter):
    mod = obj.modifiers.new("cut", "BOOLEAN")
    mod.operation, mod.object = "DIFFERENCE", cutter
    cutter.hide_render = True
    cutter.hide_viewport = True
    # boolean must run before the bevel
    obj.modifiers.move(len(obj.modifiers) - 1, 0)

def gear(r_root, r_tip, teeth, thick, loc, mat, axis="X", hole=0.0):
    bm = bmesh.new()
    pts = []
    for i in range(teeth):
        a = i / teeth * TAU
        w = TAU / teeth
        for frac, r in ((0.0, r_root), (0.18, r_tip), (0.42, r_tip), (0.60, r_root)):
            t = a + frac * w
            pts.append((r * math.cos(t), r * math.sin(t)))
    top = [bm.verts.new((x, y, thick / 2)) for x, y in pts]
    bot = [bm.verts.new((x, y, -thick / 2)) for x, y in pts]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    me = bpy.data.meshes.new("gear")
    bm.to_mesh(me)
    o = bpy.data.objects.new("gear", me)
    bpy.context.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = {"X": (0, math.pi / 2, 0), "Y": (math.pi / 2, 0, 0), "Z": (0, 0, 0)}[axis]
    finish(o, mat, smooth=0.3, bevel=0.012, segs=2)
    if hole:
        c = cyl(hole, thick * 3, loc, axis, M["steel"])
        cut(o, c)
    return o

def winding(r, length, wire, loc, mat, axis="X"):
    """Real copper wire: a small circle swept along a helix with the Screw modifier."""
    bm = bmesh.new()
    seg = 10
    vs = [bm.verts.new((r + wire * math.cos(t), 0, wire * math.sin(t))) for t in (k / seg * TAU for k in range(seg))]
    for k in range(seg):
        bm.edges.new((vs[k], vs[(k + 1) % seg]))
    me = bpy.data.meshes.new("wire")
    bm.to_mesh(me)
    o = bpy.data.objects.new("winding", me)
    bpy.context.collection.objects.link(o)
    pitch = wire * 2.08
    turns = int(length / pitch)
    s = o.modifiers.new("screw", "SCREW")
    s.axis, s.angle, s.steps, s.render_steps = "Z", TAU, 28, 28
    s.screw_offset, s.iterations = pitch, turns
    s.use_smooth_shade = True
    s.use_merge_vertices = False
    o.location = Vector(loc) - Vector((turns * pitch / 2, 0, 0)) if axis == "X" else loc
    o.rotation_euler = (0, math.pi / 2, 0) if axis == "X" else (0, 0, 0)
    o.data.materials.append(mat)
    return o

def coil(loc):
    """One magneto coil: laminated core, copper windings, cloth wrap, bakelite cheeks, HT lead."""
    x, y, z = loc
    # laminated iron core: a stack of thin plates
    plate = box((0.022, 0.62, 0.44), (x - 1.05, y, z), M["dark"], bevel=0.004, segs=1)
    arr = plate.modifiers.new("lams", "ARRAY")
    arr.count, arr.relative_offset_displace = 64, (1.5, 0, 0)
    plate.modifiers.move(len(plate.modifiers) - 1, 0)
    # copper: inner layer visible at the ends, outer half wrapped in varnished cloth
    winding(0.40, 1.22, 0.024, (x, y, z), M["copper"])
    winding(0.45, 1.22, 0.024, (x, y, z), M["copper"])
    cyl(0.50, 0.62, (x + 0.30, y, z), "X", M["cloth"], bevel=0.02)
    for dx in (-0.66, 0.66):
        cyl(0.62, 0.07, (x + dx, y, z), "X", M["bakelite"], bevel=0.015)
    # high-tension terminal
    cyl(0.07, 0.35, (x + 0.66, y, z + 0.72), "Z", M["bakelite"], bevel=0.01)
    cyl(0.035, 0.12, (x + 0.66, y, z + 0.94), "Z", M["brass"])

def bearing(loc, r=0.42):
    x, y, z = loc
    for rr, d in ((r, 0.16), (r * 0.62, 0.16)):
        o = cyl(rr, d, loc, "X", M["steel"], bevel=0.02)
        c = cyl(rr - 0.07, d * 3, loc, "X", M["steel"])
        cut(o, c)
    rb = (r + r * 0.62) / 2 - 0.035
    for k in range(11):
        a = k / 11 * TAU
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.055, location=(x, y + rb * math.cos(a), z + rb * math.sin(a)), segments=24, ring_count=12)
        finish(bpy.context.object, M["steel"], smooth=3)

def bolt(loc, axis="X", length=0.5):
    x, y, z = loc
    cyl(0.055, length, loc, axis, M["steel"], verts=24)
    off = {"X": (-length / 2, 0, 0), "Y": (0, -length / 2, 0), "Z": (0, 0, length / 2)}[axis]
    cyl(0.095, 0.08, (x + off[0], y + off[1], z + off[2]), axis, M["steel"], verts=6, bevel=0.01)

def guide(a, b, dash=0.12, gap=0.10, r=0.007):
    """Dashed centre line between two points, like on a drawing."""
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=r, depth=dash, location=a + d.normalized() * dash / 2)
    o = bpy.context.object
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = d.to_track_quat("Z", "Y")
    arr = o.modifiers.new("dash", "ARRAY")
    arr.use_relative_offset, arr.use_constant_offset = False, True
    arr.constant_offset_displace = (0, 0, dash + gap)
    arr.count = int(d.length / (dash + gap))
    o.data.materials.append(M["guide"])
    o.visible_shadow = False

# ---------------- assemblies: each knows where it sits when assembled ----------------
from contextlib import contextmanager
ASSEMBLIES = []   # (empty, offset back to the assembled position, explode start frame)

@contextmanager
def assembly(name, to_assembled=(0, 0, 0), start=0):
    before = set(bpy.data.objects)
    yield
    e = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(e)
    for o in bpy.data.objects:
        if o not in before and o.parent is None and o is not e:
            o.parent = e
    ASSEMBLIES.append((e, Vector(to_assembled), start))

# ---------------- the parts, drawn in their exploded positions ----------------
with assembly("housing"):
    H = box((2.7, 2.1, 1.9), (0, 0, 0), M["alu"], bevel=0.16, segs=5)
    cut(H, cyl(0.78, 4, (0, 0, 0), "X", M["alu"]))
    cut(H, box((2.0, 1.3, 1.0), (0, 0, 1.2), M["alu"]))          # coil pocket
    for sy in (-1, 1):
        for sz in (-1, 1):
            cyl(0.11, 0.06, (-1.36, sy * 0.78, sz * 0.7), "X", M["alu_mach"])
    cyl(0.92, 0.05, (1.36, 0, 0), "X", M["alu_mach"])              # machined rear face
    box((0.9, 0.06, 0.26), (0, -1.06, -0.2), M["brass"], bevel=0.01)   # data plate
    box((0.8, 0.07, 0.16), (0, -1.07, -0.2), M["red"], bevel=0.005)

with assembly("flange", (2.45, 0, 0), 30):
    F = box((0.18, 2.9, 2.6), (-3.9, 0, 0), M["alu_mach"], bevel=0.25, segs=6)
    cut(F, cyl(0.5, 1, (-3.9, 0, 0), "X", M["alu"]))
    for sy in (-1, 1):
        for sz in (-1, 1):
            cut(F, cyl(0.1, 1, (-3.9, sy * 1.15, sz * 1.0), "X", M["alu"]))

with assembly("bolts", (3.45, 0, 0), 0):
    for sy in (-1, 1):
        for sz in (-1, 1):
            bolt((-5.0, sy * 1.15, sz * 1.0), "X", 0.6)

with assembly("rotor", (2.4, 0, 0), 46):
    cyl(0.09, 6.2, (-2.4, 0, 0), "X", M["steel"], verts=32)
    R = cyl(0.62, 1.5, (-2.4, 0, 0), "X", M["dark"], bevel=0.03)
    for k in range(4):
        a = k / 4 * TAU + TAU / 8
        p = box((1.5, 0.34, 0.12), (-2.4, 0.62 * math.cos(a), 0.62 * math.sin(a)), M["steel"], bevel=0.02)
        p.rotation_euler = (a + math.pi / 2, 0, 0)
    cyl(0.66, 0.08, (-3.17, 0, 0), "X", M["red"])
    cyl(0.66, 0.08, (-1.63, 0, 0), "X", M["red"])

with assembly("cam", (0.85, 0, 0), 42):
    cyl(0.3, 0.4, (0.35, 0, 0), "X", M["steel"], verts=6, bevel=0.02)   # breaker cam on the shaft end

with assembly("front bearing", (3.15, 0, 0), 36):
    bearing((-3.2 - 1.3, 0, 0))
with assembly("rear bearing", (-0.8, 0, 0), 36):
    bearing((2.0, 0, 0), r=0.36)
with assembly("drive gear", (3.0, 0, 0), 14):
    gear(0.62, 0.72, 22, 0.32, (-6.2, 0, 0), M["steel"], hole=0.1)
    cyl(0.36, 0.5, (-6.2 + 0.4, 0, 0), "X", M["steel"], bevel=0.02)
with assembly("pinion", (-1.2, 0, 0), 22):
    gear(0.28, 0.35, 12, 0.3, (2.8, 0, 0), M["brass"], hole=0.06)
with assembly("distributor gear", (-1.7, 0, -0.7), 18):
    gear(0.88, 0.97, 36, 0.24, (3.6, 0, 1.25), M["fibre"], hole=0.08)
    cyl(0.06, 0.9, (3.6, 0, 1.25), "X", M["steel"], verts=24)

with assembly("distributor", (-3.2, 0, -0.2), 10):
    D = cyl(1.15, 0.7, (5.0, 0, 0.5), "X", M["bakelite"], verts=96, bevel=0.06)
    for k in range(5):
        a = k / 5 * TAU + 0.3
        cyl(0.14, 0.5, (5.55, 0.72 * math.cos(a), 0.5 + 0.72 * math.sin(a)), "X", M["bakelite"], bevel=0.02)
        cyl(0.05, 0.2, (5.85, 0.72 * math.cos(a), 0.5 + 0.72 * math.sin(a)), "X", M["brass"], verts=24)
    cyl(0.12, 0.6, (5.6, 0, 0.5), "X", M["brass"], verts=32)

# the two coils (dual magneto), lifted out of the housing
with assembly("coil A", (0.5, 0, -1.8), 6):
    coil((-1.05, 0, 2.7))
with assembly("coil B", (-0.7, 0, -1.8), 6):
    coil((1.35, 0, 2.7))

# condensers and breaker plate, dropped below
with assembly("condensers", (0, 0.2, 2.25), 26):
    for dx in (-0.6, 0.6):
        cyl(0.19, 0.9, (dx, -0.2, -2.55), "X", M["alu_mach"], bevel=0.03)
        cyl(0.08, 0.15, (dx + 0.5, -0.2, -2.55), "X", M["bakelite"])
with assembly("breaker", (-1.2, 0, 1.9), 22):
    BP = box((0.08, 1.3, 1.1), (2.7, 0, -1.9), M["steel"], bevel=0.04)
    box((0.06, 0.12, 0.6), (2.62, 0.25, -1.75), M["brass"], bevel=0.01)
    box((0.06, 0.12, 0.5), (2.62, -0.2, -1.8), M["brass"], bevel=0.01)

# drawing-style centre lines
guide((-7.2, 0, 0), (6.6, 0, 0))
guide((-1.05, 0, 0.9), (-1.05, 0, 2.0))
guide((1.35, 0, 0.9), (1.35, 0, 2.0))
guide((0, -0.2, -0.95), (0, -0.2, -2.2))
guide((2.6, 0, 0.3), (2.6, 0, 1.2))

# ---------------- stage ----------------
bpy.ops.mesh.primitive_plane_add(size=900, location=(0, 0, -3.3))
finish(bpy.context.object, M["floor"])

world = bpy.data.worlds.new("w")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.02, 0.022, 0.028, 1)

def light(name, loc, power, size, color=(1, 1, 1), target=(0, 0, 0)):
    l = bpy.data.lights.new(name, "AREA")
    l.energy, l.size, l.color = power, size, color
    o = bpy.data.objects.new(name, l)
    bpy.context.collection.objects.link(o)
    o.location = loc
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y")

def card(loc, size, strength, color=(1, 1, 1)):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc)
    o = bpy.context.object
    o.scale = (size[0], size[1], 1)
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("Z", "Y")
    m = material("card", (0, 0, 0), emit=(color, strength))
    o.data.materials.append(m)
    o.visible_camera = False
    o.visible_shadow = False

card((-2, -6, 14), (16, 6), 3.0)
card((14, 2, 5), (5, 10), 2.0, (0.8, 0.88, 1.0))
card((-16, 4, 4), (5, 9), 1.4, (1.0, 0.9, 0.8))
light("key", (-6, -9, 10), 4200, 7, (1.0, 0.95, 0.88))
light("rim", (7, 8, 6), 3200, 5, (0.65, 0.78, 1.0))
light("fill", (8, -10, 1), 900, 8, (0.9, 0.92, 1.0))
light("top", (0, 0, 12), 1200, 10)

target = bpy.data.objects.new("target", None)
bpy.context.collection.objects.link(target)
target.location = (-0.4, 0, 0.35)
cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 46
cam_data.dof.use_dof = True
cam_data.dof.focus_object = target
cam_data.dof.aperture_fstop = 4.0
cam = bpy.data.objects.new("cam", cam_data)
bpy.context.collection.objects.link(cam)
cam.location = (-7.5, -17.5, 7.0)
c = cam.constraints.new("TRACK_TO")
c.target, c.track_axis, c.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"
scene.camera = cam

# ---------------- animation (only in "anim" mode; the still is untouched) ----------------
# 10 s loop at 24 fps: hold assembled, come apart outside-in, hold, go back together in reverse.
if MODE in ("anim", "animtest"):
    FPS, DUR, OUT_AT, BACK_AT, END = 24, 30, 20, 150, 240
    scene.render.fps = FPS
    scene.frame_start, scene.frame_end = 1, END
    last = max(st for _, _, st in ASSEMBLIES)
    for e, d, st in ASSEMBLIES:
        if d.length == 0:
            continue
        for frame, loc in ((1, d), (OUT_AT + st, d), (OUT_AT + st + DUR, (0, 0, 0)),
                           (BACK_AT + last - st, (0, 0, 0)), (BACK_AT + last - st + DUR, d)):
            e.location = loc
            e.keyframe_insert("location", frame=frame)
    # centre lines appear only while the parts are apart
    g = M["guide"].node_tree.nodes["Principled BSDF"]
    for frame, k in ((1, 0), (95, 0), (112, 1), (BACK_AT, 1), (BACK_AT + 14, 0)):
        g.inputs["Emission Strength"].default_value = 1.6 * k
        g.inputs["Emission Strength"].keyframe_insert("default_value", frame=frame)
        g.inputs["Alpha"].default_value = k
        g.inputs["Alpha"].keyframe_insert("default_value", frame=frame)
    # slow orbit: swing the camera around the target
    pivot = bpy.data.objects.new("pivot", None)
    bpy.context.collection.objects.link(pivot)
    pivot.location = target.location
    cam.parent = pivot
    cam.location = Vector((-7.5, -17.5, 7.0)) - target.location
    for frame, ang in ((1, -0.22), (END, 0.22)):
        pivot.rotation_euler = (0, 0, ang)
        pivot.keyframe_insert("rotation_euler", frame=frame)
    for fc in pivot.animation_data.action.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = 0.5

# ---------------- render ----------------
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.use_denoising = True
scene.cycles.use_adaptive_sampling = True
scene.render.film_transparent = False
try:
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
except Exception:
    pass
if MODE in ("anim", "animtest"):
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    scene.cycles.samples = 32
    scene.render.use_overwrite = False        # resumable: re-running skips frames already done
    scene.render.use_placeholder = True
    if MODE == "animtest":
        scene.render.resolution_x, scene.render.resolution_y = 640, 360
        scene.cycles.samples = 10
elif MODE == "final":
    scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
    scene.cycles.samples = 160
else:
    scene.render.resolution_x, scene.render.resolution_y = 1200, 675
    scene.cycles.samples = 24
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = OUT
if MODE in ("anim", "animtest"):
    bpy.ops.wm.save_as_mainfile(filepath=OUT.rstrip("#_/\\") + ".blend")
    if MODE == "animtest":   # render just a few telling frames
        for f in (1, 60, 125, 200):
            scene.frame_set(f)
            scene.render.filepath = OUT.replace("####", f"{f:04d}")
            bpy.ops.render.render(write_still=True)
    else:
        bpy.ops.render.render(animation=True)
else:
    bpy.ops.wm.save_as_mainfile(filepath=bpy.path.abspath(OUT).rsplit(".", 1)[0] + ".blend")
    bpy.ops.render.render(write_still=True)
print("RENDERED", OUT)
