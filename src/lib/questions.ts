// 按题目 key 反查题目全貌：题干、选项、参考答案与来源、所属章节（考点）。
// key 家族与错题本/试卷一致：刷题/练习 j|s|m+题库id，官方卷 oj|os|om+卷内序号。
// 错题本只落 key + 前 40 字摘要，答题回顾与错题详情都靠这里现场还原，存储结构不必扩。
import theory from "../data/theory.json";
import { LESSONS, QUESTION_TAGS } from "../data/content";
import { officialPaper, refAnswer, type Conf } from "./answers";
import type { Store } from "./api";

export type QType = "judge" | "single" | "multi";
export const TYPE_LABEL: Record<QType, string> = { judge: "判断", single: "单选", multi: "多选" };
/** 判断题映射为两个「选项」，与单选/多选共用一套渲染 */
export const JUDGE_OPTIONS: [string, string][] = [
  ["√", "正确"],
  ["×", "错误"],
];

const bank = theory as unknown as {
  judge: { id: number; stem: string }[];
  single: { id: number; stem: string; options: [string, string][] }[];
  multi: { id: number; stem: string; options: [string, string][] }[];
};

export type ResolvedQ = {
  key: string;
  type: QType;
  /** 题库 id（j/s/m）或官方卷卷内序号（oj/os/om） */
  id: number;
  official: boolean;
  stem: string;
  options: [string, string][];
  /** 参考答案字母串（多选如 "ACD"，判断为 √/×）；无任何参考答案时为 null */
  answer: string | null;
  src: "official" | "user" | "ai" | null;
  conf?: Conf;
  chapter?: { code: string; title: string };
};

export function parseKey(key: string): { type: QType; id: number; official: boolean } | null {
  const m = key.match(/^(o?)([jsm])(\d+)$/);
  if (!m) return null;
  const type: QType = m[2] === "j" ? "judge" : m[2] === "s" ? "single" : "multi";
  return { type, id: parseInt(m[3]), official: m[1] === "o" };
}

/** 判分：多选要求字母集合完全一致，单选/判断单字母相等；无参考答案视为不可判（false） */
export function isCorrect(answer: string | null | undefined, picked: string[]): boolean {
  if (!answer) return false;
  const right = answer.length > 1 ? answer.split("").sort() : [answer];
  return picked.length === right.length && picked.every((a) => right.includes(a));
}

export function srcLabel(q: Pick<ResolvedQ, "src" | "conf">): string {
  if (q.src === "official") return "官方答案";
  if (q.src === "user") return "导入答案";
  if (q.src === "ai") return q.conf === "low" ? "AI 参考 · 低置信，仅供参考" : q.conf === "medium" ? "AI 参考 · 中置信" : "AI 参考";
  return "暂无参考答案，本题未计分";
}

export function chapterOf(type: QType, bankId: number): { code: string; title: string } | undefined {
  const code = QUESTION_TAGS[type][String(bankId)];
  const lesson = code ? LESSONS[code] : undefined;
  return lesson ? { code, title: lesson.title } : undefined;
}

// 官方卷是 900 题库的子集但没存对应 id，按归一化题干反查以便给官方卷题挂章节考点。
// NFKC 统一全半角后再剥标点与空白——只去空白会因标点差异漏掉一批。
const norm = (s: string) => s.normalize("NFKC").replace(/\s+/g, "").replace(/[，。；：？！（）【】「」《》、,.;:?!()[\]<>"']/g, "");
let stemIndex: Map<string, number> | null = null;
function bankIdByStem(type: QType, stem: string): number | undefined {
  if (!stemIndex) {
    stemIndex = new Map();
    for (const t of ["judge", "single", "multi"] as const) for (const q of bank[t]) stemIndex.set(`${t}|${norm(q.stem)}`, q.id);
  }
  return stemIndex.get(`${type}|${norm(stem)}`);
}

export function resolveQuestion(store: Store, key: string): ResolvedQ | null {
  const p = parseKey(key);
  if (!p) return null;
  const { type, id, official } = p;
  const letters = (opts: string[]) => opts.map((t, i) => [String.fromCharCode(65 + i), t] as [string, string]);

  if (official) {
    if (type === "judge") {
      const q = officialPaper.judge.find((x) => x.n === id);
      if (!q) return null;
      const bankId = bankIdByStem(type, q.stem);
      return { key, type, id, official, stem: q.stem, options: JUDGE_OPTIONS, answer: q.answer, src: "official", chapter: bankId === undefined ? undefined : chapterOf(type, bankId) };
    }
    const q = (type === "single" ? officialPaper.single : officialPaper.multi).find((x) => x.n === id);
    if (!q) return null;
    const bankId = bankIdByStem(type, q.stem);
    return { key, type, id, official, stem: q.stem, options: letters(q.options), answer: q.answer, src: "official", chapter: bankId === undefined ? undefined : chapterOf(type, bankId) };
  }

  const ref = refAnswer(store, type, id);
  const base = { key, type, id, official, answer: ref?.a ?? null, src: ref?.src ?? null, conf: ref && "conf" in ref ? ref.conf : undefined, chapter: chapterOf(type, id) };
  if (type === "judge") {
    const q = bank.judge.find((x) => x.id === id);
    return q ? { ...base, stem: q.stem, options: JUDGE_OPTIONS } : null;
  }
  const q = bank[type].find((x) => x.id === id);
  return q ? { ...base, stem: q.stem, options: q.options } : null;
}
