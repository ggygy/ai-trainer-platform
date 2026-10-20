// 讲义深化第一步：为每章生成撰写 digest（官方细目点 + 本章真题题面/选项/答案 + 现有讲义正文）。
// 子代理撰写【原理深讲】段时事实限定在 digest 内，输出 /tmp/atp-deepen/digest/<code>.md。
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const lessons = JSON.parse(readFileSync(new URL("src/data/lessons.json", root), "utf8"));
const syllabus = JSON.parse(readFileSync(new URL("src/data/syllabus.json", root), "utf8"));
const tags = JSON.parse(readFileSync(new URL("src/data/questionTags.json", root), "utf8"));
const theory = JSON.parse(readFileSync(new URL("src/data/theory.json", root), "utf8"));
const ai = JSON.parse(readFileSync(new URL("src/data/aiAnswers.json", root), "utf8"));

const chapters = syllabus.domains.flatMap((d) =>
  d.chapters.map((c) => ({ ...c, domain: d.name })),
);

const TYPE_LABEL = { judge: "判断", single: "单选", multi: "多选" };
mkdirSync("/tmp/atp-deepen/digest", { recursive: true });

for (const ch of chapters) {
  const lesson = lessons.lessons[ch.code];
  if (!lesson) {
    console.warn(`⚠ ${ch.code} 无讲义，跳过`);
    continue;
  }
  // 本章打标真题（题面/选项/AI 参考答案——AI 答案已经官方卷校准+二次复核）
  const qs = [];
  for (const t of ["judge", "single", "multi"]) {
    for (const q of theory[t]) {
      if (tags[t][String(q.id)] === ch.code) {
        const ans = ai[t][String(q.id)];
        qs.push({
          type: TYPE_LABEL[t],
          id: q.id,
          stem: q.stem,
          options: q.options ?? [],
          answer: ans ? `${ans.a}（置信 ${ans.c}）` : "无参考答案",
        });
      }
    }
  }
  const digest = `# ${ch.code} ${lesson.title}（${ch.domain} · 官方分值 ${ch.score} 分）

## 官方细目点（${ch.points.length} 个）
${ch.points.map((p, i) => `${i + 1}. ${p}`).join("\n")}

## 本章真题（${qs.length} 道，含参考答案）
${qs
  .map(
    (q, i) =>
      `${i + 1}. [${q.type}] ${q.stem}\n${
        q.options.length ? `   选项：${q.options.map(([l, x]) => `${l}.${x}`).join("  ")}` : "   （判断题）"
      }\n   参考答案：${q.answer}`,
  )
  .join("\n")}

## 现有讲义正文（撰写时保持其余段落不变，只在【细目点讲解】与【易考点】之间插入新段）
${lesson.body}
`;
  writeFileSync(`/tmp/atp-deepen/digest/${ch.code}.md`, digest);
}
console.log(`已生成 ${chapters.length} 份 digest → /tmp/atp-deepen/digest/`);
console.log(chapters.map((c) => c.code).join(" "));
