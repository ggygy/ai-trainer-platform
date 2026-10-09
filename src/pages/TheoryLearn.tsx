import { useRef, useState } from "react";
import { BookOpen, ChevronDown, CircleCheck, CircleX, Image as ImageIcon } from "lucide-react";
import { Card, Badge, Btn, Chip, Ghost, PageHead } from "../components/ui";
import { KNOWLEDGE_TREE, LESSONS } from "../data/content";
import theory from "../data/theory.json";
import { aiKey } from "../lib/answers";
import { loadStore, saveStore } from "../lib/api";

const QUIZ_POOL = (theory as unknown as { single: { id: number; stem: string; options: [string, string][] }[] }).single.slice(0, 8);

export default function TheoryLearn() {
  const [sel, setSel] = useState("k2-2");
  const lesson = LESSONS[sel] ?? Object.values(LESSONS)[0];
  const [quizIdx, setQuizIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const quizRef = useRef<HTMLDivElement>(null);
  const quiz = QUIZ_POOL[quizIdx % QUIZ_POOL.length];
  const mastered = !!loadStore().mastered?.[sel];

  const toggleMastered = () => {
    const s = loadStore();
    s.mastered = { ...(s.mastered ?? {}), [sel]: !s.mastered?.[sel] };
    saveStore(s);
    setMasteredTick((t) => t + 1);
  };
  const [, setMasteredTick] = useState(0);

  // 作答即计入刷题统计；答错写入错题本（与文案承诺一致）
  const answerQuiz = (letter: string) => {
    if (picked !== null) return;
    setPicked(letter);
    const s = loadStore();
    const today = new Date().toISOString().slice(0, 10);
    s.theoryDone = { ...(s.theoryDone ?? {}), [`s${quiz.id}`]: today };
    const right = aiKey.single[String(quiz.id)]?.a;
    if (letter !== right) {
      const wb = [...(s.wrongBook ?? [])];
      const hit = wb.find((w) => w.id === `s${quiz.id}`);
      if (hit) hit.count++;
      else wb.push({ id: `s${quiz.id}`, type: "单选", text: quiz.stem.slice(0, 40), count: 1 });
      s.wrongBook = wb;
    }
    saveStore(s);
  };

  const nextQuiz = () => {
    setQuizIdx((i) => (i + 1) % QUIZ_POOL.length);
    setPicked(null);
  };

  return (
    <div className="flex flex-col gap-4.5 p-7 h-full min-h-0">
      <PageHead
        title={lesson.title}
        sub={lesson.crumb}
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
        <Card className="w-[260px] shrink-0 overflow-y-auto !p-3">
          <div className="text-[11px] font-medium text-ink3 px-2 py-2">知识体系</div>
          <div className="flex flex-col gap-0.5">
            {KNOWLEDGE_TREE.map((n) => {
              const isTop = n.level === 1;
              const active = n.id === sel;
              const hasLesson = !!LESSONS[n.id];
              return (
                <button
                  key={n.id}
                  onClick={() => hasLesson && setSel(n.id)}
                  disabled={!hasLesson}
                  className={`flex items-center gap-2 px-2.5 rounded-lg text-left ${isTop ? "py-2" : "py-1.5 pl-6"} ${
                    active ? "bg-accent-soft" : hasLesson ? "hover:bg-surface2" : "opacity-60 cursor-default"
                  }`}
                  title={hasLesson ? undefined : "课程制作中"}
                >
                  {isTop && <ChevronDown size={13} className="text-ink3 shrink-0" />}
                  <span
                    className={`flex-1 truncate ${isTop ? "text-[13px] text-ink1" : "text-xs"} ${
                      active ? "text-accent-deep font-medium" : isTop ? "" : "text-ink2"
                    }`}
                  >
                    {n.name}
                  </span>
                  {hasLesson && !active && <BookOpen size={12} className="text-ink3 shrink-0" />}
                </button>
              );
            })}
          </div>
        </Card>

        <div className="flex-1 flex flex-col gap-4 min-w-0 overflow-y-auto pb-2">
          <Card>
            <div className="flex flex-wrap gap-2 mb-3.5">
              {lesson.tags.map((t) => (
                <Chip key={t}>{t}</Chip>
              ))}
            </div>
            <p className="text-[13px] leading-relaxed text-ink2 selectable">{lesson.body}</p>
            <div className="rounded-[10px] bg-accent-soft p-3.5 mt-3.5">
              <div className="text-xs font-semibold text-accent-deep mb-2">考试要点</div>
              <div className="flex flex-col gap-1.5">
                {lesson.points.map((p) => (
                  <div key={p} className="flex items-start gap-2">
                    <span className="w-[5px] h-[5px] rounded-full bg-accent mt-1.5 shrink-0" />
                    <span className="text-xs leading-relaxed text-accent-deep selectable">{p}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[10px] bg-surface2 h-[86px] mt-3.5 flex flex-col items-center justify-center gap-2">
              <ImageIcon size={20} className="text-ink3" />
              <div className="text-[11px] text-ink3">知识点图示（开发阶段接入官方资料插图）</div>
            </div>
          </Card>

          <Card>
            <div ref={quizRef} className="flex items-center justify-between mb-3 scroll-mt-3">
              <div className="flex items-center gap-2.5">
                <span className="text-[15px] font-semibold text-ink1">配套例题 · 官方题库</span>
                <Badge tone="accent" dot={false}>
                  单选 {(quizIdx % QUIZ_POOL.length) + 1}/{QUIZ_POOL.length}
                </Badge>
              </div>
              <Ghost onClick={nextQuiz}>下一题</Ghost>
            </div>
            <div className="text-[13px] font-medium leading-relaxed text-ink1 mb-3 selectable">{quiz.stem}</div>
            <div className="flex flex-col gap-2">
              {quiz.options.map(([letter, text]) => {
                const on = picked === letter;
                const right = aiKey.single[String(quiz.id)]?.a;
                const revealed = picked !== null;
                const isRight = right === letter;
                return (
                  <button
                    key={letter}
                    onClick={() => answerQuiz(letter)}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-[10px] border text-left ${
                      revealed && isRight
                        ? "bg-ok-soft border-ok"
                        : on
                          ? "bg-accent-soft border-accent"
                          : "border-line hover:border-ink3"
                    }`}
                  >
                    <span
                      className={`w-[26px] h-[26px] rounded-full flex items-center justify-center text-xs shrink-0 ${
                        revealed && isRight ? "bg-ok text-white" : on ? "bg-accent text-white" : "bg-surface2 text-ink2"
                      }`}
                    >
                      {letter}
                    </span>
                    <span className={`text-[13px] ${on || (revealed && isRight) ? "font-medium text-ink1" : "text-ink1"}`}>{text}</span>
                    {revealed && isRight && <CircleCheck size={15} className="ml-auto text-ok shrink-0" />}
                    {on && !isRight && <CircleX size={15} className="ml-auto text-bad shrink-0" />}
                  </button>
                );
              })}
            </div>
            {picked !== null && (
              <div className="mt-3 text-xs text-ink2">
                正确答案：<b className="text-ok">{aiKey.single[String(quiz.id)]?.a}</b>
                {picked !== aiKey.single[String(quiz.id)]?.a && (
                  <span className="text-bad"> · 本题已自动加入错题强化（可点「下一题」继续）</span>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
