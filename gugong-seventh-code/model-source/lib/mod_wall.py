# -*- coding: utf-8 -*-
"""紫禁城城墙 + 四角角楼 + 护城河 + 东西华门门楼（白模）

坐标：原点 = 太和殿中心，Z 上，+Y 北，-Y 南。
全部尺寸按真实米制写死在下面常量区；无官方数据的部位在注释里标「估」。

分工：
    CITYWALL_BODY  —— 四面梯形城台断面 + 四座角台（收分方台）
    CITYWALL_TOP   —— 外宇墙 + 垛口 + 内女儿墙（马道两侧）+ 四道马道
    MOAT           —— 护城河：河底 + 内外驳岸 + 压顶
    TOWER_NE/NW/SE/SW —— 角楼：十字歇山三重檐，通高 27.5m（自广场地面）
    GATE_E / GATE_W   —— 东西华门：城台三门洞 + 单檐歇山门楼（5 间 25m）
"""
import math

from mathutils import Matrix

import common as G
import hall as H   # noqa: F401  （契约要求可 import，本模块自带门楼，未用 hall）

# ============================================================ 真实尺度（米）
WALL_S, WALL_N = -409.0, 552.0          # 南墙 / 北墙中心线
WALL_E, WALL_W = 376.5, -376.5           # 东墙 / 西墙中心线
WALL_H = 9.90                            # 城台高
WALL_WB = 8.62                           # 城台底宽
WALL_WT = 6.66                           # 城台顶宽（内外各收 0.98）
LEN_X = WALL_E - WALL_W                  # 753
LEN_Y = WALL_N - WALL_S                  # 961

MOAT_W = 52.0                            # 护城河宽
MOAT_D = 4.0                             # 护城河深
MOAT_GAP = 24.0                          # 墙中线 → 护城河内岸（估，图上约 20m 净距）

GATE_Y = (WALL_S + WALL_N) / 2.0         # 71.5 东西华门中心
GATE_HALF_Y = 16.5                       # 城台沿墙方向半长（估）
GATE_HALF_X = 12.5                       # 城台垂直墙方向半厚（估，出墙面 8m）
GATE_TOP = WALL_H
GATE_OPEN_H = 7.20                       # 门洞净高（估）
GATE_TOWER_W = 25.0                      # 门楼面阔 5 间 25m
GATE_TOWER_D = 9.6                       # 门楼进深（估，3 进）
GATE_TOWER_H = 10.77                     # 门楼台面到正脊（通高 ≈ 20.7）

TOWER_TOTAL = 27.5                       # 角楼通高（含城台，自广场地面）
TOWER_Z0 = WALL_H
TOWER_RISE = TOWER_TOTAL - TOWER_Z0      # 城台以上 17.60

CORNER_SB = 23.5                         # 角台底边长（估）
CORNER_ST = 20.5                         # 角台顶边长

CRENEL_P = 2.40                          # 垛口中心距（估）
CRENEL_W = 1.55                          # 垛口宽（估）
CRENEL_H = 0.85                          # 垛口高（估）
PARAPET_H = 0.55                         # 宇墙实墙段高（估）
LADY_H = 0.95                            # 内女儿墙高（估）

Z_MOAT_FLOOR = -MOAT_D
BANK_T = 0.45                            # 驳岸板厚
BANK_TOP = 0.95                          # 驳岸顶标高（略高于地面，便于白模识别）

SIDES = (
    # name, cx, cy, rotZ, length   局部坐标：+X 顺墙，+Y 指向墙外
    ("S", 0.0, WALL_S, math.pi, LEN_X),
    ("N", 0.0, WALL_N, 0.0, LEN_X),
    ("E", WALL_E, GATE_Y, -math.pi / 2, LEN_Y),
    ("W", WALL_W, GATE_Y, math.pi / 2, LEN_Y),
)


# ============================================================ 小工具
def _frame(cx, cy, ang):
    return Matrix.Translation((cx, cy, 0.0)) @ Matrix.Rotation(ang, 4, 'Z')


def _bake(objs, M):
    """把世界矩阵烘进 mesh 数据（物体由 G.* 生成，位置/旋转写在 object 上）。"""
    for ob in objs:
        if ob is None:
            continue
        ob.data.transform(M @ ob.matrix_basis)
        ob.matrix_basis = Matrix.Identity(4)
    return objs


class MB:
    """把成百上千个小体块攒进一个 mesh —— 出口对象数才可控。"""

    def __init__(self):
        self.v = []
        self.f = []

    def hexa(self, b, t):
        """b/t = 4 个 (x,y,z)，底、顶同序；绕向由 G.recalc 统一。"""
        i = len(self.v)
        self.v.extend(b)
        self.v.extend(t)
        for face in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                     (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            self.f.append(tuple(i + k for k in face))

    def box(self, cx, cy, cz, sx, sy, sz, rot=0.0):
        hx, hy = sx * 0.5, sy * 0.5
        cs, sn = math.cos(rot), math.sin(rot)
        pts = ((-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy))
        b = [(cx + px * cs - py * sn, cy + px * sn + py * cs, cz) for px, py in pts]
        t = [(p[0], p[1], cz + sz) for p in b]
        self.hexa(b, t)

    def taper(self, cx, cy, cz, sb, st, h):
        """上下不同宽的方台（角台 / 须弥座粗坯）。"""
        b = [(cx - sb / 2, cy - sb / 2, cz), (cx + sb / 2, cy - sb / 2, cz),
             (cx + sb / 2, cy + sb / 2, cz), (cx - sb / 2, cy + sb / 2, cz)]
        t = [(cx - st / 2, cy - st / 2, cz + h), (cx + st / 2, cy - st / 2, cz + h),
             (cx + st / 2, cy + st / 2, cz + h), (cx - st / 2, cy + st / 2, cz + h)]
        self.hexa(b, t)

    def wall_prism(self, x0, x1, z0, h, wb, wt):
        """梯形断面城墙（局部 X 顺墙，Y 为厚度方向）。"""
        b = [(x0, -wb / 2, z0), (x1, -wb / 2, z0), (x1, wb / 2, z0), (x0, wb / 2, z0)]
        t = [(x0, -wt / 2, z0 + h), (x1, -wt / 2, z0 + h),
             (x1, wt / 2, z0 + h), (x0, wt / 2, z0 + h)]
        self.hexa(b, t)

    def slope_y(self, s, y_near, y_far, w, h_near, h_far=0.06):
        """沿局部 -Y 下行的马道（实心坡体）。"""
        b = [(s - w / 2, y_near, 0.0), (s + w / 2, y_near, 0.0),
             (s + w / 2, y_far, 0.0), (s - w / 2, y_far, 0.0)]
        t = [(s - w / 2, y_near, h_near), (s + w / 2, y_near, h_near),
             (s + w / 2, y_far, h_far), (s - w / 2, y_far, h_far)]
        self.hexa(b, t)

    def obj(self, name, M, c):
        ob = G.new_mesh(name, self.v, self.f, c)
        if M is not None:
            ob.data.transform(M)
        G.recalc(ob)
        return ob


def _band(mb, cx, cy, hx, hy, z, h, pitch=1.30, out=0.30):
    """一圈斗拱带（坐斗 + 栱，白模用来压出檐下阴影）。"""
    n = max(2, int(2 * hx / pitch))
    for i in range(n + 1):
        x = cx - hx + 2 * hx * i / n
        for sy in (-1, 1):
            mb.box(x, cy + sy * (hy + out), z, 0.44, 0.56, h)
    n2 = max(2, int(2 * hy / pitch))
    for i in range(n2 + 1):
        y = cy - hy + 2 * hy * i / n2
        for sx in (-1, 1):
            mb.box(cx + sx * (hx + out), y, z, 0.56, 0.44, h)


def _crenels(mb, s0, s1, y, z):
    n = int((s1 - s0) / CRENEL_P)
    for i in range(n):
        s = s0 + i * CRENEL_P + (CRENEL_P - CRENEL_W) / 2
        mb.box(s, y, z, CRENEL_W, 0.52, CRENEL_H)


# ============================================================ 城台本体
def _wall_body(c):
    obs = []

    # 四座角台（收分方台，包住墙体转角）
    mb = MB()
    for cx, cy in ((WALL_E, WALL_N), (WALL_W, WALL_N), (WALL_E, WALL_S), (WALL_W, WALL_S)):
        mb.taper(cx, cy, 0.0, CORNER_SB, CORNER_ST, WALL_H)
        mb.taper(cx, cy, -0.6, CORNER_SB + 1.2, CORNER_SB + 1.2, 0.6)   # 角台散水
    obs.append(mb.obj("wall_corner_plat", None, c))

    for nm, cx, cy, ang, L in SIDES:
        runs = ((-L / 2, -GATE_HALF_Y), (GATE_HALF_Y, L / 2)) if nm in ("E", "W") \
            else ((-L / 2, L / 2),)
        mb = MB()
        for s0, s1 in runs:
            mb.wall_prism(s0, s1, 0.0, WALL_H, WALL_WB, WALL_WT)
            # 墙根散水（略宽，读得出墙脚）
            mb.box((s0 + s1) / 2, 0.0, -0.55, s1 - s0, WALL_WB + 2.4, 0.55)
        obs.append(mb.obj("wall_" + nm, _frame(cx, cy, ang), c))

    return G.join(obs, "CITYWALL_BODY")


# ============================================================ 宇墙 / 垛口 / 马道
def _wall_top(c):
    obs = []
    for nm, cx, cy, ang, L in SIDES:
        runs = ((-L / 2, -GATE_HALF_Y), (GATE_HALF_Y, L / 2)) if nm in ("E", "W") \
            else ((-L / 2, L / 2),)
        mb = MB()
        y_out = WALL_WT / 2 - 0.22
        y_in = -WALL_WT / 2 + 0.22
        for s0, s1 in runs:
            mid, ln = (s0 + s1) / 2, s1 - s0
            # 外宇墙实墙段 + 垛口
            mb.box(mid, y_out, WALL_H, ln, 0.44, PARAPET_H)
            mb.box(mid, y_out, WALL_H + PARAPET_H, ln, 0.56, 0.10)      # 压顶
            _crenels(mb, s0, s1, y_out, WALL_H + PARAPET_H + 0.10)
            # 内女儿墙（马道内侧，实墙无垛口）
            mb.box(mid, y_in, WALL_H, ln, 0.44, LADY_H)
            mb.box(mid, y_in, WALL_H + LADY_H, ln, 0.54, 0.10)
            # 顶面铺装缝（每 12m 一道）
            k = max(1, int(ln / 12.0))
            for i in range(1, k):
                mb.box(s0 + i * ln / k, 0.0, WALL_H, 0.12, WALL_WT - 0.6, 0.04)
        # 马道：靠角台 70m 处，向内下地的实心坡体
        s = -(L / 2 - 70.0)
        mb.slope_y(s, -(WALL_WT / 2 + 0.40), -(WALL_WT / 2 + 0.40) - 34.0, 5.6, WALL_H)
        obs.append(mb.obj("wall_top_" + nm, _frame(cx, cy, ang), c))

    return G.join(obs, "CITYWALL_TOP")


# ============================================================ 护城河
def _moat(c):
    mb = MB()
    Xo = WALL_E + MOAT_GAP + MOAT_W        # 452.5
    Xi = WALL_E + MOAT_GAP                 # 400.5
    Yso = WALL_S - MOAT_GAP - MOAT_W       # -485
    Ysi = WALL_S - MOAT_GAP                # -433
    Yni = WALL_N + MOAT_GAP                # 576
    Yno = WALL_N + MOAT_GAP + MOAT_W       # 628

    # 河底（4 条，拼成回字，互不重叠）
    mb.box(0.0, (Yso + Ysi) / 2, Z_MOAT_FLOOR, 2 * Xo, MOAT_W, 0.45)
    mb.box(0.0, (Yni + Yno) / 2, Z_MOAT_FLOOR, 2 * Xo, MOAT_W, 0.45)
    mb.box(-(Xo + Xi) / 2, (Ysi + Yni) / 2, Z_MOAT_FLOOR, MOAT_W, Yni - Ysi, 0.45)
    mb.box((Xo + Xi) / 2, (Ysi + Yni) / 2, Z_MOAT_FLOOR, MOAT_W, Yni - Ysi, 0.45)

    hb = BANK_TOP - (Z_MOAT_FLOOR - 0.2)
    zb = Z_MOAT_FLOOR - 0.2

    def hwall(y, x0, x1):
        mb.box((x0 + x1) / 2, y, zb, x1 - x0, BANK_T, hb)
        mb.box((x0 + x1) / 2, y, BANK_TOP, x1 - x0 + 0.5, 0.90, 0.26)   # 压顶石

    def vwall(x, y0, y1):
        mb.box(x, (y0 + y1) / 2, zb, BANK_T, y1 - y0, hb)
        mb.box(x, (y0 + y1) / 2, BANK_TOP, 0.90, y1 - y0 + 0.5, 0.26)

    hwall(Ysi, -Xi - 0.3, Xi + 0.3)
    hwall(Yni, -Xi - 0.3, Xi + 0.3)
    hwall(Yso, -Xo, Xo)
    hwall(Yno, -Xo, Xo)
    vwall(-Xi, Ysi, Yni)
    vwall(Xi, Ysi, Yni)
    vwall(-Xo, Yso, Yno)
    vwall(Xo, Yso, Yno)

    return mb.obj("MOAT", None, c)


# ============================================================ 角楼（十字歇山三重檐）
def _rot_xy(cx, cy, k, x, y):
    a = k * math.pi / 2.0
    return (cx + x * math.cos(a) - y * math.sin(a), cy + x * math.sin(a) + y * math.cos(a))


TIERS = (
    # core=核心方台半宽  arm=抱厦外伸半宽  z0=层身起点  body=层身高  eave/ridge=檐口/正脊（均相对城台面）
    dict(core=6.20, arm=8.40, z0=0.55, body=3.45, eave=4.00, ridge=5.85),
    dict(core=5.30, arm=7.20, z0=5.00, body=3.50, eave=8.50, ridge=10.35),
    dict(core=4.50, arm=6.10, z0=9.70, body=3.90, eave=13.60, ridge=16.20),
)


def _tower(nm, cx, cy, c):
    obs = []
    mb = MB()

    # 台明（角台顶面之上）
    mb.box(cx, cy, TOWER_Z0, 20.4, 20.4, 0.55)
    mb.box(cx, cy, TOWER_Z0 + 0.55, 19.6, 19.6, 0.12)

    ridge_specs = []   # (p0, p1, w, h)

    for i, t in enumerate(TIERS):
        core, arm = t["core"], t["arm"]
        cb = core - 0.95                      # 层身核心半宽
        z0 = TOWER_Z0 + t["z0"]
        h = t["body"]
        ze = TOWER_Z0 + t["eave"]
        zr = TOWER_Z0 + t["ridge"]
        up = 1.15

        # ---- 层身：核心 + 四出抱厦（十字平面）
        mb.box(cx, cy, z0, 2 * cb, 2 * cb, h)
        pl = arm - 0.55 - cb
        warr = cb * 1.05
        if pl > 0.4:
            for sx in (-1, 1):
                mb.box(cx + sx * (cb + pl / 2), cy, z0, pl, warr, h)
                mb.box(cx, cy + sx * (cb + pl / 2), z0, warr, pl, h)
        # 抱厦正面隔扇（每面一樘，简化格心）
        for sx in (-1, 1):
            xx = cx + sx * (arm - 0.6)
            mb.box(xx, cy, z0 + 0.25, 0.16, warr * 0.80, h - 0.7)
            mb.box(cx, cy + sx * (arm - 0.6), z0 + 0.25, warr * 0.80, 0.16, h - 0.7)
            for j in range(3):
                f = (j + 1) / 4.0 - 0.5
                mb.box(xx - sx * 0.10, cy + f * warr * 0.80, z0 + 0.25, 0.10, 0.10, h - 0.7)
                mb.box(cx + f * warr * 0.80, cy + sx * (arm - 0.6) - sx * 0.10, z0 + 0.25,
                       0.10, 0.10, h - 0.7)
        # 额枋 + 斗拱带
        mb.box(cx, cy, z0 + h - 0.42, 2 * cb + 0.5, 2 * cb + 0.5, 0.42)
        _band(mb, cx, cy, cb + 0.30, cb + 0.30, z0 + h, 0.55)

        # ---- 檐：核心攒尖（四坡）+ 四出抱厦歇山
        S = 2 * (core + 1.5)
        ro = G.roof_pyramid("%s_r%d_core" % (nm, i), S, ze, zr,
                            curve=1.52, upturn=up, seg=10, c=c, thick=0.42)
        obs += _bake([ro], Matrix.Translation((cx, cy, 0.0)))

        x_in = core - 1.60
        x_out = arm + 2.30
        Lr = x_out - x_in
        xc = (x_in + x_out) / 2.0
        Wr = 2 * (cb * 0.55 + 1.55)
        a2, b2 = Lr / 2.0, Wr / 2.0
        cr = max(0.4, a2 - b2 * 0.20)

        for k in range(4):
            M = Matrix.Translation((cx, cy, 0.0)) @ Matrix.Rotation(k * math.pi / 2, 4, 'Z') \
                @ Matrix.Translation((xc, 0.0, 0.0))
            ra = G.roof_hip("%s_r%d_arm%d" % (nm, i, k), Lr, Wr, ze, zr,
                            ridge_frac=0.80, curve=1.70, upturn=up * 0.85,
                            seg_u=8, seg_v=5, c=c, thick=0.40)
            obs += _bake(ra, M)
            # 抱厦四条垂脊（脊端 → 檐角）
            for s1 in (-1, 1):
                for s2 in (-1, 1):
                    p0 = _rot_xy(cx, cy, k, xc + s1 * cr, 0.0) + (zr,)
                    p1 = _rot_xy(cx, cy, k, xc + s1 * a2, s2 * b2) + (ze + up * 0.85,)
                    ridge_specs.append((p0, p1))

        # 核心攒尖四条垂脊
        hS = S / 2.0
        for s1 in (-1, 1):
            for s2 in (-1, 1):
                p0 = (cx, cy, zr)
                p1 = (cx + s1 * hS, cy + s2 * hS, ze + up)
                ridge_specs.append((p0, p1))

        # 十字正脊（两层，X 与 Y 向贯通）
        ext = arm + 1.6
        for k in (0, 1):
            p0 = _rot_xy(cx, cy, k, -ext, 0.0) + (zr,)
            p1 = _rot_xy(cx, cy, k, ext, 0.0) + (zr,)
            ridge_specs.append((p0, p1))

    # ---- 脊条实体（每层 22 条，三层 66 条，接近真实 72 脊的密度感）
    for i, (p0, p1) in enumerate(ridge_specs):
        ob = G.beam_between("%s_ridge%02d" % (nm, i), p0, p1, 0.40, 0.34, c=c, extend=0.30)
        if ob:
            obs.append(ob)

    # ---- 宝顶（脊顶 16.20 + 1.30 = 城台以上 17.50，通高 27.40）
    mb.box(cx, cy, TOWER_Z0 + 16.15, 1.30, 1.30, 0.40)
    obs.append(G.cylinder(nm + "_baoding", 0.62, 0.95,
                          loc=(cx, cy, TOWER_Z0 + 16.55), seg=12, c=c))

    obs.append(mb.obj(nm + "_body", None, c))
    return G.join(obs, "TOWER_" + nm)


# ============================================================ 东西华门
def _gate(nm, gx, gy, ang, c):
    M = _frame(gx, gy, ang)
    obs = []
    mb = MB()
    HB = GATE_HALF_Y * 2 + 1.0          # 沿墙方向 34
    TB = GATE_HALF_X * 2                # 垂直墙方向 25

    # ---- 城台：四道墩 + 过梁（不做 boolean，直接拼出三个门洞）
    zo = GATE_OPEN_H + 0.70           # 墩高 = 门洞净高 + 券顶叠涩两级
    openings = ((-11.6, -7.6, 4.0), (-2.9, 2.9, 5.8), (7.6, 11.6, 4.0))
    piers = ((-HB / 2, -11.6), (-7.6, -2.9), (2.9, 7.6), (11.6, HB / 2))
    for s0, s1 in piers:
        mb.box((s0 + s1) / 2, 0.0, 0.0, s1 - s0, TB, zo)
    mb.box(0.0, 0.0, zo, HB, TB, GATE_TOP - zo)               # 过梁
    mb.box(0.0, 0.0, -0.6, HB + 1.6, TB + 1.6, 0.6)           # 城台散水
    mb.box(0.0, 0.0, GATE_TOP - 0.30, HB + 0.5, TB + 0.5, 0.30)   # 台顶压面石
    # 门洞券：两级叠涩向上收窄，做出券洞的阶梯弧
    for s0, s1, wd in openings:
        mb.box((s0 + s1) / 2, 0.0, GATE_OPEN_H, wd - 1.35, TB + 0.02, 0.35)
        mb.box((s0 + s1) / 2, 0.0, GATE_OPEN_H + 0.35, wd - 0.55, TB + 0.02, 0.35)
        # 门扇（略退入，读得出洞口进深）
        mb.box((s0 + s1) / 2, -0.8, 0.0, wd - 0.5, 0.34, GATE_OPEN_H)
        # 门洞两侧的石基座
        mb.box((s0 + s1) / 2, -TB / 2 + 0.35, 0.0, wd + 1.0, 0.7, 0.55)

    # ---- 门楼（单檐歇山，5 间 25m）
    W, D = GATE_TOWER_W, GATE_TOWER_D
    zp = GATE_TOP
    mb.box(0.0, 0.0, zp, W + 2.6, D + 2.4, 0.55)             # 台明
    zc = zp + 0.55
    colh = 5.20                                               # 檐柱高（门楼通高约 20.8）
    # 柱网：5 间（明间 5.8，次间 4.6）
    xs = (-12.5, -7.9, -2.9, 2.9, 7.9, 12.5)
    for x in xs:
        for y in (-D / 2 + 0.4, D / 2 - 0.4):
            obs.append(G.cylinder("%s_col" % nm, 0.40, colh,
                                  loc=(x, y, zc), seg=8, c=c))
            obs.append(G.box("%s_colb" % nm, 1.15, 1.15, 0.22, loc=(x, y, zc), c=c))
    # 墙身：背墙 + 两山墙（正面为隔扇门）
    mb.box(0.0, -D / 2 + 0.30, zc, W, 0.60, colh)
    for sx in (-1, 1):
        mb.box(sx * (W / 2 - 0.30), 0.0, zc, 0.60, D - 0.4, colh)
    # 正面五间隔扇（简化为框 + 竖梃）
    for i in range(5):
        cx0 = (xs[i] + xs[i + 1]) / 2
        bw = (xs[i + 1] - xs[i]) * 0.86
        mb.box(cx0, D / 2 - 0.20, zc + 0.2, bw, 0.18, colh - 0.9)
        for j in range(4):
            mb.box(cx0 + (j - 1.5) * bw / 4.0, D / 2 - 0.30, zc + 0.2, 0.09, 0.10, colh - 0.9)
        for j in range(3):
            mb.box(cx0, D / 2 - 0.30, zc + 0.2 + (j + 1) * (colh - 0.9) / 4.0,
                   bw, 0.10, 0.09)
    # 额枋 + 斗拱
    mb.box(0.0, 0.0, zc + colh, W + 0.8, D + 0.8, 0.50)
    _band(mb, 0.0, 0.0, W / 2, D / 2, zc + colh + 0.50, 0.62, pitch=1.35, out=0.34)

    z_eave = zc + colh + 1.12
    z_ridge = z_eave + 3.90                                   # 屋顶举高（≈ DD/3.7，接近官式坡度）
    WW, DD = W + 5.0, D + 4.8
    roof = G.roof_xieshan(nm + "_roof", WW, DD, z_eave, z_ridge, curve=1.80,
                          upturn=0.95, seg_u=14, seg_v=9, c=c, thick=0.50)
    obs += roof
    cr = WW / 2 - (DD / 2) * 0.55
    obs.append(G.ridge_beam(nm + "_zj", 2 * cr + 1.0, 0.80, DD * 0.030,
                            loc=(0.0, 0.0, z_ridge), c=c))
    for sx in (-1, 1):
        obs.append(G.box("%s_wn%d" % (nm, sx), DD * 0.045, DD * 0.038, 1.15,
                         loc=(sx * (cr + 0.35), 0.0, z_ridge - 0.10), c=c))
        for sy in (-1, 1):
            p0 = (sx * cr, 0.0, z_ridge - 0.05)
            p1 = (sx * WW / 2, sy * DD / 2, z_eave + 0.95)
            ob = G.beam_between("%s_cj%d%d" % (nm, sx, sy), p0, p1, 0.34, 0.30,
                                c=c, extend=0.30)
            if ob:
                obs.append(ob)
    # 山花博缝
    for sx in (-1, 1):
        obs.append(G.box("%s_sh%d" % (nm, sx), 0.45, DD * 0.36, 0.55,
                         loc=(sx * (cr - 0.1), 0.0, z_ridge - 1.05), c=c))

    obs.append(mb.obj(nm + "_body", None, c))
    _bake(obs, M)
    return G.join(obs, "GATE_" + nm)


# ============================================================ 入口
def build(c=None):
    obs = [
        _wall_body(c),
        _wall_top(c),
        _moat(c),
        _tower("NE", WALL_E, WALL_N, c),
        _tower("NW", WALL_W, WALL_N, c),
        _tower("SE", WALL_E, WALL_S, c),
        _tower("SW", WALL_W, WALL_S, c),
        _gate("E", WALL_E, GATE_Y, -math.pi / 2, c),
        _gate("W", WALL_W, GATE_Y, math.pi / 2, c),
    ]
    out = [o for o in obs if o]
    print("MOD_WALL parts=%d  objects=%d" % (len(out), len(out)))
    return out
