#!/usr/bin/env python3
"""修正版：选项标号误报修复 + 选项文本对齐验证（官方卷 vs 题库选项顺序是否一致）"""
import json, re, sys, unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "src" / "data"

def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s)
    s = re.sub(r"\s+", "", s)
    return s

th = json.loads((ROOT / "theory.json").read_text())
mk = json.loads((ROOT / "mock190.json").read_text())
ai = json.loads((ROOT / "aiAnswers.json").read_text())

# ---- A 修正：multi 选项标号 ----
bad_labels = []
for t in ("judge", "single", "multi"):
    for q in th[t]:
        if t == "judge":
            continue
        labels = [o[0] for o in q["options"]]
        if labels != list("ABCDE")[: len(labels)]:
            bad_labels.append((t, q["id"], labels))
print(f"[A-修正] 题库选项标号非法: {len(bad_labels)} 条", bad_labels[:5])

# ---- D 深化：选项对齐验证 ----
th_by_norm = {}
for t in ("single", "multi"):
    for q in th[t]:
        th_by_norm.setdefault(norm(q["stem"]), []).append((t, q))

print("\n[D-深化] 官方卷 vs 题库：选项文本比对")
same_order = diff_order = no_match = 0
real_disagree = []
opt_mismatch = []
stat = {t: [0, 0] for t in ("judge", "single", "multi")}

for t in ("judge", "single", "multi"):
    for q in mk[t]:
        cand = th_by_norm.get(norm(q["stem"])) or []
        cand = [(tt, qq) for tt, qq in cand if tt == t]
        if t == "judge":
            th_q = next((x for x in th["judge"] if norm(x["stem"]) == norm(q["stem"])), None)
            tid = th_q["id"] if th_q else None
            av = ai["judge"].get(str(tid)) if tid else None
            if tid and av:
                stat["judge"][0] += 1
                if av["a"] == q["answer"]:
                    stat["judge"][1] += 1
                else:
                    real_disagree.append((t, q["n"], tid, q["stem"][:45], q["answer"], av["a"], av["c"], "无选项"))
            continue
        if not cand:
            no_match += 1
            continue
        th_q = cand[0][1]
        tid = th_q["id"]
        av = ai[t].get(str(tid))
        if not av:
            continue
        # 选项文本对齐：官方卷 options 是纯文本数组，题库是 [label, text]
        th_opts = [o[1] for o in th_q["options"]]
        mk_opts = q["options"]
        if [norm(x) for x in th_opts] == [norm(x) for x in mk_opts]:
            same_order += 1
            stat[t][0] += 1
            if av["a"] == q["answer"]:
                stat[t][1] += 1
            else:
                real_disagree.append((t, q["n"], tid, q["stem"][:45], q["answer"], av["a"], av["c"], "选项一致"))
        else:
            # 选项集合相同但顺序不同，或选项本身不同
            if set(norm(x) for x in th_opts) == set(norm(x) for x in mk_opts):
                # 顺序不同：按内容映射转换答案再比
                th_label_by_text = {norm(o[1]): o[0] for o in th_q["options"]}
                try:
                    remapped = "".join(sorted(th_label_by_text[norm(mk_opts[ord(c) - 65])] for c in q["answer"]))
                except KeyError:
                    remapped = None
                diff_order += 1
                stat[t][0] += 1
                if remapped and av["a"] == remapped:
                    stat[t][1] += 1
                    print(f"  [顺序不同但答案等价] {t} 官方卷#{q['n']} ↔ 题库#{tid}: 官方({q['answer']})重映射={remapped} AI={av['a']}")
                else:
                    real_disagree.append((t, q["n"], tid, q["stem"][:45], f"{q['answer']}→{remapped}", av["a"], av["c"], "选项同集合不同顺序"))
            else:
                opt_mismatch.append((t, q["n"], tid, q["stem"][:45]))
                stat[t][0] += 1
                # 选项集合不同：按内容交集对齐尽力比较
                th_label_by_text = {norm(o[1]): o[0] for o in th_q["options"]}
                mk_only = [x for x in mk_opts if norm(x) not in th_label_by_text]
                th_only = [o[1] for o in th_q["options"] if norm(o[1]) not in set(norm(x) for x in mk_opts)]
                remapped = None
                try:
                    remapped = "".join(sorted(th_label_by_text[norm(mk_opts[ord(c) - 65])] for c in q["answer"]))
                except KeyError:
                    pass
                if remapped and av["a"] == remapped:
                    stat[t][1] += 1
                    real_disagree.append((t, q["n"], tid, q["stem"][:45], q["answer"], av["a"], av["c"], f"选项不同但官方答案映射后一致(仅卷多{mk_only}/库多{th_only})"))

print(f"  选项完全同序: {same_order}；同集合不同序: {diff_order}；选项内容不同: {len(opt_mismatch)}；未匹配: {no_match}")
for t in ("judge", "single", "multi"):
    m, a = stat[t]
    print(f"  {t}: 对齐后一致 {a}/{m} = {a/m:.1%}" if m else f"  {t}: 0")
total_m = sum(x[0] for x in stat.values()); total_a = sum(x[1] for x in stat.values())
print(f"  总体: {total_a}/{total_m} = {total_a/total_m:.1%}")

print(f"\n  选项内容不同的题（需人工看）: {len(opt_mismatch)}")
for x in opt_mismatch:
    print(f"    {x}")

print(f"\n  对齐后仍不一致 {len(real_disagree)} 题:")
for x in real_disagree:
    print(f"    [{x[0]} 官方卷#{x[1]} ↔ 题库#{x[2]}] {x[3]}… 官方={x[4]} AI={x[5]} ({x[6]}) [{x[7]}]")

# ---- low 置信清单 ----
print("\n[附] AI 答案 low 置信 27 题清单（最需人工核对）:")
for t in ("judge", "single", "multi"):
    for q in th[t]:
        v = ai[t].get(str(q["id"]))
        if v and v["c"] == "low":
            print(f"  {t}#{q['id']}: {q['stem'][:40]}… -> {v['a']}")
