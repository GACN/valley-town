# -*- coding: utf-8 -*-
"""给紫禁城白模上材质：官式色彩 + 程序化纹理（非照片贴图）。
产出 gugong_color.blend（保留原白模 gugong.blend 不动）。
"""
import bpy, os, sys, math

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'gugong.blend'))

# ---------------- 调色板 ----------------
PAL = {
    'TILE':  (0.62, 0.40, 0.10),   # 琉璃黄瓦
    'WALL':  (0.42, 0.085, 0.055), # 朱红墙/柱
    'STONE': (0.80, 0.77, 0.70),   # 汉白玉
    'UNDER': (0.10, 0.22, 0.18),   # 檐下青绿彩画
    'BRICK': (0.30, 0.29, 0.27),   # 青砖地
    'WATER': (0.045, 0.075, 0.085),
    'GREEN': (0.10, 0.20, 0.075),
    'GOLD':  (0.55, 0.40, 0.12),
}


def _noise_bump(nt, bsdf, scale, strength, detail=2.0):
    tex = nt.nodes.new('ShaderNodeTexNoise')
    tex.inputs['Scale'].default_value = scale
    tex.inputs['Detail'].default_value = detail
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = strength
    nt.links.new(tex.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return tex


def _brick(nt, bsdf, c1, c2, scale):
    tc = nt.nodes.new('ShaderNodeTexCoord')
    br = nt.nodes.new('ShaderNodeTexBrick')
    br.inputs['Scale'].default_value = scale
    br.inputs['Mortar Size'].default_value = 0.012
    br.inputs['Color1'].default_value = (*c1, 1)
    br.inputs['Color2'].default_value = (*c2, 1)
    br.inputs['Mortar'].default_value = (0.16, 0.16, 0.15, 1)
    nt.links.new(tc.outputs['Object'], br.inputs['Vector'])
    nt.links.new(br.outputs['Color'], bsdf.inputs['Base Color'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.35
    nt.links.new(br.outputs['Color'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])


def mk(name, col, rough=0.55, bump=None, brick=None, metal=0.0, emit=0.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*col, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if brick:
        _brick(nt, bsdf, brick[0], brick[1], brick[2])
    elif bump:
        _noise_bump(nt, bsdf, bump[0], bump[1])
    m.diffuse_color = (*col, 1.0)
    return m


M = {}
M['TILE'] = mk('琉璃黄瓦', PAL['TILE'], 0.30, bump=(260.0, 0.30))
M['WALL'] = mk('朱红墙', PAL['WALL'], 0.68, bump=(120.0, 0.12))
M['STONE'] = mk('汉白玉', PAL['STONE'], 0.42, bump=(60.0, 0.07))
M['UNDER'] = mk('檐下青绿', PAL['UNDER'], 0.52, bump=(150.0, 0.10))
M['BRICK'] = mk('青砖地', PAL['BRICK'], 0.78, brick=((0.29, 0.28, 0.26), (0.24, 0.235, 0.22), 1.6))
M['WATER'] = mk('水面', PAL['WATER'], 0.06, bump=(30.0, 0.04))
M['GREEN'] = mk('树冠', PAL['GREEN'], 0.85, bump=(90.0, 0.20))
M['GOLD'] = mk('鎏金', PAL['GOLD'], 0.34, metal=0.75, bump=(90.0, 0.05))
SLOTS = ['TILE', 'WALL', 'STONE', 'UNDER', 'GOLD', 'BRICK']
IDX = {k: i for i, k in enumerate(SLOTS)}


def kind_of(n):
    t = n.split('_')
    return t[1] if len(t) >= 2 else t[0]


# 按名字直接判定的规则（细粒度对象，4100+ 个）
def name_mat(name):
    k = kind_of(name)
    p = name.split('_')[0].upper()
    if p in ('GROUND', 'PLAZA'):
        return 'BRICK'
    if p in ('TAI', 'DB'):     # 三台 / 丹陛：汉白玉
        return 'STONE'
    up = name.upper()
    if p == 'MOAT':
        return 'WATER'
    if p == 'JINSHUI':
        return 'STONE' if 'BRIDGE' in up else 'WATER'   # 金水桥是汉白玉，不是水
    if 'ROCK' in up:
        return 'STONE'
    if 'TREE' in up or p in ('YH', 'TREE'):
        return 'GREEN'
    if k.startswith('roof') or k.startswith('rib'):
        return 'TILE'
    if k.startswith('dg'):
        return 'UNDER'
    if k in ('col', 'win0', 'win1', 'win2', 'win3') or k.startswith('win'):
        return 'WALL'
    if k.startswith('wall') or k.startswith('bk'):
        return 'WALL'
    if k.startswith('plrail') or k in ('plinth', 'yuetai', 'TAI', 'DB', 'ramp',
                                       'stairs', 'stair', 'arch', 'bridge', 'deck'):
        return 'STONE'
    if k.startswith('lt') or k.startswith('dr') or k in ('fN', 'fS', 'fE', 'fW'):
        return 'UNDER'
    if k.startswith('orn') or k.startswith('bao') or k in ('ridge', 'zhengji'):
        return 'GOLD'
    return None


# 合并对象的逐面判定（无名字语义时用：高度比例 + 法线）
def face_mat(poly, rel, nz):
    # 平台/广场顶面（大平面、低处、法线朝上）→ 青砖，不是黄瓦
    if nz > 0.86 and rel < 0.50:
        return 'BRICK'
    if nz > 0.25:          # 任何朝上的斜面都是屋面 → 琉璃瓦
        return 'TILE'
    if nz < -0.25:         # 檐下/底面 → 青绿彩画
        return 'UNDER'
    if rel < 0.16:         # 贴地的立面 → 台基
        return 'STONE'
    return 'WALL'          # 垂直面 → 朱红


stats = {}
for ob in list(bpy.data.objects):
    if ob.type != 'MESH' or not ob.data.polygons:
        continue
    mname = name_mat(ob.name)
    if mname:
        ob.data.materials.clear()
        ob.data.materials.append(M[mname])
        for p in ob.data.polygons:
            p.material_index = 0
        stats[mname] = stats.get(mname, 0) + 1
        continue
    # 逐面
    ob.data.materials.clear()
    for s in SLOTS:
        ob.data.materials.append(M[s])
    vs = ob.data.vertices
    z0 = min(v.co.z for v in vs)
    z1 = max(v.co.z for v in vs)
    span = max(0.5, z1 - z0)
    for p in ob.data.polygons:
        zc = p.center.z
        rel = (zc - z0) / span
        mi = face_mat(p, rel, p.normal.z)
        p.material_index = IDX[mi] if mi in IDX else 2   # BRICK 不在槽位里 → 落到汉白玉
    stats['FACEHEUR'] = stats.get('FACEHEUR', 0) + 1

# 世界与渲染设置
sc = bpy.context.scene
w = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
sc.world = w
w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.56, 0.58, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.85
sc.render.engine = 'CYCLES'
sc.cycles.samples = 24
sc.cycles.use_denoising = False
sc.view_settings.view_transform = 'Filmic' if 'Filmic' in [i.name for i in sc.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Standard'
sc.view_settings.look = 'None'

out = os.path.join(HERE, 'gugong_color.blend')
bpy.ops.wm.save_as_mainfile(filepath=out)
print('MAT_STATS', stats)
print('SAVED', out)
