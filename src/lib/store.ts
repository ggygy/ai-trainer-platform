// 全局状态：zustand + persist（存储介质与 key 均沿用 atp.store.v1，见 ADR-0009）
// 所有写路径必须走 action，禁止组件直接读写 localStorage（StrictMode 双跑防护仍在页面层，如 savedRef）
import { create } from "zustand";
import { persist, type PersistStorage } from "zustand/middleware";
import type { Store } from "./api";

type WrongItem = Store["wrongBook"][number];

type Actions = {
  /** 通用浅更新（仅限确无语义动作的简单场景） */
  update: (patch: Partial<Store> | ((s: Store) => Partial<Store>)) => void;
  /** 交卷落库：历史 + 错题 + （非官方卷）刷题统计，一次写入 */
  submitExam: (p: { score: number; minutes: number; wrong: WrongItem[]; theoryKeys: string[] }) => void;
  /** 导入答案：全真卷连续编号拆节（√/×→判断 1-40，字母 41-180→单选-40，≥181→多选-180） */
  importAnswers: (parsed: Record<string, string>) => void;
  clearAnswers: () => void;
  /** 理论学习例题作答：计入刷题统计；答错写入错题本（typeLabel：单选/判断/多选） */
  recordQuizAnswer: (qKey: string, isWrong: boolean, stem: string, typeLabel: string) => void;
  toggleMastered: (id: string) => void;
  markPracticeDone: (key: string) => void;
  setMaterialDir: (dir: string) => void;
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

      update: (patch) => set(patch),

      submitExam: ({ score, minutes, wrong, theoryKeys }) =>
        set((s) => {
          const theoryDone = { ...s.theoryDone };
          for (const k of theoryKeys) theoryDone[k] = today();
          return {
            history: [...s.history, { date: today(), score, theory: null, practical: null, minutes }],
            wrongBook: [...s.wrongBook, ...wrong],
            theoryDone,
          };
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
