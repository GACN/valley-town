# -*- coding: utf-8 -*-
"""生成「授权通道」(ramps/portals) 并用连通性 BFS 验证
输出 data/passages.json
规则：
  ramp   : 矩形内强制可走，高度沿 axis 从 h0 线性到 h1（用于三台/台基/城墙顶的补梯）
  portal : 矩形内强制可走，高度固定 h（用于宫门/院门/城门洞）
"""
import json, array, collections, math, os

D = "/storage/emulated/0/Music/每日归档/2026-11/gugong/game/data/"
m = json.load(open(D + "walk_meta.json"))
nx, ny, step, x0, y0 = m["nx"], m["ny"], m["step"], m["x0"], m["y0"]
H = array.array("H"); H.frombytes(open(D + "height.bin", "rb").read())
B = bytearray(open(D + "blocked.bin", "rb").read())
anchors = json.load(open(D + "anchors.json"))
objs = json.load(open(D + "objects.json"))

passages = []


def add_ramp(pid, rect, h0, h1, axis, prop="stone_stairs", note=""):
    passages.append({"id": pid, "type": "ramp", "rect": rect, "h0": h0, "h1": h1,
                     "axis": axis, "prop": prop, "note": note})


def add_portal(pid, rect, h, prop="wood_gate", note=""):
    passages.append({"id": pid, "type": "portal", "rect": rect, "h": h,
                     "prop": prop, "note": note})


# ---------- 1. 三台四向补梯（模型只有南面一段 45° 坡） ----------
add_ramp("ramp_santai_e", [64, -7, 80, 7], 0.0, 8.13, "x", "stone_stairs", "三台东侧补梯")
add_ramp("ramp_santai_w", [-80, -7, -64, 7], 0.0, 8.13, "x", "stone_stairs", "三台西侧补梯")
add_ramp("ramp_santai_n", [-7, 116, 7, 132], 8.13, 0.0, "y", "stone_stairs", "三台北侧下后庭")
# 南面 DB_STEP 是 45° 斜坡，仅放宽坡度由引擎 step 容忍处理（这里再补一条平缓坡）
add_ramp("ramp_santai_s", [-9, -140, 9, -112], 0.0, 8.13, "y", "stone_stairs", "三台南面缓坡")

# ---------- 2. 内廷台基（乾清宫/交泰殿/坤宁宫，3.0m） ----------
add_ramp("ramp_neiting_e", [28, 262, 44, 278], 0.0, 3.0, "x", "stone_stairs", "内廷台基东梯")
add_ramp("ramp_neiting_w", [-44, 262, -28, 278], 0.0, 3.0, "x", "stone_stairs", "内廷台基西梯")
add_ramp("ramp_neiting_s", [-8, 196, 8, 214], 0.0, 3.0, "y", "stone_stairs", "乾清门内上台")

# ---------- 3. 城墙顶（9.9m）登城梯 ----------
add_ramp("ramp_wall_s_e", [60, -418, 74, -398], 0.0, 9.9, "y", "wood_ladder", "南城墙东登城梯")
add_ramp("ramp_wall_s_w", [-74, -418, -60, -398], 0.0, 9.9, "y", "wood_ladder", "南城墙西登城梯")
add_ramp("ramp_wall_n_e", [60, 542, 74, 562], 0.0, 9.9, "y", "wood_ladder", "北城墙东登城梯")
add_ramp("ramp_wall_n_w", [-74, 542, -60, 562], 0.0, 9.9, "y", "wood_ladder", "北城墙西登城梯")

# ---------- 4. 四大城门洞（城台实心，做门洞） ----------
add_portal("portal_wumen", [-6, -462, 6, -392], 0.0, "gate_tunnel", "午门正中门洞（贯通城台 66m）")
add_portal("portal_shenwu", [-6, 538, 6, 566], 0.0, "gate_tunnel", "神武门门洞")
add_portal("portal_donghua", [358, 65, 396, 79], 0.0, "gate_tunnel", "东华门门洞")
add_portal("portal_xihua", [-396, 65, -358, 79], 0.0, "gate_tunnel", "西华门门洞")
# 太和门 / 乾清门（门楼本体实心）
add_portal("portal_taihemen", [-6, -224, 6, -206], 0.0, "wood_gate", "太和门门洞")
add_portal("portal_qianqingmen", [-6, 184, 6, 202], 0.0, "wood_gate", "乾清门门洞")

# ---------- 5. 东西六宫 + 外东/西 各宫院门（自动按南墙中心开口） ----------
for o in objs:
    n = o["name"]
    if not (n.startswith("W6_") or n.startswith("WB_")):
        continue
    bb = o["bbox"]
    cx = (bb[0][0] + bb[1][0]) / 2
    ymin = bb[0][1]
    add_portal("portal_%s" % n.lower(), [cx - 7, ymin, cx + 7, ymin + 8],
               0.0, "wood_gate", "%s 南院门" % n)

# ---------- 应用通道到网格副本，跑连通性 ----------
MB = bytearray(B)
MH = array.array("H", H)


def apply_passage(p):
    ax0, ay0, ax1, ay1 = p["rect"]
    i0 = max(0, int((ax0 - x0) / step)); i1 = min(nx - 1, int((ax1 - x0) / step))
    j0 = max(0, int((ay0 - y0) / step)); j1 = min(ny - 1, int((ay1 - y0) / step))
    for j in range(j0, j1 + 1):
        for i in range(i0, i1 + 1):
            k = j * nx + i
            MB[k] = 0
            if p["type"] == "portal":
                MH[k] = int(p["h"] * 100)
            else:
                x = x0 + (i + .5) * step; y = y0 + (j + .5) * step
                if p["axis"] == "x":
                    t = (x - ax0) / max(1e-6, (ax1 - ax0))
                else:
                    t = (y - ay0) / max(1e-6, (ay1 - ay0))
                t = max(0.0, min(1.0, t))
                MH[k] = int((p["h0"] + (p["h1"] - p["h0"]) * t) * 100)


for p in passages:
    apply_passage(p)


def bfs(start_xy, maxstep=2.0):
    si = int((start_xy[0] - x0) / step); sj = int((start_xy[1] - y0) / step)
    vis = bytearray(nx * ny); dq = collections.deque([sj * nx + si]); vis[sj * nx + si] = 1
    while dq:
        k = dq.popleft(); i = k % nx; j = k // nx; h = MH[k] / 100
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ii, jj = i + di, j + dj
            if not (0 <= ii < nx and 0 <= jj < ny):
                continue
            kk = jj * nx + ii
            if vis[kk] or MB[kk] != 0:
                continue
            if abs(MH[kk] / 100 - h) > maxstep:
                continue
            vis[kk] = 1; dq.append(kk)
    return vis


vis = bfs(anchors["wumen_in"]["pos"][:2])
free = sum(1 for b in MB if b == 0)
print("reachable %d / free %d = %.1f%%" % (sum(vis), free, 100 * sum(vis) / free))
bad = []
for aid, a in anchors.items():
    x, y = a["pos"][:2]
    i = int((x - x0) / step); j = int((y - y0) / step)
    if not vis[j * nx + i]:
        # 就近 3 格
        ok = any(vis[jj * nx + ii] for ii in range(max(0, i - 3), min(nx, i + 4))
                 for jj in range(max(0, j - 3), min(ny, j + 4)))
        bad.append((aid, a["name"], "旁可达" if ok else "不可达"))
print("不可达锚点 %d:" % len(bad))
for b in bad:
    print("  ", b)

json.dump({"spawn": "wumen_in", "passages": passages,
           "note": "ramp=补的台阶/梯（引擎按矩形线性插值高度），portal=门洞/院门（强制可走）"},
          open(D + "passages.json", "w"), ensure_ascii=False, indent=1)
print("passages=%d -> data/passages.json" % len(passages))
