import aiRaw from "../data/aiAnswers.json";
import mockRaw from "../data/mock190.json";
import practicalRaw from "../data/practicalAnswers.json";
import type { Store } from "./api";

export type Conf = "high" | "medium" | "low";

/** 900 题复习题的 AI 参考答案（待人工校验，用户导入的官方答案优先） */
export const aiKey = aiRaw as unknown as {
  meta: { source: string; generatedAt: string };
  judge: Record<string, { a: string; c: Conf }>;
  single: Record<string, { a: string; c: Conf }>;
  multi: Record<string, { a: string; c: Conf }>;
};

/** 第5部分官方模拟卷（190 题，含官方答案） */
export const officialPaper = mockRaw as unknown as {
  meta: {
    source: string;
    durationMin: number;
    totalScore: number;
    scores: { judge: number; single: number; multi: number };
  };
  judge: { n: number; stem: string; answer: string }[];
  single: { n: number; stem: string; options: string[]; answer: string }[];
  multi: { n: number; stem: string; options: string[]; answer: string }[];
};

/** 实操 40 题官方参考答案（题号 "1.1.1" → 答案文本） */
export const practicalRef = practicalRaw as unknown as { answers: Record<string, string> };

export function aiStats() {
  let high = 0, medium = 0, low = 0, total = 0;
  for (const t of ["judge", "single", "multi"] as const)
    for (const v of Object.values(aiKey[t])) {
      total++;
      if (v.c === "high") high++;
      else if (v.c === "medium") medium++;
      else low++;
    }
  return { high, medium, low, total };
}

/**
 * 查一题的参考答案。优先级：用户从「AI学讯」导入的官方答案 > AI 参考答案。
 * 用户答案按全真卷连续编号拆节存放（判断 1-40 / 单选 1-140 / 多选 1-10 各自的题号）。
 */
export function refAnswer(
  store: Store,
  type: "judge" | "single" | "multi",
  id: number
): { a: string; src: "user" | "ai"; conf?: Conf } | null {
  const userMap =
    type === "judge" ? store.answerKey.judge : type === "multi" ? store.answerKey.multi : store.answerKey.single;
  const user = userMap?.[String(id)];
  if (user) return { a: user, src: "user" };
  const ai = aiKey[type][String(id)];
  return ai ? { a: ai.a, src: "ai", conf: ai.c } : null;
}
