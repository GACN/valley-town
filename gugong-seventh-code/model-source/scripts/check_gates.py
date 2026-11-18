# -*- coding: utf-8 -*-
"""mod_gates 几何自检（不渲染）：城台券洞是否贯通、各部件标高。
blender -b --factory-startup -P scripts/check_gates.py
"""
import bpy, sys, math
sys.path.append("/sdcard/Music/每日归档/2026-11/gugong/lib")
import common as G

bpy.ops.wm.read_factory_settings(use_empty=True)
C = G.coll("CHK")
import mod_gates as M

obs = M.build(c=C)
dg = bpy.context.evaluated_depsgraph_get()
sc = bpy.context.scene


def ray(org, d, dist=120.0):
    r = sc.ray_cast(dg, org, d, distance=dist)
    return (r[0], tuple(round(v, 2) for v in r[1]), r[4].name if r[4] else None)


print("---- 券洞贯通检测（沿 +Y 打射线, 起点 y 在洞外南侧）")
for tag, x in (("WM_mid", 0.0), ("WM_east", 11.2), ("WM_west", -11.2)):
    print("  %-8s z=3.0  %s" % (tag, ray((x, -440.0, 3.0), (0, 1, 0), 70)))
print("  WM_mid z=9.6  %s" % (ray((0.0, -440.0, 9.6), (0, 1, 0), 70),))
print("  SWM_mid z=3.0 %s" % (ray((0.0, 520.0, 3.0), (0, 1, 0), 70),))

print("---- 竖向射线（应打在券顶）")
for tag, x, y in (("WM_mid", 0.0, -409.0), ("WM_east", 11.2, -409.0),
                  ("SWM_mid", 0.0, 552.0)):
    print("  %-8s %s" % (tag, ray((x, y, 0.02), (0, 0, 1), 40)))

print("---- 各组合 bbox / 顶点")
tot_v = 0
for o in obs:
    bb = [o.matrix_world @ __import__("mathutils").Vector(v) for v in o.bound_box]
    xs = [q.x for q in bb]; ys = [q.y for q in bb]; zs = [q.z for q in bb]
    tot_v += len(o.data.vertices)
    print("  %-14s v=%-7d x[%7.1f %7.1f] y[%7.1f %7.1f] z[%6.1f %6.1f]"
          % (o.name, len(o.data.vertices), min(xs), max(xs),
             min(ys), max(ys), min(zs), max(zs)))
print("TOTAL objects=%d verts=%d" % (len(obs), tot_v))

# 城台收分：量 y=-409 处主墩台南立面在 z=0.1 / z=11.9 的位置
print("---- 午门主墩台南立面（-Y 收分）")
for z in (0.05, 6.0, 11.9):
    r = ray((0.0, -470.0, z), (0, 1, 0), 70)
    print("  z=%5.2f -> %s" % (z, r))

# 高度抽查
print("---- 关键标高（每组最高点）")
for o in obs:
    zs = [(o.matrix_world @ __import__("mathutils").Vector(v)).z for v in o.bound_box]
    print("  %-14s top=%.2f" % (o.name, max(zs)))
print("CHECK_DONE")
