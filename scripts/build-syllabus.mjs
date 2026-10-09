// 解析官方《第2部分·认定要素细目表》(doc) → src/data/syllabus.json
// 运行：node scripts/build-syllabus.mjs   （依赖 macOS textutil）
// 细目表是 doc 表格，textutil 转出后单元格以 \a 分隔；每行结构：
//   细目点：序号 \a 章 \a 节 \a 目 \a 点 \a 名称 \a 0.5
// 章节名/分值在原文核对后内置（OFFICIAL/CHAPTER_NAMES），本脚本负责把 300 个细目点归位。
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = process.argv[2] ?? "/Users/zhouwangjun/Desktop/codeing/AI/4-04-05-05_3_20250701/第2部分_人工智能训练师_3级_认定要素细目表.doc";

const raw = execFileSync("textutil", ["-convert", "txt", "-stdout", DOC], { encoding: "utf8" });
const theoryText = raw.split("操作技能认定要素细目表")[0]; // 只取理论部分

// 细目点行（置信结构：序号 章(0-4) 节 目 点(1-23) 名称 0.5）
const re = /(?:^|\x1f)(\d{1,3})\x1f([0-4])\x1f([1-9])\x1f([1-9])\x1f((?:2[0-3]|1\d|[1-9]))\x1f([^\x1f]+?)\x1f0\.5(?=\x1f|$)/g;
const s = theoryText.split(/[\u0007\n]+/).filter((t) => t.trim() !== "").join("\x1f");

const chapters = new Map(); // "3.1.1" → 细目点名[]
for (const m of s.matchAll(re)) {
  const code = `${m[2]}.${m[3]}.${m[4]}`;
  (chapters.get(code) ?? chapters.set(code, []).get(code)).push(m[6].trim());
}

// 21 个「目」级章节 = 课程粒度；unit 为所属单元（0.1~4.2），domain 由 code 首位推出
const CHAPTERS = [
  { code: "0.1.1", name: "职业道德基本知识", unit: "0.1 职业道德", score: 2 },
  { code: "0.1.2", name: "职业守则", unit: "0.1 职业道德", score: 3 },
  { code: "0.2.1", name: "通用知识", unit: "0.2 基础知识", score: 5 },
  { code: "0.2.2", name: "相关法律、法规知识", unit: "0.2 基础知识", score: 5 },
  { code: "1.1.1", name: "业务数据相关流程设计工具知识", unit: "1.1 业务流程设计", score: 5 },
  { code: "1.1.2", name: "业务数据相关流程设计知识", unit: "1.1 业务流程设计", score: 5 },
  { code: "1.2.1", name: "业务模块分析方法", unit: "1.2 业务模块效果优化", score: 5 },
  { code: "1.2.2", name: "业务模块优化方法", unit: "1.2 业务模块效果优化", score: 5 },
  { code: "2.1.1", name: "智能训练数据处理工具原理和应用方法", unit: "2.1 数据处理规范制定", score: 7 },
  { code: "2.1.2", name: "智能训练数据处理知识", unit: "2.1 数据处理规范制定", score: 7 },
  { code: "2.2.1", name: "算法训练工具基础原理和应用方法", unit: "2.2 算法测试", score: 8 },
  { code: "2.2.2", name: "人工智能测试工具使用方法", unit: "2.2 算法测试", score: 8 },
  { code: "3.1.1", name: "数据拆解高阶方法", unit: "3.1 智能系统监控和优化", score: 6 },
  { code: "3.1.2", name: "数据分析高阶方法", unit: "3.1 智能系统监控和优化", score: 6 },
  { code: "3.1.3", name: "单一产品智能解决方案设计方法", unit: "3.1 智能系统监控和优化", score: 6 },
  { code: "3.2.1", name: "人机交互流程设计知识", unit: "3.2 人机交互流程设计", score: 6 },
  { code: "3.2.2", name: "人机交互流程设计工具相关知识", unit: "3.2 人机交互流程设计", score: 6 },
  { code: "4.1.1", name: "培训讲义编写知识", unit: "4.1 培训", score: 1 },
  { code: "4.1.2", name: "培训教学知识", unit: "4.1 培训", score: 1 },
  { code: "4.2.1", name: "实践教学方法", unit: "4.2 指导", score: 1 },
  { code: "4.2.2", name: "技术指导方法", unit: "4.2 指导", score: 2 },
];
const DOMAIN_NAMES = { "0": "基本要求", "1": "业务分析", "2": "智能训练", "3": "智能系统设计", "4": "培训与指导" };

const domains = Object.entries(DOMAIN_NAMES).map(([d, name]) => {
  const list = CHAPTERS.filter((c) => c.code.startsWith(`${d}.`));
  return {
    code: d,
    name,
    score: list.reduce((n, c) => n + c.score, 0),
    chapters: list.map((c) => {
      const points = chapters.get(c.code);
      if (!points?.length) throw new Error(`章节 ${c.code} 未解析到细目点`);
      return { ...c, points };
    }),
  };
});

const totalPoints = domains.flatMap((d) => d.chapters).reduce((n, c) => n + c.points.length, 0);
const totalScore = domains.reduce((n, d) => n + d.score, 0);
if (totalPoints !== 300) throw new Error(`细目点应为 300，解析到 ${totalPoints}`);
if (totalScore !== 100) throw new Error(`总分应为 100，解析到 ${totalScore}`);

writeFileSync(
  join(ROOT, "src/data/syllabus.json"),
  JSON.stringify({ meta: { source: "第2部分_人工智能训练师_3级_认定要素细目表", totalPoints, totalScore }, domains }, null, 2) + "\n"
);
console.log(`✓ syllabus.json：${domains.length} 大项 / ${CHAPTERS.length} 章节 / ${totalPoints} 细目点 / 总分 ${totalScore}`);
for (const d of domains) console.log(`  ${d.code} ${d.name} ${d.score}分：${d.chapters.map((c) => `${c.code}(${c.points.length}点)`).join(" ")}`);
