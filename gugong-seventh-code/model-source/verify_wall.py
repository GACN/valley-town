# -*- coding: utf-8 -*-
"""mod_wall 几何核验：断面 / 门洞 / 角楼层数（只建模型，不渲染）"""
import bpy, sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree

LIB = "/sdcard/Music/每日归档/2026-11/gugong/lib"
sys.path.append(LIB)
bpy.ops.wm.read_factory_settings(use_empty=True)
import common as G
import mod_wall as W

C = G.coll("CHK")
obs = W.build(c=C)
bpy.context.view_layer.update()

print("--- 对象清单")
for o in obs:
    mn = [1e9] * 3
    mx = [-1e9] * 3
    for v in o.bound_box:
        w = o.matrix_world @ Vector(v)
        for i in range(3):
            mn[i] = min(mn[i], w[i]); mx[i] = max(mx[i], w[i])
    print("%-14s v=%6d f=%6d  x[%7.1f %7.1f] y[%7.1f %7.1f] z[%6.2f %6.2f]" % (
        o.name, len(o.data.vertices), len(o.data.polygons),
        mn[0], mx[0], mn[1], mx[1], mn[2], mx[2]))

# ---- BVH 射线
def bvh(names):
    dg = bpy.context.evaluated_depsgraph_get()
    verts, faces = [], []
    for n in names:
        o = bpy.data.objects[n]
        mw = o.matrix_world
        off = len(verts)
        verts += [mw @ v.co for v in o.data.vertices]
        faces += [tuple(off + i for i in p.vertices) for p in o.data.polygons]
    return BVHTree.FromPolygons(verts, faces, all_triangles=False, epsilon=0.0)

def ray(tree, o, d, label):
    d = Vector(d).normalized()
    hit = tree.ray_cast(Vector(o), d, 4000.0)
    if hit[0] is None:
        print("%-34s 未命中" % label)
        return None
    t = hit[3]
    print("%-34s 命中 dist=%8.3f  点=(%.2f, %.2f, %.2f); 命中面数=%d" % (
        label, t, hit[0].x, hit[0].y, hit[0].z, len(hit)))
    return t

wall = bvh(["CITYWALL_BODY"])
print("--- 城墙断面（南墙 y=-409 中心线）")
ray(wall, (0, -460, 2.0), (0, 1, 0), "z=2.0  自南向北")
ray(wall, (0, 460, 2.0), (0, -1, 0), "z=2.0  自北向南")
ray(wall, (0, -460, 9.5), (0, 1, 0), "z=9.5  自南向北")
ray(wall, (0, -460, 12.0), (0, 1, 0), "z=12 (应穿顶越过)")
rot = bvh(["CITYWALL_BODY"])
ray(rot, (-460, 0.0, 2.0), (1, 0, 0), "西墙 z=2.0 自西向东(y=0)")

print("--- 东华门门洞（城台 x 364..389, y 55..88）")
gt = bvh(["GATE_E"])
ray(gt, (330, 71.5, 3.5), (1, 0, 0), "三门洞·明间 z=3.5（应止于门扇）")
ray(gt, (330, 71.5 + 9.6, 3.5), (1, 0, 0), "三门洞·侧间 z=3.5")
ray(gt, (330, 71.5 + 14.5, 3.5), (1, 0, 0), "墩台 z=3.5（应止于 364 外皮）")
ray(gt, (330, 71.5, 8.6), (1, 0, 0), "过梁 z=8.6（应止于 364 外皮）")
ray(gt, (330, 71.5, 7.50), (1, 0, 0), "券顶一级 z=7.5（应止于外皮）")
ray(gt, (330, 71.5, 7.00), (1, 0, 0), "券下 z=7.0（应穿洞到门扇）")
ray(gt, (330, 71.5, 12.0), (1, 0, 0), "门楼柱层 z=12")

print("--- 角楼各层檐口（东南角 x=376.5 y=-409）")
tw = bvh(["TOWER_SE"])
for z in (14.5, 18.5, 23.0, 25.5, 27.0):
    ray(tw, (376.5 - 40, -409, z), (1, 0, 0), "z=%.1f 自西向东" % z)

print("--- 护城河断面（南段）")
mo = bvh(["MOAT"])
ray(mo, (0, -520, -1.0), (0, 1, 0), "z=-1.0 自南向北（河底应在 -4）")
ray(mo, (0, -420, 0.50), (0, 1, 0), "z=0.5  自南向北（应命中内驳岸）")

tot = sum(len(o.data.polygons) for o in obs)
print("--- 合计 objects=%d verts=%d faces=%d" % (
    len(obs), sum(len(o.data.vertices) for o in obs), tot))
print("VERIFY_DONE")
