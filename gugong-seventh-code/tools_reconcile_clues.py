# -*- coding: utf-8 -*-
"""线索引用对齐：任务/对话里引用了不存在的 clue id 时，
优先模糊匹配到已有线索上；匹配不到就用「补齐线索」占位（写入 content_clues_auto.json）。
不覆盖代理写的 content_clues.json。
"""
import json, os, re, difflib

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")


def load(name, default=None):
    p = os.path.join(D, name)
    if not os.path.exists(p):
        return default
    return json.load(open(p, encoding="utf-8"))


clues = load("content_clues.json", {"clues": []})["clues"]
extra = load("content_clues_extra.json", {"clues": []}) or {"clues": []}
clues = clues + extra.get("clues", [])
by_id = {c["id"]: c for c in clues}
anchors = load("anchors.json", {})
npcs = load("content_npcs.json", {"npcs": []})["npcs"]

refs = set()
where = {}
for f in ("content_quests_a.json", "content_quests_b.json", "content_quests_side.json"):
    d = load(f, {"quests": []})
    for q in d["quests"]:
        for s in q.get("steps", []) or []:
            at = s.get("at") or {}
            if at.get("kind") == "clue" and at.get("clue"):
                refs.add(at["clue"]); where.setdefault(at["clue"], f"{q['id']}/{s['id']}")
            for g in s.get("grants", []) or []:
                if str(g).startswith("clue:"):
                    cid = str(g)[5:]
                    refs.add(cid); where.setdefault(cid, f"{q['id']}/{s['id']}")

for f in ("content_dialogue_a.json", "content_dialogue_b.json"):
    d = load(f, {"trees": {}})
    for npc, tree in d.get("trees", {}).items():
        for nid, nd in (tree.get("nodes") or {}).items():
            effs = list(nd.get("effects") or [])
            for ch in nd.get("choices") or []:
                effs += list(ch.get("effects") or [])
            for e in effs:
                if str(e).startswith("clue:"):
                    cid = str(e)[5:]
                    refs.add(cid); where.setdefault(cid, f"dialogue:{npc}/{nid}")
            for cond in (nd.get("if") or []):
                if str(cond).startswith("has_clue:"):
                    refs.add(str(cond)[9:])

dangling = sorted(r for r in refs if r not in by_id)
print("已定义线索 %d 条，被引用 %d 个 id，缺 %d 个" % (len(clues), len(refs), len(dangling)))

# 章节 → 该章第一个任务锚点，用于给占位线索找落点
chapter_anchor = {}
for f in ("content_quests_a.json", "content_quests_b.json"):
    d = load(f, {"quests": []})
    for q in d["quests"]:
        ch = q.get("chapter", 1)
        for s in q.get("steps", []) or []:
            at = s.get("at") or {}
            if at.get("kind") == "anchor" and at.get("anchor"):
                chapter_anchor.setdefault(ch, at["anchor"])
                break

existing_ids = list(by_id.keys())
auto = []
remap = {}
for cid in dangling:
    m = re.match(r"c(\d+)_", cid)
    ch = int(m.group(1)) if m else 1
    # 模糊匹配：同章 + 后缀相似
    cands = [e for e in existing_ids if e.startswith("c%d_" % ch)]
    best = None
    for c in cands:
        r = difflib.SequenceMatcher(None, cid, c).ratio()
        if r > 0.72 and (best is None or r > best[1]):
            best = (c, r)
    if best:
        remap[cid] = best[0]
        continue
    slug = cid[3:] if m else cid
    anchor = chapter_anchor.get(ch) or (list(anchors.keys())[0] if anchors else None)
    auto.append({
        "id": cid,
        "name": "补充线索：" + slug.replace("_", " "),
        "kind": "scene" if "print" in slug or "trace" in slug or "mud" in slug else "document",
        "chapter": ch,
        "anchor": anchor,
        "interior": None,
        "desc": "调查中记下的一处细节。",
        "detail": "（由任务引用、原文尚未细写的线索。位置与内容沿用该章调查路线：%s。可在此处补写 120-260 字的说明。）" % where.get(cid, ""),
        "tags": ["补充"],
        "implies": [],
        "weight": 1,
        "auto": True,
    })

out = {"clues": auto, "remap": remap,
       "note": "autogen：任务/对话引用了未定义的线索；remap 为模糊对到已有线索的映射"}
json.dump(out, open(os.path.join(D, "content_clues_auto.json"), "w"), ensure_ascii=False, indent=1)
print("模糊对齐 %d 个，补齐占位 %d 个 -> data/content_clues_auto.json" % (len(remap), len(auto)))
if remap:
    for k, v in list(remap.items())[:12]:
        print("   %-28s -> %s" % (k, v))
