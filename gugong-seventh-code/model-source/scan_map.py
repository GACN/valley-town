"""扫描故宫白模：输出对象清单/包围盒/材质/顶点数，供分区与游戏关卡使用。
只读，不生成、不渲染、不保存。
"""
import bpy, json, sys
from mathutils import Vector

OUT = "/sdcard/Music/每日归档/2026-11/gugong/game/map_inventory.json"

objs = []
for o in bpy.data.objects:
    d = {"name": o.name, "type": o.type}
    d["parent"] = o.parent.name if o.parent else None
    cols = [c.name for c in o.users_collection]
    d["collections"] = cols
    loc, rot, scale = o.matrix_world.decompose()
    d["loc"] = [round(loc.x, 2), round(loc.y, 2), round(loc.z, 2)]
    if o.type == 'MESH':
        me = o.data
        d["verts"] = len(me.vertices)
        d["polys"] = len(me.polygons)
        d["mats"] = [m.name if m else None for m in me.materials]
        # world bbox
        cs = [o.matrix_world @ Vector(c) for c in o.bound_box]
        mn = [min(p[i] for p in cs) for i in range(3)]
        mx = [max(p[i] for p in cs) for i in range(3)]
        d["bbox"] = [[round(v, 2) for v in mn], [round(v, 2) for v in mx]]
        d["dim"] = [round(mx[i] - mn[i], 2) for i in range(3)]
        d["zmax"] = round(mx[2], 2)
        d["zmin"] = round(mn[2], 2)
    objs.append(d)

collections = {}
for c in bpy.data.collections:
    collections[c.name] = {
        "objects": len(c.objects),
        "children": [ch.name for ch in c.children],
        "all_objects_recursive": len(c.all_objects),
    }

mats = []
for m in bpy.data.materials:
    mats.append({"name": m.name, "users": m.users,
                 "base_color": ([round(v, 3) for v in m.diffuse_color] if m.use_nodes is False else None)})

data = {
    "blend": bpy.data.filepath,
    "total_objects": len(objs),
    "mesh_objects": sum(1 for o in objs if o["type"] == 'MESH'),
    "total_verts": sum(o.get("verts", 0) for o in objs),
    "total_polys": sum(o.get("polys", 0) for o in objs),
    "collections": collections,
    "materials": mats,
    "objects": objs,
}

import os
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(data, f, ensure_ascii=False)
print("SCAN_OK objs=%d mesh=%d verts=%d polys=%d mats=%d" % (
    data["total_objects"], data["mesh_objects"], data["total_verts"],
    data["total_polys"], len(mats)))
