import { useEffect, useMemo, useRef, useState } from "react";
import { Timer, Flag, RotateCw, FileSpreadsheet, BadgeCheck, Sparkles } from "lucide-react";
import { Badge, Btn, Card, Chip, OptionRow } from "../components/exam-ui";
import theory from "../data/theory.json";
import { saveStore, type Store } from "../lib/api";
import { aiStats, officialPaper, refAnswer } from "../lib/answers";

type Q = { key: string; type: "single" | "multi" | "judge"; id: number; stem: string; options: [string, string][] };

const bank = theory as unknown as { judge: { id: number; stem: string }[]; single: Q[]; multi: Q[] };

function shuffle<T>(arr: T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

function buildPaper(judgeN: number, singleN: number, multiN: number): Q[] {
  const j: Q[] = shuffle(bank.judge, judgeN).map((q) => ({ key: `j${q.id}`, type: "judge", id: q.id, stem: q.stem, options: [] }));
  const s: Q[] = shuffle(bank.single, singleN).map((q) => ({ key: `s${q.id}`, type: "single", id: q.id, stem: q.stem, options: q.options }));
  const m: Q[] = shuffle(bank.multi, multiN).map((q) => ({ key: `m${q.id}`, type: "multi", id: q.id, stem: q.stem, options: q.options }));
  return [...j, ...s, ...m];
}

/** 第5部分官方模拟卷 → 与 Q 同构（选项字母按序生成），保持官方顺序不洗牌 */
function buildOfficialPaper(): { paper: Q[]; key: Record<string, string> } {
  const pair = (opts: string[]) => opts.map((t, i) => [String.fromCharCode(65 + i), t] as [string, string]);
  const j: Q[] = officialPaper.judge.map((q) => ({ key: `oj${q.n}`, type: "judge", id: q.n, stem: q.stem, options: [] }));
  const s: Q[] = officialPaper.single.map((q) => ({ key: `os${q.n}`, type: "single", id: q.n, stem: q.stem, options: pair(q.options) }));
  const m: Q[] = officialPaper.multi.map((q) => ({ key: `om${q.n}`, type: "multi", id: q.n, stem: q.stem, options: pair(q.options) }));
  const key: Record<string, string> = {};
  for (const q of [...j, ...s, ...m]) {
    const src = q.type === "judge" ? officialPaper.judge : q.type === "single" ? officialPaper.single : officialPaper.multi;
    key[q.key] = src.find((x) => x.n === q.id)!.answer;
  }
  return { paper: [...j, ...s, ...m], key };
}

export default function TheoryExam({
  store,
  setStore,
  autoOfficial,
}: {
  store: Store;
  setStore: (s: Store) => void;
  autoOfficial?: boolean;
}) {
  const [config, setConfig] = useState<{ j: number; s: number; m: number; official: boolean } | null>(null);
  const [officialKey, setOfficialKey] = useState<Record<string, string> | null>(null);
  const [paper, setPaper] = useState<Q[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [cur, setCur] = useState(0);
  const [seconds, setSeconds] = useState(90 * 60);
  const [finished, setFinished] = useState(false);

  const start = (j: number, s: number, m: number) => {
    setConfig({ j, s, m, official: false });
    setOfficialKey(null);
    setPaper(buildPaper(j, s, m));
    setAnswers({});
    setMarked(new Set());
    setCur(0);
    setSeconds(j === 190 ? 90 * 60 : Math.round((j + s + m) * 90 * 60 / 190));
    setFinished(false);
  };

  const startOfficial = () => {
    const { paper, key } = buildOfficialPaper();
    setConfig({ j: 40, s: 140, m: 10, official: true });
    setOfficialKey(key);
    setPaper(paper);
    setAnswers({});
    setMarked(new Set());
    setCur(0);
    setSeconds(officialPaper.meta.durationMin * 60);
    setFinished(false);
  };

  useEffect(() => {
    if (autoOfficial) startOfficial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!paper || !config) return <StartScreen onStart={start} onOfficial={startOfficial} store={store} setStore={setStore} />;
  if (finished)
    return (
      <ResultScreen
        paper={paper}
        answers={answers}
        elapsedMin={Math.round((totalSeconds(config) - seconds) / 60)}
        officialKey={config.official ? officialKey : null}
        again={() => setPaper(null)}
        store={store}
        setStore={setStore}
        marked={marked}
      />
    );

  const q = paper[cur];
  const answered = Object.keys(answers).filter((k) => answers[k]?.length).length;

  const pick = (letter: string) => {
    const next = { ...answers };
    if (q.type === "multi") {
      const curSel = next[q.key] ?? [];
      next[q.key] = curSel.includes(letter) ? curSel.filter((x) => x !== letter) : [...curSel, letter].sort();
    } else {
      next[q.key] = [letter];
    }
    setAnswers(next);
  };

  return (
    <div className="flex flex-col gap-4 p-5 px-7 h-full">
      <div className="h-14 shrink-0 bg-surface border border-line rounded-xl px-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[15px] font-bold text-ink1">理论模拟考试</span>
          {config.official ? <Badge tone="ok">官方全真卷</Badge> : <Badge tone="accent">模拟模式</Badge>}
          <span className="text-xs text-ink3">
            判断 {config.j} · 单选 {config.s} · 多选 {config.m}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-bad-soft">
            <Timer size={15} className="text-bad" />
            <span className="font-mono text-sm font-bold text-bad tracking-wider">{fmt(seconds)}</span>
          </div>
          <Btn onClick={() => setPaper(null)}>放弃</Btn>
          <Btn primary onClick={() => setFinished(true)}>
            交卷
          </Btn>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        <Card className="flex-1 min-w-0 flex flex-col !p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Chip active>{q.type === "single" ? "单选" : q.type === "multi" ? "多选" : "判断"}</Chip>
              <span className="text-[13px] font-medium text-ink2">
                第 {cur + 1} / {paper.length} 题
              </span>
            </div>
            <button
              onClick={() => {
                const n = new Set(marked);
                n.has(q.key) ? n.delete(q.key) : n.add(q.key);
                setMarked(n);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                marked.has(q.key) ? "bg-warn-soft text-warn" : "bg-surface2 text-ink2"
              }`}
            >
              <Flag size={13} /> {marked.has(q.key) ? "已标记疑问" : "标记疑问"}
            </button>
          </div>

          <div className="text-[15px] font-medium leading-relaxed text-ink1 mt-4 selectable">
            {q.type === "judge" ? `${q.stem}（正确打 √，错误打 ×）` : q.stem}
          </div>

          <div className="flex flex-col gap-2.5 mt-4">
            {q.type === "judge" ? (
              <>
                {["√", "×"].map((v) => (
                  <JudgeRow key={v} label={v === "√" ? "正确 √" : "错误 ×"} selected={answers[q.key]?.[0] === v} onClick={() => pick(v)} />
                ))}
              </>
            ) : (
              q.options.map(([letter, text]) => (
                <OptionRow
                  key={letter}
                  letter={letter}
                  text={text}
                  selected={answers[q.key]?.includes(letter)}
                  onClick={() => pick(letter)}
                />
              ))
            )}
          </div>

          <div className="flex-1" />
          <div className="flex items-center justify-between pt-3">
            <div className="flex gap-2.5">
              <Btn onClick={() => setCur(Math.max(0, cur - 1))} disabled={cur === 0}>
                上一题
              </Btn>
              <Btn primary onClick={() => setCur(Math.min(paper.length - 1, cur + 1))} disabled={cur === paper.length - 1}>
                下一题
              </Btn>
            </div>
            <span className="text-[11px] text-ink3">交卷后自动判分并收录错题</span>
          </div>
        </Card>

        <Card className="w-[300px] shrink-0 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[15px] font-semibold text-ink1">答题卡</span>
            <span className="text-xs text-ink3">已答 {answered}/{paper.length}</span>
          </div>
          <div className="flex gap-1.5 mb-3">
            <Chip active>判断</Chip>
            <Chip>单选</Chip>
            <Chip>多选</Chip>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-7 gap-1.5">
              {paper.map((p, i) => {
                const isCur = i === cur;
                const done = answers[p.key]?.length > 0;
                const mk = marked.has(p.key);
                return (
                  <button
                    key={p.key}
                    onClick={() => setCur(i)}
                    className={`h-6 rounded-md text-[10px] flex items-center justify-center ${
                      isCur
                        ? "bg-accent text-white font-semibold"
                        : mk
                          ? "bg-warn-soft text-warn"
                          : done
                            ? "bg-accent-soft text-accent-deep"
                            : "bg-surface2 text-ink3"
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-line mt-3">
            {[
              ["bg-accent", "当前题"],
              ["bg-accent-soft", "已作答"],
              ["bg-warn-soft", "已标记"],
              ["bg-surface2", "未作答"],
            ].map(([c, l]) => (
              <div key={l} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-sm ${c}`} />
                <span className="text-[11px] text-ink3">{l}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function JudgeRow({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-[10px] border text-left transition-colors ${
        selected ? "bg-accent-soft border-accent" : "bg-surface border-line hover:border-ink3"
      }`}
    >
      <span
        className={`w-[26px] h-[26px] rounded-full flex items-center justify-center text-xs ${
          selected ? "bg-accent text-white" : "bg-surface2 text-ink2"
        }`}
      >
        {selected ? "✓" : "?"}
      </span>
      <span className={`text-sm ${selected ? "text-accent-deep font-medium" : "text-ink1"}`}>{label}</span>
    </button>
  );
}

function StartScreen({
  onStart,
  onOfficial,
  store,
  setStore,
}: {
  onStart: (j: number, s: number, m: number) => void;
  onOfficial: () => void;
  store: Store;
  setStore: (s: Store) => void;
}) {
  const [preset, setPreset] = useState<"official" | "full" | "half" | "quick">("official");
  const [answerText, setAnswerText] = useState("");
  const presets = {
    official: { label: "官方全真卷", desc: "第5部分模拟卷 190 题 · 官方答案自动判分", official: true },
    full: { label: "全真模拟", desc: "判断 40 + 单选 140 + 多选 10 · 90 分钟", official: false },
    half: { label: "半卷练习", desc: "判断 20 + 单选 70 + 多选 5 · 45 分钟", official: false },
    quick: { label: "快速刷题", desc: "判断 10 + 单选 30 + 多选 5 · 20 分钟", official: false },
  };
  const keyCount = Object.values(store.answerKey).reduce((n, m) => n + Object.keys(m).length, 0);
  const ai = aiStats();

  const importAnswers = () => {
    const parsed: Record<string, string> = {};
    const re = /(\d+)\s*[\.、]?\s*([ABCDE√×对错]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(answerText))) parsed[m[1]] = m[2].toUpperCase();
    const next = { ...store.answerKey };
    for (const [id, a] of Object.entries(parsed)) {
      const n = parseInt(id);
      if (a === "√" || a === "对") (next.judge ??= {})[String(n)] = "√";
      else if (a === "×" || a === "错") (next.judge ??= {})[String(n)] = "×";
      else (next.single ??= {})[String(n)] = a;
    }
    setStore({ ...store, answerKey: next });
    setAnswerText("");
  };

  return (
    <div className="p-7 h-full overflow-y-auto">
      <div className="text-xl font-bold text-ink1">理论模拟考试</div>
      <div className="text-xs text-ink3 mt-1">官方复习题库已导入：判断 {bank.judge.length} · 单选 {bank.single.length} · 多选 {bank.multi.length}，共 {bank.judge.length + bank.single.length + bank.multi.length} 题；另有第5部分官方模拟卷 190 题（含官方答案）</div>

      <div className="grid grid-cols-4 gap-4 mt-6">
        {(Object.keys(presets) as (keyof typeof presets)[]).map((k) => {
          const p = presets[k];
          return (
            <Card key={k} className={`cursor-pointer ${preset === k ? "!border-accent ring-1 ring-accent" : ""}`} pad={false}>
              <div className="w-full text-left p-5" onClick={() => setPreset(k)}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[15px] font-semibold text-ink1">{p.label}</span>
                  {p.official && <BadgeCheck size={14} className="text-ok shrink-0" />}
                </div>
                <div className="text-xs text-ink2 mt-1.5 leading-relaxed">{p.desc}</div>
                <Btn
                  primary
                  className="mt-4 w-full !justify-center"
                  onClick={() => (p.official ? onOfficial() : onStart(p === presets.full ? 40 : p === presets.half ? 20 : 10, p === presets.full ? 140 : p === presets.half ? 70 : 30, p === presets.full ? 10 : p === presets.half ? 5 : 5))}
                >
                  <Timer size={14} /> 开始考试
                </Btn>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="mt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-accent" />
            <div className="text-[15px] font-semibold text-ink1">答案来源说明</div>
          </div>
        </div>
        <div className="text-xs text-ink2 mt-2 leading-relaxed">
          刷题判分按 <b>用户导入答案 &gt; AI 参考答案</b> 的优先级合并：AI 已预生成全部 {ai.total} 题参考答案（高置信 {ai.high} · 中 {ai.medium} · 低 {ai.low}），
          低置信题判分仅供参考；从「AI学讯」小程序核对后粘贴官方答案将自动覆盖 AI 答案（当前已导入 {keyCount} 条）。
        </div>
      </Card>

      <Card className="mt-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[15px] font-semibold text-ink1">官方答案导入（可选，优先级最高）</div>
            <div className="text-xs text-ink3 mt-1">从小程序「AI学讯」核对答案后，按 “1.A 2.C 3.√ …” 格式粘贴到下面，自动解析保存。</div>
          </div>
        </div>
        <div className="flex gap-2.5 mt-3">
          <textarea
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            placeholder={"示例：\n1. A\n2. √\n3. C"}
            className="flex-1 h-24 rounded-[10px] bg-surface2 p-3 text-[13px] font-mono text-ink1 outline-none focus:ring-1 focus:ring-accent resize-none selectable"
          />
          <div className="flex flex-col gap-2">
            <Btn primary onClick={importAnswers} disabled={!answerText.trim()}>
              解析导入
            </Btn>
            <Btn
              onClick={() => {
                setStore({ ...store, answerKey: {} });
              }}
            >
              <RotateCw size={13} /> 清空答案
            </Btn>
          </div>
        </div>
      </Card>

      <div className="flex items-start gap-2 mt-5 text-xs text-ink3">
        <FileSpreadsheet size={14} className="mt-0.5 shrink-0" />
        理论机考真实规则：90 分钟 · 共 190 题（140 单选 + 10 多选 + 40 判断），从约 1200 题题库中抽取；本平台题库为官方公开复习题 900 题 + 官方模拟卷 190 题。
      </div>
    </div>
  );
}

function ResultScreen({
  paper,
  answers,
  elapsedMin,
  officialKey,
  again,
  store,
  setStore,
  marked,
}: {
  paper: Q[];
  answers: Record<string, string[]>;
  elapsedMin: number;
  officialKey: Record<string, string> | null;
  again: () => void;
  store: Store;
  setStore: (s: Store) => void;
  marked: Set<string>;
}) {
  const verdict = useMemo(() => {
    const perQ = paper.map((q) => {
      const right = officialKey ? officialKey[q.key] : refAnswer(store, q.type, q.id)?.a;
      const ans = answers[q.key] ?? [];
      const rightArr = right ? (right.length > 1 ? right.split("").sort() : [right]) : null;
      const ok = !!(rightArr && ans.length === rightArr.length && ans.every((a) => rightArr.includes(a)));
      const ref = officialKey ? ({ a: officialKey[q.key], src: "user" as const } ) : refAnswer(store, q.type, q.id);
      return { q, ok, src: ref?.src ?? "ai", conf: ref && "conf" in ref ? ref.conf : undefined };
    });
    let score = 0, total = 0, userN = 0, aiLow = 0;
    for (const v of perQ) {
      const w = officialKey
        ? officialPaper.meta.scores[v.q.type === "judge" ? "judge" : v.q.type === "single" ? "single" : "multi"]
        : 1;
      total += w;
      if (v.ok) score += w;
      if (v.src === "user") userN++;
      if (!officialKey && v.src === "ai" && v.conf === "low") aiLow++;
    }
    return { perQ, score: total ? Math.round((score / total) * 100) : 0, userN, aiLow };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper, answers, officialKey, store]);

  const correct = verdict.perQ.filter((v) => v.ok).length;
  const minutes = elapsedMin;
  const savedRef = useRef(false);

  useEffect(() => {
    if (savedRef.current) return; // StrictMode 下 effect 跑两次，避免重复记录成绩
    savedRef.current = true;
    const next: Store = {
      ...store,
      history: [
        ...store.history,
        { date: new Date().toISOString().slice(0, 10), score: verdict.score, theory: null, practical: null, minutes },
      ],
      wrongBook: [
        ...store.wrongBook,
        ...verdict.perQ
          .filter((v) => !v.ok)
          .slice(0, 20)
          .map((v) => ({ id: v.q.key, type: v.q.type === "single" ? "单选" : v.q.type === "multi" ? "多选" : "判断", text: v.q.stem.slice(0, 40), count: 1 })),
      ],
    };
    saveStore(next);
    setStore(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const answered = Object.values(answers).filter((a) => a?.length).length;

  return (
    <div className="p-7 h-full overflow-y-auto">
      <div className="text-xl font-bold text-ink1">考试结束</div>
      <div className="grid grid-cols-4 gap-4 mt-5">
        <Card className="flex items-center gap-4">
          <ScoreDonut value={verdict.score} unscored={false} />
          <div>
            <div className="text-sm font-semibold text-ink1">{officialKey ? "官方卷得分" : "综合得分"}</div>
            <div className="text-xs text-ink3 mt-1">
              答对 {correct}/{paper.length} · {officialKey ? "官方答案判定" : `AI/导入答案判定（低置信 ${verdict.aiLow} 题）`}
            </div>
          </div>
        </Card>
        <Stat label="作答完成" value={`${answered}/${paper.length}`} />
        <Stat label="答题用时" value={`${minutes} 分钟`} />
        <Stat label="标记疑问" value={`${marked.size} 题`} />
      </div>
      <div className="flex gap-3 mt-5">
        <Btn primary onClick={again}>
          再来一场
        </Btn>
        {/* 深链接（?page=exam&paper=official）下 reload 会重新进考试，回到无参数路径才是真的“返回首页” */}
        <Btn onClick={() => location.assign(location.pathname)}>返回首页</Btn>
      </div>
    </div>
  );
}

function ScoreDonut({ value, unscored }: { value: number; unscored: boolean }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative w-[70px] h-[70px]">
      <svg viewBox="0 0 70 70" className="w-full h-full -rotate-90">
        <circle cx="35" cy="35" r={r} fill="none" stroke="#F1F4F9" strokeWidth="8" />
        <circle cx="35" cy="35" r={r} fill="none" stroke={unscored ? "#93A0B8" : "#2563EB"} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(value / 100) * c} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-ink1">{unscored ? "--" : value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <div className="text-xs text-ink2">{label}</div>
      <div className="text-2xl font-bold text-ink1 mt-2">{value}</div>
    </Card>
  );
}

function totalSeconds(c: { j: number; s: number; m: number; official: boolean }) {
  return c.official ? 90 * 60 : Math.round((c.j + c.s + c.m) * 90 * 60 / 190);
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
