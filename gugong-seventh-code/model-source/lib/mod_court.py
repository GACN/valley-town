# -*- coding: utf-8 -*-
"""
外朝广场模块 mod_court
-------------------------------------------------------------------------
负责：三台（三层须弥座汉白玉台基，含每层栏杆、丹陛踏跺）
      太和殿广场砖地铺装
      内金水河 + 五座金水桥
      东西廊庑
      太和殿前陈设（铜龟、铜鹤、日晷、嘉量，简化体块）

坐标：原点 = 太和殿殿身中心，Z 上，+Y 北（南 = -Y）。
      三台：南北 232（y -116…+116）、东西 130、高 8.13，顶面 z=8.13。
      三大殿殿身（mod_taidian）以 z=8.13 为基面坐在三台上。

重复性构件（栏杆望柱、踏跺踏步、桥面、河岸）走内存累加 + 单网格落地
（MeshBuilder），既保证望柱间距 1.7m 的密度，又不产生几千个临时对象。
-------------------------------------------------------------------------
"""
import math
import bmesh
import bpy

import common as G

# ---------------------------------------------------------------- 尺度常数
Z_TOP = 8.13                     # 三台顶面
W0, D0 = 130.0, 232.0            # 三台底层（最下一层）东西 / 南北
N_TIER = 3
INSET = 3.6                      # 每层内收（同时也是上层踏跺的落脚平台进深）
H_TIER = Z_TOP / N_TIER          # 2.71
RUN_TIER = 3.1                   # 每层踏跺水平进深（≤ INSET，落在下层压面石内）
N_STEP = 13                      # 每层踏步数

RAIL_H = 1.15
RAIL_STEP = 1.7                  # 望柱间距 ≈1.7m

PLAZA_W = 200.0                  # 广场东西
PLAZA_D = 180.0                  # 广场南北（-232…-52）
PAVE_Z = 0.02                    # 砖地比地面高 2cm
PAVE_Y0 = -232.0
PAVE_Y1 = -52.0

RIVER_Y = -165.0                 # 内金水河中心
RIVER_W = 12.0
RIVER_BED = -1.40

DB_W = 40.0                      # 丹陛总宽
DB_RAMP_W = 9.2                  # 御路石宽

EW_Y = -55.0                     # 东西侧踏跺中心 y
EW_W = 14.0

COR_X = 92.0                     # 廊庑中心线 |x|
COR_Y0, COR_Y1 = -155.0, -5.0    # 廊庑南北
COR_W = 8.0


# ---------------------------------------------------------------- 网格累加器
class MB(object):
    """把大量小构件累加进一个 mesh（省对象、省 time）。"""

    def __init__(self):
        self.v = []
        self.f = []
        self.rz = 0.0
        self.ox = 0.0
        self.oy = 0.0

    # -- 局部坐标系（用于东西向踏跺：造一个朝南的再整体转 90°）
    def frame(self, rz=0.0, ox=0.0, oy=0.0):
        self.rz, self.ox, self.oy = rz, ox, oy

    def _p(self, p):
        x, y, z = p
        if self.rz:
            c, s = math.cos(self.rz), math.sin(self.rz)
            x, y = x * c - y * s, x * s + y * c
        return (x + self.ox, y + self.oy, z)

    def _add(self, verts, faces):
        o = len(self.v)
        self.v.extend(self._p(p) for p in verts)
        self.f.extend(tuple(i + o for i in fa) for fa in faces)

    def box(self, cx, cy, cz, sx, sy, sz, rz=0.0):
        """底面在 cz 的盒子。rz = 自身 Z 轴旋转。"""
        hx, hy = sx / 2.0, sy / 2.0
        pts = [(-hx, -hy, 0.0), (hx, -hy, 0.0), (hx, hy, 0.0), (-hx, hy, 0.0),
               (-hx, -hy, sz), (hx, -hy, sz), (hx, hy, sz), (-hx, hy, sz)]
        if rz:
            c, s = math.cos(rz), math.sin(rz)
            pts = [(p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]) for p in pts]
        pts = [(p[0] + cx, p[1] + cy, p[2] + cz) for p in pts]
        self._add(pts, G.BOX_F)

    def cyl(self, cx, cy, cz, rx, ry, h, seg=12, k=1.0):
        """底面在 cz 的（椭）圆柱，k = 顶面缩放。"""
        v = []
        for i in range(seg):
            a = math.tau * i / seg
            v.append((cx + rx * math.cos(a), cy + ry * math.sin(a), cz))
        for i in range(seg):
            a = math.tau * i / seg
            v.append((cx + rx * k * math.cos(a), cy + ry * k * math.sin(a), cz + h))
        f = [(i, (i + 1) % seg, seg + (i + 1) % seg, seg + i) for i in range(seg)]
        f.append(tuple(range(seg))[::-1])
        f.append(tuple(range(seg, 2 * seg)))
        self._add(v, f)

    def quad(self, a, b, cc, d):
        self._add([a, b, cc, d], [(0, 1, 2, 3)])

    def obj(self, name, c=None):
        if not self.f:
            return None
        ob = G.recalc(G.new_mesh(name, self.v, self.f, c))
        # recalc 对开放曲面（桥面板 / 拱肩条）的朝向是随机的，用有符号体积兜底
        if _signed_volume(ob.data) < 0.0:
            bm = bmesh.new()
            bm.from_mesh(ob.data)
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
            bm.to_mesh(ob.data)
            bm.free()
            ob.data.update()
        return ob


def _signed_volume(me):
    vol = 0.0
    for p in me.polygons:
        vs = [me.vertices[i].co for i in p.vertices]
        a = vs[0]
        for i in range(1, len(vs) - 1):
            vol += a.dot(vs[i].cross(vs[i + 1])) / 6.0
    return vol


# ---------------------------------------------------------------- 台基
# 须弥座线脚（定宽，单位 m；"out" = 该层皮面相对台基名义边线的外凸量，负值为收进束腰）
# 注：G.sumeru 的线脚宽度是按台基面阔的百分比缩放的，在 130×232m 的三台尺度上
#     会得到 10m 深的束腰（真实须弥座收进仅 0.3~0.6m），故此处按官式定宽线脚自建，
#     层序完全照须弥座：圭角—下枋—束腰—上枭—上枋—压面石。
SU_BANDS = ((0.42, 0.10),    # 圭角
            (0.38, 0.22),    # 下枋
            (0.75, -0.06),   # 束腰（收进）
            (0.30, 0.14),    # 上枭
            (0.45, 0.28),    # 上枋
            (0.41, 0.52))    # 压面石（出挑檐）
SU_TOT = sum(b[0] for b in SU_BANDS)


def _tier_moulding(mb, w, d, z, h):
    """把 6 层须弥座线脚叠成一层台基，顶面 = z + h。"""
    zz = z
    for bh, out in SU_BANDS:
        hh = h * bh / SU_TOT
        mb.box(0.0, 0.0, zz, w + 2.0 * out, d + 2.0 * out, hh)
        zz += hh


def _tier(k):
    """第 k 层（0 = 最下）：(东西, 南北, 底面 z)"""
    return (W0 - 2 * INSET * k, D0 - 2 * INSET * k, k * H_TIER)


def _rail_run(mb, p0, p1, z, h=RAIL_H, step=RAIL_STEP, skip=None):
    """一段望柱 + 栏板；skip(px,py) 为真处留空（踏跺开口）。"""
    x0, y0 = p0
    x1, y1 = p1
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy)
    if L < 0.5:
        return
    n = max(1, int(round(L / step)))
    ux, uy = dx / L, dy / L
    ang = math.atan2(dy, dx)
    seg = L / n
    pts = [(x0 + ux * seg * i, y0 + uy * seg * i) for i in range(n + 1)]
    keep = [not (skip and skip(px, py)) for px, py in pts]
    for i, (px, py) in enumerate(pts):
        if not keep[i]:
            continue
        mb.box(px, py, z, 0.26, 0.26, h, rz=ang)                 # 望柱
        mb.box(px, py, z + h, 0.34, 0.34, 0.10, rz=ang)          # 柱头
        if i < n and keep[i + 1]:                                # 栏板
            mx = (pts[i][0] + pts[i + 1][0]) / 2.0
            my = (pts[i][1] + pts[i + 1][1]) / 2.0
            mb.box(mx, my, z, seg * 0.94, 0.20, h * 0.72, rz=ang)


def _rail_ring(mb, w, d, z, h=RAIL_H, step=RAIL_STEP):
    """一圈栏杆，南面留 40m 踏跺口，东西面各留 14m 踏跺口。"""
    hx, hy = w / 2.0, d / 2.0
    gap_s = abs(DB_W) / 2.0 + 1.0
    gap_e = EW_W / 2.0 + 0.5

    def sk_s(px, py):
        return abs(px) < gap_s

    def sk_e(px, py):
        return abs(py - EW_Y) < gap_e

    before = len(mb.f)
    _rail_run(mb, (-hx, -hy), (hx, -hy), z, h, step, sk_s)       # 南
    _rail_run(mb, (-hx, hy), (hx, hy), z, h, step)               # 北
    _rail_run(mb, (-hx, -hy), (-hx, hy), z, h, step, sk_e)       # 西
    _rail_run(mb, (hx, -hy), (hx, hy), z, h, step, sk_e)         # 东
    return len(mb.f) - before


def _stairs_mb(mb, x0, x1, z0, rise, run, y_top, steps=N_STEP):
    """踏步体块：最高一级贴着台基面 y_top，向南（-Y）逐级下落。"""
    tread = run / float(steps)
    rh = rise / float(steps)
    xm = (x0 + x1) / 2.0
    wd = x1 - x0
    for i in range(steps):
        h = rh * (i + 1)
        yc = y_top - tread * (steps - i - 0.5)
        mb.box(xm, yc, z0, wd, tread * 1.02, h)


def _terrace(c):
    """三台本体 + 每层栏杆。"""
    obs = []
    for k in range(N_TIER):
        w, d, z = _tier(k)
        mb = MB()
        _tier_moulding(mb, w, d, z, H_TIER)
        _rail_ring(mb, w, d, z + H_TIER)
        ob = mb.obj("TAI_T%d" % (k + 1), c)
        if ob:
            obs.append(ob)
    return obs


def _danbi(c):
    """丹陛踏跺：南面三段（御路石 + 左右台阶），东西两侧各一段。"""
    obs = []
    mb = MB()
    for k in range(N_TIER):
        w, d, z = _tier(k)
        z0 = PAVE_Z if k == 0 else z
        y_face = -d / 2.0
        # 南面：中间御路石斜坡 + 两侧台阶
        for x0, x1 in ((-DB_W / 2, -DB_RAMP_W / 2), (DB_RAMP_W / 2, DB_W / 2)):
            _stairs_mb(mb, x0, x1, z0, H_TIER, RUN_TIER, y_face)
        obs.append(G.ramp("DB_RAMP%d" % (k + 1), DB_RAMP_W, H_TIER, RUN_TIER, z0,
                          loc=(0, y_face, z0), c=c))
        # 东西两侧：局部造朝南的，再整体转到 ±X 方向
        for sx in (1, -1):
            mb.frame(rz=sx * math.pi / 2.0, ox=sx * w / 2.0, oy=EW_Y)
            _stairs_mb(mb, -EW_W / 2, EW_W / 2, z0, H_TIER, RUN_TIER, 0.0)
            mb.frame()
    ob = mb.obj("DB_STEP", c)
    if ob:
        obs.append(ob)
    return obs


# ---------------------------------------------------------------- 广场铺装
def _pave(c):
    obs = []
    y_riv_s = RIVER_Y - RIVER_W / 2.0 - 0.6      # -171.6
    y_riv_n = RIVER_Y + RIVER_W / 2.0 + 0.6      # -158.4
    hw = PLAZA_W / 2.0
    mb = MB()
    # 砖地（被内金水河断开成南北两块）
    mb.box(0, (PAVE_Y0 + y_riv_s) / 2.0, 0.0, PLAZA_W, y_riv_s - PAVE_Y0, PAVE_Z)
    mb.box(0, (y_riv_n + PAVE_Y1) / 2.0, 0.0, PLAZA_W, PAVE_Y1 - y_riv_n, PAVE_Z)
    # 三台东西两侧的广场向北延伸，把廊庑北端接住（200×180 之外补两条）
    for sx in (-1, 1):
        x_in = 65.0
        mb.box(sx * (x_in + hw) / 2.0, (PAVE_Y1 - 5.0) / 2.0 - 0.0, 0.0,
               hw - x_in, -5.0 - PAVE_Y1, PAVE_Z)
    # 御路石带（中线 6m + 两侧 3m），比砖地再高 4cm
    bands = [(0.0, 6.0), (-26.0, 3.0), (26.0, 3.0)]
    for cx, bw in bands:
        for ya, yb in ((PAVE_Y0, y_riv_s), (y_riv_n, PAVE_Y1)):
            mb.box(cx, (ya + yb) / 2.0, PAVE_Z, bw, yb - ya, 0.04)
    ob = mb.obj("PLAZA_PAVE", c)
    if ob:
        obs.append(ob)
    return obs


# ---------------------------------------------------------------- 内金水河
def _river(c):
    obs = []
    y0 = RIVER_Y - RIVER_W / 2.0
    y1 = RIVER_Y + RIVER_W / 2.0
    hw = PLAZA_W / 2.0
    mb = MB()
    # 河底
    mb.box(0, RIVER_Y, RIVER_BED - 0.5, 2 * hw, RIVER_W + 1.2, 0.5)
    for sy in (-1, 1):
        yy = RIVER_Y + sy * RIVER_W / 2.0
        # 驳岸（垂直岸壁，从河底到河沿下皮）
        mb.box(0, yy + sy * 0.45, RIVER_BED, 2 * hw, 0.9, 0.45 - RIVER_BED)
        # 汉白玉河沿（压面石，向河心挑出 0.6）
        mb.box(0, yy + sy * 0.30, 0.45, 2 * hw, 1.7, 0.30)
    # 水面（浅池）
    mb.box(0, RIVER_Y, RIVER_BED + 0.5, 2 * hw - 1.0, RIVER_W - 1.2, 0.06)
    ob = mb.obj("YH_RIVER", c)
    if ob:
        obs.append(ob)
    return obs


# ---------------------------------------------------------------- 金水桥
def _deck_z(y):
    """桥面标高（三段：南引桥 / 拱顶 / 北引桥）。"""
    ys, yn = -177.0, -153.0
    ya, yb = RIVER_Y - RIVER_W / 2.0, RIVER_Y + RIVER_W / 2.0
    z_end, z_spring, crown = 0.03, 0.82, 0.95
    if y <= ya:
        t = (y - ys) / (ya - ys)
        return z_end + (z_spring - z_end) * t
    if y >= yb:
        t = (yn - y) / (yn - yb)
        return z_end + (z_spring - z_end) * t
    return z_spring + crown * math.sin(math.pi * (y - ya) / RIVER_W)


def _arch_z(y):
    """券洞内弧（半椭圆）。"""
    ya, yb = RIVER_Y - RIVER_W / 2.0, RIVER_Y + RIVER_W / 2.0
    if y <= ya or y >= yb:
        return 0.02
    return -0.90 + 1.32 * math.sin(math.pi * (y - ya) / RIVER_W)


def _rail_curve(mb, x, ys, yn, h=1.0, step=RAIL_STEP):
    n = max(1, int(round((yn - ys) / step)))
    seg = (yn - ys) / n
    for i in range(n + 1):
        y = ys + seg * i
        z = _deck_z(y)
        mb.box(x, y, z, 0.24, 0.24, h)
        mb.box(x, y, z + h, 0.32, 0.32, 0.09)
        if i < n:
            ym = y + seg / 2.0
            mb.box(x, ym, _deck_z(ym), 0.18, seg * 0.92, h * 0.70)


def _bridge(mb, cx, w):
    hw = w / 2.0
    ys, yn = -177.0, -153.0
    th = 0.38
    n = 24
    yy = [ys + (yn - ys) * i / float(n) for i in range(n + 1)]
    za_y = [RIVER_Y - RIVER_W / 2.0, RIVER_Y + RIVER_W / 2.0]

    # 桥面板（顶 / 底 / 两侧板边）
    for i in range(n):
        y0, y1 = yy[i], yy[i + 1]
        z0, z1 = _deck_z(y0), _deck_z(y1)
        mb.quad((cx - hw, y0, z0), (cx + hw, y0, z0), (cx + hw, y1, z1), (cx - hw, y1, z1))
        mb.quad((cx - hw, y0, z0 - th), (cx - hw, y1, z1 - th),
                (cx + hw, y1, z1 - th), (cx + hw, y0, z0 - th))
        for sx in (-1, 1):
            x = cx + sx * hw
            mb.quad((x, y0, z0 - th), (x, y1, z1 - th), (x, y1, z1), (x, y0, z0))

    # 拱券 + 拱肩墙（两侧桥脸），券脸带外凸 8cm
    for sx in (-1, 1):
        x0 = cx + sx * hw
        x1 = cx + sx * (hw + 0.08)
        for i in range(n):
            y0, y1 = yy[i], yy[i + 1]
            dz0, dz1 = _deck_z(y0) - th, _deck_z(y1) - th
            a0, a1 = _arch_z(y0), _arch_z(y1)
            inside = (za_y[0] - 0.01) < y0 < (za_y[1] + 0.01)
            if inside:
                # 券脸带外表面 + 上下窄条
                mb.quad((x1, y0, a0), (x1, y1, a1), (x1, y1, a1 + 0.34), (x1, y0, a0 + 0.34))
                mb.quad((x0, y0, a0), (x1, y0, a0), (x1, y1, a1), (x0, y1, a1))
                mb.quad((x0, y0, a0 + 0.34), (x0, y1, a1 + 0.34),
                        (x1, y1, a1 + 0.34), (x1, y0, a0 + 0.34))
                top0 = a0 + 0.34
                top1 = a1 + 0.34
            else:
                top0, top1 = a0, a1
            # 拱肩墙：券脸顶 → 桥面底
            h0 = max(0.04, dz0 - top0)
            h1 = max(0.04, dz1 - top1)
            mb.quad((x0, y0, top0), (x0, y1, top1), (x0, y1, top1 + h1), (x0, y0, top0 + h0))

    # 券洞内弧（拱腹），把洞顶封住
    for i in range(n):
        y0, y1 = yy[i], yy[i + 1]
        if not (za_y[0] <= y0 <= za_y[1]):
            continue
        a0, a1 = _arch_z(y0), _arch_z(y1)
        mb.quad((cx - hw, y0, a0), (cx + hw, y0, a0), (cx + hw, y1, a1), (cx - hw, y1, a1))

    # 栏杆
    _rail_curve(mb, cx - hw + 0.28, ys + 0.4, yn - 0.4)
    _rail_curve(mb, cx + hw - 0.28, ys + 0.4, yn - 0.4)


def _bridges(c):
    mb = MB()
    for cx, w in ((0.0, 12.0), (-10.5, 8.0), (10.5, 8.0), (-18.5, 6.0), (18.5, 6.0)):
        _bridge(mb, cx, w)
    ob = mb.obj("JINSHUI_BRIDGES", c)
    return [ob] if ob else []


# ---------------------------------------------------------------- 廊庑
def _corridor(c, sx):
    obs = []
    cx = sx * COR_X
    yc = (COR_Y0 + COR_Y1) / 2.0
    L = COR_Y1 - COR_Y0
    hw = COR_W / 2.0
    mb = MB()
    # 台明
    mb.box(cx, yc, PAVE_Z, COR_W + 1.2, L, 0.45)
    # 后檐墙（外侧）
    mb.box(cx + sx * (hw - 0.35), yc, PAVE_Z + 0.45, 0.7, L, 4.38)
    # 两排柱
    n = 34
    for i in range(n + 1):
        y = COR_Y0 + L * i / float(n)
        for k in (-1, 1):
            mb.cyl(cx + k * (hw - 0.5), y, PAVE_Z + 0.45, 0.27, 0.27, 4.0, seg=10)
    # 额枋 / 檐檩
    for k in (-1, 1):
        mb.box(cx + k * (hw - 0.5), yc, PAVE_Z + 4.45, 0.36, L, 0.55)
    obs.append(mb.obj("COR_%s" % ("E" if sx > 0 else "W"), c))

    # 屋顶：两坡，脊在廊心
    ang = math.atan2(1.05, hw + 0.8)
    slope = math.hypot(hw + 0.8, 1.05)
    for k in (-1, 1):
        obs.append(G.box("COR_roof%d_%s" % (k, "E" if sx > 0 else "W"),
                         slope, L + 1.2, 0.34,
                         loc=(cx + k * (hw + 0.8) / 2.0,
                              yc, PAVE_Z + 5.52),
                         rot=(0, k * ang, 0), c=c, bottom=False))
    obs.append(G.box("COR_ridge_%s" % ("E" if sx > 0 else "W"), 0.9, L + 1.4, 0.36,
                     loc=(cx, yc, PAVE_Z + 6.0), c=c, bottom=False))
    return [o for o in obs if o]


# ---------------------------------------------------------------- 陈设
def _turtle(mb, x, y, z):
    mb.box(x, y, z, 2.8, 2.2, 0.85)                       # 须弥台座
    mb.box(x, y, z + 0.85, 2.2, 2.0, 0.25)                # 底座压面
    mb.cyl(x, y, z + 1.10, 1.15, 0.95, 0.55, seg=14, k=0.72)   # 龟背
    mb.box(x, y - 1.10, z + 1.12, 0.52, 0.72, 0.40)       # 头
    for kx in (-1, 1):                                    # 四足
        for ky in (-1, 1):
            mb.box(x + kx * 0.85, y + ky * 0.72, z + 0.85, 0.30, 0.42, 0.28)


def _crane(mb, x, y, z):
    mb.box(x, y, z, 2.0, 2.0, 0.70)                       # 台座
    for k in (-1, 1):                                     # 双足
        mb.cyl(x + k * 0.26, y, z + 0.70, 0.10, 0.10, 0.72, seg=8)
    mb.cyl(x, y, z + 1.42, 0.56, 0.42, 0.95, seg=12, k=0.78)   # 身
    mb.box(x, y + 0.42, z + 1.55, 0.50, 0.70, 0.22)       # 尾
    mb.box(x, y - 0.30, z + 2.30, 0.26, 0.30, 0.62)       # 颈
    mb.box(x, y - 0.58, z + 2.86, 0.28, 0.74, 0.26)       # 头 + 喙


def _ornaments(c):
    obs = []
    mb = MB()
    for sx in (-1, 1):
        _turtle(mb, sx * 19.0, -46.0, Z_TOP)
        _crane(mb, sx * 27.0, -46.0, Z_TOP)
    ob = mb.obj("ORN_BIRDS", c)
    if ob:
        obs.append(ob)

    # 日晷（东）
    x, y, z = 34.0, -41.0, Z_TOP
    obs.append(G.box("RIGUI_base", 1.7, 1.7, 0.80, loc=(x, y, z), c=c))
    obs.append(G.box("RIGUI_ped", 0.7, 0.7, 1.05, loc=(x, y, z + 0.80), c=c))
    dial = G.cylinder("RIGUI_dial", 0.95, 0.12, loc=(x, y, z + 1.95), seg=20, c=c)
    dial.rotation_euler = (math.radians(-40), 0, 0)
    obs.append(dial)
    obs.append(G.box("RIGUI_gn", 0.09, 1.30, 0.38, loc=(x, y, z + 1.95),
                     rot=(math.radians(-40), 0, 0), c=c, bottom=False))

    # 嘉量（西）：石亭式，台座 + 亭身 + 攒尖顶 + 宝顶
    x, y, z = -34.0, -41.0, Z_TOP
    obs.append(G.box("JIAL_base", 2.1, 2.1, 0.55, loc=(x, y, z), c=c))
    obs.append(G.box("JIAL_body", 1.7, 1.7, 1.15, loc=(x, y, z + 0.55), c=c))
    # roof_pyramid 的顶点是 0 基的（不带 loc），造完再整体挪到位
    pyr = G.roof_pyramid("JIAL_roof", 2.55, 0.0, 1.00, curve=1.5,
                         upturn=0.08, seg=6, c=c, thick=0.16)
    pyr.location = (x, y, z + 1.70)
    obs.append(pyr)
    obs.append(G.box("JIAL_top", 0.34, 0.34, 0.30, loc=(x, y, z + 2.60), c=c))
    return obs


# ---------------------------------------------------------------- build
def build(c=None):
    if c is None:
        c = G.coll("COURT")
    obs = []
    obs += _terrace(c)
    obs += _danbi(c)
    obs += _pave(c)
    obs += _river(c)
    obs += _bridges(c)
    for sx in (1, -1):
        obs += _corridor(c, sx)
    obs += _ornaments(c)
    bpy.context.view_layer.update()
    return [o for o in obs if o is not None]
