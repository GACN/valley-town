# 故宫白模工程 · 模块契约（所有 agent 必须遵守）

工作目录：`/storage/emulated/0/Music/每日归档/2026-11/gugong/`

## 运行环境
- Blender 4.0.2 在 droidspaces 容器 `burj` 内，**只能在容器里跑**
- Termux 侧命令模板：
  `su -c '/data/local/Droidspaces/bin/droidspaces --name=burj run /bin/bash -c "cd /sdcard/Music/每日归档/2026-11/gugong && blender -b --factory-startup -P <脚本> 2>&1 | tail -30"'`
- **只允许跑「建模型 smoke test」，禁止跑渲染**（8 核共享，渲染会互相拖死）。
- 语法自查（Termux 本地，不占容器）：
  `python3 -m py_compile lib/<你的模块>.py`

## 坐标与单位
- 单位：**米**，Z 轴向上。
- 原点：太和殿殿身中心；Z=0 = 太和殿广场地面。
- +X = 东，+Y = 北，-Y = 南。
- 所有殿宇**正面朝南（-Y）**。

## 文件约定
每个模块：`lib/mod_xxx.py`，必须暴露：

```python
def build(c=None):
    """往当前 scene 里加对象，返回 list[Object]。"""
```

模块内部：`import common as G` / `import hall as H`（sys.path 由加载器 `build.py` 处理，写模块时不要自己改 path）。

## 通用库 API（`lib/common.py`，别重复造轮子）
| 函数 | 说明 |
|---|---|
| `box(name, sx, sy, sz, loc, rot, c, bottom=True)` | 长方体，bottom=True 时底面贴 loc.z |
| `cylinder(name, r, h, loc, seg, r2, c)` | 圆柱/圆台 |
| `new_mesh/mesh 顶点面` | 低层建面 |
| `beam_between(name, p0, p1, w, h, c, extend)` | 两点间方料（脊/梁/椽） |
| `roof_hip(name, width, depth, z_eave, z_ridge, ridge_frac, curve, upturn, seg_u, seg_v, c, thick, ribs)` | **庑殿顶**（四坡五脊），ribs=瓦垄条数 |
| `roof_xieshan(name, width, depth, z_eave, z_ridge, curve, upturn, seg_u, seg_v, c, thick)` | 歇山顶近似 |
| `roof_pyramid(name, size, z_eave, z_ridge, curve, upturn, seg, c, thick)` | 四角攒尖 |
| `ridge_beam(name, length, h, w, loc, rot, c)` | 正脊 |
| `column_row/column_grid(name, xs, ys, z, r, h, c)` | 檐柱+柱础 |
| `dougong_row(name, x0, x1, y, z, step, d, h, c)` | 沿 X 的斗拱带 |
| `dougong_row_y(name, y0, y1, x, z, step, d, h, c)` | 沿 Y 的斗拱带 |
| `balustrade(name, x0,y0,x1,y1, z, h, step, c)` | 望柱+栏板直线段 |
| `balustrade_ring(name, w, d, z, h, step, c, cx, cy)` | 一圈栏杆 |
| `stairs(name, width, rise, run, z0, loc, steps, c, rot_z)` | 踏跺，**rise=总高** |
| `terrace(name, w, d, h, loc, c)` | 台基 |
| `sumeru(name, w, d, h, loc, c)` | 须弥座（带线脚收分） |
| `lattice(name, w, h, z, loc, c, cols, rows, bar, rot_z)` | 隔扇/槛窗格心 |
| `wall_run(name, pts, z0, h, t, c)` | 折线墙 |
| `crenellation(name, x0,y0,x1,y1, z, h, w, gap, c)` | 城墙垛口 |
| `tree(name, loc, h, r, c)` | 树（柱+锥形冠） |
| `corridor(name, x0,y0,x1,y1, z0, height, width, bays, c)` | 廊庑 |
| `join(objs, name)` | 合并对象（出口前务必合并，控制对象数） |

`lib/hall.py`：`hall(name, w, d, z0, body_h, style='hip'|'xieshan'|'pyramid', double=True, oh, bay_x, bay_y, ridge_frac, upturn, curve, door_bays, c, wall)` → `(objs, ridge_z)`。
- `w,d` = **柱网外包**尺寸；`body_h` = 台面到正脊的高度。
- 内部已经含台明、柱网、隔扇、额枋、斗拱、下檐、上层墙身、上檐、正脊、鸱吻、垂脊。

## 总平面（真实尺度基准，必须按此摆位）
城墙：南北 961m、东西 753m、总长 3428m、高 9.90m、底宽 8.62m、顶宽 6.66m。护城河宽 52m。
坐标：南墙 `y=-409`，北墙 `y=+552`，东西墙 `x=±376.5`。

| 建筑 | 中心 y | 面阔×进深(m) | 屋顶 | 通高(m) |
|---|---|---|---|---|
| 午门 | -409 | 城台 60×? 凹形 | 重檐庑殿+四阙亭 | 37.95 |
| 太和门 | -228 | 40×20（9间3进） | 重檐歇山 | 23.8 |
| 太和殿 | 0 | 63.96×37.2（11间5进） | 重檐庑殿 | 35.05（含三台 8.13） |
| 中和殿 | +58 | 24.15×24.15（5间） | 单檐攒尖 | 27 |
| 保和殿 | +112 | 49.68×24.97（9间5进） | 重檐歇山 | 29.5 |
| 乾清门 | +180 | 5间 | 单檐歇山 | ~16 |
| 乾清宫 | +232 | 45×21（9间5进） | 重檐庑殿 | ~20 |
| 交泰殿 | +275 | 3间方形 | 单檐攒尖 | ~14 |
| 坤宁宫 | +305 | 9间 | 重檐庑殿 | ~18 |
| 御花园 | +345…+470 | 东西 140 | — | — |
| 神武门 | +552 | 城台+城楼 | 重檐庑殿 | 31 |
| 角楼 | 四角 | 十字歇山三重檐 | 27.5 |

三台（三大殿共用的三层汉白玉台基）：南北 232（-116…+116）、东西 130、高 8.13。

## 硬性要求
1. **尺度真实**：上表数值直接写进代码，不要凭感觉。
2. **对象数控制**：单个模块出口 `G.join(...)` 或分组合并，尽量 < 200 个对象。
3. **不要碰**别人的模块文件；只写自己的 `lib/mod_xxx.py`。
4. 提交前必须：`python3 -m py_compile` 通过 + 用 smoke 脚本（见下）实际建出模型不报错。
5. 报告里写清：对象数、关键坐标、你自行估计（无官方数据）的维度。

## smoke test
```bash
cat > /tmp/chk.py <<'EOF'
import bpy, sys, os
sys.path.append("/sdcard/Music/每日归档/2026-11/gugong/lib")
import importlib
G = importlib.import_module("common")
bpy.ops.wm.read_factory_settings(use_empty=True)
C = G.coll("T")
mod = importlib.import_module("MODNAME")
obs = mod.build(c=C)
print("SMOKE_OK objects=%d" % len(obs))
EOF
```
注意：容器里 `/tmp` 可能不可写，脚本一律写到 `/sdcard/Music/每日归档/2026-11/gugong/` 下。
