// 讲义深化合并：把 /tmp/atp-deepen/out/<code>.txt 的【原理深讲】段插入
// lessons.json 每章 body 的【易考点】段之前（【细目点讲解】之后）。
// 幂等：已含【原理深讲】的章跳过。
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const lessonsPath = new URL("src/data/lessons.json", root);
const lessons = JSON.parse(readFileSync(lessonsPath, "utf8"));

let inserted = 0;
const report = [];
for (const [code, lesson] of Object.entries(lessons.lessons)) {
  if (lesson.body.includes("【原理深讲】")) {
    report.push(`${code} 已含深讲段，跳过`);
    continue;
  }
  const file = `/tmp/atp-deepen/out/${code}.txt`;
  if (!existsSync(file)) {
    report.push(`${code} ⚠ 缺输出文件`);
    continue;
  }
  const raw = readFileSync(file, "utf8").trim();
  if (!raw.startsWith("【原理深讲】")) {
    report.push(`${code} ⚠ 首行不是【原理深讲】`);
    continue;
  }
  if (raw.replace(/\s/g, "").length < 1200) {
    report.push(`${code} ⚠ 过短（${raw.length} 字符）`);
    continue;
  }
  const idx = lesson.body.indexOf("【易考点】");
  if (idx === -1) {
    report.push(`${code} ⚠ 正文无【易考点】段`);
    continue;
  }
  lesson.body = lesson.body.slice(0, idx) + raw + "\n\n" + lesson.body.slice(idx);
  inserted++;
  report.push(`${code} ✓ +${raw.replace(/\s/g, "").length} 字`);
}

if (inserted > 0) {
  lessons.meta.deepenedAt = new Date().toISOString().slice(0, 10);
  lessons.meta.note = (lessons.meta.note ?? "") + "；2026-10-21 各章新增【原理深讲】段（通俗原理+工作场景+代码示例）";
  writeFileSync(lessonsPath, JSON.stringify(lessons, null, 2) + "\n");
}
console.log(report.join("\n"));
console.log(`\n合并 ${inserted} 章 → src/data/lessons.json`);
