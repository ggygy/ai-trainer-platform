// 全局状态：zustand + persist（存储介质与 key 均沿用 atp.store.v1，见 ADR-0009）
// 所有写路径必须走 action，禁止组件直接读写 localStorage（StrictMode 双跑防护仍在页面层，如 savedRef）
import { create } from "zustand";
import { persist, type PersistStorage } from "zustand/middleware";
import type { ExamDetail, Store } from "./api";

type WrongItem = Store["wrongBook"][number];

/** 逐题回顾数据只保留最近 N 场（每场官方卷约 5KB，防 localStorage 无限增长）；更早的场次只留分数 */
const DETAIL_KEEP = 30;

type Actions = {
  /** 通用浅更新（仅限确无语义动作的简单场景） */
  update: (patch: Partial<Store> | ((s: Store) => Partial<Store>)) => void;
  /** 交卷落库：历史 + 错题 + （非官方卷）刷题统计，一次写入；removeWrongKeys=错题重练模式，答对的题移出错题本 */
  submitExam: (p: { score: number; minutes: number; wrong: WrongItem[]; theoryKeys: string[]; removeWrongKeys?: string[]; detail?: ExamDetail }) => void;
  /** 导入答案：全真卷连续编号拆节（√/×→判断 1-40，字母 41-180→单选-40，≥181→多选-180） */
  importAnswers: (parsed: Record<string, string>) => void;
  clearAnswers: () => void;
  /** 理论学习例题作答：计入刷题统计；答错写入错题本（typeLabel：单选/判断/多选） */
  recordQuizAnswer: (qKey: string, isWrong: boolean, stem: string, typeLabel: string) => void;
  toggleMastered: (id: string) => void;
  markPracticeDone: (key: string) => void;
  setMaterialDir: (dir: string) => void;
  setMockProfile: (p: Partial<Store["mockProfile"]>) => void;
  savePracticalAnswer: (key: string, text: string) => void;
};

const today = () => new Date().toISOString().slice(0, 10);

// 旧数据是裸 Store 对象，zustand persist 的信封是 { state, version }——读取时两者都认，
// 首次写回即统一为信封格式（用户已积累的备考数据无缝迁移）
const legacyAwareStorage: PersistStorage<Store> = {
  getItem: (name) => {
    const raw = localStorage.getItem(name);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && "state" in parsed && "version" in parsed) {
        return parsed as { state: Store; version: number };
      }
      return { state: parsed as Store, version: 0 };
    } catch {
      return null;
    }
  },
  setItem: (name, value) => localStorage.setItem(name, JSON.stringify(value)),
  removeItem: (name) => localStorage.removeItem(name),
};

export const useStore = create<Store & Actions>()(
  persist(
    (set) => ({
      practice: {},
      history: [],
      wrongBook: [],
      answerKey: {},
      theoryDone: {},
      mastered: {},
      materialDir: navigator.userAgent.includes("Windows")
        ? "C:/Users/Public/Documents/人工智能训练师三级上网素材"
        : "/Users/zhouwangjun/Desktop/codeing/AI/人工智能训练师三级上网素材",
      materialDirCustom: false,
      mockProfile: {},
      practicalAnswers: {},

      update: (patch) => set(patch),

      submitExam: ({ score, minutes, wrong, theoryKeys, removeWrongKeys, detail }) =>
        set((s) => {
          const theoryDone = { ...s.theoryDone };
          for (const k of theoryKeys) theoryDone[k] = today();
          let wrongBook = [...s.wrongBook, ...wrong];
          if (removeWrongKeys) {
            // 错题重练交卷：答对（removeWrongKeys 只含答对的）移出错题本；
            // 答错的原记录 count+1、不追加重复条目；未作答的原样保留
            const wrongKeys = new Set(wrong.map((w) => w.id));
            const remove = new Set(removeWrongKeys);
            wrongBook = s.wrongBook
              .filter((w) => !remove.has(w.id))
              .map((w) => (wrongKeys.has(w.id) ? { ...w, count: w.count + 1 } : w));
          }
          const history = [...s.history, { date: today(), score, theory: null, practical: null, minutes, detail }];
          const cut = history.length - DETAIL_KEEP;
          for (let i = 0; i < cut; i++) if (history[i].detail) history[i] = { ...history[i], detail: undefined };
          return { history, wrongBook, theoryDone };
        }),

      importAnswers: (parsed) =>
        set((s) => {
          const judge = { ...(s.answerKey.judge ?? {}) };
          const single = { ...(s.answerKey.single ?? {}) };
          const multi = { ...(s.answerKey.multi ?? {}) };
          for (const [id, a] of Object.entries(parsed)) {
            const n = parseInt(id);
            if (a === "√" || a === "对") judge[String(n)] = "√";
            else if (a === "×" || a === "错") judge[String(n)] = "×";
            else if (n > 180) multi[String(n - 180)] = a;
            else if (n > 40) single[String(n - 40)] = a;
            else single[String(n)] = a;
          }
          return { answerKey: { judge, single, multi } };
        }),

      clearAnswers: () => set({ answerKey: { judge: {}, single: {}, multi: {} } }),

      recordQuizAnswer: (qKey, isWrong, stem, typeLabel) =>
        set((s) => {
          const exists = s.wrongBook.some((w) => w.id === qKey);
          const wrongBook = isWrong
            ? exists
              ? s.wrongBook.map((w) => (w.id === qKey ? { ...w, count: w.count + 1 } : w))
              : [...s.wrongBook, { id: qKey, type: typeLabel, text: stem.slice(0, 40), count: 1 }]
            : s.wrongBook;
          return { theoryDone: { ...s.theoryDone, [qKey]: today() }, wrongBook };
        }),

      toggleMastered: (id) =>
        set((s) => ({ mastered: { ...s.mastered, [id]: !s.mastered?.[id] } })),

      markPracticeDone: (key) =>
        set((s) => ({ practice: { ...s.practice, [key]: { done: true, lastAt: today() } } })),

      setMaterialDir: (dir) => set({ materialDir: dir, materialDirCustom: true }),

      setMockProfile: (p) => set((s) => ({ mockProfile: { ...s.mockProfile, ...p } })),

      savePracticalAnswer: (key, text) =>
        set((s) => ({ practicalAnswers: { ...s.practicalAnswers, [key]: text } })),
    }),
    {
      name: "atp.store.v1",
      version: 1,
      storage: legacyAwareStorage,
      // 与旧 loadStore 的浅合并语义一致：新增顶层字段时旧数据不丢
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<Store>) }),
    }
  )
);
