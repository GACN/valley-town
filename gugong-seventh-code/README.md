# 宫阙疑云：第七码

> 第一人称 · 开放地图 · 长篇悬疑推理。用一座真实尺度的紫禁城白模，做成能在手机浏览器里走完 14 章的游戏。

在线玩（手机横屏最佳）：

```
https://gacn.github.io/valley-town/gugong-seventh-code/
```

- 卡顿加 `?q=low`：`.../gugong-seventh-code/?q=low`
- 打不开先看自检页：`.../gugong-seventh-code/diag.html`
- 本地跑：`bash start.sh`（自动打印当前局域网地址）或 `python3 serve.py 8123`

---

## 一、这是什么

架空朝代的紫禁城：宫廷档案官林照月雨夜从东北角楼坠亡，官方定为失足。监察使裴景衡私下请你（外来调查员）重查。表面上一切指向禁军统领韩砚，实际牵出十五年前档案库大火与一份被拆成七份的秘密账册《第七码》。

- 14 章主线，4 种结局（真相大白 / 冤案 / 沉默交易 / 隐藏结局）
- 98 个任务（62 主线 + 36 支线），348 个任务步骤
- 130 条可调查线索（含 7 份第七码）；线索在关联板上互相关联，成立才写入推理链
- 22 名 NPC，各有日程（按小时在不同地点走动）、信任度、知道与隐瞒的事
- 14 个可进入的殿宇室内场景，63 个室内可调查点
- 昼夜、雨雪雾、灯笼照明；时间会走（1 游戏小时 ≈ 90 秒）

## 二、地图从哪来

不是新建地图，是把已有的 Blender 白模（`gugong_cam.blend`，961 × 753 m 真实尺度、4180 个构件、49.8 万顶点）直接搬进浏览器：

1. `model-source/export_game.py` — 按语义分区（午门 / 太和门 / 三台 / 内廷 / 御花园 / 神武门 / 东西六宫 / 外东外西 / 城墙广场）合并导出 11 个 GLB。
2. `model-source/walk_grid3.py` — 对全城射线采样，生成 1.5 m 精度可行走网格（高度场 + 阻挡图）。判定用「顶面归属法」：某格最高的面属于地形层（广场/台基/三台/踏跺/金水桥/城墙）→ 可站；属于建筑构件（屋顶/墙身/栏杆）→ 阻挡。
3. 原模型是**纯外壳**（门洞未开洞、殿内无楼板），因此补了 35 条「授权通道」：三台与内廷台基台阶、城墙登城梯、四大城门门洞、18 组宫院院门；殿内做成独立室内场景（`js/interior.js` 按规格程序化生成）。

实测：52 个关卡锚点全部可站，从午门出发 98.2% 可走格连通；广场 0 m、太和殿月台 8.13 m、内廷台基 3.0 m 高度正确；宫墙不可穿越，门洞可穿行。

## 三、怎么玩

| 想干什么 | 手机 | 键盘 |
|---|---|---|
| 移动 | 左下摇杆 | W A S D |
| 跑 | 摇杆推到底 / 「疾行」 | Shift |
| 转视角 | 右半屏拖动 | 鼠标拖动 |
| 调查 / 交谈 / 进入 / 推门 | 右下「调查」「交谈」 | E |
| 选对话 | 点选项 | 1-4，0 离开 |
| 证据 / 任务 / 人物 / 推理 / 推演 / 地图 / 日志 | 底部导航 | V / J / K / B / M |

第十章有一个真的时间线题：把当夜七件事排进六个更次，三更鼓必须和那声闷响同刻；排错会告诉你错几处。

## 四、技术结构

```
index.html / css/ui.css        页面壳与 HUD/面板样式
js/main.js                     组装、交互、POI 对象池、结局判定
js/world.js                    渲染器、光照、天穹 shader、雨雪雾、分区流式加载、授权通道道具
js/player.js                   第一人称碰撞（走格数据，不依赖 three 物理）、坡度与台阶
js/npc.js                      程序化人物、日程、A* + 侧向脱困寻路
js/interior.js                 14 个室内场景生成（柱、龙椅、书架、药柜、兵器架…）
js/state.js                    旗标/证据/信任/推理/任务/存档
js/dialogue.js                 对话树引擎（条件 + 效果 + 打字机）
js/ui.js                       HUD、七个面板、对话、结局
js/audio.js                    WebAudio 合成音效（雨、风、脚步、钟、UI）
data/                          走格数据、锚点、通道、剧情内容、小地图
vendor/three/                  three r180 + GLTFLoader + BufferGeometryUtils（全本地，无 CDN）
assets/glb/                    11 个分区模型（合计 39 MB）
model-source/                  白模生成脚本、模块库、渲染预览、白模说明页
tools_*.py|mjs                 内容校验、线索对齐、逻辑测试、全流程推演
```

画质三档（高/中/低）控制像素比、阴影贴图、雾距、粒子数、分区加载半径。POI 网格用对象池（最多 22 个）；楼梯按段合并几何体（draw call 310 → 217）。

## 五、已验证 / 未验证

脚本实测（`tools_test_logic.mjs` / `tools_sim_playthrough.mjs` / `tools_validate_content.py`）：

- 52 个锚点全部可站；三台补梯可从 0 走到 8.13 m；南墙不可穿，午门门洞可穿出
- 14 章任务链全通：346 步走完，7 码齐，39 条推理，0 卡死步骤，0 悬空线索引用，22 棵对话树节点全可达
- 存档往返一致；四种结局判定矩阵正确

未验证：真机像素与帧率。本机无头 Chromium 的 SwiftShader 在这种规模下会丢 WebGL 上下文，画面需在真实手机上确认。

## 六、再生成

```bash
# 需要 Blender 4.0（含 numpy）与原始 gugong_cam.blend
blender -b gugong_cam.blend -P model-source/export_game.py     # 分区 GLB
blender -b gugong_cam.blend -P model-source/walk_grid3.py      # 走格网格
python3 tools_make_anchors.py && python3 tools_make_passages.py && python3 tools_make_minimap.py
python3 tools_validate_content.py && node tools_test_logic.mjs && node tools_sim_playthrough.mjs
```

原始 `.blend`（55–57 MB ×4）未入库，生成脚本与渲染预览在 `model-source/`。
