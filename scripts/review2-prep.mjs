// 全量答案复核准备：把 710 题（900 题 - 190 官方卷题，官方卷题已有官方答案背书）
// 按题型分批导出为 JSONL，供并行子代理逐题独立判断。
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const theory = JSON.parse(readFileSync(new URL("src/data/theory.json", root), "utf8"));
const ai = JSON.parse(readFileSync(new URL("src/data/aiAnswers.json", root), "utf8"));
const mock = JSON.parse(readFileSync(new URL("src/data/mock190.json", root), "utf8"));

// 官方卷题在 900 题库中的指纹（题干+选项同序即同题，validate-bank 已验证 190 全命中）
// 与 validate-bank.py 同口径的归一化：NFKC + 去空白 + 全半角标点统一
const norm = (s) =>
  s
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/，/g, ",")
    .replace(/：/g, ":")
    .trim();
const officialKeys = new Set();
for (const t of ["judge", "single", "multi"]) {
  for (const q of mock[t]) officialKeys.add(`${t}|${norm(q.stem)}`);
}

const rows = [];
for (const t of ["judge", "single", "multi"]) {
  for (const q of theory[t]) {
    if (officialKeys.has(`${t}|${norm(q.stem)}`)) continue; // 官方答案已确认，不重判
    const a = ai[t][String(q.id)];
    rows.push({
      type: t === "judge" ? "判断" : t === "single" ? "单选" : "多选",
      id: q.id,
      stem: q.stem,
      options: q.options ?? [],
      current: a?.a ?? null,
      conf: a?.c ?? null,
    });
  }
}
rows.sort((a, b) => (a.type === b.type ? a.id - b.id : a.type.localeCompare(b.type, "zh")));

const BATCHES = 8;
mkdirSync("/tmp/atp-review2/in", { recursive: true });
mkdirSync("/tmp/atp-review2/out", { recursive: true });
const per = Math.ceil(rows.length / BATCHES);
for (let i = 0; i < BATCHES; i++) {
  const slice = rows.slice(i * per, (i + 1) * per);
  if (!slice.length) break;
  writeFileSync(
    `/tmp/atp-review2/in/batch-${i + 1}.jsonl`,
    slice.map((r) => JSON.stringify(r)).join("\n") + "\n",
  );
  const byType = slice.reduce((m, r) => ((m[r.type] = (m[r.type] ?? 0) + 1), m), {});
  console.log(`batch-${i + 1}: ${slice.length} 题`, JSON.stringify(byType));
}
console.log(`共 ${rows.length} 题（900 - 官方卷 190）`);
