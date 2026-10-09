#!/usr/bin/env python3
"""题库校验：完整性 + 答案格式 + AI 答案 vs 官方卷交叉验证。只读，不修改数据。"""
import json, re, sys, unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "src" / "data"
MATERIAL = ROOT.parent.parent.parent / "人工智能训练师三级上网素材"

issues = []
def err(cat, msg):
    issues.append((cat, msg))

def norm(s: str) -> str:
    """题干归一化：去空白/全半角差异，用于重复检测与跨文件匹配"""
    s = unicodedata.normalize("NFKC", s)
    s = re.sub(r"\s+", "", s)
    s = s.replace("（", "(").replace("）", ")").replace("，", ",").replace("：", ":")
    return s

th = json.loads((ROOT / "theory.json").read_text())
mk = json.loads((ROOT / "mock190.json").read_text())
ai = json.loads((ROOT / "aiAnswers.json").read_text())
pa = json.loads((ROOT / "practicalAnswers.json").read_text())

# ============ A. theory.json 完整性 ============
print("=" * 60)
print("A. theory.json（900 题复习题库）")
sec_counts = {t: len(th[t]) for t in ("judge", "single", "multi")}
print(f"  题量: 判断 {sec_counts['judge']} / 单选 {sec_counts['single']} / 多选 {sec_counts['multi']}，合计 {sum(sec_counts.values())}")
if sum(sec_counts.values()) != 900:
    err("A", f"题库总量 {sum(sec_counts.values())} ≠ 900")

all_stems = {}  # norm_stem -> [(section, id)]
for t in ("judge", "single", "multi"):
    ids = [q["id"] for q in th[t]]
    expect = list(range(1, len(th[t]) + 1))
    if ids != expect:
        dup = [i for i, c in Counter(ids).items() if c > 1]
        missing = sorted(set(expect) - set(ids))
        err("A", f"{t} id 不连续: 缺 {missing[:10]}，重复 {dup[:10]}")
    for q in th[t]:
        stem = (q.get("stem") or "").strip()
        if not stem:
            err("A", f"{t}#{q['id']} 题干为空")
        if len(stem) < 4:
            err("A", f"{t}#{q['id']} 题干过短: {stem!r}")
        if stem != q.get("stem"):
            err("A", f"{t}#{q['id']} 题干首尾有空白字符")
        key = norm(stem)
        all_stems.setdefault(key, []).append((t, q["id"]))
        opts = q.get("options")
        if t == "judge":
            if opts not in (None, []):
                err("A", f"{t}#{q['id']} 判断题不应有选项，但有 {opts}")
        elif opts is None:
            err("A", f"{t}#{q['id']} 缺选项")
        else:
            labels = [o[0] for o in opts]
            texts = [o[1].strip() for o in opts]
            if labels != list("ABCDE")[: len(labels)]:
                err("A", f"{t}#{q['id']} 选项标号异常: {labels}")
            if any(not x for x in texts):
                err("A", f"{t}#{q['id']} 存在空选项文本")
            if len(set(texts)) != len(texts):
                err("A", f"{t}#{q['id']} 选项文本重复")
            if t == "single" and len(opts) != 4:
                err("A", f"{t}#{q['id']} 单选题选项数 {len(opts)} ≠ 4")
            if t == "multi" and len(opts) not in (4, 5):
                err("A", f"{t}#{q['id']} 多选题选项数 {len(opts)} 不在 4~5")

dups = {k: v for k, v in all_stems.items() if len(v) > 1}
print(f"  题干重复（归一化后）: {len(dups)} 组")
for k, v in list(dups.items())[:8]:
    err("A", f"题干重复: {k[:40]}… -> {v}")

# ============ B. mock190.json 官方卷 ============
print("=" * 60)
print("B. mock190.json（官方模拟卷 190 题，含官方答案）")
mk_counts = {t: len(mk[t]) for t in ("judge", "single", "multi")}
print(f"  题量: 判断 {mk_counts['judge']} / 单选 {mk_counts['single']} / 多选 {mk_counts['multi']}，合计 {sum(mk_counts.values())}")
expect_counts = {"judge": 40, "single": 140, "multi": 10}
for t, e in expect_counts.items():
    if mk_counts[t] != e:
        err("B", f"官方卷 {t} 题量 {mk_counts[t]} ≠ 真实考试结构 {e}")
sc = mk["meta"].get("scores", {})
score_sum = mk_counts["judge"] * sc.get("judge", 0) + mk_counts["single"] * sc.get("single", 0) + mk_counts["multi"] * sc.get("multi", 0)
print(f"  分值校验: {mk_counts['judge']}×{sc.get('judge')} + {mk_counts['single']}×{sc.get('single')} + {mk_counts['multi']}×{sc.get('multi')} = {score_sum}（卷面总分 {mk['meta'].get('totalScore')}）")
if abs(score_sum - mk["meta"].get("totalScore", 0)) > 0.01:
    err("B", f"分值合计 {score_sum} ≠ totalScore {mk['meta'].get('totalScore')}")

mk_stems = {}
for t in ("judge", "single", "multi"):
    ns = [q["n"] for q in mk[t]]
    if ns != list(range(1, len(mk[t]) + 1)):
        err("B", f"{t} 题号不连续: {ns[:20]}")
    for q in mk[t]:
        tag = f"{t}#{q['n']}"
        stem = (q.get("stem") or "").strip()
        if not stem:
            err("B", f"{tag} 题干为空")
        mk_stems.setdefault(norm(stem), []).append(tag)
        a = q.get("answer")
        if t == "judge":
            if a not in ("√", "×"):
                err("B", f"{tag} 判断题答案异常: {a!r}")
        elif t == "single":
            if a not in list("ABCDE")[: len(q.get("options", []))]:
                err("B", f"{tag} 单选答案 {a!r} 超出选项范围 {len(q.get('options', []))} 个")
        else:
            if not a or not re.fullmatch(r"[A-E]+", a) or list(a) != sorted(set(a)):
                err("B", f"{tag} 多选答案格式异常: {a!r}")
            elif not set(a) <= set("ABCDE"[: len(q.get("options", []))]):
                err("B", f"{tag} 多选答案 {a} 超出选项范围")
        opts = q.get("options") or []
        if t != "judge":
            if not opts:
                err("B", f"{tag} 缺选项")
            else:
                for o in opts:
                    if not (o or "").strip():
                        err("B", f"{tag} 存在空选项")
mk_dups = {k: v for k, v in mk_stems.items() if len(v) > 1}
print(f"  卷内题干重复: {len(mk_dups)} 组")
for k, v in mk_dups.items():
    err("B", f"卷内题干重复: {k[:40]}… -> {v}")

# ============ C. aiAnswers.json 覆盖与格式 ============
print("=" * 60)
print("C. aiAnswers.json（900 题 AI 参考答案）")
conf_dist = Counter()
total_ai = 0
for t in ("judge", "single", "multi"):
    ids_th = {q["id"] for q in th[t]}
    keys_ai = {int(k) for k in ai[t]}
    missing = sorted(ids_th - keys_ai)
    extra = sorted(keys_ai - ids_th)
    if missing:
        err("C", f"{t} AI 答案缺 {len(missing)} 题: {missing[:15]}")
    if extra:
        err("C", f"{t} AI 答案多出题号: {extra[:15]}")
    bad_fmt = []
    for k, v in ai[t].items():
        total_ai += 1
        conf_dist[v.get("c")] += 1
        a = v.get("a")
        n_opts = len(th[t][int(k) - 1]["options"]) if t != "judge" else 0
        ok = False
        if t == "judge":
            ok = a in ("√", "×")
        elif t == "single":
            ok = a in list("ABCDE")[: n_opts or 4]
        else:
            ok = bool(a) and isinstance(a, str) and re.fullmatch(r"[A-E]+", a) and list(a) == sorted(set(a)) and set(a) <= set("ABCDE"[: n_opts or 5])
        if not ok:
            bad_fmt.append((k, a))
    if bad_fmt:
        err("C", f"{t} 答案格式非法 {len(bad_fmt)} 条: {bad_fmt[:10]}")
print(f"  覆盖: {total_ai}/900")
print(f"  置信分布: high {conf_dist['high']} / medium {conf_dist['medium']} / low {conf_dist['low']} / 其他 {conf_dist.get(None, 0) + conf_dist.get('', 0)}")

# ============ D. 交叉验证：AI 答案 vs 官方卷答案 ============
print("=" * 60)
print("D. 交叉验证：官方卷 ∩ 复习题库 的题，AI 答案 vs 官方答案")
th_by_norm = {}
for t in ("judge", "single", "multi"):
    for q in th[t]:
        th_by_norm.setdefault(norm(q["stem"]), []).append((t, q["id"]))
matched, agree, disagree = 0, 0, []
stat = {t: [0, 0] for t in ("judge", "single", "multi")}  # [matched, agree]
stat_conf = {"high": [0, 0], "medium": [0, 0], "low": [0, 0]}
for t in ("judge", "single", "multi"):
    for q in mk[t]:
        cand = th_by_norm.get(norm(q["stem"]))
        if not cand:
            continue
        tt, tid = cand[0]
        if tt != t:
            continue
        av = ai[t].get(str(tid))
        if not av:
            continue
        matched += 1
        stat[t][0] += 1
        stat_conf[av["c"]][0] += 1
        if av["a"] == q["answer"]:
            agree += 1
            stat[t][1] += 1
            stat_conf[av["c"]][1] += 1
        else:
            disagree.append((t, q["n"], tid, q["stem"][:50], q["answer"], av["a"], av["c"]))
print(f"  官方卷 190 题中能对上复习题库且带 AI 答案的: {matched} 题")
if matched:
    print(f"  AI 答案与官方答案一致: {agree}/{matched} = {agree/matched:.1%}")
    for t in ("judge", "single", "multi"):
        m, a = stat[t]
        if m:
            print(f"    {t}: {a}/{m} = {a/m:.1%}")
    for c in ("high", "medium", "low"):
        m, a = stat_conf[c]
        if m:
            print(f"    置信 {c}: {a}/{m} = {a/m:.1%}")
    print(f"  不一致 {len(disagree)} 题清单:")
    for t, n, tid, stem, off, a, conf in disagree:
        print(f"    [{t} 官方卷#{n} ↔ 题库#{tid}] {stem}…  官方={off} AI={a} ({conf})")
        err("D", f"{t} 题库#{tid} 与官方卷#{n} 答案不一致: 官方={off} AI={a}")

# ============ E. practicalAnswers.json ============
print("=" * 60)
print("E. practicalAnswers.json（实操 40 题参考答案）")
folders = sorted(p.name for p in MATERIAL.iterdir() if p.is_dir())
pa_keys = sorted(pa["answers"].keys())
print(f"  题组文件夹: {len(folders)} 个；答案条目: {len(pa_keys)} 条")
if folders != pa_keys:
    err("E", f"答案键与题组文件夹不一致: 仅文件夹有 {set(folders)-set(pa_keys)}，仅答案有 {set(pa_keys)-set(folders)}")
empty = [k for k, v in pa["answers"].items() if not (v or "").strip()]
if empty:
    err("E", f"答案内容为空: {empty}")
for k in pa_keys:
    v = pa["answers"][k] or ""
    if len(v.strip()) < 30:
        err("E", f"{k} 答案内容过短({len(v.strip())}字): {v[:60]!r}")
    # 每个题组文件夹里应有题目文件（ipynb 或 docx）
    qdir = MATERIAL / k
    files = [p.name for p in qdir.iterdir()] if qdir.exists() else []
    if not any(f.endswith((".ipynb", ".docx")) for f in files):
        err("E", f"{k} 题组文件夹缺少题目文件(.ipynb/.docx): {files[:5]}")

# ============ 汇总 ============
print("=" * 60)
print(f"汇总: 共发现 {len(issues)} 类问题")
seen = Counter(c for c, _ in issues)
for c, n in seen.most_common():
    print(f"  [{c}] {n} 条")
sample = {}
for c, m in issues:
    sample.setdefault(c, []).append(m)
for c, ms in sample.items():
    print(f"\n[{c}] 示例（前 5 条）:")
    for m in ms[:5]:
        print(f"  - {m}")
sys.exit(0)
