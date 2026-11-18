# -*- coding: utf-8 -*-
"""外朝三大殿：太和殿 / 中和殿 / 保和殿（坐在三台上，台基顶面 z=8.13）"""
import bpy
import common as G
import hall as H

Z_TAI = 8.13          # 三台顶面
BAY = dict(x=11, y=5)


def build(c=None):
    obs = []

    # ---------------- 太和殿（重檐庑殿，面阔 11 间 63.96m，进深 5 间 37.2m）
    o, zr = H.hall("THD", 63.96, 37.2, Z_TAI, body_h=26.92, style='hip', double=True,
                   oh=2.9, bay_x=11, bay_y=5, ridge_frac=0.0, upturn=2.3,
                   door_bays=[4, 5, 6], c=c)
    obs += o
    # 月台：与三台同高的殿前平台（不抬升，避免与殿身台明脱节）
    obs.append(G.box("THD_yuetai", 34, 14, 0.3, loc=(0, -18.0 - 7.0, Z_TAI), c=c))
    obs += G.balustrade_ring("THD_yuetai_rail", 34, 14, Z_TAI + 0.3, h=1.05, step=1.7,
                             c=c, cx=0, cy=-25.0)
    # 月台前沿踏跺（下到三台面，落差 0.3+殿身台明）
    obs += G.stairs("THD_yuetai_st", 16, 1.1, 0.5, Z_TAI, loc=(0, -32.0, Z_TAI), steps=3, c=c)

    # ---------------- 中和殿（单檐四角攒尖，方形 24.15m）
    o2, zr2 = H.hall("ZHD", 24.15, 24.15, Z_TAI, body_h=18.87, style='pyramid',
                     double=False, oh=2.2, bay_x=5, bay_y=5, upturn=1.7,
                     door_bays=[2], c=c)
    for ob in o2:
        ob.location.y += 62.0
    obs += o2

    # ---------------- 保和殿（重檐歇山，面阔 9 间 49.68m，进深 5 间 24.97m）
    o3, zr3 = H.hall("BHD", 49.68, 24.97, Z_TAI, body_h=21.4, style='xieshan',
                     double=True, oh=2.5, bay_x=9, bay_y=5, upturn=2.0,
                     door_bays=[4], c=c)
    for ob in o3:
        ob.location.y += 95.0
    obs += o3

    bpy.context.view_layer.update()
    print("TAIDIAN ridge=%.2f  ZHONGHE ridge=%.2f  BAOHE ridge=%.2f" % (zr, zr2, zr3))
    return obs
