# -*- coding: utf-8 -*-
"""从可用走网格生成游戏小地图 + 走位体检
输出: data/minimap.png (小地图，供 UI 与自检), data/minimap_meta.json
"""
import json, array, math
from PIL import Image, ImageDraw

D = "/storage/emulated/0/Music/每日归档/2026-11/gugong/game/data/"
m = json.load(open(D + "walk_meta.json"))
nx, ny, step, x0, y0 = m["nx"], m["ny"], m["step"], m["x0"], m["y0"]
h = array.array("H"); h.frombytes(open(D + "height.bin", "rb").read())
b = open(D + "blocked.bin", "rb").read()

SC = 1.0 / step  # 每格像素
W, H = nx, ny
img = Image.new("RGB", (W, H), (10, 12, 16))
px = img.load()
for j in range(H):
    for i in range(W):
        k = j * nx + i
        hh = h[k] / 100.0
        blk = b[k]
        if blk == 2:
            px[i, H - 1 - j] = (18, 34, 52)          # 水
        elif blk == 1:
            shade = int(min(255, 60 + hh * 6))
            px[i, H - 1 - j] = (shade, shade // 2, shade // 3)  # 建筑/阻挡：暖色
        else:
            shade = int(min(255, 26 + hh * 10))
            px[i, H - 1 - j] = (shade, shade + 6, shade + 14)   # 可走：冷灰
d = ImageDraw.Draw(img)
d.line([(0, 0), (0, H)], fill=(70, 60, 40))
# 中轴标记
def mark(x, y, txt, col=(255, 200, 90)):
    i = int((x - x0) * SC); j = int((y - y0) * SC)
    d.ellipse([i - 3, H - 1 - j - 3, i + 3, H - 1 - j + 3], fill=col)
    d.text((i + 5, H - 1 - j - 5), txt, fill=col)

for (x, y, t) in [(0, -409, "Wumen"), (0, -228, "Taihemen"), (0, 0, "Taihedian"),
                  (0, 112, "Baohedian"), (0, 180, "Qianqingmen"), (0, 232, "Qianqinggong"),
                  (0, 305, "Kunninggong"), (0, 400, "Yuhuayuan"), (0, 544, "Shenwumen"),
                  (-376, -409, "SW tower"), (376, 552, "NE tower")]:
    mark(x, y, t)
img.save(D + "minimap.png")
print("minimap", img.size)

# 体检：抽样区域的可行走比例
def area_stats(name, ax0, ay0, ax1, ay1):
    tot = walk = water = blk = 0
    hs = []
    for j in range(ny):
        y = y0 + (j + .5) * step
        if not (ay0 <= y <= ay1):
            continue
        for i in range(nx):
            x = x0 + (i + .5) * step
            if not (ax0 <= x <= ax1):
                continue
            k = j * nx + i
            tot += 1
            if b[k] == 0:
                walk += 1; hs.append(h[k] / 100)
            elif b[k] == 2:
                water += 1
            else:
                blk += 1
    if tot:
        avg = sum(hs) / len(hs) if hs else 0
        print("%-22s cells=%-6d walk=%-5.0f%% water=%-4d blocked=%-5d avgH=%.2f" % (
            name, tot, 100.0 * walk / tot, water, blk, avg))

area_stats("午门区 y<-360", -400, -440, 400, -360)
area_stats("太和门区", -400, -360, 400, -150)
area_stats("三大殿三台", -200, -150, 200, 150)
area_stats("内廷", -150, 150, 150, 340)
area_stats("御花园", -120, 340, 120, 500)
area_stats("神武门", -150, 500, 150, 580)
area_stats("东六宫", 60, 150, 220, 340)
area_stats("西六宫", -240, 150, -60, 340)
area_stats("外东路", 100, -300, 400, 400)
area_stats("外西路", -400, -300, -100, 400)
area_stats("城墙顶带", -390, -415, 390, -395)
json.dump({"minimap": "data/minimap.png", "px_per_cell": 1, "note": "y 轴已翻转，北在上"},
          open(D + "minimap_meta.json", "w"), ensure_ascii=False, indent=1)
