# -*- coding: utf-8 -*-
"""故宫两翼院落群：东西六宫（12 院）+ 文华殿 / 武英殿 / 奉先殿 / 养心殿 /
宁寿宫 / 慈宁宫 + 太和殿广场两侧朝房。

坐标同契约：原点 = 太和殿中心，+X 东，+Y 北，Z 上；殿宇一律朝南(-Y)。
城墙内空 x -370…370、y -400…545；中轴 |x|<70（外朝三大殿、内廷后三宫、
御花园）已被占用，本模块全部落在 |x| >= 88 的两翼条带里。

所有院落由 `compound()` 生成：四周围墙 + 南面三间门 + 院中偏北正殿
（hall.hall，单檐歇山）+ 东西厢房（小体块 + 歇山）+ 角落树。
出口每个院落 join 成一个对象，总对象数 ~20。
"""
import math

import bpy
from mathutils import Matrix

import common as G
import hall as H

PI2 = math.pi * 0.5

Z0 = 0.0            # 宫城地面标高
WALL_H = 4.4        # 院墙高
WALL_T = 1.0        # 院墙厚

HALL_SEG_U = 12
HALL_SEG_V = 7


# ---------------------------------------------------------------- 总平面
def _spec(nm, cx, cy, w, d, bays, mw, md, mb, style='xieshan', rear=False):
    return dict(nm=nm, cx=cx, cy=cy, w=w, d=d, bays=bays,
                mw=mw, md=md, mb=mb, style=style, rear=rear)


# 东西六宫：两列三行，院 50×70（真实东西六宫约 50×70m，含墙）
SIX = [
    # ---- 东六宫（东一列 x=+115：景仁 / 承乾 / 钟粹；东二列 x=+173：延禧 / 永和 / 景阳）
    _spec("JRG",  115.0, 200.0, 50.0, 70.0, 5, 21.0, 12.0, 11.0),   # 景仁宫
    _spec("CQG",  115.0, 275.0, 50.0, 70.0, 5, 21.0, 12.0, 11.0),   # 承乾宫
    _spec("ZCG",  115.0, 350.0, 50.0, 70.0, 5, 21.0, 12.0, 11.0),   # 钟粹宫
    _spec("YXG",  173.0, 200.0, 50.0, 70.0, 5, 21.0, 12.0, 11.0),   # 延禧宫
    _spec("YHG",  173.0, 275.0, 50.0, 70.0, 5, 21.0, 12.0, 11.0),   # 永和宫
    _spec("JYG",  173.0, 350.0, 50.0, 70.0, 5, 21.0, 12.0, 11.0),   # 景阳宫
    # ---- 西六宫（西一列 x=-115：永寿 / 翊坤 / 储秀；西二列 x=-173：太极 / 长春 / 咸福）
    _spec("YSG", -115.0, 200.0, 50.0, 70.0, 5, 21.0, 12.0, 11.0),   # 永寿宫
    _spec("YKG", -115.0, 275.0, 50.0, 70.0, 5, 21.0, 12.0, 11.0),   # 翊坤宫
    _spec("CXG", -115.0, 350.0, 50.0, 70.0, 5, 21.0, 12.0, 11.0),   # 储秀宫
    _spec("TJG", -173.0, 200.0, 50.0, 70.0, 5, 21.0, 12.0, 11.0),   # 太极殿
    _spec("CCG", -173.0, 275.0, 50.0, 70.0, 5, 21.0, 12.0, 11.0),   # 长春宫
    _spec("XFG", -173.0, 350.0, 50.0, 70.0, 5, 21.0, 12.0, 11.0),   # 咸福宫
]

# 六组大宫（尺度大一号，带后殿）
BIG = [
    _spec("WHG",  230.0, -150.0, 90.0, 110.0, 5, 28.0, 15.0, 15.0, rear=True),   # 文华殿
    _spec("WYG", -230.0, -150.0, 90.0, 110.0, 5, 27.0, 15.0, 14.5, rear=True),   # 武英殿
    _spec("FXD",  150.0,  105.0, 70.0,  90.0, 7, 32.0, 14.0, 15.0, rear=False),  # 奉先殿
    _spec("YXD", -150.0,  105.0, 70.0,  90.0, 5, 24.0, 12.0, 12.0, rear=False),  # 养心殿
    _spec("NSG",  255.0,  425.0, 110.0, 130.0, 7, 34.0, 18.0, 16.0, rear=True),  # 宁寿宫
    _spec("CNG", -255.0,  382.0, 110.0, 130.0, 7, 32.0, 16.0, 15.0, rear=True),  # 慈宁宫
]

COURTS = SIX + BIG

# 朝房：mod_court 已在 |x|=92 建了太和殿广场廊庑（y -155…-5，屋顶出挑到 |x|≈97），
# 内金水河东西端到 |x|=100，所以朝房轴线外移到 |x|=108，避免与两者穿插。
CF_X = 108.0
CF_Y0, CF_Y1 = -258.0, -118.0
CF_H = 5.0
CF_W = 7.0


# ---------------------------------------------------------------- 小工具
def _shift(objs, dx=0.0, dy=0.0):
    for o in objs:
        if o is None:
            continue
        o.location.x += dx
        o.location.y += dy
    return objs


def _wall_seg(name, pts, h, t, c=None):
    """院墙：墙身 + 压顶。"""
    o = G.wall_run(name, pts, Z0, h, t, c)
    o += G.wall_run(name + "_cap", pts, Z0 + h, 0.40, t + 0.55, c)
    return [x for x in o if x is not None]


def _bake_parent(objs, proxy):
    """H.corridor 用空物体做整体旋转，join 前把世界矩阵烘进 mesh、删掉空物体。"""
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


def _corridor_at(name, x0, y0, x1, y1, z, height, width, bays, c=None):
    """H.corridor 的屋顶以局部原点为中心生成（没沿 +X 偏移 L/2），这里补偿。"""
    part = H.corridor(name, x0, y0, x1, y1, z, height=height, width=width,
                      bays=bays, c=c)
    L = math.hypot(x1 - x0, y1 - y0)
    roofs = [o for o in part
             if o is not None and o.type == 'MESH' and o.name.startswith(name + "_roof")]
    if roofs:
        xs = [v.co.x for o in roofs for v in o.data.vertices]
        ctr = (min(xs) + max(xs)) / 2.0
        if abs(ctr) < L * 0.25:
            for o in roofs:
                o.location.x += L / 2.0 - ctr
    return _bake_parent(part, bpy.data.objects.get(name + "_rig"))


# ---------------------------------------------------------------- 单体
def _small(name, cx, cy, w, d, z0, body_h, c=None, bays=3, oh=1.5, doors=True):
    """门屋 / 后殿：台明 + 墙身 + 门窗贴脸 + 单檐歇山 + 正脊。"""
    obs = []
    obs.append(G.box(name + "_tai", w + 2.6, d + 2.6, 0.45, loc=(cx, cy, z0), c=c))
    obs.append(G.box(name + "_body", w, d, body_h, loc=(cx, cy, z0 + 0.45), c=c))
    z_e = z0 + 0.45 + body_h
    if doors:
        bw = w / bays
        for i in range(bays):
            bx = cx - w / 2.0 + bw * (i + 0.5)
            if i % 2 == 0:
                obs.append(G.box("%s_dr%d" % (name, i), bw * 0.56, 0.34, body_h * 0.62,
                                 loc=(bx, cy - d / 2.0 - 0.05, z0 + 0.45), c=c))
            else:
                obs.append(G.box("%s_wn%d" % (name, i), bw * 0.52, 0.34, body_h * 0.30,
                                 loc=(bx, cy - d / 2.0 - 0.05,
                                      z0 + 0.45 + body_h * 0.34), c=c))
    rise = body_h * 0.46
    rf = G.roof_xieshan(name + "_rf", w + 2 * oh, d + 2 * oh, z_e, z_e + rise,
                        curve=1.72, upturn=0.55, seg_u=8, seg_v=6, c=c, thick=0.34)
    # roof_xieshan 建在原点，必须整体平移到门屋位置
    _shift(rf, dx=cx, dy=cy)
    obs += rf
    cl = (w + 2 * oh) / 2.0 - (d + 2 * oh) / 2.0 * 0.55
    obs.append(G.box(name + "_ji", cl * 2.0, (d + 2 * oh) * 0.05,
                     max(0.22, rise * 0.16), loc=(cx, cy, z_e + rise),
                     bottom=False, c=c))
    return obs


def _wing(name, cx, cy, L, W, z0, h, c=None, inward=-1, oh=1.25):
    """厢房：面阔沿南北（L），进深东西（W），正脊南北向。
    屋顶先按 X 长边建，再把 mesh 绕 Z 转 90°，避免另写一套。"""
    obs = []
    obs.append(G.box(name + "_tai", W + 2.0, L + 1.6, 0.40, loc=(cx, cy, z0), c=c))
    obs.append(G.box(name + "_body", W, L, h, loc=(cx, cy, z0 + 0.40), c=c))
    z_e = z0 + 0.40 + h
    rise = h * 0.52
    r = G.roof_xieshan(name + "_rf", L + 2 * oh, W + 2 * oh, z_e, z_e + rise,
                       curve=1.72, upturn=0.38, seg_u=10, seg_v=6, c=c, thick=0.32)
    M = Matrix.Rotation(PI2, 4, 'Z')
    for o in r:
        o.data.transform(M)
        o.location = (cx, cy, 0.0)
    obs += r
    cl = (L + 2 * oh) / 2.0 - (W + 2 * oh) / 2.0 * 0.55
    obs.append(G.box(name + "_ji", (W + 2 * oh) * 0.09, cl * 2.0,
                     max(0.20, rise * 0.15), loc=(cx, cy, z_e + rise),
                     bottom=False, c=c))
    # 朝院心一侧的檐柱 + 檐枋
    xc = cx + inward * (W / 2.0 + 0.85)
    n = max(4, int(L / 4.5))
    for i in range(n + 1):
        yy = cy - L / 2.0 + L * i / n
        obs.append(G.cylinder("%s_c%d" % (name, i), 0.24, h * 0.92,
                              loc=(xc, yy, z0 + 0.40), seg=6, c=c))
    obs.append(G.box(name + "_fang", 0.30, L, 0.48, loc=(xc, cy, z_e - 0.48), c=c))
    return obs


# ---------------------------------------------------------------- 通用院落
def compound(name, cx, cy, w, d, c=None, main_bays=5, main_body=11.0,
             main_w=21.0, main_d=12.0, main_style='xieshan',
             wing_h=5.6, trees=2, rear=False,
             gate_w=13.0, gate_d=8.0, gate_body=8.0, wall_h=WALL_H):
    """通用院落生成器。

    name 前缀 / (cx,cy) 院心 / w×d 院墙外轮廓（含墙厚）。
    布局（局部 v，0 = 院心）：
      南墙 v=-d/2，门屋跨墙居中（向外挑 4m）；
      正殿偏北：v = d/2 - (24 或 9) - main_d/2；
      东西厢房贴着东西墙内侧，自门前广场到正殿前；
      前院两角各一棵树。
    返回 [Object]（未 join）。
    """
    obs = []
    hw, hd = w / 2.0, d / 2.0
    y_s, y_n = cy - hd, cy + hd
    x_w, x_e = cx - hw, cx + hw
    g2 = gate_w / 2.0

    # ---- 院墙：南面留门洞，其余三面封闭
    obs += _wall_seg(name + "_wS1", [(x_w, y_s), (cx - g2, y_s)], wall_h, WALL_T, c)
    obs += _wall_seg(name + "_wS2", [(cx + g2, y_s), (x_e, y_s)], wall_h, WALL_T, c)
    obs += _wall_seg(name + "_wE", [(x_e, y_s), (x_e, y_n)], wall_h, WALL_T, c)
    obs += _wall_seg(name + "_wW", [(x_w, y_s), (x_w, y_n)], wall_h, WALL_T, c)
    obs += _wall_seg(name + "_wN", [(x_w, y_n), (x_e, y_n)], wall_h, WALL_T, c)

    # ---- 南门：3 间，单檐歇山（门身嵌进院墙，只向南挑出约 2.5m）
    obs += _small(name + "_gate", cx, y_s + 1.5, gate_w, gate_d, Z0, gate_body, c,
                  bays=3, oh=1.5)

    # ---- 正殿（偏北，hall.hall 单檐歇山，进深 3 间）
    mv = hd - (24.0 if rear else 9.0) - main_d / 2.0
    o, _zr = H.hall(name + "_main", main_w, main_d, Z0, body_h=main_body,
                    style=main_style, double=False, oh=2.0,
                    bay_x=main_bays, bay_y=3, upturn=0.9, curve=1.78,
                    door_bays=[main_bays // 2], c=c,
                    seg_u=HALL_SEG_U, seg_v=HALL_SEG_V, eave_thick=0.40)
    _shift(o, dx=cx, dy=cy + mv)
    obs += o

    # ---- 后殿（大宫才有：正殿之后补一座小殿，加厚纵深）
    if rear:
        obs += _small(name + "_rear", cx, cy + (hd - 10.0),
                      max(14.0, main_w * 0.58), 10.0, Z0, 8.5, c,
                      bays=5, oh=1.4, doors=False)

    # ---- 东西厢房
    v_front = -hd + 14.0
    v_rear = mv - main_d / 2.0 - 4.0
    wl = v_rear - v_front
    if wl >= 12.0:
        wc = cy + (v_front + v_rear) / 2.0
        for sx in (-1, 1):
            obs += _wing("%s_wing%s" % (name, "E" if sx > 0 else "W"),
                         cx + sx * (hw - 5.6), wc, wl, 5.2, Z0, wing_h, c,
                         inward=-sx)

    # ---- 前院两角树
    for i in range(max(0, min(2, trees))):
        lx = (-1.0 if i == 0 else 1.0) * (hw - 9.0)
        obs += G.tree("%s_tree%d" % (name, i),
                      (cx + lx, y_s + 10.0, Z0),
                      h=8.6 + 0.9 * i, r=2.9, c=c, seg=7)
    return [o for o in obs if o is not None]


# ---------------------------------------------------------------- 出口
def _bbox(ob):
    mn = [1e9] * 3
    mx = [-1e9] * 3
    for v in ob.bound_box:
        w = ob.matrix_world @ __import__("mathutils").Vector(v)
        for i in range(3):
            mn[i] = min(mn[i], w[i])
            mx[i] = max(mx[i], w[i])
    return mn, mx


def build(c=None):
    obs = []
    rows = []
    allv = 0
    MN = [1e9] * 3
    MX = [-1e9] * 3

    # ---- 18 个院落
    for sp in COURTS:
        part = compound(sp["nm"], sp["cx"], sp["cy"], sp["w"], sp["d"], c=c,
                        main_bays=sp["bays"], main_w=sp["mw"], main_d=sp["md"],
                        main_body=sp["mb"], main_style=sp["style"],
                        rear=sp["rear"], trees=2)
        prefix = "W6_" if sp in SIX else "WB_"
        ob = G.join(part, prefix + sp["nm"])
        if ob is None:
            continue
        obs.append(ob)
        rows.append((sp, ob))

    # ---- 太和殿广场两侧朝房（corridor，高 5m）
    for sx in (-1, 1):
        tag = "E" if sx > 0 else "W"
        part = _corridor_at("CF_" + tag, sx * CF_X, CF_Y0, sx * CF_X, CF_Y1, Z0,
                            height=CF_H, width=CF_W, bays=24, c=c)
        ob = G.join(part, "WCF_" + tag)
        if ob is not None:
            obs.append(ob)
            rows.append((dict(nm="CF_" + tag, cx=sx * CF_X,
                              cy=(CF_Y0 + CF_Y1) / 2.0,
                              w=CF_W, d=CF_Y1 - CF_Y0, bays=0, mw=0.0,
                              md=0.0, mb=CF_H, style="corridor", rear=False), ob))

    bpy.context.view_layer.update()

    # ---- 统计
    print("=" * 78)
    print("  %-7s %8s %8s %6s %6s  %8s %8s  %s" %
          ("name", "cx", "cy", "w", "d", "objects", "verts", "bbox x/y"))
    for sp, ob in rows:
        nv = len(ob.data.vertices)
        allv += nv
        mn, mx = _bbox(ob)
        for i in range(3):
            MN[i] = min(MN[i], mn[i])
            MX[i] = max(MX[i], mx[i])
        print("  %-7s %8.1f %8.1f %6.1f %6.1f  %8d %8d  x[%.0f..%.0f] y[%.0f..%.0f]" %
              (sp["nm"], sp["cx"], sp["cy"], sp["w"], sp["d"], 1, nv,
               mn[0], mx[0], mn[1], mx[1]))
    print("-" * 78)
    print("  TOTAL objs=%d verts=%d" % (len(obs), allv))
    print("  BBOX x[%.1f..%.1f] y[%.1f..%.1f] z[%.1f..%.1f]" %
          (MN[0], MX[0], MN[1], MX[1], MN[2], MX[2]))
    print("MOD_WINGS objects=%d verts=%d" % (len(obs), allv))
    print("=" * 78)
    return obs
