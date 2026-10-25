// 答题回顾：一场考试逐题对照（你的答案 vs 参考答案）+ 可筛选答题卡。
// 交卷页（现场数据）与成绩页（历史 detail 还原）共用；单题块 ReviewQuestion 也给错题本展开复用。
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, CircleCheck, CircleX } from "lucide-react";
import { Badge, Chip, Ghost } from "./ui";
import { TYPE_LABEL, srcLabel, type ResolvedQ } from "../lib/questions";

export type ReviewItem = { q: ResolvedQ; picked: string[]; ok: boolean; marked?: boolean };
type Filter = "all" | "wrong" | "blank" | "marked";

export default function ExamReview({ items, onOpenLesson }: { items: ReviewItem[]; onOpenLesson?: (code: string) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [jumpKey, setJumpKey] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const counts = useMemo(
    () => ({
      all: items.length,
      wrong: items.filter((it) => it.picked.length > 0 && !it.ok).length,
      blank: items.filter((it) => it.picked.length === 0).length,
      marked: items.filter((it) => it.marked).length,
    }),
    [items],
  );
  const match = (it: ReviewItem, f: Filter) =>
    f === "all" ? true : f === "wrong" ? it.picked.length > 0 && !it.ok : f === "blank" ? it.picked.length === 0 : !!it.marked;
  const shown = items.filter((it) => match(it, filter));

  // 答题卡点选：目标被当前筛选滤掉时先切回「全部」，渲染后再滚动定位（限定在本组件内查找，
  // 成绩页弹层回看时错题本里可能展开着同一题）
  useEffect(() => {
    if (!jumpKey) return;
    rootRef.current?.querySelector(`[id="rv-${jumpKey}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setJumpKey(null);
  }, [jumpKey, filter]);
  const jump = (it: ReviewItem) => {
    if (!match(it, filter)) setFilter("all");
    setJumpKey(it.q.key);
  };

  const chips: [Filter, string][] = [
    ["all", `全部 ${counts.all}`],
    ["wrong", `答错 ${counts.wrong}`],
    ["blank", `未答 ${counts.blank}`],
  ];
  if (counts.marked > 0) chips.push(["marked", `标记 ${counts.marked}`]);

  return (
    <div ref={rootRef} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="text-[15px] font-semibold text-ink1">答题回顾</span>
          <span className="text-xs text-ink3">绿色为正确答案，红色为你的错选；点答题卡可定位到题</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {chips.map(([k, label]) => (
            <Chip key={k} active={filter === k} onClick={() => setFilter(k)}>
              {label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {items.map((it, i) => {
          const blank = it.picked.length === 0;
          return (
            <button
              key={it.q.key}
              onClick={() => jump(it)}
              title={`第 ${i + 1} 题 · ${TYPE_LABEL[it.q.type]} · ${it.ok ? "答对" : blank ? "未作答" : "答错"}${it.marked ? " · 已标记" : ""}`}
              className={`w-7 h-7 rounded-md text-[11px] flex items-center justify-center ${
                it.ok ? "bg-ok-soft text-ok" : blank ? "bg-surface2 text-ink3" : "bg-bad-soft text-bad"
              } ${it.marked ? "ring-1 ring-warn" : ""}`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-4 text-[11px] text-ink3">
        {(
          [
            ["bg-ok-soft", "答对"],
            ["bg-bad-soft", "答错"],
            ["bg-surface2", "未答"],
            ["ring-1 ring-warn", "标记疑问"],
          ] as const
        ).map(([c, l]) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-sm ${c}`} />
            {l}
          </span>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="px-4 py-6 rounded-[12px] bg-surface2 text-xs text-ink3 text-center">没有符合筛选条件的题目</div>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((it) => (
            <ReviewQuestion key={it.q.key} q={it.q} picked={it.picked} ok={it.ok} marked={it.marked} index={items.indexOf(it) + 1} onOpenLesson={onOpenLesson} />
          ))}
        </div>
      )}
    </div>
  );
}

/** 单题对照块。传 picked 即考试回顾（含作答状态）；不传则只展示题目与参考答案（错题本详情） */
export function ReviewQuestion({
  q,
  picked,
  ok,
  marked,
  index,
  onOpenLesson,
}: {
  q: ResolvedQ;
  picked?: string[];
  ok?: boolean;
  marked?: boolean;
  index?: number;
  onOpenLesson?: (code: string) => void;
}) {
  const reviewing = picked !== undefined;
  const blank = reviewing && picked.length === 0;
  const isRight = (letter: string) => !!q.answer?.includes(letter);
  return (
    <div id={`rv-${q.key}`} className="rounded-[12px] border border-line bg-surface p-4 scroll-mt-4">
      <div className="flex items-center gap-2 flex-wrap">
        {index !== undefined && <span className="text-xs font-semibold text-ink2">第 {index} 题</span>}
        <span className="px-2 py-0.5 rounded-full text-[11px] bg-surface2 text-ink2">{TYPE_LABEL[q.type]}</span>
        {reviewing && (ok ? <Badge tone="ok">答对</Badge> : blank ? <Badge tone="muted">未作答</Badge> : <Badge tone="bad">答错</Badge>)}
        {marked && <Badge tone="warn">标记疑问</Badge>}
        <span className="flex-1" />
        {q.chapter && (
          <span className="flex items-center gap-1 text-[11px] text-ink3">
            <BookOpen size={12} /> 考点 {q.chapter.code} · {q.chapter.title}
          </span>
        )}
        {q.chapter && onOpenLesson && <Ghost onClick={() => onOpenLesson(q.chapter!.code)}>去看讲义</Ghost>}
      </div>

      <div className="text-[13px] font-medium leading-relaxed text-ink1 mt-2.5 selectable">{q.stem}</div>

      <div className="flex flex-col gap-1.5 mt-2.5">
        {q.options.map(([letter, text]) => {
          const right = isRight(letter);
          const on = reviewing && picked.includes(letter);
          return (
            <div
              key={letter}
              className={`flex items-center gap-3 px-3.5 py-2 rounded-[10px] border ${
                right ? "bg-ok-soft border-ok" : on ? "bg-bad-soft border-bad" : "border-line"
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] shrink-0 ${
                  right ? "bg-ok text-white font-semibold" : on ? "bg-bad text-white" : "bg-surface2 text-ink2"
                }`}
              >
                {letter}
              </span>
              <span className="text-[13px] text-ink1 leading-relaxed selectable">{text}</span>
              {right && <CircleCheck size={15} className="ml-auto text-ok shrink-0" />}
              {on && !right && <CircleX size={15} className="ml-auto text-bad shrink-0" />}
            </div>
          );
        })}
      </div>

      <div className="mt-2.5 text-xs text-ink2 flex items-center gap-1.5 flex-wrap">
        {reviewing && (
          <>
            你的答案：<b className={ok ? "text-ok" : "text-bad"}>{blank ? "未作答" : picked.join("")}</b>
            <span className="text-ink3">·</span>
          </>
        )}
        正确答案：<b className="text-ok">{q.answer ?? "--"}</b>
        <span className="text-ink3">· {srcLabel(q)}</span>
      </div>
    </div>
  );
}
