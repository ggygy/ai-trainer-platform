import { useRef, useState } from "react";
import { BookOpen, ChevronDown, CircleCheck, CircleX, ListTree, Sparkles } from "lucide-react";
import { Card, Badge, Btn, Chip, Ghost, PageHead } from "../components/ui";
import { KNOWLEDGE_TREE, LESSONS, LESSON_SOURCE_NOTE, SYLLABUS, lessonQuizIds, type Lesson } from "../data/content";
import theory from "../data/theory.json";
import { aiKey } from "../lib/answers";
import { useStore } from "../lib/store";

const singleBank = (theory as unknown as { single: { id: number; stem: string; options: [string, string][] }[] }).single;

export default function TheoryLearn() {
  const [sel, setSel] = useState("3.1.1"); // 默认打开最高权重单元（3.1 共 18 分）的第一章
  const lesson = LESSONS[sel];
  const [quizIdx, setQuizIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const quizRef = useRef<HTMLDivElement>(null);
  const quizIds = lessonQuizIds(sel);
  const quizId = quizIds[quizIdx % quizIds.length];
  const quiz = singleBank.find((q) => q.id === quizId)!;
  const mastered = useStore((s) => !!s.mastered?.[sel]);

  const select = (id: string) => {
    if (id === sel) return;
    setSel(id);
    setQuizIdx(0);
    setPicked(null);
  };

  const toggleMastered = () => useStore.getState().toggleMastered(sel);

  // 作答即计入刷题统计；答错写入错题本（与文案承诺一致）
  const answerQuiz = (letter: string) => {
    if (picked !== null) return;
    setPicked(letter);
    const right = aiKey.single[String(quizId)]?.a;
    useStore.getState().recordQuizAnswer(`s${quizId}`, letter !== right, quiz.stem);
  };

  const nextQuiz = () => {
    setQuizIdx((i) => (i + 1) % quizIds.length);
    setPicked(null);
  };

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
          <QuizCard quizRef={quizRef} quiz={quiz} quizIdx={quizIdx} total={quizIds.length} picked={picked} onPick={answerQuiz} onNext={nextQuiz} />
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
  return (
    <Card>
      <div className="flex flex-wrap gap-2 mb-3.5">
        {lesson.tags.map((t) => (
          <Chip key={t}>{t}</Chip>
        ))}
      </div>
      {lesson.body.split("\n\n").map((p, i) => (
        <p key={i} className="text-[13px] leading-relaxed text-ink2 selectable mb-3 last:mb-0">
          {p}
        </p>
      ))}
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
  quiz,
  quizIdx,
  total,
  picked,
  onPick,
  onNext,
}: {
  quizRef: React.RefObject<HTMLDivElement | null>;
  quiz: { id: number; stem: string; options: [string, string][] };
  quizIdx: number;
  total: number;
  picked: string | null;
  onPick: (letter: string) => void;
  onNext: () => void;
}) {
  const right = aiKey.single[String(quiz.id)]?.a;
  const revealed = picked !== null;
  return (
    <Card>
      <div ref={quizRef} className="flex items-center justify-between mb-3 scroll-mt-3">
        <div className="flex items-center gap-2.5">
          <span className="text-[15px] font-semibold text-ink1">配套例题 · 本章真题</span>
          <Badge tone="accent" dot={false}>
            例题 {(quizIdx % total) + 1}/{total}
          </Badge>
        </div>
        <Ghost onClick={onNext}>下一题</Ghost>
      </div>
      <div className="text-[13px] font-medium leading-relaxed text-ink1 mb-3 selectable">{quiz.stem}</div>
      <div className="flex flex-col gap-2">
        {quiz.options.map(([letter, text]) => {
          const on = picked === letter;
          const isRight = right === letter;
          return (
            <button
              key={letter}
              onClick={() => onPick(letter)}
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
      {revealed && (
        <div className="mt-3 text-xs text-ink2">
          正确答案：<b className="text-ok">{right}</b>
          {picked !== right && <span className="text-bad"> · 本题已自动加入错题强化（可点「下一题」继续）</span>}
        </div>
      )}
      <div className="mt-3 text-[11px] text-ink3 flex items-center gap-1.5">
        <BookOpen size={12} />
        例题取自本章打标真题；本章真题不足 4 道时自动回补同单元真题。
      </div>
    </Card>
  );
}
