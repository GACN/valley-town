# -*- coding: utf-8 -*-
"""
故宫白模几何库 —— 统一契约
坐标：X 东西(+X 东) / Y 南北(+Y 北) / Z 上，单位米。
原点：太和殿殿身中心，Z=0 = 太和殿广场地面标高。
所有函数返回 bpy object 或 object 列表，已 recalc 法线。
"""
import bpy, bmesh, math
from mathutils import Vector, Matrix, Euler

TAU = math.pi * 2


# ---------------------------------------------------------------- 基础
def scene():
    return bpy.context.scene


def coll(name="GUGONG"):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    return c


def new_mesh(name, verts, faces, c=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate(verbose=False)
    me.update()
    ob = bpy.data.objects.new(name, me)
    (c or bpy.context.scene.collection).objects.link(ob)
    return ob


def recalc(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return ob


def solidify(ob, t, offset=0.0):
    m = ob.modifiers.new("solid", 'SOLIDIFY')
    m.thickness = t
    m.offset = offset
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.modifier_apply(modifier=m.name)
    ob.select_set(False)
    recalc(ob)
    return ob


def bevel(ob, w=0.05, seg=1):
    m = ob.modifiers.new("bev", 'BEVEL')
    m.width = w
    m.segments = seg
    m.limit_method = 'ANGLE'
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.modifier_apply(modifier=m.name)
    ob.select_set(False)
    return ob


def join(objs, name=None):
    objs = [o for o in objs if o and o.name in bpy.data.objects]
    if not objs:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    if name:
        ob.name = name
    ob.select_set(False)
    return ob


# ---------------------------------------------------------------- 体块
BOX_F = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]


def beam_between(name, p0, p1, w, h, c=None, extend=0.0):
    """两点之间的方料（垂脊/戗脊/椽），局部 Z 轴对齐线段方向。"""
    from mathutils import Vector
    v0, v1 = Vector(p0), Vector(p1)
    d = v1 - v0
    L = d.length
    if L < 1e-4:
        return None
    if extend:
        d = d.normalized() * (L + extend * 2)
    ob = box(name, w, h, d.length, loc=tuple((v0 + v1) / 2), bottom=False, c=c)
    ob.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return ob


def box(name, sx, sy, sz, loc=(0, 0, 0), rot=(0, 0, 0), c=None, bottom=True):
    """底面在 loc.z 的长方体（除非 bottom=False 则以中心为 loc）。"""
    z0 = 0.0 if bottom else -sz / 2.0
    v = [(-sx / 2, -sy / 2, z0), (sx / 2, -sy / 2, z0), (sx / 2, sy / 2, z0), (-sx / 2, sy / 2, z0),
         (-sx / 2, -sy / 2, z0 + sz), (sx / 2, -sy / 2, z0 + sz),
         (sx / 2, sy / 2, z0 + sz), (-sx / 2, sy / 2, z0 + sz)]
    ob = new_mesh(name, v, BOX_F, c)
    ob.location = loc
    ob.rotation_euler = Euler(rot)
    return recalc(ob)


def cylinder(name, r, h, loc=(0, 0, 0), seg=16, r2=None, c=None):
    r2 = r if r2 is None else r2
    v, f = [], []
    for i in range(seg):
        a = TAU * i / seg
        v.append((r * math.cos(a), r * math.sin(a), 0))
    for i in range(seg):
        a = TAU * i / seg
        v.append((r2 * math.cos(a), r2 * math.sin(a), h))
    for i in range(seg):
        j = (i + 1) % seg
        f.append((i, j, seg + j, seg + i))
    f.append(tuple(range(seg))[::-1])
    f.append(tuple(range(seg, seg * 2)))
    ob = new_mesh(name, v, f, c)
    ob.location = loc
    return recalc(ob)


def plate(name, pts_xz_top, thickness, c=None, y0=0.0, y1=1.0):
    """把一个 XZ 截面沿 Y 推成体。pts_xz_top: [(x,z)...] 顺时针。"""
    n = len(pts_xz_top)
    v = [(p[0], y0, p[1]) for p in pts_xz_top] + [(p[0], y1, p[1]) for p in pts_xz_top]
    f = [tuple(range(n))[::-1], tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        f.append((i, j, n + j, n + i))
    return recalc(new_mesh(name, v, f, c))


# ---------------------------------------------------------------- 中式屋顶（核心）
def _roof_height(z_eave, z_ridge, v, curve):
    """v: 0=脊 1=檐。中式举折：近脊陡、近檐平缓（反宇）。"""
    return z_eave + (z_ridge - z_eave) * ((1.0 - v) ** curve)


def _shengqi(u, v, upturn, p=1.9):
    """生起：檐口向两端渐高 + 翼角起翘（低指数让中段也带弧）。"""
    return upturn * (abs(u) ** p) * (v ** 2.0)


def roof_hip(name, width, depth, z_eave, z_ridge, ridge_frac=0.0,
             curve=1.75, upturn=0.0, seg_u=14, seg_v=9, c=None,
             close_bottom=False, thick=0.0, ribs=0, rib_w=0.40, rib_h=0.26):
    """庑殿顶（四坡五脊）。width/depth = 檐口外轮廓（含出檐）。
    ridge_frac: 推山系数 0=正脊长 width-depth, 1=正脊通长。"""
    a, b = width / 2.0, depth / 2.0
    c_ridge = max(0.4, a - b * (1.0 - ridge_frac))
    objs = []
    faces_v = []

    # 前后坡（长坡）
    for sy in (-1, 1):
        verts = []
        for iu in range(seg_u + 1):
            u = -1.0 + 2.0 * iu / seg_u
            for iv in range(seg_v + 1):
                v = iv / seg_v
                xr = c_ridge * u
                xf = a * u
                x = xr + (xf - xr) * v
                y = sy * b * v
                z = _roof_height(z_eave, z_ridge, v, curve)
                z += _shengqi(u, v, upturn)
                verts.append((x, y, z))
        nv = seg_v + 1
        faces = []
        for iu in range(seg_u):
            for iv in range(seg_v):
                p = iu * nv + iv
                q = (iu + 1) * nv + iv
                faces.append((p, q, q + 1, p + 1) if sy > 0 else (p, p + 1, q + 1, q))
        objs.append(new_mesh(name + ("_S" if sy < 0 else "_N"), verts, faces, c))
        faces_v.append((verts, faces, sy))

    # 东西山面（三角坡）
    for sx in (-1, 1):
        verts = []
        for iu in range(seg_u + 1):
            u = -1.0 + 2.0 * iu / seg_u
            for iv in range(seg_v + 1):
                v = iv / seg_v
                x = sx * (c_ridge + (a - c_ridge) * v)
                y = b * u * v
                z = _roof_height(z_eave, z_ridge, v, curve)
                z += _shengqi(u, v, upturn)
                verts.append((x, y, z))
        nv = seg_v + 1
        faces = []
        for iu in range(seg_u):
            for iv in range(seg_v):
                p = iu * nv + iv
                q = (iu + 1) * nv + iv
                faces.append((p, q, q + 1, p + 1) if sx > 0 else (p, p + 1, q + 1, q))
        objs.append(new_mesh(name + ("_E" if sx > 0 else "_W"), verts, faces, c))

    for ob in objs:
        recalc(ob)
        if thick:
            solidify(ob, thick, -1.0)
        ob.select_set(False)

    # 瓦垄：带侧壁的瓦条棱（平面片会被 solidify 外壳吞掉，必须做出体积）
    # 全部瓦条汇成一张 mesh —— 逐条建对象会让对象数爆掉、join 极慢
    if ribs:
        rv, rf = [], []

        def _strip_along_u(sign_y, u):
            """前后坡的一条瓦垄"""
            base = len(rv)
            for iv in range(seg_v + 1):
                v = iv / seg_v
                xr, xf = c_ridge * u, a * u
                x = xr + (xf - xr) * v
                zb = _roof_height(z_eave, z_ridge, v, curve) + _shengqi(u, v, upturn)
                y0 = sign_y * b * v
                hw = rib_w / 2.0
                rv.extend([(x - hw, y0, zb), (x + hw, y0, zb),
                           (x - hw, y0, zb + rib_h), (x + hw, y0, zb + rib_h)])
            for iv in range(seg_v):
                p0 = base + iv * 4
                p1 = p0 + 4
                rf.append((p0 + 2, p0 + 3, p1 + 3, p1 + 2))
                rf.append((p0, p0 + 2, p1 + 2, p1))
                rf.append((p0 + 1, p1 + 1, p1 + 3, p0 + 3))

        def _strip_along_y(sign_x, u):
            """山面的一条瓦垄"""
            base = len(rv)
            for iv in range(seg_v + 1):
                v = iv / seg_v
                x = sign_x * (c_ridge + (a - c_ridge) * v)
                y = b * u * v
                zb = _roof_height(z_eave, z_ridge, v, curve) + _shengqi(u, v, upturn)
                hw = rib_w / 2.0
                rv.extend([(x, y - hw, zb), (x, y + hw, zb),
                           (x, y - hw, zb + rib_h), (x, y + hw, zb + rib_h)])
            for iv in range(seg_v):
                p0 = base + iv * 4
                p1 = p0 + 4
                rf.append((p0 + 2, p0 + 3, p1 + 3, p1 + 2))
                rf.append((p0, p0 + 2, p1 + 2, p1))
                rf.append((p0 + 1, p1 + 1, p1 + 3, p0 + 3))

        for sy in (-1, 1):
            for i in range(ribs + 1):
                _strip_along_u(sy, -1.0 + 2.0 * i / ribs)
        ng = max(4, int(depth / 1.4))
        for sx in (-1, 1):
            for i in range(ng + 1):
                _strip_along_y(sx, -1.0 + 2.0 * i / ng)
        objs.append(recalc(new_mesh(name + "_ribs", rv, rf, c)))
    return objs


def roof_xieshan(name, width, depth, z_eave, z_ridge, curve=1.75, upturn=0.0,
                 seg_u=12, seg_v=8, c=None, thick=0.0, gable_inset=0.0):
    """歇山顶近似：前后坡 + 两端山花（垂直三角面）。"""
    a, b = width / 2.0, depth / 2.0
    c_ridge = a - b * 0.55
    objs = []
    for sy in (-1, 1):
        verts = []
        for iu in range(seg_u + 1):
            u = -1.0 + 2.0 * iu / seg_u
            for iv in range(seg_v + 1):
                v = iv / seg_v
                x = c_ridge * u + (a * u - c_ridge * u) * v
                y = sy * b * v
                z = _roof_height(z_eave, z_ridge, v, curve)
                z += _shengqi(u, v, upturn)
                verts.append((x, y, z))
        nv = seg_v + 1
        faces = []
        for iu in range(seg_u):
            for iv in range(seg_v):
                p = iu * nv + iv
                q = (iu + 1) * nv + iv
                faces.append((p, q, q + 1, p + 1) if sy > 0 else (p, p + 1, q + 1, q))
        objs.append(new_mesh(name + ("_S" if sy < 0 else "_N"), verts, faces, c))
    # 山花
    for sx in (-1, 1):
        z_mid = _roof_height(z_eave, z_ridge, 0.35, curve)
        xs = sx * (c_ridge + gable_inset)
        v = [(xs, -b * 0.35, z_eave), (xs, b * 0.35, z_eave), (xs, 0, z_ridge)]
        objs.append(new_mesh(name + ("_gE" if sx > 0 else "_gW"), v, [(0, 1, 2)], c))
    for ob in objs:
        recalc(ob)
        if thick:
            solidify(ob, thick, -1.0)
        ob.select_set(False)
    return objs


def roof_pyramid(name, size, z_eave, z_ridge, curve=1.7, upturn=0.0,
                 seg=10, c=None, thick=0.0):
    """四角攒尖（方形）。"""
    a = size / 2.0
    verts, faces = [], []
    nv = seg + 1
    for ix in range(seg + 1):
        u = -1.0 + 2.0 * ix / seg
        for iy in range(seg + 1):
            w = -1.0 + 2.0 * iy / seg
            r = max(abs(u), abs(w))
            v = r  # 0 中心 1 檐
            # 方形等高线收缩
            x = u * a
            y = w * a
            z = _roof_height(z_eave, z_ridge, min(1.0, v), curve)
            z += upturn * (r ** 6)
            verts.append((x, y, z))
    for ix in range(seg):
        for iy in range(seg):
            p = ix * nv + iy
            q = (ix + 1) * nv + iy
            faces.append((p, q, q + 1, p + 1))
    ob = new_mesh(name, verts, faces, c)
    recalc(ob)
    if thick:
        solidify(ob, thick, -1.0)
    ob.select_set(False)
    return ob


def ridge_beam(name, length, h=0.75, w=0.55, loc=(0, 0, 0), rot=(0, 0, 0), c=None):
    return box(name, length, w, h, loc=loc, rot=rot, c=c, bottom=False)


# ---------------------------------------------------------------- 构件
def column_row(name, xs, y, z, r=0.42, h=6.0, seg=10, c=None):
    obs = []
    for i, x in enumerate(xs):
        obs.append(cylinder("%s_%02d" % (name, i), r, h, loc=(x, y, z), seg=seg, c=c))
        # 柱础
        obs.append(cylinder("%s_b_%02d" % (name, i), r * 1.5, 0.22, loc=(x, y, z - 0.05), seg=seg, c=c))
    return obs


def column_grid(name, xs, ys, z, r=0.42, h=6.0, c=None):
    obs = []
    for j, y in enumerate(ys):
        obs += column_row("%s_y%d" % (name, j), xs, y, z, r, h, c=c)
    return obs


def dougong_row(name, x0, x1, y, z, step=1.5, d=1.0, h=0.85, c=None, axis='X'):
    """斗拱层：密排坐斗 + 三重出挑栱 + 昂，白模靠它形成檐下深阴影。"""
    obs = []
    n = max(2, int((x1 - x0) / step))
    for i in range(n + 1):
        t = x0 + (x1 - x0) * i / n
        obs.append(box("%s_d%d" % (name, i), 0.62, 0.62, 0.30,
                       loc=(t, y, z), c=c, bottom=True))
        obs.append(box("%s_g%d" % (name, i), 0.40, d * 1.00, 0.24,
                       loc=(t, y, z + 0.30), c=c, bottom=True))
        obs.append(box("%s_g2%d" % (name, i), 0.40, d * 1.45, 0.22,
                       loc=(t, y, z + 0.54), c=c, bottom=True))
        obs.append(box("%s_g3%d" % (name, i), 0.34, d * 1.85, 0.20,
                       loc=(t, y, z + 0.76), c=c, bottom=True))
        obs.append(box("%s_a%d" % (name, i), 0.26, d * 2.10, 0.16,
                       loc=(t, y, z + 0.96), c=c, bottom=True))
    # 垫栱板
    obs.append(box("%s_panel" % name, abs(x1 - x0), 0.30, 0.30,
                   loc=((x0 + x1) / 2, y, z + 0.10), c=c, bottom=True))
    return obs


def dougong_row_y(name, y0, y1, x, z, step=1.5, d=1.0, h=0.85, c=None):
    """沿 Y 方向排布的斗拱（侧面用），轴对齐体块换轴即可。"""
    obs = []
    n = max(2, int(abs(y1 - y0) / step))
    for i in range(n + 1):
        t = y0 + (y1 - y0) * i / n
        obs.append(box("%s_d%d" % (name, i), 0.62, 0.62, 0.30, loc=(x, t, z), c=c))
        obs.append(box("%s_g%d" % (name, i), d * 1.00, 0.40, 0.24, loc=(x, t, z + 0.30), c=c))
        obs.append(box("%s_g2%d" % (name, i), d * 1.45, 0.40, 0.22, loc=(x, t, z + 0.54), c=c))
        obs.append(box("%s_g3%d" % (name, i), d * 1.85, 0.34, 0.20, loc=(x, t, z + 0.76), c=c))
        obs.append(box("%s_a%d" % (name, i), d * 2.10, 0.26, 0.16, loc=(x, t, z + 0.96), c=c))
    obs.append(box("%s_panel" % name, 0.30, abs(y1 - y0), 0.30,
                   loc=(x, (y0 + y1) / 2, z + 0.10), c=c))
    return obs


def balustrade(name, x0, y0, x1, y1, z, h=1.15, step=1.55, c=None):
    """望柱 + 栏板，沿直线段。"""
    obs = []
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy)
    if L < 0.01:
        return obs
    ux, uy = dx / L, dy / L
    ang = math.atan2(dy, dx)
    n = max(1, int(L / step))
    for i in range(n + 1):
        t = i * L / n
        px, py = x0 + ux * t, y0 + uy * t
        obs.append(box("%s_z%d" % (name, i), 0.26, 0.26, h,
                       loc=(px, py, z), rot=(0, 0, ang), c=c, bottom=True))
        obs.append(box("%s_cap%d" % (name, i), 0.34, 0.34, 0.10,
                       loc=(px, py, z + h), rot=(0, 0, ang), c=c, bottom=True))
        if i < n:
            mx, my = px + ux * L / n / 2, py + uy * L / n / 2
            obs.append(box("%s_p%d" % (name, i), L / n * 0.96, 0.20, h * 0.72,
                           loc=(mx, my, z), rot=(0, 0, ang), c=c, bottom=True))
    return obs


def balustrade_ring(name, w, d, z, h=1.15, step=1.55, c=None, cx=0, cy=0):
    w2, d2 = w / 2, d / 2
    o = []
    o += balustrade(name + "_S", cx - w2, cy - d2, cx + w2, cy - d2, z, h, step, c)
    o += balustrade(name + "_N", cx - w2, cy + d2, cx + w2, cy + d2, z, h, step, c)
    o += balustrade(name + "_W", cx - w2, cy - d2, cx - w2, cy + d2, z, h, step, c)
    o += balustrade(name + "_E", cx + w2, cy - d2, cx + w2, cy + d2, z, h, step, c)
    return o


def stairs(name, width, rise, run, z0, loc=(0, 0, 0), steps=12, c=None, rot_z=0.0):
    """rise = 总高（自动均分到 steps 级）。"""
    obs = []
    step_h = rise / max(1, steps)
    for i in range(steps):
        h = step_h * (i + 1)
        y = -run * i
        obs.append(box("%s_%02d" % (name, i), width, run * 1.02, h,
                       loc=(loc[0], loc[1] + y, z0), rot=(0, 0, rot_z), c=c, bottom=True))
    return obs


def ramp(name, width, rise, run, z0, loc=(0, 0, 0), c=None, rot_z=0.0):
    """丹陛御路：整块斜板 + 侧栏。"""
    L = math.hypot(rise, run)
    ang = math.atan2(rise, run)
    ob = box(name, width, L, 0.35, loc=(loc[0], loc[1] - run / 2, z0 + rise / 2),
             rot=(ang, 0, rot_z), c=c, bottom=False)
    return ob


def terrace(name, w, d, h, loc=(0, 0, 0), c=None, taper=0.0, plinth=0.0):
    """台基 / 须弥座（可带收分）。"""
    ob = box(name, w, d, h, loc=loc, c=c, bottom=True)
    if plinth:
        box(name + "_pl", w + plinth * 2, d + plinth * 2, h * 0.22,
            loc=(loc[0], loc[1], loc[2] - h * 0.22), c=c, bottom=True)
    return ob


def lattice(name, w, h, z, loc, c=None, cols=4, rows=7, bar=0.09, rot_z=0.0):
    """隔扇门/槛窗格心（白模：边框 + 格条）。"""
    obs = []
    x0 = loc[0] - w / 2
    obs.append(box(name + "_fL", bar * 2, 0.18, h, loc=(x0, loc[1], z), rot=(0, 0, rot_z), c=c))
    obs.append(box(name + "_fR", bar * 2, 0.18, h, loc=(x0 + w, loc[1], z), rot=(0, 0, rot_z), c=c))
    obs.append(box(name + "_fB", w, 0.18, bar * 2.2, loc=(loc[0], loc[1], z), rot=(0, 0, rot_z), c=c))
    obs.append(box(name + "_fT", w, 0.18, bar * 2.2, loc=(loc[0], loc[1], z + h), rot=(0, 0, rot_z), c=c))
    for i in range(1, cols):
        obs.append(box("%s_v%d" % (name, i), bar, 0.14, h, loc=(x0 + w * i / cols, loc[1], z),
                       rot=(0, 0, rot_z), c=c))
    for j in range(1, rows):
        obs.append(box("%s_h%d" % (name, j), w, 0.14, bar, loc=(loc[0], loc[1], z + h * j / rows),
                       rot=(0, 0, rot_z), c=c))
    return obs


def door_bay_row(name, xs, y, z, w, h, c=None, rot_z=0.0):
    obs = []
    for i, x in enumerate(xs):
        obs += lattice("%s_%d" % (name, i), w, h, z, (x, y), c=c, rot_z=rot_z)
    return obs


def wall_run(name, pts, z0, h, t=0.8, c=None):
    """沿折线生成墙（pts: [(x,y)...]）。"""
    obs = []
    for i in range(len(pts) - 1):
        x0, y0 = pts[i]
        x1, y1 = pts[i + 1]
        dx, dy = x1 - x0, y1 - y0
        L = math.hypot(dx, dy)
        if L < 0.01:
            continue
        ang = math.atan2(dy, dx)
        obs.append(box("%s_%d" % (name, i), L, t, h,
                       loc=((x0 + x1) / 2, (y0 + y1) / 2, z0), rot=(0, 0, ang), c=c, bottom=True))
    return obs


def crenellation(name, x0, y0, x1, y1, z, h=1.1, w=1.2, gap=0.9, c=None):
    """城墙垛口。"""
    obs = []
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy)
    ang = math.atan2(dy, dx)
    ux, uy = dx / L, dy / L
    n = max(1, int(L / (w + gap)))
    for i in range(n):
        t = i * (w + gap) + w / 2
        obs.append(box("%s_%d" % (name, i), w, 0.62, h,
                       loc=(x0 + ux * t, y0 + uy * t, z), rot=(0, 0, ang), c=c, bottom=True))
    return obs


def lattice_screen(name, w, h, z, loc, c=None, nx=8, ny=8, bar=0.1, rot_z=0.0):
    return lattice(name, w, h, z, loc, c=c, cols=nx, rows=ny, bar=bar, rot_z=rot_z)


def sumeru(name, w, d, h, loc=(0, 0, 0), c=None, inset=0.55):
    """须弥座：圭角 + 下枋 + 束腰 + 上枋 + 上枭，带出挑线脚。"""
    obs = []
    z = loc[2]
    parts = [
        (1.00, 0.18),   # 圭角
        (0.94, 0.16),   # 下枋
        (0.84, 0.30),   # 束腰（内收最多）
        (0.90, 0.12),   # 上枭
        (1.00, 0.14),   # 上枋
        (1.04, 0.10),   # 压面石
    ]
    tot = sum(p[1] for p in parts)
    zz = z
    for i, (k, f) in enumerate(parts):
        hh = h * f / tot
        obs.append(box("%s_%d" % (name, i), w * k, d * k, hh,
                       loc=(loc[0], loc[1], zz), c=c, bottom=True))
        zz += hh
    return obs




def tree(name, loc, h=9.0, r=3.4, c=None, seg=8):
    obs = [cylinder(name + "_t", r * 0.13, h * 0.55, loc=loc, seg=6, c=c)]
    obs.append(cylinder(name + "_c", r, h * 0.62, loc=(loc[0], loc[1], loc[2] + h * 0.42),
                        seg=seg, r2=r * 0.25, c=c))
    return obs


# ---------------------------------------------------------------- 场景/相机/世界
def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)


def clay_material(name="CLAY", color=(0.86, 0.855, 0.84, 1.0)):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = 0.62
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.28
    return m


def apply_clay(objs=None):
    mat = clay_material()
    objs = objs or [o for o in bpy.data.objects if o.type == 'MESH']
    for o in objs:
        if o.type != 'MESH':
            continue
        o.data.materials.clear()
        o.data.materials.append(mat)
        for p in o.data.polygons:
            p.use_smooth = False


def studio_light(strength=5.0, angle=math.radians(4), z=math.radians(232), world=0.42):
    """白模布光：低环境光 + 高角度侧逆光，靠阴影读构件（瓦垄/斗拱全靠这个）。
    环境光给太高会把起伏压平，之前 1.05 就是"一片白"的主因。"""
    w = bpy.context.scene.world
    if w is None:
        w = bpy.data.worlds.new("W")
        bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (0.58, 0.63, 0.70, 1)
    bg.inputs[1].default_value = world
    d = bpy.data.lights.new("SUN", 'SUN')
    d.energy = strength
    d.angle = angle
    ob = bpy.data.objects.new("SUN", d)
    bpy.context.scene.collection.objects.link(ob)
    ob.rotation_euler = Euler((math.radians(56), 0, z))
    return ob


def camera(name, loc, target, lens=35.0, ortho=None, c=None):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.clip_start = 0.5
    cd.clip_end = 60000.0   # 默认 100m，远景（全城航拍）会被直接裁掉成空画面
    if ortho:
        cd.type = 'ORTHO'
        cd.ortho_scale = ortho
    ob = bpy.data.objects.new(name, cd)
    (c or bpy.context.scene.collection).objects.link(ob)
    ob.location = loc
    d = Vector(target) - Vector(loc)
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.view_layer.update()   # 否则 matrix_world 陈旧，投影/取景判断会全错
    return ob


def auto_camera(name, az_deg, elev_deg, target, radius, lens=50.0, res=(1280, 720),
                margin=1.12, c=None):
    """按方位角/仰角/包围球半径自动算距离，保证目标整体入画。
    az: 0=从南向北看(-Y 方向), 90=从东向西; elev: 仰角(度)。"""
    sc = bpy.context.scene
    rx, ry = res
    sensor_h = 36.0 * (ry / float(rx)) if rx >= ry else 36.0
    vfov = 2.0 * math.atan(sensor_h / (2.0 * lens))
    hfov = 2.0 * math.atan((sensor_h * rx / ry) / (2.0 * lens))
    fov = min(vfov, hfov)
    dist = radius * margin / math.tan(fov / 2.0)
    a, e = math.radians(az_deg), math.radians(elev_deg)
    t = Vector(target)
    loc = t + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    return camera(name, tuple(loc), tuple(t), lens, c=c)


def fit_camera(name, az_deg, elev_deg, target, probe, lens=50.0, res=(1280, 720),
               margin=0.04, start=None, c=None, max_iter=12):
    """按包围球解析求距离，把 probe 点全部收进画面。返回 (camera, dist)。
    之前用「逐次放大直到拟合」的写法遇到点在相机背后就发散到无穷远（画面全空），
    改成解析解 + 有限次校验，最稳。"""
    from bpy_extras.object_utils import world_to_camera_view
    sc = bpy.context.scene
    pts = [Vector(q) for q in probe]
    t = Vector(target)
    rx, ry = res
    sensor = 36.0
    vfov = 2.0 * math.atan(sensor * (ry / float(rx)) / (2.0 * lens))
    hfov = 2.0 * math.atan(sensor / (2.0 * lens))
    fov = min(vfov, hfov)
    # 包围球
    ctr = sum(pts, Vector((0, 0, 0))) / len(pts)
    R = max((q - ctr).length for q in pts) + 1.0
    # 球心当作目标点，距离按球半径解析
    t = ctr if (ctr - t).length < R * 0.5 else t
    R2 = max((q - t).length for q in pts) + 1.0
    a, e = math.radians(az_deg), math.radians(elev_deg)
    dirv = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    dist = R2 / math.sin(fov / 2.0) * (1.0 + margin)
    cam = None
    for _ in range(max_iter):
        cam = camera(name, tuple(t + dirv * dist), tuple(t), lens, c=c)
        inside = True
        for q in pts:
            u = world_to_camera_view(sc, cam, q)
            if not (margin <= u.x <= 1 - margin and margin <= u.y <= 1 - margin):
                inside = False
                break
        if inside:
            return cam, dist
        dist *= 1.10
    return cam, dist


def ground(size=14000, z=-0.02, c=None):
    ob = box("GROUND", size, size, 0.06, loc=(0, 0, z), c=c, bottom=True)
    return ob
