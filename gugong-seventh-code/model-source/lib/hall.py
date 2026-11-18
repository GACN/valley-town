# -*- coding: utf-8 -*-
"""通用中式殿堂生成器（白模）。参数为真实米制。

纵向分工（body_h = 台面到正脊）按官式比例：
  0.020 台明 | 0.360 檐柱 | 0.035 额枋 | 0.055 下斗拱
  0.085 下檐(披檐) | 0.055 上层墙身 | 0.060 上斗拱 | 0.330 主屋面  = 1.000
"""
import math
import common as G

F = dict(plinth=0.018, pillar=0.300, fang=0.035, dg1=0.052,
         roof1=0.075, wall_up=0.110, dg2=0.058, roof_main=0.352)


def hall(name, w, d, z0, body_h=26.92, style='hip', double=True,
         oh=2.7, bay_x=11, bay_y=5, ridge_frac=0.0, upturn=0.9,
         curve=1.80, door_bays=None, c=None, wall=True, seg_u=16, seg_v=10,
         eave_thick=0.5, oh_lower=None):
    """w,d = 柱网外包（面阔/进深）。返回 (objs, ridge_z)。"""
    obs = []
    H = body_h
    z_pl = z0
    z_col = z_pl + F['plinth'] * H
    z_fang = z_col + F['pillar'] * H
    z_dg1 = z_fang + F['fang'] * H
    z_eave1 = z_dg1 + F['dg1'] * H
    z_r1 = z_eave1 + F['roof1'] * H
    z_up = z_r1
    z_dg2 = z_up + F['wall_up'] * H
    z_eave2 = z_dg2 + F['dg2'] * H
    z_ridge = z0 + H

    # ---------------- 台明
    obs.append(G.box(name + "_plinth", w + 2.4, d + 2.4, F['plinth'] * H, loc=(0, 0, z_pl), c=c))
    obs += G.balustrade_ring(name + "_plrail", w + 2.0, d + 2.0, z_col, h=0.95, step=1.6, c=c)

    # ---------------- 柱网（官式开间：明间最宽，向两端递减）
    if bay_x % 2 == 1:
        half = bay_x // 2
        ratios = [1.24]
        for i in range(1, half + 1):
            ratios.append(max(0.78, 1.0 - 0.052 * i))
        ratio_list = ratios[:half][::-1] + [1.24] + ratios[1:half + 1]
        ratio_list = ratio_list[:bay_x]
        tot = sum(ratio_list)
        xs = [0.0]
        acc = 0.0
        for r in ratio_list:
            acc += w * r / tot
            xs.append(-w / 2 + acc)
    else:
        xs = [(-w / 2) + w * i / bay_x for i in range(bay_x + 1)]
    bayw = w / bay_x
    ys = [(-d / 2) + d * j / bay_y for j in range(bay_y + 1)]
    r_col = max(0.32, min(0.50, w / 140.0))
    obs += G.column_grid(name + "_col", xs, ys, z_col, r=r_col, h=z_fang - z_col, c=c)

    # ---------------- 檐下装修：隔扇 / 槛墙
    if wall:
        if door_bays is None:
            door_bays = [bay_x // 2]
        door_h = (z_fang - z_col) * 0.80
        for i in range(bay_x):
            bw = xs[i + 1] - xs[i]
            cx = xs[i] + bw / 2
            if i in door_bays:
                obs += G.lattice("%s_dr%d" % (name, i), bw * 0.88, door_h, z_col,
                                 (cx, -d / 2), c=c, cols=4, rows=10, bar=0.085)
            else:
                obs.append(G.box("%s_win%d" % (name, i), bw * 0.88, 0.30, (z_fang - z_col) * 0.34,
                                 loc=(cx, -d / 2, z_col), c=c))
                obs += G.lattice("%s_lt%d" % (name, i), bw * 0.88, (z_fang - z_col) * 0.40,
                                 z_col + (z_fang - z_col) * 0.40, (cx, -d / 2),
                                 c=c, cols=4, rows=5, bar=0.075)
            obs.append(G.box("%s_bk%d" % (name, i), bw * 0.96, 0.34, z_fang - z_col,
                             loc=(cx, d / 2, z_col), c=c))
        for sx in (-1, 1):
            obs.append(G.box("%s_wall%d" % (name, sx), 0.42, d, z_fang - z_col,
                             loc=(sx * w / 2, 0, z_col), c=c))

    # ---------------- 额枋 + 平板枋
    tk_f = 0.12 * H
    obs.append(G.box(name + "_fS", w + 1.2, 0.62, tk_f, loc=(0, -d / 2 - 0.15, z_fang - tk_f), c=c))
    obs.append(G.box(name + "_fN", w + 1.2, 0.62, tk_f, loc=(0, d / 2 + 0.15, z_fang - tk_f), c=c))
    obs.append(G.box(name + "_fE", 0.62, d + 1.2, tk_f, loc=(w / 2 + 0.15, 0, z_fang - tk_f), c=c))
    obs.append(G.box(name + "_fW", 0.62, d + 1.2, tk_f, loc=(-w / 2 - 0.15, 0, z_fang - tk_f), c=c))

    # ---------------- 下斗拱
    step = max(0.85, (w / bay_x) / 3.0)
    dh = F['dg1'] * H
    obs += G.dougong_row(name + "_dg1S", -w / 2 - 0.6, w / 2 + 0.6, -d / 2 - 0.60, z_dg1, step, 0.95, dh, c)
    obs += G.dougong_row(name + "_dg1N", -w / 2 - 0.6, w / 2 + 0.6, d / 2 + 0.60, z_dg1, step, 0.95, dh, c)
    obs += G.dougong_row_y(name + "_dg1E", -d / 2 - 0.6, d / 2 + 0.6, w / 2 + 0.60, z_dg1, step, 0.95, dh, c)
    obs += G.dougong_row_y(name + "_dg1W", -d / 2 - 0.6, d / 2 + 0.6, -w / 2 - 0.60, z_dg1, step, 0.95, dh, c)

    oh_l = oh * 0.60 if oh_lower is None else oh_lower

    if double:
        # ---- 下檐（披檐）
        wl, dl = w + 2 * oh_l, d + 2 * oh_l
        obs += G.roof_hip(name + "_roof1", wl, dl, z_eave1, z_r1, ridge_frac=0.55,
                          curve=1.55, upturn=upturn * 0.55, seg_u=seg_u, seg_v=5,
                          c=c, thick=eave_thick * 0.9, ribs=int(wl / 0.62))
        # 围脊（下檐与上层墙身交接）
        wu, du = w - 2 * 0.06 * H, d - 2 * 0.06 * H
        obs.append(G.box(name + "_weiji", wu + 1.0, du + 1.0, (z_r1 - z_eave1) * 0.55,
                         loc=(0, 0, z_r1 - (z_r1 - z_eave1) * 0.30), c=c))
        # ---- 上层墙身
        obs.append(G.box(name + "_upper", wu, du, z_dg2 - z_up, loc=(0, 0, z_up), c=c))
        # 上层窗（每开间一扇，只做正面）
        bayu = wu / bay_x
        for i in range(bay_x):
            cu = -wu / 2 + bayu * (i + 0.5)
            obs.append(G.box("%s_uw%d" % (name, i), bayu * 0.60, 0.22, (z_dg2 - z_up) * 0.5,
                             loc=(cu, -du / 2, z_up + (z_dg2 - z_up) * 0.28), c=c))
        # ---- 上斗拱
        step2 = max(0.85, (wu / bay_x) / 3.0)
        dh2 = F['dg2'] * H
        obs += G.dougong_row(name + "_dg2S", -wu / 2 - 0.5, wu / 2 + 0.5, -du / 2 - 0.55, z_dg2, step2, 0.95, dh2, c)
        obs += G.dougong_row(name + "_dg2N", -wu / 2 - 0.5, wu / 2 + 0.5, du / 2 + 0.55, z_dg2, step2, 0.95, dh2, c)
        obs += G.dougong_row_y(name + "_dg2E", -du / 2 - 0.5, du / 2 + 0.5, wu / 2 + 0.55, z_dg2, step2, 0.95, dh2, c)
        obs += G.dougong_row_y(name + "_dg2W", -du / 2 - 0.5, du / 2 + 0.5, -wu / 2 - 0.55, z_dg2, step2, 0.95, dh2, c)
        main_w, main_d = wu, du
    else:
        main_w, main_d = w, d

    # ---------------- 主屋面
    _main_roof(name, main_w, main_d, z_eave2 if double else z_eave1, z_ridge, style,
               oh, ridge_frac, upturn, curve, seg_u, seg_v, c, obs, eave_thick)
    return obs, z_ridge


def _main_roof(name, w, d, z_eave, z_ridge, style, oh, ridge_frac,
               upturn, curve, seg_u, seg_v, c, obs, eave_thick):
    rise = z_ridge - z_eave
    if style == 'hip':
        ww, dd = w + 2 * oh, d + 2 * oh
        obs += G.roof_hip(name + "_roofM", ww, dd, z_eave, z_ridge, ridge_frac=ridge_frac,
                          curve=curve, upturn=upturn, seg_u=seg_u, seg_v=seg_v,
                          c=c, thick=eave_thick, ribs=int(ww / 0.62))
        cl = max(2.0, (ww / 2 - dd / 2 * (1 - ridge_frac)) * 2)
        obs.append(G.ridge_beam(name + "_zhengji", cl + 0.6, rise * 0.13, dd * 0.028,
                                loc=(0, 0, z_ridge), c=c))
        # 鸱吻
        for sx in (-1, 1):
            obs.append(G.box("%s_wen%d" % (name, sx), dd * 0.035, dd * 0.030, rise * 0.30,
                             loc=(sx * (cl / 2 + 0.2), 0, z_ridge + rise * 0.05), c=c, bottom=True))
        # 垂脊（沿脊线 → 檐角）
        for sx in (-1, 1):
            for sy in (-1, 1):
                p0 = (sx * cl / 2, 0, z_ridge)
                p1 = (sx * ww / 2, sy * dd / 2, z_eave + upturn + rise * 0.02)
                obs.append(G.beam_between("%s_chui%d%d" % (name, sx, sy), p0, p1,
                                          dd * 0.022, rise * 0.075, c=c, extend=0.55))
    elif style == 'xieshan':
        ww, dd = w + 2 * oh, d + 2 * oh
        obs += G.roof_xieshan(name + "_roofM", ww, dd, z_eave, z_ridge, curve=curve,
                              upturn=upturn, seg_u=seg_u, seg_v=seg_v, c=c, thick=eave_thick)
        cl = (ww / 2 - dd / 2 * 0.55) * 2
        obs.append(G.ridge_beam(name + "_zhengji", cl + 0.5, rise * 0.12, dd * 0.026,
                                loc=(0, 0, z_ridge), c=c))
        for sx in (-1, 1):
            obs.append(G.box("%s_wen%d" % (name, sx), dd * 0.032, dd * 0.028, rise * 0.26,
                             loc=(sx * (cl / 2 + 0.2), 0, z_ridge + rise * 0.04), c=c, bottom=True))
    else:  # pyramid 攒尖
        sz = max(w, d) + 2 * oh
        obs.append(G.roof_pyramid(name + "_roofM", sz, z_eave, z_ridge, curve=curve,
                                  upturn=upturn, seg=12, c=c, thick=eave_thick))
        obs.append(G.cylinder(name + "_baoding", sz * 0.030, rise * 0.32,
                              loc=(0, 0, z_ridge - rise * 0.10), seg=12,
                              r2=sz * 0.008, c=c))
    return z_ridge


def corridor(name, x0, y0, x1, y1, z0, height=6.0, width=6.0, bays=None, c=None):
    """沿直线生成廊庑（柱列 + 单坡屋顶 + 墙）。"""
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy)
    if L < 1:
        return []
    ang = math.atan2(dy, dx)
    n = bays or max(2, int(L / 5.0))
    obs = []
    step = L / n
    for i in range(n + 1):
        t = i * step
        obs.append(G.cylinder("%s_c%d" % (name, i), 0.30, height,
                              loc=(t, -width / 2, z0), seg=8, c=c))
        obs.append(G.cylinder("%s_d%d" % (name, i), 0.30, height,
                              loc=(t, width / 2, z0), seg=8, c=c))
    obs.append(G.box(name + "_wall", L, 0.4, height * 0.9, loc=(L / 2, width / 2, z0), c=c))
    obs += G.dougong_row(name + "_dg", 0, L, -width / 2 - 0.4, z0 + height, 1.4, 0.8, 0.7, c)
    obs += G.dougong_row(name + "_dg2", 0, L, width / 2 + 0.4, z0 + height, 1.4, 0.8, 0.7, c)
    # 两坡顶（用庑殿顶压扁近似）
    obs += G.roof_hip(name + "_roof", L + 1.6, width + 3.0, z0 + height + 1.4,
                      z0 + height + 3.0, ridge_frac=0.92, curve=1.6,
                      seg_u=max(6, n * 2), seg_v=4, c=c, thick=0.4)
    # 平移到起点并旋转
    from mathutils import Vector
    grp = obs
    for o in grp:
        o.location = Vector((o.location.x, o.location.y, o.location.z))
    import bpy
    proxy = bpy.data.objects.new(name + "_rig", None)
    bpy.context.scene.collection.objects.link(proxy)
    for o in grp:
        o.parent = proxy
    proxy.location = (x0, y0, 0)
    proxy.rotation_euler = (0, 0, ang)
    return grp
