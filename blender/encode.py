# Stitch the rendered PNG frames into an MP4 with Blender's own video encoder (no ffmpeg needed).
# Run:  blender -b -P encode.py -- <frames_dir> <output.mp4>
import bpy, os, sys

frames_dir, out = sys.argv[sys.argv.index("--") + 1:][:2]
files = sorted(f for f in os.listdir(frames_dir) if f.endswith(".png"))

scene = bpy.context.scene
scene.sequence_editor_create()
strip = scene.sequence_editor.sequences.new_image("frames", os.path.join(frames_dir, files[0]), 1, 1)
for f in files[1:]:
    strip.elements.append(f)
scene.frame_start, scene.frame_end = 1, len(files)
scene.render.fps = 24
scene.render.resolution_x, scene.render.resolution_y = 1280, 720
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "FFMPEG"
scene.render.ffmpeg.format = "MPEG4"
scene.render.ffmpeg.codec = "H264"
scene.render.ffmpeg.constant_rate_factor = "HIGH"
scene.render.ffmpeg.ffmpeg_preset = "GOOD"
scene.render.filepath = out
bpy.ops.render.render(animation=True)
print("ENCODED", out, len(files), "frames")
