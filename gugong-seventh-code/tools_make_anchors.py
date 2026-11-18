# -*- coding: utf-8 -*-
"""从走格数据 + 物件索引计算关卡锚点：每个景点给一个"真能站人"的坐标
输出 data/anchors.json
"""
import json, array, math

D = "/storage/emulated/0/Music/每日归档/2026-11/gugong/game/data/"
m = json.load(open(D + "walk_meta.json"))
nx, ny, step, x0, y0 = m["nx"], m["ny"], m["step"], m["x0"], m["y0"]
H = array.array("H"); H.frombytes(open(D + "height.bin", "rb").read())
B = open(D + "blocked.bin", "rb").read()


def cell_at(x, y):
    i = int((x - x0) / step); j = int((y - y0) / step)
    if 0 <= i < nx and 0 <= j < ny:
        return j * nx + i
    return None


def walkable_point(x, y, maxr=30.0):
    """在 (x,y) 附近找最近的可行走格，返回 (x,y,z,dist)"""
    best = None
    for r in range(0, int(maxr / step) + 1):
        rr = r * step
        n = max(1, int(2 * math.pi * r))
        for t in range(n):
            a = 2 * math.pi * t / n
            px = x + rr * math.cos(a); py = y + rr * math.sin(a)
            k = cell_at(px, py)
            if k is None or B[k] != 0:
                continue
            # 周围 8 格也要能走，避免贴墙角
            okc = 0
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    i = int((px - x0) / step) + dx; j = int((py - y0) / step) + dy
                    if 0 <= i < nx and 0 <= j < ny and B[j * nx + i] == 0:
                        okc += 1
            if okc >= 9:
                d = math.hypot(px - x, py - y)
                if best is None or d < best[3]:
                    best = (round(px, 1), round(py, 1), round(H[k] / 100, 2), round(d, 1))
        if best and best[3] <= rr:
            break
    return best


PLACES = [
    # id, 显示名, 候选 (x,y)
    ("wumen_in", "午门门内广场", (0, -380)),
    ("wumen_out", "午门外", (0, -440)),
    ("taihemen", "太和门", (0, -215)),
    ("taihemen_plaza", "太和门广场", (0, -300)),
    ("jinshui", "内金水桥", (0, -160)),
    ("taihedian_yuetai", "太和殿月台", (0, -22)),
    ("taihedian_front", "太和殿前广场", (0, -110)),
    ("zhonghedian", "中和殿", (0, 58)),
    ("baohedian", "保和殿", (0, 112)),
    ("santai_east", "三台东侧", (72, 0)),
    ("santai_west", "三台西侧", (-72, 0)),
    ("qianqingmen", "乾清门", (0, 190)),
    ("qianqinggong", "乾清宫", (0, 250)),
    ("jiaotaidian", "交泰殿", (0, 275)),
    ("kunninggong", "坤宁宫", (0, 325)),
    ("yuhuayuan", "御花园", (0, 400)),
    ("qinandian", "钦安殿", (0, 392)),
    ("wanchunting", "万春亭", (-26, 372)),
    ("qianqiuting", "千秋亭", (26, 372)),
    ("duixiushan", "堆秀山", (48, 443)),
    ("shenwumen", "神武门", (0, 520)),
    ("tower_ne", "东北角楼", (365, 540)),
    ("tower_nw", "西北角楼", (-365, 540)),
    ("tower_se", "东南角楼", (365, -398)),
    ("tower_sw", "西南角楼", (-365, -398)),
    ("wall_south_top", "南城墙", (60, -402)),
    ("corr_east", "东长街", (95, -80)),
    ("corr_west", "西长街", (-95, -80)),
    ("huamen_e", "东华门内", (350, 20)),
    ("huamen_w", "西华门内", (-350, 20)),
    ("garden_east", "御花园东路", (70, 400)),
    ("garden_west", "御花园西路", (-70, 400)),
    ("neiting_east_street", "内廷东街", (60, 270)),
    ("neiting_west_street", "内廷西街", (-60, 270)),
]

# 东西六宫 + 外东/外西 由物件中心推导
W6_NAMES = {"CCG": "长春宫", "CQG": "承乾宫", "CXG": "储秀宫", "XFG": "咸福宫",
            "YSG": "永寿宫", "YKG": "翊坤宫", "TJG": "太极殿",
            "JRG": "景仁宫", "JYG": "景阳宫", "YHG": "永和宫",
            "YXG": "延禧宫", "ZCG": "钟粹宫"}
WB_NAMES = {"CNG": "慈宁宫", "FXD": "奉先殿", "NSG": "宁寿宫", "WHG": "文华殿",
            "WYG": "武英殿", "YXD": "咸安宫"}

objs = json.load(open(D + "objects.json"))
for o in objs:
    n = o["name"]
    if n.startswith("W6_") and n[3:] in W6_NAMES:
        cx = (o["bbox"][0][0] + o["bbox"][1][0]) / 2
        cy = (o["bbox"][0][1] + o["bbox"][1][1]) / 2
        PLACES.append(("w6_" + n[3:].lower(), W6_NAMES[n[3:]], (cx, cy - 26)))
    elif n.startswith("WB_") and n[3:] in WB_NAMES:
        cx = (o["bbox"][0][0] + o["bbox"][1][0]) / 2
        cy = (o["bbox"][0][1] + o["bbox"][1][1]) / 2
        PLACES.append(("wb_" + n[3:].lower(), WB_NAMES[n[3:]], (cx, cy - 40)))

out = {}
fails = []
for pid, name, (x, y) in PLACES:
    p = walkable_point(x, y)
    if p:
        out[pid] = {"id": pid, "name": name, "pos": [p[0], p[1], p[2]],
                    "target": [x, y], "offset": p[3]}
    else:
        fails.append((pid, name, x, y))
json.dump(out, open(D + "anchors.json", "w"), ensure_ascii=False, indent=1)
print("anchors=%d fails=%d" % (len(out), len(fails)))
for k, v in out.items():
    print("  %-22s %-12s pos=%s off=%s" % (k, v["name"], v["pos"], v["offset"]))
for f in fails:
    print("  FAIL", f)
