# -*- coding: utf-8 -*-
"""总装：把各分区模块拼成一个紫禁城
用法: blender -b --factory-startup -P build.py [-- mod_a mod_b ...]
"""
import bpy, sys, os, time, traceback

BASE = "/sdcard/Music/每日归档/2026-11/gugong"
sys.path.append(os.path.join(BASE, "lib"))

import common as G

argv = sys.argv
only = argv[argv.index("--") + 1:] if "--" in argv else []
MODS = ["mod_court", "mod_taidian", "mod_gates", "mod_wall", "mod_inner", "mod_wings"]
if only:
    MODS = [m for m in MODS if m in only or (m + ".py") in only]

G.clear_scene()
C = G.coll("GUGONG")

t_all = time.time()
total = 0
for m in MODS:
    if not os.path.exists(os.path.join(BASE, "lib", m + ".py")):
        print("SKIP %s (missing)" % m)
        continue
    try:
        mod = __import__(m)
        t = time.time()
        obs = mod.build(c=C)
        bpy.context.view_layer.update()
        n = len(obs or [])
        total += n
        print("BUILD %-12s objs=%-5d %.1fs" % (m, n, time.time() - t))
    except Exception:
        traceback.print_exc()
        print("BUILD_FAIL %s" % m)

bpy.context.view_layer.update()
print("TOTAL objs=%d  %.1fs" % (total, time.time() - t_all))

G.apply_clay()
G.ground(14000, -0.06, c=C)
G.studio_light()

sc = G.scene()
sc.render.resolution_x = 1280
sc.render.resolution_y = 720
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = 24
sc.cycles.use_denoising = False

# 俯视总平面机位（便于核对布局）
cam, d = G.fit_camera("CAM_PLAN", 8, 58, (0, 60, 6),
                      [(-376, -409, 0), (376, -409, 0), (-376, 552, 0), (376, 552, 0),
                       (0, 0, 35.05), (0, 552, 31)],
                      lens=50, res=(1280, 720), start=400)
sc.camera = cam
print("PLAN dist=%.0fm" % d)

out = os.path.join(BASE, "gugong.blend")
bpy.ops.wm.save_as_mainfile(filepath=out)
print("SAVED", out)
