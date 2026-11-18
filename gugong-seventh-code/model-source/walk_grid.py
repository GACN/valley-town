# -*- coding: utf-8 -*-
"""重建可行走网格：多命中竖直射线求"地面"，带净空检查，再按真实地面高度做水平阻挡。
产出 data/height.bin / blocked.bin / walk_meta.json + walk_probe.txt 诊断
"""
import bpy, os, json, time, array
from mathutils import Vector
import bmesh
from mathutils.bvhtree import BVHTree

HERE = "/sdcard/Music/每日归档/2026-11/gugong"
GAME = os.path.join(HERE, "game")
DATA = os.path.join(GAME, "data")

t0 = time.time()
bm = bmesh.new()
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    tmp = bmesh.new()
    tmp.from_mesh(o.data)
    tmp.transform(o.matrix_world)
    vmap = {v: bm.verts.new(v.co) for v in tmp.verts}
    bm.verts.ensure_lookup_table()
    for f in tmp.faces:
        try:
            bm.faces.new([vmap[v] for v in f.verts])
        except ValueError:
            pass
    tmp.free()
bvh = BVHTree.FromBMesh(bm)
print("BVH %.1fs faces=%d" % (time.time() - t0, len(bm.faces)))


def vertical_surfaces(x, y, top=60.0, bottom=-3.0, maxn=6):
    """自上而下收集竖直射线碰到的面高度（去重）"""
    z = top
    out = []
    for _ in range(maxn):
        h = bvh.ray_cast(Vector((x, y, z)), Vector((0, 0, -1)), z - bottom)
        if h[0] is None:
            break
        hz = h[0].z
        out.append(round(hz, 3))
        z = hz - 0.02
        if z < bottom:
            break
    return out


# 诊断：几个关键点的竖直命中序列
probe = {
    '太和殿中心': (0, 0), '太和殿前月台': (0, -25), '三台边(60,-60)': (60, -60),
    '广场(0,-200)': (0, -200), '午门洞(0,-409)': (0, -409), '午门台(20,-409)': (20, -409),
    '乾清宫(0,232)': (0, 232), '东六宫院内(157,200)': (157, 200),
    '御花园(30,400)': (30, 400), '城墙顶(0,-404)': (0, -404), '城墙外(0,-425)': (0, -425),
}
lines = []
for k, (x, y) in probe.items():
    lines.append("%-18s %s" % (k, vertical_surfaces(x, y)))
open(os.path.join(GAME, "walk_probe.txt"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines))

STEP = 1.5
X0, X1 = -400.0, 400.0
Y0, Y1 = -440.0, 580.0
NX = int((X1 - X0) / STEP)
NY = int((Y1 - Y0) / STEP)
heights = array.array('H', [0]) * (NX * NY)
blocked = bytearray(NX * NY)

DIRS = [(1, 0), (-1, 0), (0, 1), (0, -1),
        (0.7071, 0.7071), (-0.7071, 0.7071), (0.7071, -0.7071), (-0.7071, -0.7071)]
RAY_LEN = 0.9
EYE = 1.55

t0 = time.time()
stat = {'nosurf': 0, 'ceiling': 0}
for j in range(NY):
    y = Y0 + (j + 0.5) * STEP
    for i in range(NX):
        x = X0 + (i + 0.5) * STEP
        idx = j * NX + i
        surf = vertical_surfaces(x, y)
        if not surf:
            stat['nosurf'] += 1
            heights[idx] = 0
            blocked[idx] = 1
            continue
        floor = surf[-1]
        heights[idx] = int(max(0, min(65535, round(floor * 100))))
        # 净空：地面上 2.15m 内有别的面 → 不可站（如屋檐下的构件、屋顶内部）
        clear = True
        for s in surf[:-1]:
            if floor + 0.25 < s < floor + 2.15:
                clear = False
                break
        if not clear:
            stat['ceiling'] += 1
            blocked[idx] = 1
            continue
        org = Vector((x, y, floor + EYE))
        blk = 0
        for dx, dy in DIRS:
            h = bvh.ray_cast(org, Vector((dx, dy, 0)).normalized(), RAY_LEN)
            if h[0] is not None:
                blk = 1
                break
        blocked[idx] = blk
    if j % 120 == 0:
        print("  row %d/%d %.0fs" % (j, NY, time.time() - t0), flush=True)

with open(os.path.join(DATA, "height.bin"), "wb") as f:
    heights.tofile(f)
with open(os.path.join(DATA, "blocked.bin"), "wb") as f:
    f.write(bytes(blocked))

b_free = sum(1 for b in blocked if b == 0)
json.dump({"step": STEP, "x0": X0, "x1": X1, "y0": Y0, "y1": Y1,
           "nx": NX, "ny": NY, "eye": EYE, "ray_len": RAY_LEN,
           "free_cells": b_free, "total_cells": NX * NY,
           "stats": stat,
           "height_unit": "cm", "height_encoding": "uint16 LE",
           "blocked_encoding": "uint8 row-major j*NX+i, +Y=north",
           "note": "height=竖直射线最低命中面(可站地面)；blocked=净空不足或1.55m眼高四向/斜向0.9m内有面"},
          open(os.path.join(DATA, "walk_meta.json"), "w"), ensure_ascii=False, indent=1)
print("WALK_OK free=%d/%d (%.1f%%) nosurf=%d ceiling=%d %.1fs" % (
    b_free, NX * NY, 100.0 * b_free / (NX * NY), stat['nosurf'], stat['ceiling'], time.time() - t0))
