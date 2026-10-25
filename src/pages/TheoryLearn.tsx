import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, CircleX, ListTree, Sparkles, X } from "lucide-react";
import { Card, Badge, Btn, Chip, Ghost, PageHead } from "../components/ui";
import { KNOWLEDGE_TREE, LESSONS, LESSON_SOURCE_NOTE, SYLLABUS, lessonQuiz, type Lesson, type QuizQuestion } from "../data/content";
import theory from "../data/theory.json";
import quizLinksRaw from "../data/quizLessons.json";
import { aiKey } from "../lib/answers";
import { useStore } from "../lib/store";
import type { PageId } from "../components/Sidebar";

const bank = theory as unknown as {
  judge: { id: number; stem: string }[];
  single: { id: number; stem: string; options: [string, string][] }[];
  multi: { id: number; stem: string; options: [string, string][] }[];
};
const TYPE_LABEL = { judge: "判断", single: "单选", multi: "多选" } as const;
const quizLinks = quizLinksRaw as unknown as {
  entries: Record<"judge" | "single" | "multi", Record<string, { code: string; excerpt: string }>>;
};

/** 一道例题的作答快照：切题/切回后仍能看到当时的选择与判分 */
type QuizState = { picked?: string | null; pickedMulti?: string[]; submitted?: boolean };

export default function TheoryLearn({ go, initial }: { go: (p: PageId) => void; initial?: string }) {
  // 默认打开最高权重单元（3.1 共 18 分）的第一章；答题回顾「去看讲义」传入章节代码则直接落到该章
  const [sel, setSel] = useState(initial && LESSONS[initial] ? initial : "3.1.1");
  const lesson = LESSONS[sel];
  const [quizIdx, setQuizIdx] = useState(0); // 指向本章 quizPool 的绝对下标
  const [answersMap, setAnswersMap] = useState<Record<string, QuizState>>({}); // qKey → 作答快照
  const [filter, setFilter] = useState<"all" | "undo" | "wrong">("all");
  const [showPoint, setShowPoint] = useState(false); // 「本题考点」弹层
  const quizRef = useRef<HTMLDivElement>(null);
  const quizPool = lessonQuiz(sel); // 仅本章打标真题，单选/判断/多选交错
  const q: QuizQuestion = quizPool[quizIdx % quizPool.length];
  const item = bank[q.type].find((x) => x.id === q.id)!;
  const mastered = useStore((s) => !!s.mastered?.[sel]);
  const doneMap = useStore((s) => s.theoryDone);
  const wrongBook = useStore((s) => s.wrongBook);
  const chapterFinished = quizPool.every((x) => doneMap?.[`${x.type[0]}${x.id}`]);
  const wrongSet = new Set(wrongBook.map((w) => w.id));
  const keyOf = (x: QuizQuestion) => `${x.type[0]}${x.id}`;

  // 筛选后的导航池（题目本体不变，只影响上一题/下一题与答题卡网格）
  const navPool =
    filter === "undo"
      ? quizPool.filter((x) => !doneMap?.[keyOf(x)])
      : filter === "wrong"
        ? quizPool.filter((x) => wrongSet.has(keyOf(x)))
        : quizPool;

  const select = (id: string) => {
    if (id === sel) return;
    setSel(id);
    setQuizIdx(0);
    setFilter("all");
    setShowPoint(false);
  };

  const toggleMastered = () => useStore.getState().toggleMastered(sel);

  // 作答即计入刷题统计；答错写入错题本（与文案承诺一致）
  const reveal = (isWrong: boolean) => {
    useStore.getState().recordQuizAnswer(keyOf(q), isWrong, item.stem, TYPE_LABEL[q.type]);
  };
  const qState = answersMap[keyOf(q)] ?? {};
  const pickSingle = (letter: string) => {
    if (qState.picked != null) return;
    setAnswersMap((m) => ({ ...m, [keyOf(q)]: { ...m[keyOf(q)], picked: letter } }));
    const right = aiKey[q.type === "judge" ? "judge" : "single"][String(q.id)]?.a;
    reveal(letter !== right);
  };
  const toggleMulti = (letter: string) => {
    if (qState.submitted) return;
    const cur = qState.pickedMulti ?? [];
    setAnswersMap((m) => ({
      ...m,
      [keyOf(q)]: { ...m[keyOf(q)], pickedMulti: cur.includes(letter) ? cur.filter((x) => x !== letter) : [...cur, letter].sort() },
    }));
  };
  const submitMulti = () => {
    const picked = qState.pickedMulti ?? [];
    if (qState.submitted || picked.length === 0) return;
    setAnswersMap((m) => ({ ...m, [keyOf(q)]: { ...m[keyOf(q)], submitted: true } }));
    reveal(picked.join("") !== aiKey.multi[String(q.id)]?.a);
  };

  // 在导航池内跳转；当前题被筛选滤掉时落到池首
  const step = (dir: 1 | -1) => {
    if (!navPool.length) return;
    const pos = navPool.findIndex((x) => keyOf(x) === keyOf(q));
    const nextPos = pos === -1 ? 0 : (pos + dir + navPool.length) % navPool.length;
    setQuizIdx(quizPool.findIndex((x) => keyOf(x) === keyOf(navPool[nextPos])));
  };
  const jumpTo = (x: QuizQuestion) => setQuizIdx(quizPool.findIndex((y) => keyOf(y) === keyOf(x)));

  return (
    <div className="flex flex-col gap-4.5 p-7 h-full min-h-0">
      <PageHead
        title={lesson.title}
        sub={`理论学习 / ${lesson.unit.replace(/^(\d+\.\d+)\s/, "$1 · ")}`}
        right={
          <>
            {mastered && <Badge>已掌握 ✓</Badge>}
            <Btn onClick={toggleMastered}>{mastered ? "取消掌握标记" : "标记已掌握"}</Btn>
            <Btn primary onClick={() => quizRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              做配套例题
            </Btn>
          </>
        }
      />
      <div className="flex gap-4 flex-1 min-h-0">
        <KnowledgeTree sel={sel} onSelect={select} />
        <div className="flex-1 flex flex-col gap-4 min-w-0 overflow-y-auto pb-2">
          <LessonCard lesson={lesson} />
          <SyllabusPoints code={sel} />
          {chapterFinished && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-[12px] border border-ok bg-ok-soft">
              <CircleCheck size={16} className="text-ok shrink-0" />
              <span className="text-xs text-ink2 flex-1">本章 {quizPool.length} 道真题已全部刷过，可继续轮刷，或去全库练习（含未打标题）。</span>
              <Btn onClick={() => go("exam")}>去全库刷题</Btn>
            </div>
          )}
          <QuizCard
            quizRef={quizRef}
            type={q.type}
            item={item}
            idx={quizIdx}
            total={quizPool.length}
            quizPool={quizPool}
            navPool={navPool}
            filter={filter}
            onFilter={setFilter}
            qState={qState}
            onPickSingle={pickSingle}
            onToggleMulti={toggleMulti}
            onSubmitMulti={submitMulti}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            onJump={jumpTo}
            isDone={(x) => !!doneMap?.[keyOf(x)]}
            isWrong={(x) => wrongSet.has(keyOf(x))}
            curKey={keyOf(q)}
            onShowPoint={() => setShowPoint(true)}
          />
          {showPoint && (
            <PointModal
              type={q.type}
              id={q.id}
              fallbackCode={sel}
              onClose={() => setShowPoint(false)}
            />
          )}
          <div className="text-[11px] text-ink3 leading-relaxed flex items-start gap-1.5">
            <Sparkles size={13} className="mt-0.5 shrink-0" />
            {LESSON_SOURCE_NOTE}
          </div>
        </div>
      </div>
    </div>
  );
}

function KnowledgeTree({ sel, onSelect }: { sel: string; onSelect: (id: string) => void }) {
  const masteredMap = useStore((s) => s.mastered);
  return (
    <Card className="w-[290px] shrink-0 overflow-y-auto !p-3">
      <div className="text-[11px] font-medium text-ink3 px-2 py-2">官方知识体系 · 共 100 分 / 21 章</div>
      <div className="flex flex-col gap-0.5">
        {KNOWLEDGE_TREE.map((n) => {
          if (n.level === 1)
            return (
              <div key={n.id} className="flex items-center gap-2 px-2.5 pt-3 pb-1.5">
                <ChevronDown size={13} className="text-ink3 shrink-0" />
                <span className="flex-1 text-[13px] font-semibold text-ink1 truncate">
                  {n.code} {n.name}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-surface2 text-[10px] font-mono font-semibold text-ink2 shrink-0">{n.score} 分</span>
              </div>
            );
          const active = n.id === sel;
          const done = !!masteredMap?.[n.id];
          return (
            <button
              key={n.id}
              onClick={() => onSelect(n.id)}
              className={`flex items-center gap-2 px-2.5 py-1.5 pl-6 rounded-lg text-left transition-colors ${
                active ? "bg-accent-soft" : "hover:bg-surface2"
              }`}
              title={`${n.name} · ${n.score} 分 · ${n.pointCount} 个细目点`}
            >
              <span
                className={`flex-1 text-xs truncate ${active ? "text-accent-deep font-medium" : "text-ink2"}`}
              >
                {n.name}
              </span>
              {done && <CircleCheck size={12} className="text-ok shrink-0" />}
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 ${n.score >= 5 ? "bg-accent-soft text-accent-deep" : "bg-surface2 text-ink3"}`}>
                {n.score}分
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function LessonCard({ lesson }: { lesson: Lesson }) {
  const paragraphs = lesson.body.split("\n\n");
  const [open, setOpen] = useState(false);
  const long = paragraphs.length > 5; // 长讲义默认收起前 5 段，避免淹没页面
  return (
    <Card>
      <div className="flex flex-wrap gap-2 mb-3.5">
        {lesson.tags.map((t) => (
          <Chip key={t}>{t}</Chip>
        ))}
      </div>
      <div className={`flex flex-col ${long && !open ? "max-h-[420px] overflow-hidden relative" : ""}`}>
        {paragraphs.map((p, i) => (
          <p key={i} className="text-[13px] leading-relaxed text-ink2 selectable mb-3 last:mb-0">
            {p}
          </p>
        ))}
        {long && !open && <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-surface to-transparent" />}
      </div>
      {long && (
        <div className="flex justify-end -mt-1 mb-1">
          <Ghost onClick={() => setOpen((v) => !v)}>{open ? "收起讲义" : "展开全部讲义"}</Ghost>
        </div>
      )}
      <div className="rounded-[10px] bg-accent-soft p-3.5 mt-3.5">
        <div className="text-xs font-semibold text-accent-deep mb-2">考试要点</div>
        <div className="flex flex-col gap-1.5">
          {lesson.keyPoints.map((p) => (
            <div key={p} className="flex items-start gap-2">
              <span className="w-[5px] h-[5px] rounded-full bg-accent mt-1.5 shrink-0" />
              <span className="text-xs leading-relaxed text-accent-deep selectable">{p}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function SyllabusPoints({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const chapter = SYLLABUS.domains.flatMap((d) => d.chapters).find((c) => c.code === code)!;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ListTree size={15} className="text-accent" />
          <span className="text-[15px] font-semibold text-ink1">官方细目点清单（{chapter.points.length} 个）</span>
        </div>
        <Ghost onClick={() => setOpen((v) => !v)}>{open ? "收起" : "展开全部"}</Ghost>
      </div>
      <div className={`mt-3 flex flex-col gap-1.5 ${open ? "" : "max-h-[120px] overflow-hidden relative"}`}>
        {chapter.points.map((p, i) => (
          <div key={p} className="flex items-start gap-2.5">
            <span className="text-[10px] font-mono text-ink3 shrink-0 mt-0.5 w-6 text-right">{String(i + 1).padStart(2, "0")}</span>
            <span className="text-xs leading-relaxed text-ink2 selectable">{p}</span>
          </div>
        ))}
        {!open && <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent" />}
      </div>
      {!open && (
        <div className="mt-2 text-[11px] text-ink3">细目点是官方公布的考点最小单位——本章所有真题都从这些点里出。</div>
      )}
    </Card>
  );
}

function QuizCard({
  quizRef,
  type,
  item,
  idx,
  total,
  quizPool,
  navPool,
  filter,
  onFilter,
  qState,
  onPickSingle,
  onToggleMulti,
  onSubmitMulti,
  onPrev,
  onNext,
  onJump,
  isDone,
  isWrong,
  curKey,
  onShowPoint,
}: {
  quizRef: React.RefObject<HTMLDivElement | null>;
  type: QuizQuestion["type"];
  item: { id: number; stem: string; options?: [string, string][] };
  idx: number;
  total: number;
  quizPool: QuizQuestion[];
  navPool: QuizQuestion[];
  filter: "all" | "undo" | "wrong";
  onFilter: (f: "all" | "undo" | "wrong") => void;
  qState: QuizState;
  onPickSingle: (letter: string) => void;
  onToggleMulti: (letter: string) => void;
  onSubmitMulti: () => void;
  onPrev: () => void;
  onNext: () => void;
  onJump: (x: QuizQuestion) => void;
  isDone: (x: QuizQuestion) => boolean;
  isWrong: (x: QuizQuestion) => boolean;
  curKey: string;
  onShowPoint: () => void;
}) {
  const right = aiKey[type][String(item.id)]?.a;
  // 判断题映射成 √/× 两个「选项」；单选/多选用题库自带选项
  const options: [string, string][] =
    type === "judge" ? ([["√", "正确"], ["×", "错误"]] as [string, string][]) : (item.options ?? []);
  const revealed = type === "multi" ? !!qState.submitted : qState.picked != null;
  const isRight = (letter: string) => (type === "multi" ? !!right?.includes(letter) : right === letter);
  const keyOf = (x: QuizQuestion) => `${x.type[0]}${x.id}`;
  return (
    <Card>
      <div ref={quizRef} className="flex items-center justify-between mb-3 scroll-mt-3">
        <div className="flex items-center gap-2.5">
          <span className="text-[15px] font-semibold text-ink1">配套例题</span>
          <span className="px-2.5 py-1 rounded-full text-xs bg-surface2 text-ink2">{TYPE_LABEL[type]}</span>
          <Badge tone="accent" dot={false}>
            例题 {idx + 1}/{total}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Ghost onClick={onShowPoint}>查看本题考点</Ghost>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onPrev}
              disabled={!navPool.length}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface2 text-xs text-ink2 hover:bg-accent-soft hover:text-accent disabled:opacity-40"
            >
              <ChevronLeft size={13} /> 上一题
            </button>
            <button
              onClick={onNext}
              disabled={!navPool.length}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface2 text-xs text-ink2 hover:bg-accent-soft hover:text-accent disabled:opacity-40"
            >
              下一题 <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* 筛选 + 答题卡：可按状态过滤后自由跳题 */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {(
          [
            ["all", `全部 ${total}`],
            ["undo", `只刷未做 ${quizPool.filter((x) => !isDone(x)).length}`],
            ["wrong", `只刷错题 ${quizPool.filter((x) => isWrong(x)).length}`],
          ] as const
        ).map(([k, label]) => (
          <Chip key={k} active={filter === k} onClick={() => onFilter(k)}>
            {label}
          </Chip>
        ))}
      </div>
      {navPool.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {navPool.map((x) => {
            const k = keyOf(x);
            const isCur = k === curKey;
            const wrong = isWrong(x);
            const done = isDone(x);
            return (
              <button
                key={k}
                onClick={() => onJump(x)}
                title={`${TYPE_LABEL[x.type]} · ${wrong ? "做错过" : done ? "已做" : "未做"}`}
                className={`w-6 h-6 rounded-md text-[10px] flex items-center justify-center ${
                  isCur
                    ? "bg-accent text-white font-semibold"
                    : wrong
                      ? "bg-bad-soft text-bad"
                      : done
                        ? "bg-accent-soft text-accent-deep"
                        : "bg-surface2 text-ink3 hover:bg-line"
                }`}
              >
                {quizPool.findIndex((y) => keyOf(y) === k) + 1}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mb-3 px-3 py-2.5 rounded-lg bg-ok-soft text-xs text-ink2">
          {filter === "undo" ? "本章题目已全部刷过——可切回「全部」轮刷，或去全库练习。" : "本章暂无错题记录。"}
        </div>
      )}

      <div className="text-[13px] font-medium leading-relaxed text-ink1 mb-3 selectable">
        {type === "judge" && <span className="text-ink3">（判断对错）</span>}
        {type === "multi" && <span className="text-ink3">（多选，勾选后提交）</span>}
        {item.stem}
      </div>
      <div className="flex flex-col gap-2">
        {options.map(([letter, text]) => {
          const on = type === "multi" ? (qState.pickedMulti ?? []).includes(letter) : qState.picked === letter;
          return (
            <button
              key={letter}
              onClick={() => (type === "multi" ? onToggleMulti(letter) : onPickSingle(letter))}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-[10px] border text-left ${
                revealed && isRight(letter)
                  ? "bg-ok-soft border-ok"
                  : on
                    ? "bg-accent-soft border-accent"
                    : "border-line hover:border-ink3"
              }`}
            >
              <span
                className={`w-[26px] h-[26px] rounded-full flex items-center justify-center text-xs shrink-0 ${
                  revealed && isRight(letter) ? "bg-ok text-white" : on ? "bg-accent text-white" : "bg-surface2 text-ink2"
                }`}
              >
                {letter}
              </span>
              <span className="text-[13px] text-ink1">{text}</span>
              {revealed && isRight(letter) && <CircleCheck size={15} className="ml-auto text-ok shrink-0" />}
              {revealed && on && !isRight(letter) && <CircleX size={15} className="ml-auto text-bad shrink-0" />}
            </button>
          );
        })}
      </div>
      {type === "multi" && !qState.submitted && (
        <div className="mt-3">
          <Btn primary onClick={onSubmitMulti} disabled={!(qState.pickedMulti ?? []).length}>
            提交答案
          </Btn>
        </div>
      )}
      {revealed && (
        <div className="mt-3 text-xs text-ink2">
          正确答案：<b className="text-ok">{right}</b>
          {(type === "multi" ? (qState.pickedMulti ?? []).join("") !== right : qState.picked !== right) && (
            <span className="text-bad"> · 本题已自动加入错题强化（可点「下一题」继续）</span>
          )}
          <span className="text-ink3"> · 点「查看本题考点」回看对应讲义</span>
        </div>
      )}
      <div className="mt-3 text-[11px] text-ink3 flex items-center gap-1.5">
        <BookOpen size={12} />
        例题为 本章打标真题（共 {total} 道，单选/判断/多选交错）；全库 900 题请到「模拟考试」刷题。
      </div>
    </Card>
  );
}

/** 「本题考点」弹层：所属章节 + 讲义易考点出处句（若有）+ 整章讲义（定位到易考点段） */
function PointModal({
  type,
  id,
  fallbackCode,
  onClose,
}: {
  type: QuizQuestion["type"];
  id: number;
  fallbackCode: string; // 无精确出处时的章节（例题都来自当前章）
  onClose: () => void;
}) {
  const link = quizLinks.entries[type][String(id)];
  const code = link?.code ?? fallbackCode;
  const lesson = LESSONS[code];
  const examRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    // 打开即定位到【易考点】段
    examRef.current?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-8" onClick={onClose}>
      <div
        className="w-[760px] max-w-full max-h-full rounded-[14px] bg-surface border border-line shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <BookOpen size={15} className="text-accent shrink-0" />
            <span className="text-sm font-semibold text-ink1 truncate">
              {code} {lesson.title}
            </span>
            <Badge tone="accent" dot={false}>
              本题考点
            </Badge>
          </div>
          <button onClick={onClose} className="text-ink3 hover:text-ink1 shrink-0">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          {link ? (
            <div className="rounded-[10px] bg-accent-soft border border-accent/25 p-3.5 mb-4">
              <div className="text-[11px] font-semibold text-accent-deep mb-1.5">本题在讲义【易考点】中的出处</div>
              <div className="text-[13px] leading-relaxed text-ink1 selectable">{link.excerpt}</div>
            </div>
          ) : (
            <div className="rounded-[10px] bg-surface2 p-3.5 mb-4 text-xs text-ink2 leading-relaxed">
              本题暂无逐题出处句，下方是整章讲义——【易考点】段列有本章全部真题的考法与答案。
            </div>
          )}
          <div className="flex flex-col">
            {lesson.body.split("\n\n").map((p, i) =>
              p.startsWith("【易考点】") ? (
                <div key={i} ref={examRef} className="scroll-mt-4 rounded-[10px] border border-accent/30 bg-accent-soft/40 p-3 my-2">
                  <p className="text-[13px] leading-relaxed text-ink2 selectable">{p}</p>
                </div>
              ) : (
                <p key={i} className="text-[13px] leading-relaxed text-ink2 selectable mb-3 last:mb-0">
                  {p}
                </p>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
