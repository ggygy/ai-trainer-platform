# 一次性脚本：解析官方考试平台 40 题页面存档 → src/data/practicalTasks.json
# 用法: python3 scripts/parse-official-tasks.py
import json
import re
import sys
from pathlib import Path

SRC = Path("/Users/zhouwangjun/Desktop/codeing/AI/人工智能训练师三级考试平台模拟界面")
OUT = Path(__file__).resolve().parent.parent / "src" / "data" / "practicalTasks.json"

CHROME = re.compile(r"答案上传|素材下载|技能要求|质量指标")
REQ = re.compile(r"（\d{1,2}）|\(\d{1,2}\)|\d{1,2}、")  # 全角（1）/半角(1)/1、 三种编号都有


def text_of(path: Path) -> str:
    html = path.read_text(encoding="utf-8")
    body = html[html.find("<body"):]
    t = re.sub(r"<style[^>]*>.*?</style>", "", body, flags=re.S)
    t = re.sub(r"<script[^>]*>.*?</script>", "", t, flags=re.S)
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def between(t: str, start: str, end: str) -> str:
    i = t.find(start)
    if i < 0:
        return ""
    j = t.find(end, i + len(start))
    return t[i + len(start): j if j >= 0 else len(t)].strip(" ：:。")


def split_numbered(section: str) -> list[str]:
    """按（N）/(N) 序号切段，去掉序号本身，保留完整句子。"""
    marks = list(REQ.finditer(section))
    if not marks:
        return []
    out = []
    for k, m in enumerate(marks):
        end = marks[k + 1].start() if k + 1 < len(marks) else len(section)
        seg = section[m.end():end].strip()
        if seg:
            out.append(seg)
    return out


def parse(code: str, path: Path) -> dict:
    t = text_of(path)
    name = between(t, "试题名称", "场地设备要求")
    equipment = between(t, "场地设备要求", "考核时间")
    minutes_m = re.search(r"考核时间\s*(\d+)\s*min", t)
    minutes = int(minutes_m.group(1)) if minutes_m else None

    i = t.find("工作任务")
    tail = t[i + len("工作任务"):] if i >= 0 else ""
    # 截掉页面装饰（答案上传/素材下载）与评分区（技能要求/质量指标单独解析）
    cut = len(tail)
    for marker in ("答案上传", "素材下载", "技能要求", "质量指标"):
        j = tail.find(marker)
        if j >= 0:
            cut = min(cut, j)
    tail = tail[:cut].strip()

    skills = split_numbered(between(t, "技能要求", "质量指标")) if "质量指标" in t else split_numbered(tail_of(t, "技能要求"))
    quality = split_numbered(between(t, "质量指标", "答案上传")) if "质量指标" in t else []

    reqs_raw = split_numbered(tail)
    if reqs_raw:
        background = tail[: REQ.search(tail).start()].strip()
        requirements = [r.strip() for r in reqs_raw]
    else:
        # docx 方案题（4.1.x/4.2.x 等）没有编号要求：最后一句指令即要求
        sentences = [x for x in re.split(r"(?<=[。；])", tail) if x.strip()]
        if len(sentences) >= 2:
            background = "".join(sentences[:-1]).strip()
            requirements = [sentences[-1].strip()]
        else:
            background = tail
            requirements = []
    return {
        "name": name,
        "minutes": minutes,
        "equipment": equipment,
        "background": background,
        "requirements": requirements,
        "skills": skills,
        "quality": quality,
    }


def tail_of(t: str, marker: str) -> str:
    i = t.find(marker)
    return t[i + len(marker):] if i >= 0 else ""


def main() -> None:
    files = sorted(p for p in SRC.glob("*.html") if re.match(r"\d\.\d\.\d", p.stem))
    # 文件名可能带时间戳后缀（1.1.2_20250716_135623.html），归一化为题号；同题号取文件名更短者
    best: dict[str, Path] = {}
    for p in files:
        code = p.stem.split("_")[0]
        if code not in best or len(p.stem) < len(best[code].stem):
            best[code] = p
    seen: dict[str, dict] = {}
    for code, path in sorted(best.items()):
        seen[code] = parse(code, path)

    OUT.write_text(json.dumps(seen, ensure_ascii=False, indent=1), encoding="utf-8")
    bad = [(c, len(v["requirements"])) for c, v in seen.items() if not v["requirements"]]
    print(f"共 {len(seen)} 题 → {OUT}")
    for c, v in sorted(seen.items()):
        flag = "OK " if v["requirements"] else "缺!"
        print(f"{flag} {c}: {v['name'][:24]} | 要求{len(v['requirements'])} 技能{len(v['skills'])} 质量{len(v['quality'])} | {v['minutes']}min")
    if bad:
        print("缺要求项的题:", bad)
        sys.exit(1)


if __name__ == "__main__":
    main()
