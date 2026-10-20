// 题目 → 讲义考点映射：解析每章 lessons.json【易考点】段的真题引用句，
// 与 900 题库题干归一化模糊匹配，生成 src/data/quizLessons.json。
// 供理论学习页「查看本题考点」弹层使用（每题可回看对应理论知识出处）。
//
// 句式样本：
//   真题考「狭义的职业道德是指在( )活动中应遵循的职业行为准则和规范」——正确答案是 C（一定职业）
//   多选考「符合职业特点所要求( )的总和」——正确答案是 ABC（道德准则、道德情操、道德品质）
//   判断题高频：无需考虑数据的质量与适用性（错）、职业道德不包括对用户隐私的保护（错）
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const lessons = JSON.parse(readFileSync(new URL("src/data/lessons.json", root), "utf8"));
const theory = JSON.parse(readFileSync(new URL("src/data/theory.json", root), "utf8"));
const tags = JSON.parse(readFileSync(new URL("src/data/questionTags.json", root), "utf8"));

// 归一化：去空白与全部中英标点，小写——题干引用与题库原文常有 ( ) 与全角差异
const norm = (s) =>
  s.replace(/[\s()（）,，。.、;；:：?？!！·—\-…「」『』“”"'’‘]/g, "").toLowerCase();

const TYPES = ["judge", "single", "multi"];
// 题库索引：归一化题干 → 候选题列表
const bank = {};
for (const t of TYPES) bank[t] = theory[t].map((q) => ({ ...q, n: norm(q.stem) }));

/** 最长公共子串长度（同章回退匹配用，判断题引用常是题干删词改写） */
function lcsLen(a, b) {
  let best = 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) best = cur[j];
      }
    }
    prev = cur;
  }
  return best;
}

/**
 * 引用片段 → 题库题。优先同章打标题（讲义易考点引用的理应是本章题），
 * 无匹配时放开到全库；同章内支持 LCS 比例回退（吸收判断题删词改写）。
 * 返回 { type, id } 或 null。
 */
function matchQuote(quote, hintType, chapterCode) {
  const nq = norm(quote);
  if (!nq) return null;
  const tryTypes = hintType ? [hintType, ...TYPES.filter((t) => t !== hintType)] : TYPES;
  const scan = (types, sameChapterOnly) => {
    let best = null; // { score, lenDiff, hit }
    for (const t of types) {
      for (const q of bank[t]) {
        if (sameChapterOnly && tags[t][String(q.id)] !== chapterCode) continue;
        let score = 0;
        if (q.n === nq) score = 4;
        else if (q.n.startsWith(nq) || nq.startsWith(q.n)) score = 3;
        else if (q.n.includes(nq) || nq.includes(q.n)) score = 2;
        else if (sameChapterOnly) {
          // LCS 回退：公共子串覆盖引用 3/4 以上且足够长才认（只在同章小池子里开，避免误撞）
          const l = lcsLen(q.n, nq);
          if (l >= 8 && l >= 0.75 * Math.min(q.n.length, nq.length)) score = 1;
        }
        if (!score) continue;
        const lenDiff = Math.abs(q.n.length - nq.length);
        if (!best || score > best.score || (score === best.score && lenDiff < best.lenDiff))
          best = { score, lenDiff, hit: { type: t, id: q.id } };
      }
    }
    return best?.hit ?? null;
  };
  return scan(tryTypes, true) ?? scan(tryTypes, false);
}

const entries = { judge: {}, single: {}, multi: {} };
let parsedQuotes = 0;

for (const [code, lesson] of Object.entries(lessons.lessons)) {
  const body = lesson.body ?? "";
  const examPoint = body.split("\n\n").find((p) => p.startsWith("【易考点】")) ?? "";

  // ① 「真题考/多选考/单选考『…』——正确答案是 X（…）」句式
  const quoteRe = /(真题|多选|单选|判断)?考「([^」]+)」——正确答案是\s*([A-E√×]+)/g;
  let m;
  while ((m = quoteRe.exec(examPoint))) {
    parsedQuotes++;
    const hintType = m[1] === "多选" ? "multi" : m[1] === "单选" ? "single" : m[1] === "判断" ? "judge" : null;
    const hit = matchQuote(m[2], hintType, code);
    if (!hit) continue;
    // 完整出处句（到答案括号结束），比光秃秃的题干引用更有复习价值
    const sentenceEnd = examPoint.indexOf("）", m.index + m[0].length);
    const excerpt =
      sentenceEnd > 0 ? examPoint.slice(m.index, sentenceEnd + 1).replace(/。$/, "") : m[0];
    if (!entries[hit.type][String(hit.id)]) entries[hit.type][String(hit.id)] = { code, excerpt };
  }

  // ② 判断题列表句式：「判断（题）高频：XXX（错）、YYY（对）、…」逐项匹配。
  //    用 matchAll 全局逐项提取（split 取首段会丢掉后面的项）
  const judgeListRe = /判断题?高频[：:]/g;
  while ((m = judgeListRe.exec(examPoint))) {
    const rest = examPoint.slice(m.index + m[0].length);
    for (const im of rest.matchAll(/([^、;；。]+?)[（(](对|错)[)）]/g)) {
      const stemPart = im[1].trim();
      if (!stemPart || stemPart.length < 6) continue; // 过短片段易误撞
      parsedQuotes++;
      const hit = matchQuote(stemPart, "judge", code);
      if (!hit || hit.type !== "judge") continue;
      if (!entries.judge[String(hit.id)])
        entries.judge[String(hit.id)] = { code, excerpt: `${stemPart}（${im[2]}）` };
    }
  }
}

const matched = {};
for (const t of TYPES) matched[t] = Object.keys(entries[t]).length;
const totalBank = TYPES.reduce((n, t) => n + theory[t].length, 0);
const out = {
  meta: {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: "lessons.json【易考点】段真题引用句 ↔ theory.json 题干归一化匹配（同章打标题优先）",
    parsedQuotes,
    matched,
    matchedPctOfBank: `${Math.round((matched.judge + matched.single + matched.multi) / totalBank * 100)}%`,
  },
  entries,
};
writeFileSync(new URL("src/data/quizLessons.json", root), JSON.stringify(out, null, 2) + "\n");
console.log(`引用句 ${parsedQuotes} 条；匹配到题目：判断 ${matched.judge} / 单选 ${matched.single} / 多选 ${matched.multi}（覆盖题库 ${out.meta.matchedPctOfBank}）`);
