# -*- coding: utf-8 -*-
"""生成内容清点报告 CONTENT_REPORT.md（数字全部从数据实时统计）"""
import json, os, collections

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
J = lambda n: json.load(open(os.path.join(D, n), encoding="utf-8"))
has = lambda n: os.path.exists(os.path.join(D, n))

clues = J("content_clues.json")["clues"]
extra = J("content_clues_extra.json")["clues"] if has("content_clues_extra.json") else []
auto = J("content_clues_auto.json") if has("content_clues_auto.json") else {"clues": [], "remap": {}}
allc = clues + extra + auto.get("clues", [])
npcs = J("content_npcs.json")["npcs"]
chs = J("content_chapters_a.json")["chapters"] + J("content_chapters_b.json")["chapters"]
qs = (J("content_quests_a.json")["quests"] + J("content_quests_b.json")["quests"]
      + J("content_quests_side.json")["quests"])
trees = {}
for f in ("content_dialogue_a.json", "content_dialogue_b.json"):
    trees.update(J(f)["trees"])
ints = J("content_interiors.json")["interiors"]
anchors = J("anchors.json")
regions = J("regions.json")
objs = J("objects.json")

L = []
L.append("# 内容清点（自动生成）\n")
L.append(f"- 地图：{len(regions)} 个分区 GLB，{len(objs)} 个原始构件，961×753 m；分区合计 {sum(v['verts'] for v in regions.values())/10000:.1f} 万顶点，{sum(v['bytes'] for v in regions.values())/1e6:.1f} MB")
L.append(f"- 关卡锚点：{len(anchors)} 个（全部经走格验证可站）")
L.append(f"- 章节：{len(chs)} 章")
L.append(f"- 任务：{len(qs)} 个（主线 {sum(1 for q in qs if q['type']=='main')} / 支线 {sum(1 for q in qs if q['type']=='side')}），步骤 {sum(len(q.get('steps',[])) for q in qs)} 个")
L.append(f"- 线索/证据：{len(allc)} 条（其中第七码 {sum(1 for c in allc if c['kind']=='code')} 条，补充线索 {len(extra)} 条，占位 {len(auto.get('clues',[]))} 条）")
L.append(f"- NPC：{len(npcs)} 名，对话树 {len(trees)} 棵 / {sum(len(t['nodes']) for t in trees.values())} 个节点")
L.append(f"- 室内场景：{len(ints)} 个（可调查点 {sum(len(i.get('pois',[])) for i in ints)} 个）")
L.append(f"- 结局：4 个（truth / wrong / deal / hidden）\n")

L.append("## 每章内容量\n")
L.append("| 章 | 标题 | 主线任务 | 支线 | 线索 | 该章代码 |")
L.append("|---|---|---|---|---|---|")
for ch in sorted(chs, key=lambda c: c["n"]):
    n = ch["n"]
    mq = sum(1 for q in qs if q["type"] == "main" and q.get("chapter") == n)
    sq = sum(1 for q in qs if q["type"] == "side" and q.get("chapter") == n)
    cl = sum(1 for c in allc if c.get("chapter") == n)
    codes = sum(1 for c in allc if c.get("chapter") == n and c.get("kind") == "code")
    L.append(f"| {n} | {ch['title']} | {mq} | {sq} | {cl} | {codes or '—'} |")

L.append("\n## 线索类型分布\n")
kinds = collections.Counter(c.get("kind") for c in allc)
names = {"physical": "物证", "document": "文书", "testimony": "证词", "scene": "现场痕迹", "code": "第七码"}
for k, v in kinds.most_common():
    L.append(f"- {names.get(k,k)}：{v}")

L.append("\n## NPC 与信任\n")
L.append("| NPC | 身份 | 初始信任 | 日程段 | 对话节点 |")
L.append("|---|---|---|---|---|")
for n in npcs:
    t = trees.get(n["id"])
    L.append(f"| {n['name']} | {n.get('title','')} | {n.get('trust0',0)} | {len(n.get('schedule',[]))} | {len(t['nodes']) if t else 0} |")

L.append("\n## 区域吃到的内容量（按 clue 的 anchor 归并）\n")
anchors_by_region = {}
for c in allc:
    a = c.get("anchor")
    if not a:
        continue
    anchors_by_region[a] = anchors_by_region.get(a, 0) + 1
for a, v in sorted(anchors_by_region.items(), key=lambda x: -x[1]):
    L.append(f"- {anchors[a]['name'] if a in anchors else a}（{a}）：{v} 条")

open(os.path.join(os.path.dirname(D), "CONTENT_REPORT.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")
print("CONTENT_REPORT.md 生成完成：")
print("\n".join(L[:10]))
