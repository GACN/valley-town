# -*- coding: utf-8 -*-
"""故宫白模 → 手机端游戏资产
产出（全部写到 game/assets/ 与 game/data/）：
  assets/glb/rNN_*.glb      分区 GLB（按材质合并，Draco 压缩）
  data/regions.json         分区元数据（bbox/对象数/顶点数/文件大小）
  data/objects.json         物件索引（名字/中心/尺寸/分区）供关卡挂点
  data/height.bin           可行走高度场 uint16 LE，单位 cm
  data/blocked.bin          可行走阻挡图 uint8 0/1
  data/walk_meta.json       网格参数
只读原 blend，不改、不存。不渲染。
"""
import bpy, os, sys, json, math, time
from mathutils import Vector

HERE = "/sdcard/Music/每日归档/2026-11/gugong"
GAME = os.path.join(HERE, "game")
GLB_DIR = os.path.join(GAME, "assets", "glb")
DATA = os.path.join(GAME, "data")
os.makedirs(GLB_DIR, exist_ok=True)
os.makedirs(DATA, exist_ok=True)

# ---------- 干净材质（丢弃程序化节点，GLB 只带 baseColor/rough/metal） ----------
PAL = {
    '琉璃黄瓦': (0.62, 0.40, 0.10, 0.30, 0.0),
    '朱红墙':   (0.42, 0.085, 0.055, 0.68, 0.0),
    '汉白玉':   (0.80, 0.77, 0.70, 0.42, 0.0),
    '檐下青绿': (0.10, 0.22, 0.18, 0.52, 0.0),
    '青砖地':   (0.27, 0.265, 0.25, 0.80, 0.0),
    '水面':     (0.045, 0.075, 0.085, 0.06, 0.0),
    '树冠':     (0.10, 0.20, 0.075, 0.85, 0.0),
    '鎏金':     (0.55, 0.40, 0.12, 0.34, 0.75),
}
clean = {}
for name, (r, g, b, rough, metal) in PAL.items():
    m = bpy.data.materials.new("X_" + name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    clean[name] = m

for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    for i, ms in enumerate(o.material_slots):
        if ms.material and ms.material.name in clean:
            ms.material = clean[ms.material.name]

# ---------- 分区规则 ----------
def region_of(name, cx, cy):
    if name.startswith(('CITYWALL', 'TOWER_', 'GATE_', 'MOAT', 'JINSHUI',
                        'GROUND', 'PLAZA', 'ORN_')):
        return 'r00_world'
    if name.startswith('WB_'):
        return 'r10_east_wings' if cx > 0 else 'r11_west_wings'
    if name.startswith('W6_'):
        return 'r08_east_six' if cx > 0 else 'r09_west_six'
    if cy < -360:
        return 'r01_wumen'
    if cy < -150:
        return 'r02_taihemen'
    if cy < 150:
        return 'r03_santai'
    if cy < 340:
        return 'r04_neiting'
    if cy < 500:
        return 'r05_yuhuayuan'
    return 'r06_shenwumen'

regions = {}
mesh_objs = [o for o in bpy.data.objects if o.type == 'MESH']
for o in mesh_objs:
    cs = [o.matrix_world @ Vector(c) for c in o.bound_box]
    cx = sum(p.x for p in cs) / 8.0
    cy = sum(p.y for p in cs) / 8.0
    reg = region_of(o.name, cx, cy)
    o["_reg"] = reg
    regions.setdefault(reg, []).append(o)

print("PARTITION:", {k: len(v) for k, v in sorted(regions.items())})

# ---------- 每个分区：合并成一个多材质对象后导出 GLB ----------
bpy.ops.object.select_all(action='DESELECT')
meta = {}
for reg, objs in sorted(regions.items()):
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = reg
    joined.data.name = reg

    # bbox
    cs = [joined.matrix_world @ Vector(c) for c in joined.bound_box]
    mn = [min(p[i] for p in cs) for i in range(3)]
    mx = [max(p[i] for p in cs) for i in range(3)]

    fp = os.path.join(GLB_DIR, reg + ".glb")
    bpy.ops.object.select_all(action='DESELECT')
    joined.select_set(True)
    bpy.context.view_layer.objects.active = joined
    t0 = time.time()
    bpy.ops.export_scene.gltf(
        filepath=fp,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_materials='EXPORT',
        export_normals=True,
        export_tangents=False,
        export_texcoords=False,
    )
    sz = os.path.getsize(fp)
    meta[reg] = {
        "file": "assets/glb/%s.glb" % reg,
        "bytes": sz,
        "verts": len(joined.data.vertices),
        "polys": len(joined.data.polygons),
        "materials": [ms.material.name for ms in joined.material_slots if ms.material],
        "bbox": [[round(v, 2) for v in mn], [round(v, 2) for v in mx]],
        "center": [round((mn[i] + mx[i]) / 2, 2) for i in range(3)],
        "export_s": round(time.time() - t0, 1),
    }
    print("EXPORT %-18s objs=%-5d verts=%-7d %7.2fMB %.1fs" % (
        reg, len(objs), len(joined.data.vertices), sz / 1e6, time.time() - t0))

with open(os.path.join(DATA, "regions.json"), "w") as f:
    json.dump(meta, f, ensure_ascii=False, indent=1)

# ---------- 物件索引（供关卡挂点；用未合并前的名字） ----------
inv = json.load(open(os.path.join(GAME, "map_inventory.json")))
with open(os.path.join(DATA, "objects.json"), "w") as f:
    json.dump(inv["objects"], f, ensure_ascii=False)

# ---------- 可行走网格（高度场 + 阻挡） ----------
# 场景现在已经是合并后的分区对象；直接用 depsgraph 建 BVH 采样
import bmesh
from mathutils.bvhtree import BVHTree

t0 = time.time()
bm = bmesh.new()
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    me = o.data
    tmp = bmesh.new()
    tmp.from_mesh(me)
    tmp.transform(o.matrix_world)
    # 追加到 bm
    vmap = {}
    for v in tmp.verts:
        vmap[v] = bm.verts.new(v.co)
    bm.verts.ensure_lookup_table()
    for f in tmp.faces:
        try:
            bm.faces.new([vmap[v] for v in f.verts])
        except ValueError:
            pass
    tmp.free()
bvh = BVHTree.FromBMesh(bm)
print("BVH built in %.1fs faces=%d" % (time.time() - t0, len(bm.faces)))

STEP = 1.5
X0, X1 = -400.0, 400.0
Y0, Y1 = -440.0, 580.0
NX = int((X1 - X0) / STEP)
NY = int((Y1 - Y0) / STEP)
print("GRID %dx%d = %d cells" % (NX, NY, NX * NY))

import array
heights = array.array('H', [0]) * (NX * NY)
blocked = bytearray(NX * NY)

DIRS = [(1, 0), (-1, 0), (0, 1), (0, -1),
        (0.7071, 0.7071), (-0.7071, 0.7071), (0.7071, -0.7071), (-0.7071, -0.7071)]
RAY_LEN = 1.1        # 阻挡判定射线长度（约等于玩家半径 + 半格）
EYE = 1.55

t0 = time.time()
for j in range(NY):
    y = Y0 + (j + 0.5) * STEP
    for i in range(NX):
        x = X0 + (i + 0.5) * STEP
        idx = j * NX + i
        # 地面高度：从高处垂直向下
        hit = bvh.ray_cast(Vector((x, y, 60.0)), Vector((0, 0, -1)), 80.0)
        if hit[0] is None:
            heights[idx] = 0
        else:
            hz = hit[0].z
            heights[idx] = int(max(0, min(65535, round(hz * 100))))
        zref = max(hz if hit[0] is not None else 0.0, 0.0) + EYE
        org = Vector((x, y, zref))
        blk = 0
        for dx, dy in DIRS:
            h = bvh.ray_cast(org, Vector((dx, dy, 0)).normalized(), RAY_LEN)
            if h[0] is not None:
                blk = 1
                break
        blocked[idx] = blk
    if j % 100 == 0:
        print("  row %d/%d  %.0fs" % (j, NY, time.time() - t0), flush=True)

with open(os.path.join(DATA, "height.bin"), "wb") as f:
    heights.tofile(f)
with open(os.path.join(DATA, "blocked.bin"), "wb") as f:
    f.write(bytes(blocked))

b_free = sum(1 for b in blocked if b == 0)
with open(os.path.join(DATA, "walk_meta.json"), "w") as f:
    json.dump({
        "step": STEP, "x0": X0, "x1": X1, "y0": Y0, "y1": Y1,
        "nx": NX, "ny": NY, "eye": EYE, "ray_len": RAY_LEN,
        "free_cells": b_free, "total_cells": NX * NY,
        "height_unit": "cm", "height_encoding": "uint16 LE",
        "blocked_encoding": "uint8, row-major, j*NX+i, y increasing north",
        "note": "height=向下射线命中的地面高度；blocked=1.55m 眼高处 8 方向 1.1m 内有面",
    }, f, ensure_ascii=False, indent=1)
print("WALK_OK free=%d/%d (%.1f%%) %.1fs" % (
    b_free, NX * NY, 100.0 * b_free / (NX * NY), time.time() - t0))
print("ALL_DONE")
