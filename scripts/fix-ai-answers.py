#!/usr/bin/env python3
"""把 aiAnswers.json 中与官方卷（mock190，选项完全一致）冲突的 25 题修正为官方答案。
以官方卷 answer 为准（answerSource: official），置信度改 high，meta 记录校准信息。"""
import json, re, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "src" / "data"

def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s)
    s = re.sub(r"\s+", "", s)
    return s

th = json.loads((ROOT / "theory.json").read_text())
mk = json.loads((ROOT / "mock190.json").read_text())
ai = json.loads((ROOT / "aiAnswers.json").read_text())

th_by_norm = {}
for t in ("judge", "single", "multi"):
    for q in th[t]:
        th_by_norm.setdefault((t, norm(q["stem"])), q)

fixed = []
for t in ("judge", "single", "multi"):
    for q in mk[t]:
        th_q = th_by_norm.get((t, norm(q["stem"])))
        if not th_q:
            continue
        tid = str(th_q["id"])
        av = ai[t].get(tid)
        if not av:
            continue
        # 选项必须一致才允许以官方答案覆盖（防止选项不同导致字母不可比）
        if t != "judge":
            th_opts = [norm(o[1]) for o in th_q["options"]]
            if th_opts != [norm(x) for x in q["options"]]:
                continue
        if av["a"] != q["answer"]:
            fixed.append((t, tid, av["a"], q["answer"]))
            av["a"] = q["answer"]
            av["c"] = "high"
            av["src"] = "official"

print(f"修正 {len(fixed)} 题:")
for t, tid, old, new in fixed:
    print(f"  {t}#{tid}: {old} -> {new} (official)")

ai["meta"]["calibratedAgainst"] = "mock190 官方卷 190 题全量比对（选项完全一致才覆盖），冲突答案已改为官方答案"
ai["meta"]["calibratedAt"] = "2026-10-09"
ai["meta"]["calibratedCount"] = len(fixed)

(ROOT / "aiAnswers.json").write_text(json.dumps(ai, ensure_ascii=False, indent=2) + "\n")
print("已写回 aiAnswers.json")
