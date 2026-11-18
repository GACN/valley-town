# -*- coding: utf-8 -*-
"""重建可行走网格 v2
地形 BVH（地面/广场/台基/三台/踏跺/金水桥/城墙）= 决定可站高度
全量 BVH = 决定阻挡（建筑、院墙、柱、栏杆）
"""
import bpy, os, json, time, array
from mathutils import Vector
import bmesh
from mathutils.bvhtree import BVHTree

HERE = "/sdcard/Music/每日归档/2026-11/gugong"
GAME = os.path.join(HERE, "game")
DATA = os.path.join(GAME, "data")

TERRAIN_PREFIX = ('GROUND', 'PLAZA', 'TAI_T', 'DB_STEP', 'DB_RAMP', 'JINSHUI',
                  'CITYWALL', 'MOAT', 'NI_TAI3', 'THM_TAI', 'SWM_TAI', 'YH_RIVER')


def build_bvh(objs):
    bm = bmesh.new()
    for o in objs:
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
    n = len(bm.faces)
    bm.free()
    return bvh, n


meshes = [o for o in bpy.data.objects if o.type == 'MESH']
terrain_objs = [o for o in meshes if o.name.startswith(TERRAIN_PREFIX)]
t0 = time.time()
tbvh, tn = build_bvh(terrain_objs)
print("terrain BVH %.1fs faces=%d objs=%d" % (time.time() - t0, tn, len(terrain_objs)))
t0 = time.time()
fbvh, fn = build_bvh(meshes)
print("full BVH %.1fs faces=%d" % (time.time() - t0, fn))


def lowest(x, y, bvh, top=60.0, bottom=-3.0, maxn=20):
    z = top
    last = None
    for _ in range(maxn):
        h = bvh.ray_cast(Vector((x, y, z)), Vector((0, 0, -1)), z - bottom)
        if h[0] is None:
            break
        last = h[0].z
        z = last - 0.02
        if z < bottom:
            break
    return last


probe = {'太和殿中心': (0, 0), '月台(0,-25)': (0, -25), '三台边(60,-60)': (60, -60),
         '三台东(64,0)': (64, 0), '广场(0,-200)': (0, -200), '午门洞(0,-409)': (0, -409),
         '乾清宫(0,232)': (0, 232), '内廷台(0,270)': (0, 270),
         '东六宫院内(157,200)': (157, 200), '西六宫院内(-189,200)': (-189, 200),
         '御花园(30,400)': (30, 400), '城墙顶(0,-404)': (0, -404), '城墙外(0,-425)': (0, -425),
         '金水桥(0,-160)': (0, -160)}
lines = []
for k, (x, y) in probe.items():
    lines.append("%-24s floor=%-7s" % (k, lowest(x, y, tbvh)))
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
stat = {'nofoor': 0, 'blocked': 0}
for j in range(NY):
    y = Y0 + (j + 0.5) * STEP
    for i in range(NX):
        x = X0 + (i + 0.5) * STEP
        idx = j * NX + i
        f = lowest(x, y, tbvh)
        if f is None:
            stat['nofoor'] += 1
            heights[idx] = 0
            blocked[idx] = 1
            continue
        heights[idx] = int(max(0, min(65535, round(f * 100))))
        org = Vector((x, y, f + EYE))
        blk = 0
        for dx, dy in DIRS:
            h = fbvh.ray_cast(org, Vector((dx, dy, 0)).normalized(), RAY_LEN)
            if h[0] is not None:
                blk = 1
                break
        blocked[idx] = blk
        stat['blocked'] += blk
    if j % 120 == 0:
        print("  row %d/%d %.0fs" % (j, NY, time.time() - t0), flush=True)

open(os.path.join(DATA, "height.bin"), "wb").write(heights.tobytes())
open(os.path.join(DATA, "blocked.bin"), "wb").write(bytes(blocked))
b_free = sum(1 for b in blocked if b == 0)
json.dump({"step": STEP, "x0": X0, "x1": X1, "y0": Y0, "y1": Y1,
           "nx": NX, "ny": NY, "eye": EYE, "ray_len": RAY_LEN,
           "free_cells": b_free, "total_cells": NX * NY, "stats": stat,
           "height_unit": "cm", "height_encoding": "uint16 little-endian",
           "blocked_encoding": "uint8 row-major j*nx+i, +Y=north",
           "note": "height=地形层(地面/台基/三台/踏跺/城墙顶)最低命中面；blocked=全量模型在眼高四向0.9m内有面"},
          open(os.path.join(DATA, "walk_meta.json"), "w"), ensure_ascii=False, indent=1)
print("WALK_OK free=%d/%d (%.1f%%) nofloor=%d %.1fs" % (
    b_free, NX * NY, 100.0 * b_free / (NX * NY), stat['nofoor'], time.time() - t0))
