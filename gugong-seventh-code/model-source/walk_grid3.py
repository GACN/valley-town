# -*- coding: utf-8 -*-
"""可行走网格 v3：顶面归属法
每格三条自上而下单射线：
  terrain（广场/台基/三台/踏跺/金水桥/城墙）= 地形顶面
  full（除 GROUND 外全部构件）           = 该格最高的东西
  water（护城河/御花园河）               = 水面
判定：最高面属于地形 → 可站，高度=地形顶；最高面是建筑/构件 → 阻挡（殿内、屋顶、院墙都算）；
      地形层无命中 → 地面 0，若其上有构件则阻挡；水面最高 → 水（阻塞=2，留给定制的船/桥逻辑）。
"""
import bpy, os, json, time, array
from mathutils import Vector
import bmesh
from mathutils.bvhtree import BVHTree

HERE = "/sdcard/Music/每日归档/2026-11/gugong"
GAME = os.path.join(HERE, "game")
DATA = os.path.join(GAME, "data")

TERRAIN = ('PLAZA', 'TAI_T', 'DB_STEP', 'DB_RAMP', 'JINSHUI', 'CITYWALL',
           'NI_TAI3', 'THM_TAI', 'SWM_TAI')
WATER = ('MOAT', 'YH_RIVER')
SKIP = ('GROUND',)


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
tb, tn = build_bvh([o for o in meshes if o.name.startswith(TERRAIN)])
wb, wn = build_bvh([o for o in meshes if o.name.startswith(WATER)])
fb, fn = build_bvh([o for o in meshes if not o.name.startswith(SKIP)])
print("BVH terrain=%d water=%d full=%d" % (tn, wn, fn))

DOWN = Vector((0, 0, -1))


def top(bvh, x, y, z=70.0):
    h = bvh.ray_cast(Vector((x, y, z)), DOWN, 90.0)
    return None if h[0] is None else h[0].z


probe = {'太和殿中心': (0, 0), '月台(0,-25)': (0, -25), '三台边(60,-60)': (60, -60),
         '广场(0,-200)': (0, -200), '午门台(0,-409)': (0, -409), '乾清宫(0,232)': (0, 232),
         '东六宫院内(157,200)': (157, 200), '御花园(30,400)': (30, 400),
         '城墙顶(0,-404)': (0, -404), '城墙外(0,-425)': (0, -425), '金水桥(0,-160)': (0, -160),
         '太和门前置(0,-215)': (0, -215)}
lines = []
for k, (x, y) in probe.items():
    lines.append("%-22s terrain=%-8s full=%-8s water=%-8s" % (
        k, top(tb, x, y), top(fb, x, y), top(wb, x, y)))
open(os.path.join(GAME, "walk_probe.txt"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines))

STEP = 1.5
X0, X1 = -415.0, 415.0
Y0, Y1 = -485.0, 590.0
NX = int((X1 - X0) / STEP)
NY = int((Y1 - Y0) / STEP)
heights = array.array('H', [0]) * (NX * NY)
blocked = bytearray(NX * NY)

t0 = time.time()
stat = {'walk_terrain': 0, 'walk_bare': 0, 'blocked_building': 0, 'blocked_bare': 0, 'water': 0}
for j in range(NY):
    y = Y0 + (j + 0.5) * STEP
    for i in range(NX):
        x = X0 + (i + 0.5) * STEP
        idx = j * NX + i
        t = top(tb, x, y)
        f = top(fb, x, y)
        w = top(wb, x, y)
        # 水：水面就是该格最高面
        if w is not None and (f is None or w >= f - 0.05):
            heights[idx] = int(round(max(0.0, w) * 100))
            blocked[idx] = 2
            stat['water'] += 1
            continue
        if t is not None:
            if f is not None and f > t + 0.5:
                heights[idx] = int(round(max(0.0, t) * 100))
                blocked[idx] = 1
                stat['blocked_building'] += 1
            else:
                heights[idx] = int(round(max(0.0, t) * 100))
                blocked[idx] = 0
                stat['walk_terrain'] += 1
        else:
            heights[idx] = 0
            if f is not None and f > 0.6:
                blocked[idx] = 1
                stat['blocked_bare'] += 1
            else:
                blocked[idx] = 0
                stat['walk_bare'] += 1
    if j % 140 == 0:
        print("  row %d/%d %.0fs" % (j, NY, time.time() - t0), flush=True)

open(os.path.join(DATA, "height.bin"), "wb").write(heights.tobytes())
open(os.path.join(DATA, "blocked.bin"), "wb").write(bytes(blocked))
json.dump({"step": STEP, "x0": X0, "x1": X1, "y0": Y0, "y1": Y1,
           "nx": NX, "ny": NY, "eye": 1.55, "stats": stat,
           "height_unit": "cm", "height_encoding": "uint16 little-endian",
           "blocked_encoding": "uint8 row-major j*nx+i, +Y=north, 0=free 1=blocked 2=water",
           "note": "顶面归属法：最高面属于地形层→可站；属于建筑/构件→阻挡"},
          open(os.path.join(DATA, "walk_meta.json"), "w"), ensure_ascii=False, indent=1)
walk = stat['walk_terrain'] + stat['walk_bare']
print("WALK_OK walkable=%d/%d (%.1f%%) %s %.1fs" % (
    walk, NX * NY, 100.0 * walk / (NX * NY), stat, time.time() - t0))
