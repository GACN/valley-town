# -*- coding: utf-8 -*-
"""故宫 三座门：午门（五凤楼）· 太和门 · 神武门

坐标：原点 = 太和殿殿身中心，+X 东 / +Y 北 / Z 上，单位米。
  · 午门   y = -409（横跨南墙，雁翅楼向南伸出）
  · 太和门 y = -228
  · 神武门 y = +552（横跨北墙）
城墙本体由 mod_wall.py 负责；本模块只做门本身的墩台/城楼/台基。

官方数值（写死在代码里）：午门通高 37.95 / 城台 12 / 正楼面阔 9 间 60m；
太和门 面阔 9 间 40m、进深 3 间 20m、通高 23.8（含 2m 须弥座）；神武门 通高 31。
自估部位（无官方数据）：午门墩台 88x30、雁翅楼 16x36、阙亭 10.4 见方/高 11.5、
雁翅廊 高 6.6、券洞宽高、神武门墩台 62x24。
"""
import math
import bpy
import common as G
import hall as H

Y_WM = -409.0          # 午门 中心
Y_THM = -228.0         # 太和门 中心
Y_SWM = 552.0          # 神武门 中心
Z_TAI = 12.0           # 午门 / 神武门 城台高（通高 37.95 / 31 反推）
Z_THM = 2.0            # 太和门 须弥座高


# ============================================================ 低层零件
def _taper(name, x0, x1, y0, y1, z0, z1, it, ib, c):
    """带收分的方台：it / ib = 顶 / 底 四边内收量 (x-, x+, y-, y+)。"""
    b = [(x0 + ib[0], y0 + ib[2], z0), (x1 - ib[1], y0 + ib[2], z0),
         (x1 - ib[1], y1 - ib[3], z0), (x0 + ib[0], y1 - ib[3], z0)]
    t = [(x0 + it[0], y0 + it[2], z1), (x1 - it[1], y0 + it[2], z1),
         (x1 - it[1], y1 - it[3], z1), (x0 + it[0], y1 - it[3], z1)]
    f = [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4),
         (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return G.recalc(G.new_mesh(name, b + t, f, c))


def _arch(name, cx, r, spring, y0, y1, c, n=14):
    """半圆券洞上方砌体（券顶近似）：底部为半圆，顶部为平线。"""
    pts = []
    for i in range(n + 1):
        a = math.pi * i / n
        pts.append((cx - r * math.cos(a), spring + r * math.sin(a)))
    pts += [(cx + r, spring + r), (cx - r, spring + r)]
    return G.plate(name, pts, 0.0, c, y0, y1)


def _arch_face(name, cx, r, spring, y_face, c, n=6, out=0.16):
    """券脸石：沿券线的一圈凸出石块（南北立面各一圈）。"""
    obs = []
    seg = math.pi * r / n * 1.25
    for i in range(n + 1):
        a = math.pi * i / n
        x = cx - r * math.cos(a)
        z = spring + r * math.sin(a)
        tx, tz = r * math.sin(a), r * math.cos(a)          # 切向
        ry = -math.atan2(tz, tx)
        obs.append(G.box("%s_%d" % (name, i), seg, 0.34, 0.30,
                         loc=(x, y_face, z), rot=(0, ry, 0), c=c, bottom=False))
    # 券脚（两侧立颊）
    for sx in (-1, 1):
        obs.append(G.box("%s_j%d" % (name, sx), 0.34, 0.34, spring,
                         loc=(cx + sx * (r + 0.02), y_face, 0.0), c=c))
    return obs


def _leaves(name, cx, w, h, y, c):
    """两扇板门。"""
    obs = []
    for sx in (-1, 1):
        obs.append(G.box("%s_%d" % (name, sx), w / 2 - 0.06, 0.28, h,
                         loc=(cx + sx * w / 4, y, 0.0), c=c))
    return obs


def _mass(name, xa, xb, ya, yb, z_top, gates, batter, c, f=(1, 1, 1, 1)):
    """带收分 + 贯通券洞的墩台。

    f = (x-, x+, y-, y+) 四个立面是否收分（1/0）。
    gates = [{'x':中心x, 'w':洞宽, 'spring':起券高}]；券顶 = spring + w/2。
    """
    obs = []
    B = batter / z_top

    def sl(nm, x0, x1, z0, z1, fx0, fx1):
        it = (B * z1 * fx0, B * z1 * fx1, B * z1 * f[2], B * z1 * f[3])
        ib = (B * z0 * fx0, B * z0 * fx1, B * z0 * f[2], B * z0 * f[3])
        return _taper(nm, x0, x1, ya, yb, z0, z1, it, ib, c)

    gates = sorted(gates, key=lambda g: g["x"])
    segs, cur = [], xa
    for g in gates:
        gx0, gx1 = g["x"] - g["w"] / 2, g["x"] + g["w"] / 2
        if gx0 - cur > 0.01:
            segs.append((cur, gx0, None))
        segs.append((gx0, gx1, g))
        cur = gx1
    if xb - cur > 0.01:
        segs.append((cur, xb, None))

    for i, (x0, x1, g) in enumerate(segs):
        if g is None:
            obs.append(sl("%s_s%d" % (name, i), x0, x1, 0.0, z_top,
                          x0 <= xa + 1e-6, x1 >= xb - 1e-6))
        else:
            r, spring = g["w"] / 2.0, g["spring"]
            apex = spring + r
            if apex < z_top - 0.05:
                obs.append(sl("%s_t%d" % (name, i), x0, x1, apex, z_top, False, False))
            obs.append(_arch("%s_v%d" % (name, i), g["x"], r, spring, ya, yb, c))
    return obs


def _stairs(name, cx, y_face, width, z0, z_top, run=0.36, steps=7, c=None):
    """踏跺：最上一级贴 y_face，向南（-Y）逐级降下。"""
    obs = []
    sh = (z_top - z0) / steps
    for i in range(steps):
        h = (i + 1) * sh
        y = y_face - run * (steps - i - 0.5)
        obs.append(G.box("%s_%d" % (name, i), width, run * 1.06, h,
                         loc=(cx, y, z0), c=c))
    return obs


def _lion(name, x, y, z0, c):
    """铜狮（蹲坐，连须弥座约 2.9m）。"""
    obs = []
    obs += G.sumeru(name + "_ped", 2.1, 2.5, 0.95, loc=(x, y, z0), c=c)
    z = z0 + 0.95
    obs.append(G.box(name + "_bod", 1.05, 1.75, 1.05, loc=(x, y + 0.15, z), c=c))
    obs.append(G.box(name + "_ch", 1.15, 0.75, 0.35, loc=(x, y - 0.30, z + 0.45), c=c))
    obs.append(G.box(name + "_hd", 0.92, 0.80, 0.80, loc=(x, y - 0.55, z + 0.95), c=c))
    obs.append(G.box(name + "_mn", 1.20, 0.55, 0.55, loc=(x, y - 0.05, z + 1.05), c=c))
    for sx in (-1, 1):
        obs.append(G.box("%s_lg%d" % (name, sx), 0.28, 0.55, 0.85,
                         loc=(x + sx * 0.38, y - 0.62, z), c=c))
        obs.append(G.box("%s_er%d" % (name, sx), 0.16, 0.20, 0.24,
                         loc=(x + sx * 0.34, y - 0.58, z + 1.62), c=c))
    obs.append(G.box(name + "_tl", 0.26, 0.55, 0.90, loc=(x, y + 1.05, z + 0.55), c=c))
    return obs


def _parapet(name, pts, z, c, h=1.05, t=0.50):
    """宇墙（城台顶女儿墙）+ 压顶。"""
    obs = G.wall_run(name, pts, z, h, t, c)
    obs += G.wall_run(name + "_cap", pts, z + h, 0.14, t + 0.14, c)
    return obs


def _prune(objs, key):
    keep = []
    for o in objs:
        if o and key in o.name:
            bpy.data.objects.remove(o, do_unlink=True)
        else:
            keep.append(o)
    return keep


# ============================================================ 午门
WM_W, WM_D = 88.0, 30.0         # 主墩台 东西 / 南北（自估）
WM_WX0, WM_WX1 = 28.0, 44.0     # 雁翅楼 墩台 x 范围（自估）
WM_WY0 = -460.0                 # 雁翅楼 南端
WM_GATES = [dict(x=0.0, w=5.60, spring=6.0),      # 中门：宽 5.6，券顶 8.8
            dict(x=-11.2, w=4.20, spring=5.2),    # 左门：宽 4.2，券顶 7.3
            dict(x=11.2, w=4.20, spring=5.2)]


def _wumen(c):
    P, T = [], []          # P = 墩台/宇墙/券洞；T = 五凤楼木构（正楼+阙亭+雁翅廊）
    ya, yb = Y_WM - WM_D / 2, Y_WM + WM_D / 2          # -424 .. -394

    # ---- 城台（主墩台，三券洞）
    P += _mass("WM_tai", -WM_W / 2, WM_W / 2, ya, yb, Z_TAI, WM_GATES, 0.60, c)
    # ---- 雁翅楼墩台（两翼向南伸出，凹字形）
    for sx in (-1, 1):
        x0, x1 = (WM_WX0, WM_WX1) if sx > 0 else (-WM_WX1, -WM_WX0)
        P += _mass("WM_wing%d" % sx, x0, x1, WM_WY0, ya, Z_TAI, [], 0.60, c,
                   f=(1, 1, 1, 0))
    # ---- 券脸石 + 板门（南北立面）
    for gi, g in enumerate(WM_GATES):
        r, sp = g["w"] / 2, g["spring"]
        P += _arch_face("WM_jl%da" % gi, g["x"], r, sp, ya - 0.02, c)
        P += _arch_face("WM_jl%db" % gi, g["x"], r, sp, yb + 0.02, c)
        if gi:                                        # 侧门装板门
            P += _leaves("WM_dr%d" % gi, g["x"], g["w"], sp - 0.35, yb - 1.3, c)

    # ---- 城台顶宇墙（沿凹字形外缘）
    p = [(-43.0, -394.9), (43.0, -394.9), (43.0, -459.0), (29.0, -459.0),
         (29.0, -424.0), (-29.0, -424.0), (-29.0, -459.0), (-43.0, -459.0),
         (-43.0, -394.9)]
    P += _parapet("WM_yuqiang", p, Z_TAI, c)

    # ---- 正楼（五凤楼主体：重檐庑殿，面阔 9 间 60m，通高 37.95）
    body = 37.95 - Z_TAI
    o, zr = H.hall("WM_ZL", 60.0, 24.0, Z_TAI, body_h=body, style='hip',
                   double=True, oh=2.6, bay_x=9, bay_y=5, ridge_frac=0.0,
                   upturn=1.25, curve=1.80, door_bays=[4], c=c,
                   seg_u=16, seg_v=9)
    o = _prune(o, "_plrail")
    for ob in o:
        ob.location.y += Y_WM
    z_col = Z_TAI + H.F['plinth'] * body
    T += G.balustrade_ring("WM_ZL_rail", 62.2, 26.2, z_col, h=1.15, step=1.62,
                           c=c, cx=0.0, cy=Y_WM)
    T += o

    # ---- 四阙亭（重檐攒尖 + 宝顶，四隅）
    queen = [(-37.0, Y_WM), (37.0, Y_WM), (-37.0, -452.0), (37.0, -452.0)]
    for qi, (qx, qy) in enumerate(queen):
        o2, _ = H.hall("WM_QT%d" % qi, 10.4, 10.4, Z_TAI, body_h=11.5,
                       style='pyramid', double=True, oh=1.30, bay_x=3, bay_y=3,
                       upturn=0.75, curve=1.60, door_bays=[1], c=c,
                       seg_u=8, seg_v=6)
        for ob in o2:
            ob.location.x += qx
            ob.location.y += qy
        T += o2

    # ---- 雁翅楼（廊庑：柱列 + 两坡顶）
    for sx in (-1, 1):
        cx = sx * 36.0
        cy = -435.5
        for i in range(7):
            yy = -445.0 + 19.0 * i / 6.0
            for k in (-1, 1):
                T.append(G.cylinder("WM_cl%d_%d%d" % (sx, i, k), 0.30, 4.60,
                                    loc=(cx + k * 4.3, yy, Z_TAI), seg=8, c=c))
        T.append(G.box("WM_cwall%d" % sx, 0.55, 19.6, 4.20,
                       loc=(cx + sx * 4.6, cy, Z_TAI), c=c))
        T += G.dougong_row_y("WM_cdg%d" % sx, cy - 9.6, cy + 9.6,
                             cx - 4.55, Z_TAI + 4.62, 1.5, 0.75, 0.60, c)
        T += G.dougong_row_y("WM_cdg2%d" % sx, cy - 9.6, cy + 9.6,
                             cx + 4.55, Z_TAI + 4.62, 1.5, 0.75, 0.60, c)
        rf = G.roof_hip("WM_crf%d" % sx, 20.4, 13.0, Z_TAI + 5.30, Z_TAI + 7.10,
                        ridge_frac=0.90, curve=1.60, upturn=0.35,
                        seg_u=12, seg_v=4, c=c, thick=0.40)
        for ob in rf:
            ob.rotation_euler = (0, 0, math.pi / 2)
            ob.location = (cx, cy, 0)
        T += rf
    return P, T


# ============================================================ 太和门
def _taihemen(c):
    B, T = [], []                         # B = 台基/栏杆/踏跺/铜狮；T = 门殿木构
    W, D = 40.0, 20.0                     # 面阔 9 间 40m，进深 3 间 20m
    body = 23.8 - Z_THM                   # 台面→正脊 = 21.8（通高 23.8）

    # ---- 须弥座台基（2m）+ 台基栏杆（台面外缘一圈）
    B += G.sumeru("THM_tai", 46.0, 26.0, Z_THM, loc=(0, Y_THM, 0), c=c)
    B += G.balustrade_ring("THM_rail", 45.4, 25.4, Z_THM + 0.04, h=1.10, step=1.55,
                           c=c, cx=0.0, cy=Y_THM)

    # ---- 踏跺（中御路 + 左右）
    yf = Y_THM - 13.0
    B += _stairs("THM_st_c", 0.0, yf, 11.5, 0.0, Z_THM, 0.38, 7, c)
    for sx in (-1, 1):
        B += _stairs("THM_st_%d" % sx, sx * 12.0, yf, 6.0, 0.0, Z_THM, 0.38, 7, c)

    # ---- 门前铜狮一对（踏跺两侧）
    for sx in (-1, 1):
        B += _lion("THM_lion%d" % sx, sx * 17.5, Y_THM - 18.5, 0.0, c)

    # ---- 门殿（重檐歇山）
    o, zr = H.hall("THM", W, D, Z_THM, body_h=body, style='xieshan', double=True,
                   oh=2.4, bay_x=9, bay_y=3, ridge_frac=0.55, upturn=1.15,
                   curve=1.78, door_bays=[4], c=c, seg_u=14, seg_v=8)
    o = _prune(o, "_plrail")
    for ob in o:
        ob.location.y += Y_THM
    T += o
    return B, T


# ============================================================ 神武门
SWM_W, SWM_D = 62.0, 24.0
SWM_GATES = [dict(x=0.0, w=5.60, spring=6.0)]


def _shenwumen(c):
    B, T = [], []
    ya, yb = Y_SWM - SWM_D / 2, Y_SWM + SWM_D / 2       # 540 .. 564
    body = 31.0 - Z_TAI                                 # 城楼 19m

    # ---- 城台（一券洞）
    B += _mass("SWM_tai", -SWM_W / 2, SWM_W / 2, ya, yb, Z_TAI, SWM_GATES, 0.60, c)
    g = SWM_GATES[0]
    B += _arch_face("SWM_jla", g["x"], g["w"] / 2, g["spring"], ya - 0.02, c)
    B += _arch_face("SWM_jlb", g["x"], g["w"] / 2, g["spring"], yb + 0.02, c)

    # ---- 城台顶栏杆
    B += G.balustrade_ring("SWM_rail", 60.6, 22.6, Z_TAI + 0.03, h=1.10, step=1.60,
                           c=c, cx=0.0, cy=Y_SWM)

    # ---- 城台后（北）踏跺
    B += _stairs("SWM_st", 0.0, yb, 8.0, 0.0, Z_TAI, 0.40, 12, c)

    # ---- 城楼（面阔 5 间 31m，重檐庑殿，通高 31m）
    o, zr = H.hall("SWM_L", 31.0, 15.0, Z_TAI, body_h=body, style='hip',
                   double=True, oh=2.1, bay_x=5, bay_y=3, ridge_frac=0.0,
                   upturn=1.05, curve=1.80, door_bays=[2], c=c,
                   seg_u=14, seg_v=9)
    o = _prune(o, "_plrail")
    for ob in o:
        ob.location.y += Y_SWM
    z_col = Z_TAI + H.F['plinth'] * body
    T += G.balustrade_ring("SWM_L_rail", 32.4, 16.4, z_col, h=1.10, step=1.55,
                           c=c, cx=0.0, cy=Y_SWM)
    T += o
    return B, T


# ============================================================ 出口
def _report(objs):
    v = 0
    mn = [1e9] * 3
    mx = [-1e9] * 3
    for o in objs:
        if o is None or o.type != 'MESH' or o.data is None:
            continue
        v += len(o.data.vertices)
        for q in o.bound_box:
            w = o.matrix_world @ __import__("mathutils").Vector(q)
            for i in range(3):
                mn[i] = min(mn[i], w[i])
                mx[i] = max(mx[i], w[i])
    print("GATES objects=%d verts=%d" % (len(objs), v))
    print("GATES bbox x[%.1f..%.1f] y[%.1f..%.1f] z[%.1f..%.1f]"
          % (mn[0], mx[0], mn[1], mx[1], mn[2], mx[2]))
    print("GATES parts: 午门[城台3券洞+雁翅楼两翼+宇墙 | 正楼重檐庑殿9间"
          " | 四阙亭重檐攒尖 | 雁翅廊] 太和门[须弥座+栏杆+3踏跺+铜狮2 | "
          "重檐歇山9间3进] 神武门[城台1券洞+栏杆+踏跺 | 重檐庑殿5间3进]")


def build(c=None):
    """往 scene 里加午门 / 太和门 / 神武门，返回 list[Object]。"""
    wm_tai, wm_top = _wumen(c)
    thm_tai, thm_top = _taihemen(c)
    swm_tai, swm_top = _shenwumen(c)
    groups = [("WM_TAI", wm_tai), ("WM_FENGHUANG", wm_top),
              ("THM_TAI", thm_tai), ("THM_HALL", thm_top),
              ("SWM_TAI", swm_tai), ("SWM_HALL", swm_top)]

    out = []
    for nm, objs in groups:
        ob = G.join([o for o in objs if o and o.name in bpy.data.objects], nm)
        if ob:
            out.append(ob)
    bpy.context.view_layer.update()
    _report(out)
    return out
