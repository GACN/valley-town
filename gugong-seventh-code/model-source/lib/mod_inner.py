# -*- coding: utf-8 -*-
"""内廷：后三宫（乾清门 / 乾清宫 / 交泰殿 / 坤宁宫）+ 御花园。

坐标：原点 = 太和殿中心，+X 东，+Y 北，Z 上；殿宇正面朝南(-Y)；
太和殿广场 z=0，三台顶 8.13，内廷地面 z≈0。

全部用 common / hall 的构件拼装，屋顶一律走 G.roof_hip / roof_xieshan /
roof_pyramid（攒尖小亭直接用 hall(style='pyramid')）。
出口前按分组 join，对象数 ~13。
"""
import math
import random

import bpy

import common as G
import hall as H

TAU = math.pi * 2.0

# ---------------------------------------------------------------- 总平面
Y_QQM = 180.0            # 乾清门
Y_QNG = 232.0            # 乾清宫
Y_JTD = 275.0            # 交泰殿
Y_KNG = 305.0            # 坤宁宫

Z_H3 = 3.0                                        # 后三宫共用台基顶面
TAI_CY, TAI_W, TAI_D = 270.0, 54.0, 112.0         # 台基 y: 214..326
TAI_FRONT = TAI_CY - (TAI_D + 3.6) / 2.0          # 212.2：最下一级台明前沿

COURT_X = 62.0                                    # 东西廊庑轴线
CRT_Y0, CRT_Y1 = 218.0, 308.0                     # 廊庑净长 90m
CRT_WALL_Y0, CRT_WALL_Y1 = 206.0, 330.0           # 院墙南北

GB_Y0, GB_Y1, GB_X = 345.0, 470.0, 70.0           # 御花园范围
Y_QAD = 392.0                                     # 钦安殿
Y_TING = 372.0                                    # 万春亭 / 千秋亭
TING_X = 26.0

SEED = 20261117


# ---------------------------------------------------------------- 小工具
def _shift(objs, dx=0.0, dy=0.0):
    for o in objs:
        if o is None:
            continue
        o.location.x += dx
        o.location.y += dy
    return objs


def _join(objs, name):
    objs = [o for o in objs if o is not None]
    if not objs:
        return []
    ob = G.join(objs, name)
    return [ob] if ob else []


def _stairs(name, width, rise, run, front_y, steps=5, x=0.0, z0=0.0, c=None):
    """自北向南下行的踏跺：最高一级紧贴台基前沿 front_y。
    （G.stairs 的级高沿 -Y 递增，这里用 rot_z=pi 把方向翻回来）"""
    return G.stairs(name, width, rise, run, z0,
                    loc=(x, front_y - run * (steps - 1), z0),
                    steps=steps, c=c, rot_z=math.pi)


def _rail(name, x0, y0, x1, y1, z, h=1.05, step=2.2, c=None):
    return G.balustrade(name, x0, y0, x1, y1, z, h=h, step=step, c=c)


def _rail_with_gap(name, hw, y, z, gap, h=1.05, step=2.2, c=None):
    """东西向栏杆，中间留 gap 宽的踏跺口。"""
    o = []
    o += _rail(name + "_w", -hw, y, -gap / 2.0, y, z, h, step, c)
    o += _rail(name + "_e", gap / 2.0, y, hw, y, z, h, step, c)
    return o


def _wall_seg(name, pts, h=4.6, t=1.15, c=None):
    """院墙：墙身 + 压顶（两次 wall_run，第二次做薄而宽的檐口）。"""
    o = G.wall_run(name, pts, 0.0, h, t, c)
    o += G.wall_run(name + "_cap", pts, h, 0.42, t + 0.5, c)
    return o


def _bake_parent(objs, proxy):
    """廊庑用空物体做整体旋转，join 前把世界矩阵烘进 mesh、删掉空物体。"""
    bpy.context.view_layer.update()
    for o in objs:
        if o is None:
            continue
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    if proxy is not None:
        try:
            bpy.data.objects.remove(proxy, do_unlink=True)
        except Exception:
            pass
    bpy.context.view_layer.update()
    return objs


# ---------------------------------------------------------------- 乾清门
def _qianqingmen(c=None):
    """面阔 5 间 25m × 进深 12m，单檐歇山，body_h 16，白台基 1.5m，门前石狮一对。"""
    obs = []
    # 白台基（两级线脚，顶面 z=1.5）
    obs.append(G.box("QQM_tai0", 33.0, 19.0, 0.55, loc=(0, Y_QQM, 0.0), c=c))
    obs.append(G.box("QQM_tai1", 30.0, 16.5, 0.95, loc=(0, Y_QQM, 0.55), c=c))
    front = Y_QQM - 19.0 / 2.0            # 170.5：踏跺从最下一级台明边起

    # 门殿
    o, zr = H.hall("QQM", 25.0, 12.0, 1.5, body_h=16.0, style='xieshan',
                   double=False, oh=2.2, bay_x=5, bay_y=3, upturn=0.85,
                   curve=1.75, door_bays=[2], c=c,
                   seg_u=12, seg_v=8, eave_thick=0.42)
    _shift(o, dy=Y_QQM)
    obs += o
    print("  QQM ridge_z=%.2f" % zr)

    # 踏跺（中御路 + 左右各一）
    obs += _stairs("QQM_st_m", 8.0, 1.5, 0.42, front, steps=5, c=c)
    for sx in (-1, 1):
        obs += _stairs("QQM_st_%d" % sx, 3.2, 1.5, 0.42, front, steps=5,
                       x=sx * 11.0, c=c)

    # 石狮一对（简化体块：须弥座 + 身 + 头 + 尾）
    for sx in (-1, 1):
        lx = sx * 9.5
        ly = 165.0
        obs.append(G.box("QQM_sz%d" % sx, 1.9, 2.7, 1.15, loc=(lx, ly, 0.0), c=c))
        obs.append(G.box("QQM_sb%d" % sx, 1.15, 1.85, 1.30, loc=(lx, ly, 1.15), c=c))
        obs.append(G.cylinder("QQM_sh%d" % sx, 0.50, 0.80, loc=(lx, ly - 0.55, 2.40),
                              seg=8, r2=0.44, c=c))
        obs.append(G.box("QQM_st%d" % sx, 0.55, 0.85, 0.95,
                         loc=(lx, ly + 0.55, 0.75), c=c))
    return obs


# ---------------------------------------------------------------- 后三宫共用台基
def _houtai(c=None):
    """乾清宫 / 交泰殿 / 坤宁宫 共用的 3m 高台基（带栏杆、正面踏跺）。"""
    obs = []
    obs.append(G.box("H3G_t0", TAI_W + 3.6, TAI_D + 3.6, 0.60, loc=(0, TAI_CY, 0.0), c=c))
    obs.append(G.box("H3G_t1", TAI_W + 1.4, TAI_D + 1.4, 1.20, loc=(0, TAI_CY, 0.60), c=c))
    obs.append(G.box("H3G_t2", TAI_W, TAI_D, 1.20, loc=(0, TAI_CY, 1.80), c=c))

    hw = TAI_W / 2.0 - 0.7                 # 26.3
    ys = TAI_CY - TAI_D / 2.0 + 0.9        # 214.9
    yn = TAI_CY + TAI_D / 2.0 - 0.9        # 325.1
    obs += _rail_with_gap("H3G_rS", hw, ys, Z_H3, 18.0, c=c)
    obs += _rail("H3G_rN", -hw, yn, hw, yn, Z_H3, c=c)
    obs += _rail("H3G_rE", hw, ys, hw, yn, Z_H3, c=c)
    obs += _rail("H3G_rW", -hw, ys, -hw, yn, Z_H3, c=c)

    # 正面大踏跺
    obs += _stairs("H3G_st", 17.0, Z_H3, 0.34, TAI_FRONT, steps=10, c=c)
    for sx in (-1, 1):
        obs += _stairs("H3G_st%d" % sx, 5.0, Z_H3, 0.34, TAI_FRONT, steps=10,
                       x=sx * 15.0, c=c)
    return obs


# ---------------------------------------------------------------- 三宫
def _qianqinggong(c=None):
    o, zr = H.hall("QNG", 45.0, 21.0, Z_H3, body_h=20.0, style='hip',
                   double=True, oh=2.6, bay_x=9, bay_y=5, ridge_frac=0.0,
                   upturn=1.25, curve=1.80, door_bays=[4], c=c)
    _shift(o, dy=Y_QNG)
    print("  QNG ridge_z=%.2f" % zr)
    return o


def _jiaotaidian(c=None):
    o, zr = H.hall("JTD", 15.0, 15.0, Z_H3, body_h=14.0, style='pyramid',
                   double=False, oh=1.9, bay_x=3, bay_y=3, upturn=1.0,
                   curve=1.62, door_bays=[1], c=c,
                   seg_u=12, seg_v=8, eave_thick=0.40)
    _shift(o, dy=Y_JTD)
    print("  JTD ridge_z=%.2f" % zr)
    return o


def _kunninggong(c=None):
    o, zr = H.hall("KNG", 40.0, 18.0, Z_H3, body_h=18.0, style='hip',
                   double=True, oh=2.4, bay_x=9, bay_y=3, ridge_frac=0.0,
                   upturn=1.15, curve=1.80, door_bays=[4], c=c)
    _shift(o, dy=Y_KNG)
    print("  KNG ridge_z=%.2f" % zr)
    return o


# ---------------------------------------------------------------- 廊庑 + 院墙
def _langwu(c=None):
    """东西两侧厢房/廊庑各 90m，围出后三宫院落。"""
    obs = []
    L = CRT_Y1 - CRT_Y0
    for sx in (-1, 1):
        nm = "LANG_E" if sx > 0 else "LANG_W"
        part = H.corridor(nm, sx * COURT_X, CRT_Y0, sx * COURT_X, CRT_Y1, 0.0,
                          height=6.2, width=6.0, bays=18, c=c)
        # hall.corridor 的屋顶是以局部原点为中心生成的（没沿 +X 偏移 L/2），
        # 不补偿的话整片屋顶会挂到廊庑南端之外。
        roofs = [o for o in part
                 if o is not None and o.type == 'MESH' and o.name.startswith(nm + "_roof")]
        if roofs:
            xs = [v.co.x for o in roofs for v in o.data.vertices]
            ctr = (min(xs) + max(xs)) / 2.0
            if abs(ctr) < L * 0.25:
                for o in roofs:
                    o.location.x += L / 2.0 - ctr
        proxy = bpy.data.objects.get(nm + "_rig")
        obs += _bake_parent(part, proxy)
    return obs


def _court_walls(c=None):
    """后三宫院落的南北封口墙（中留门道）。"""
    obs = []
    x = COURT_X
    obs += _wall_seg("CW_S1", [(-x, CRT_WALL_Y0), (-11.0, CRT_WALL_Y0)], 4.8, 1.15, c)
    obs += _wall_seg("CW_S2", [(11.0, CRT_WALL_Y0), (x, CRT_WALL_Y0)], 4.8, 1.15, c)
    obs += _wall_seg("CW_N1", [(-x, CRT_WALL_Y1), (-13.0, CRT_WALL_Y1)], 4.8, 1.15, c)
    obs += _wall_seg("CW_N2", [(13.0, CRT_WALL_Y1), (x, CRT_WALL_Y1)], 4.8, 1.15, c)
    # 廊庑端头接院墙的短墙
    for sx in (-1, 1):
        obs += _wall_seg("CW_E%d" % sx,
                         [(sx * x, CRT_WALL_Y0), (sx * x, CRT_Y0)], 4.8, 1.0, c)
        obs += _wall_seg("CW_W%d" % sx,
                         [(sx * x, CRT_Y1), (sx * x, CRT_WALL_Y1)], 4.8, 1.0, c)
    return obs


# ---------------------------------------------------------------- 御花园
def _garden_walls(c=None):
    obs = []
    obs += _wall_seg("GW_S1", [(-GB_X, GB_Y0), (-10.5, GB_Y0)], 4.6, 1.15, c)
    obs += _wall_seg("GW_S2", [(10.5, GB_Y0), (GB_X, GB_Y0)], 4.6, 1.15, c)
    obs += _wall_seg("GW_N1", [(-GB_X, GB_Y1), (-7.5, GB_Y1)], 4.6, 1.15, c)
    obs += _wall_seg("GW_N2", [(7.5, GB_Y1), (GB_X, GB_Y1)], 4.6, 1.15, c)
    obs += _wall_seg("GW_E", [(GB_X, GB_Y0), (GB_X, GB_Y1)], 4.6, 1.15, c)
    obs += _wall_seg("GW_W", [(-GB_X, GB_Y0), (-GB_X, GB_Y1)], 4.6, 1.15, c)
    return obs


def _qinandian(c=None):
    """钦安殿：方形 15×15，单檐攒尖，body_h 10，须弥座台基 1.6m + 栏杆。"""
    obs = []
    obs += G.sumeru("QAD_xm", 22.0, 22.0, 1.6, loc=(0, Y_QAD, 0.0), c=c)
    o, zr = H.hall("QAD", 15.0, 15.0, 1.6, body_h=10.0, style='pyramid',
                   double=False, oh=1.8, bay_x=3, bay_y=3, upturn=0.95,
                   curve=1.60, door_bays=[1], c=c,
                   seg_u=10, seg_v=7, eave_thick=0.36)
    _shift(o, dy=Y_QAD)
    obs += o

    hw = 11.2
    ys = Y_QAD - hw
    obs += _rail_with_gap("QAD_rS", hw, ys, 1.6, 8.0, h=1.0, step=2.0, c=c)
    obs += _rail("QAD_rN", -hw, Y_QAD + hw, hw, Y_QAD + hw, 1.6, 1.0, 2.0, c)
    obs += _rail("QAD_rE", hw, ys, hw, Y_QAD + hw, 1.6, 1.0, 2.0, c)
    obs += _rail("QAD_rW", -hw, ys, -hw, Y_QAD + hw, 1.6, 1.0, 2.0, c)
    obs += _stairs("QAD_st", 8.0, 1.6, 0.40, Y_QAD - 11.0, steps=5, c=c)
    print("  QAD ridge_z=%.2f" % zr)
    return obs


def _ting(name, cx, cy, size=10.0, body_h=9.0, c=None):
    """方亭（万春亭 / 千秋亭）：方形攒尖，开敞无墙。"""
    obs = []
    obs.append(G.box(name + "_b0", size + 4.4, size + 4.4, 0.35, loc=(cx, cy, 0.0), c=c))
    obs.append(G.box(name + "_b1", size + 2.6, size + 2.6, 0.55, loc=(cx, cy, 0.35), c=c))
    o, zr = H.hall(name, size, size, 0.9, body_h=body_h, style='pyramid',
                   double=False, oh=1.7, bay_x=3, bay_y=3, upturn=1.05,
                   curve=1.55, wall=False, c=c,
                   seg_u=10, seg_v=7, eave_thick=0.34)
    _shift(o, dx=cx, dy=cy)
    obs += o
    obs += _stairs(name + "_st", 5.0, 0.9, 0.30, cy - (size + 4.4) / 2.0,
                   steps=4, x=cx, c=c)
    print("  %s ridge_z=%.2f" % (name, zr))
    return obs


# 建筑/山体占位（树避开）：(cx, cy, half_w, half_d)
_STRUCT = [
    (0.0, Y_QAD, 15.0, 15.0),
    (TING_X, Y_TING, 8.0, 8.0),
    (-TING_X, Y_TING, 8.0, 8.0),
    (46.0, 448.0, 9.5, 9.5),
    (-46.0, 450.0, 8.0, 8.0),
    (-52.0, 428.0, 6.5, 6.5),
    (44.0, 372.0, 5.0, 4.0),
]


def _trees(c=None, count=52):
    """成组树木：固定种子，中轴与建筑/假山处避让。"""
    rng = random.Random(SEED)
    obs = []
    n = 0
    tries = 0
    while n < count and tries < 6000:
        tries += 1
        x = rng.uniform(-GB_X + 8.0, GB_X - 8.0)
        y = rng.uniform(GB_Y0 + 7.0, GB_Y1 - 7.0)
        if abs(x) < 8.5:                       # 中轴御路留空
            continue
        bad = False
        for (cx, cy, hw, hd) in _STRUCT:
            if abs(x - cx) < hw + 2.5 and abs(y - cy) < hd + 2.5:
                bad = True
                break
        if bad:
            continue
        h = rng.uniform(7.5, 11.5)
        r = rng.uniform(2.4, 3.9)
        obs += G.tree("TREE_%02d" % n, (x, y, 0.0), h=h, r=r, c=c, seg=7)
        n += 1
    print("  TREES n=%d (tries=%d)" % (n, tries))
    return obs


def _rocks(c=None):
    """假山：不规则体块（5 边台锥 + 斜置板块）叠成，堆秀山主峰在东。"""
    piles = [
        ("ROCK_DS", 46.0, 448.0, 8.0, 9.8, 16, 4101),
        ("ROCK_W", -46.0, 450.0, 6.5, 7.0, 12, 4102),
        ("ROCK_S", -52.0, 428.0, 4.5, 4.2, 8, 4103),
        ("ROCK_T", 44.0, 372.0, 4.0, 3.6, 7, 4104),
    ]
    obs = []
    for (nm, cx, cy, spread, ztop, n, seed) in piles:
        rng = random.Random(seed)
        for i in range(n):
            a = rng.uniform(0.0, TAU)
            d = rng.uniform(0.0, spread)
            px, py = cx + math.cos(a) * d, cy + math.sin(a) * d * 0.8
            if i % 3 == 2:
                rr = rng.uniform(1.4, max(1.8, min(3.6, ztop * 0.42)))
                zz = rng.uniform(rr * 0.65, max(rr * 0.65 + 0.3, ztop - rr * 0.5))
                obs.append(G.box("%s_b%d" % (nm, i), rr * 2.0, rr * 1.5, rr * 1.15,
                                 loc=(px, py, zz),
                                 rot=(rng.uniform(-0.22, 0.22),
                                      rng.uniform(-0.22, 0.22),
                                      rng.uniform(0.0, TAU)),
                                 c=c, bottom=False))
            else:
                r = rng.uniform(1.5, 3.2)
                hh = rng.uniform(1.4, ztop * 0.55)
                zz = rng.uniform(0.0, max(0.2, ztop - hh))
                obs.append(G.cylinder("%s_c%d" % (nm, i), r, hh, loc=(px, py, zz),
                                      seg=5, r2=r * rng.uniform(0.30, 0.68), c=c))
        # 主峰
        obs.append(G.cylinder(nm + "_peak", max(1.6, spread * 0.30), ztop,
                              loc=(cx, cy, 0.0), seg=5,
                              r2=max(0.5, spread * 0.07), c=c))
    return obs


# ---------------------------------------------------------------- 出口
def build(c=None):
    obs = []

    # 1. 乾清门
    obs += _join(_qianqingmen(c), "NI_QQM")

    # 2. 后三宫共用高台基
    obs += _join(_houtai(c), "NI_TAI3")

    # 3. 乾清宫 / 交泰殿 / 坤宁宫
    obs += _join(_qianqinggong(c), "NI_QNG")
    obs += _join(_jiaotaidian(c), "NI_JTD")
    obs += _join(_kunninggong(c), "NI_KNG")

    # 4. 廊庑 + 院落墙
    obs += _join(_langwu(c), "NI_LANG")
    obs += _join(_court_walls(c), "NI_COURTWALL")

    # 5. 御花园
    obs += _join(_garden_walls(c), "NI_GARDENWALL")
    obs += _join(_qinandian(c), "NI_QAD")
    obs += _join(_ting("WCT", TING_X, Y_TING, c=c), "NI_WCT")
    obs += _join(_ting("QCT", -TING_X, Y_TING, c=c), "NI_QCT")
    obs += _join(_trees(c), "NI_TREES")
    obs += _join(_rocks(c), "NI_ROCKS")

    bpy.context.view_layer.update()
    print("MOD_INNER objects=%d" % len([o for o in obs if o]))
    return obs
