# -*- coding: utf-8 -*-
"""内容数据校验器：结构 + 交叉引用 + 数量盘点
用法: python3 tools_validate_content.py
"""
import json, os, re, sys, glob

D = os.path.dirname(os.path.abspath(__file__)) + "/data/"
errors, warns = [], []


def load(name, default=None):
    p = D + name
    if not os.path.exists(p):
        return default
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception as e:
        errors.append("%s JSON 解析失败: %s" % (name, e))
        return default


anchors = load("anchors.json", {}) or {}
A = set(anchors.keys())

npc_doc = load("content_npcs.json", {"npcs": []})
npcs = npc_doc.get("npcs", [])
NPC = {n.get("id") for n in npcs if isinstance(n, dict)}

clue_doc = load("content_clues.json", {"clues": []})
extra_doc = load("content_clues_extra.json", {"clues": []}) or {"clues": []}
auto_doc = load("content_clues_auto.json", {"clues": []}) or {"clues": []}
clues = clue_doc.get("clues", []) + extra_doc.get("clues", []) + auto_doc.get("clues", [])
CLUE = {c.get("id") for c in clues if isinstance(c, dict)}

chap = []
for f in ["content_chapters.json", "content_chapters_a.json", "content_chapters_b.json"]:
    d = load(f)
    if d:
        chap += d.get("chapters", [])

quests = []
for f in ["content_quests.json", "content_quests_a.json", "content_quests_b.json",
          "content_quests_side.json"]:
    d = load(f)
    if d:
        quests += d.get("quests", [])

dlg = {}
for f in ["content_dialogue.json", "content_dialogue_a.json", "content_dialogue_b.json"]:
    d = load(f)
    if d:
        dlg.update(d.get("trees", {}))

interiors = []
for f in ["content_interiors.json"]:
    d = load(f)
    if d:
        interiors += d.get("interiors", [])

INT = {i.get("id") for i in interiors if isinstance(i, dict)}

REQ = re.compile(r"^(flag:[\w\u4e00-\u9fa5]+|has_clue:\w+|trust:\w+>=\d+|chapter>=\d+|deduce:\w+)$")
GRA = re.compile(r"^(flag:[\w\u4e00-\u9fa5]+|clue:\w+|trust:\w+[+-]\d+|unlock:\w+|chapter:\d+|ending:\w+|code:\d+)$")

# ---------- NPC ----------
main_npc = 0
for n in npcs:
    nid = n.get("id")
    for k in ("id", "name", "title", "anchor", "trust0", "schedule", "lines"):
        if k not in n:
            errors.append("NPC %s 缺字段 %s" % (nid, k))
    if n.get("anchor") and n["anchor"] not in A:
        errors.append("NPC %s anchor 不存在: %s" % (nid, n["anchor"]))
    if n.get("home_anchor") and n["home_anchor"] not in A:
        errors.append("NPC %s home_anchor 不存在: %s" % (nid, n["home_anchor"]))
    for s in n.get("schedule", []) or []:
        if s.get("anchor") not in A:
            errors.append("NPC %s schedule anchor 不存在: %s" % (nid, s.get("anchor")))
        if not (0 <= s.get("from", 0) <= 24 and 0 <= s.get("to", 0) <= 24):
            errors.append("NPC %s schedule 时间越界" % nid)
    if len(n.get("schedule", []) or []) < 3:
        warns.append("NPC %s 日程少于 3 段" % nid)
    if n.get("trust0", 0) > 0:
        main_npc += 1

# ---------- Clue ----------
kinds = {"physical", "document", "testimony", "scene", "code"}
for c in clues:
    cid = c.get("id")
    for k in ("id", "name", "kind", "chapter", "desc", "detail"):
        if k not in c:
            errors.append("Clue %s 缺字段 %s" % (cid, k))
    if c.get("kind") not in kinds:
        errors.append("Clue %s kind 非法: %s" % (cid, c.get("kind")))
    if c.get("anchor") and c["anchor"] not in A:
        errors.append("Clue %s anchor 不存在: %s" % (cid, c["anchor"]))
    if c.get("interior") and c["interior"] not in INT:
        warns.append("Clue %s interior 未定义: %s" % (cid, c.get("interior")))
    if len(c.get("detail", "")) < 60:
        warns.append("Clue %s detail 偏短(%d)" % (cid, len(c.get("detail", ""))))
    for i in c.get("implies", []) or []:
        if i not in CLUE and CLUE:
            warns.append("Clue %s implies 指向不存在线索 %s" % (cid, i))
    if 1 <= c.get("chapter", 0) <= 14:
        pass
    else:
        errors.append("Clue %s chapter 越界" % cid)

# ---------- Chapter ----------
seen_ch = set()
for ch in chap:
    n = ch.get("n")
    if n in seen_ch:
        errors.append("章节重复定义: %s" % n)
    seen_ch.add(n)
    for k in ("n", "title", "intro", "open_regions"):
        if k not in ch:
            errors.append("Chapter %s 缺字段 %s" % (n, k))
    for r in ch.get("open_regions", []) or []:
        if not re.match(r"^r\d\d_\w+$", r):
            errors.append("Chapter %s region 名不合法: %s" % (n, r))
    if len(ch.get("intro", "")) < 80:
        warns.append("Chapter %s intro 偏短" % n)

# ---------- Quest ----------
qids = set()
for q in quests:
    qid = q.get("id")
    if qid in qids:
        errors.append("Quest id 重复: %s" % qid)
    qids.add(qid)
    if q.get("type") not in ("main", "side"):
        errors.append("Quest %s type 非法" % qid)
    if not q.get("steps"):
        errors.append("Quest %s 无 steps" % qid)
    if q.get("giver") and q["giver"] not in NPC and NPC:
        warns.append("Quest %s giver 不存在: %s" % (qid, q.get("giver")))
    for s in q.get("steps", []) or []:
        at = s.get("at") or {}
        kind = at.get("kind")
        if kind not in ("anchor", "npc", "interior", "clue", "deduce", "puzzle"):
            errors.append("Quest %s step %s at.kind 非法: %s" % (qid, s.get("id"), kind))
        if kind == "anchor" and at.get("anchor") not in A:
            errors.append("Quest %s step %s anchor 不存在: %s" % (qid, s.get("id"), at.get("anchor")))
        if kind == "npc" and at.get("npc") not in NPC and NPC:
            warns.append("Quest %s step %s npc 不存在: %s" % (qid, s.get("id"), at.get("npc")))
        if kind == "interior" and at.get("interior") not in INT and INT:
            warns.append("Quest %s step %s interior 未定义: %s" % (qid, s.get("id"), at.get("interior")))
        if kind == "clue" and at.get("clue") not in CLUE and CLUE:
            warns.append("Quest %s step %s clue 不存在: %s" % (qid, s.get("id"), at.get("clue")))
        for r in s.get("requires", []) or []:
            if not REQ.match(str(r)):
                errors.append("Quest %s step %s requires 语法错误: %s" % (qid, s.get("id"), r))
        for g in s.get("grants", []) or []:
            if not GRA.match(str(g)):
                errors.append("Quest %s step %s grants 语法错误: %s" % (qid, s.get("id"), g))
            if str(g).startswith("clue:") and CLUE and str(g)[5:] not in CLUE:
                warns.append("Quest %s grants 不存在的 clue: %s" % (qid, g))

# ---------- Dialogue ----------
for nid, tree in dlg.items():
    if NPC and nid not in NPC:
        warns.append("Dialogue 树属于不存在的 NPC: %s" % nid)
    nodes = tree.get("nodes", {})
    if tree.get("start") not in nodes:
        errors.append("Dialogue %s start 节点不存在" % nid)
    for key, nd in nodes.items():
        if "text" not in nd:
            errors.append("Dialogue %s/%s 缺 text" % (nid, key))
        for ch in nd.get("choices", []) or []:
            if ch.get("goto") and ch["goto"] not in nodes:
                errors.append("Dialogue %s/%s goto 不存在: %s" % (nid, key, ch.get("goto")))
            for cond in ch.get("if", []) or []:
                if not REQ.match(str(cond)):
                    errors.append("Dialogue %s/%s if 语法错误: %s" % (nid, key, cond))
        if nd.get("goto") and nd["goto"] not in nodes:
            errors.append("Dialogue %s/%s goto 不存在: %s" % (nid, key, nd.get("goto")))
        for eff in nd.get("effects", []) or []:
            if not GRA.match(str(eff)):
                errors.append("Dialogue %s/%s effects 语法错误: %s" % (nid, key, eff))
    if len(nodes) < 8:
        warns.append("Dialogue %s 节点仅 %d 个(建议 ≥8)" % (nid, len(nodes)))

# ---------- Interior ----------
ALLOWED_PROPS = {"dragon_throne", "screen", "braziers", "desk", "archive_shelf", "bed",
                 "columns_row",  # DESIGN.md 4.6: columns_row:N
                 "altar", "banners", "chests", "lantern_row", "map_table",
                 "medicine_cabinet", "weapon_rack", "well", "stone_coffin", "scroll_rack"}
for it in interiors:
    for k in ("id", "name", "w", "d", "h"):
        if k not in it:
            errors.append("Interior %s 缺字段 %s" % (it.get("id"), k))
    for p in it.get("props", []) or []:
        base = str(p).split(":")[0]
        if base not in ALLOWED_PROPS:
            errors.append("Interior %s prop 未定义: %s" % (it.get("id"), p))

# ---------- 汇总 ----------
print("=" * 62)
print("NPC            %2d 个（trust0>0 的主要角色 %d）" % (len(npcs), main_npc))
print("章节           %2d 章 / 1-14 覆盖: %s" % (len(chap), sorted(seen_ch)))
print("任务           %2d 个（main %d / side %d）" % (
    len(quests), sum(1 for q in quests if q.get("type") == "main"),
    sum(1 for q in quests if q.get("type") == "side")))
print("任务步骤       %2d" % sum(len(q.get("steps", []) or []) for q in quests))
print("线索/证据      %2d 条（code %d）" % (len(clues), sum(1 for c in clues if c.get("kind") == "code")))
print("对话树         %2d 棵 / 节点 %d" % (len(dlg), sum(len(t.get("nodes", {})) for t in dlg.values())))
print("室内场景       %2d 个" % len(interiors))
print("=" * 62)
for w in warns[:80]:
    print("WARN  " + w)
if len(warns) > 80:
    print("WARN  ... 另有 %d 条" % (len(warns) - 80))
for e in errors[:80]:
    print("ERROR " + e)
if len(errors) > 80:
    print("ERROR ... 另有 %d 条" % (len(errors) - 80))
print("ALL_CONTENT_OK" if not errors else "CONTENT_HAS_ERRORS %d" % len(errors))
sys.exit(0 if not errors else 1)
