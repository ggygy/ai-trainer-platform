import { useEffect, useRef, useState } from "react";
import {
  Timer,
  FileSpreadsheet,
  Play,
  CircleCheck,
  LoaderCircle,
  ExternalLink,
  Square,
  FolderOpen,
} from "lucide-react";
import { Card, CardHead, Badge, Btn, Ghost } from "../components/ui";
import { QUESTION_GROUPS, taskSteps } from "../data/content";
import { practicalRef } from "../lib/answers";
import { useStore } from "../lib/store";
import { jupyterStart, jupyterStop, onJupyterReady, jupyterStatus, isTauri, openFolder } from "../lib/api";

export default function PracticalExam({ initial }: { initial?: { groupId: string; idx: number } }) {
  const [sel, setSel] = useState(initial ?? { groupId: "2.2", idx: 0 });
  const group = QUESTION_GROUPS.find((g) => g.id === sel.groupId) ?? QUESTION_GROUPS[3];

  const [answer, setAnswer] = useState("");
  const [jp, setJp] = useState<{ running: boolean; url: string }>({ running: false, url: "" });
  const [starting, setStarting] = useState(false);
  const [seconds, setSeconds] = useState(120 * 60);
  const [log, setLog] = useState<string[]>([]);
  const unReady = useRef<(() => void) | null>(null);

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      if (!isTauri()) return;
      const st = await jupyterStatus();
      setJp({ running: st.running, url: st.url });
      unReady.current = await onJupyterReady((url) => setJp({ running: true, url }));
    })();
    return () => {
      unReady.current?.();
    };
  }, []);

  // 响应题组页跳转
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.groupId) setSel(d);
    };
    window.addEventListener("open-practical", h);
    return () => window.removeEventListener("open-practical", h);
  }, []);

  const steps = taskSteps(group.id);
  const qKey = `${group.id}-${sel.idx}`;
  const refText = practicalRef.answers[`${group.id}.${sel.idx + 1}`] ?? "";
  const [showRef, setShowRef] = useState(() => new URLSearchParams(window.location.search).get("ref") === "1");

  const materialDir = useStore((s) => s.materialDir);
  const markPracticeDone = useStore((s) => s.markPracticeDone);

  const startJupyter = async () => {
    setStarting(true);
    const dir = `${materialDir}/${dirOf(group)}`;
    try {
      const info = await jupyterStart(dir);
      if (info.running && info.url) setJp({ running: true, url: info.url });
      unReady.current = await onJupyterReady((url) => setJp({ running: true, url }));
      setLog((l) => [...l, `$ jupyter lab --notebook-dir ${dir}`, info.url ? `✓ 就绪: ${info.url}` : "✓ 启动中…"]);
    } catch (e) {
      setLog((l) => [...l, `[错误] ${String(e)}`]);
    }
    setStarting(false);
  };

  const markDone = () => {
    markPracticeDone(qKey); // zustand 订阅：仪表盘/报告的进度立即刷新
    setLog((l) => [...l, "✓ 已标记本题完成"]);
  };

  return (
    <div className="flex flex-col gap-3.5 p-5 px-6 h-full min-h-0">
      <div className="h-14 shrink-0 bg-surface border border-line rounded-xl px-5 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="px-2.5 py-1 rounded-md bg-accent-soft text-accent text-[13px] font-bold shrink-0">{group.id}.{sel.idx + 1}</span>
          <span className="text-sm font-bold text-ink1 truncate">{group.titles[sel.idx]}</span>
          <Badge tone="accent">实操模拟</Badge>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-bad-soft">
            <Timer size={15} className="text-bad" />
            <span className="font-mono text-sm font-bold text-bad tracking-wider">{fmt(seconds)}</span>
          </div>
          <select
            value={`${sel.groupId}-${sel.idx}`}
            onChange={(e) => {
              const [groupId, idx] = e.target.value.split("-");
              setSel({ groupId, idx: parseInt(idx) });
            }}
            className="px-3 py-2 rounded-lg bg-surface border border-line text-xs text-ink2 outline-none"
          >
            {QUESTION_GROUPS.flatMap((g) =>
              g.titles.map((t, i) => (
                <option key={`${g.id}-${i}`} value={`${g.id}-${i}`}>
                  {g.id}.{i + 1} {t.slice(0, 18)}
                </option>
              )),
            )}
          </select>
          <Btn primary onClick={markDone}>
            <CircleCheck size={14} /> 标记完成
          </Btn>
        </div>
      </div>

      <div className="flex gap-3.5 flex-1 min-h-0">
        <div className="w-[400px] shrink-0 flex flex-col gap-3.5 overflow-y-auto">
          <Card>
            <CardHead title="题目要求" right={<Badge tone="accent">{group.form === "填空" ? "填空 5 分" : `代码 ${group.score}`}</Badge>} />
            <div className="flex flex-col gap-2">
              {steps.map((s, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="w-[18px] h-[18px] rounded-full bg-surface2 text-ink2 text-[10px] font-semibold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-xs leading-relaxed text-ink2 selectable">{s}</span>
                </div>
              ))}
            </div>
          </Card>

          {group.form !== "填空" && (
            <Card>
              <CardHead title="简答区" right={<Badge tone="warn">简答</Badge>} />
              <div className="text-xs text-ink2 mb-2">按题目要求简述思路或结论。</div>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="在此输入你的答案…"
                className="w-full h-20 rounded-lg bg-surface2 p-3 text-xs text-ink1 outline-none focus:ring-1 focus:ring-accent resize-none selectable"
              />
            </Card>
          )}

          <Card>
            <CardHead
              title="参考答案（对照自评）"
              right={refText ? <Badge tone="ok">官方</Badge> : <Badge tone="warn">暂缺</Badge>}
            />
            {refText ? (
              <>
                <button
                  onClick={() => setShowRef((v) => !v)}
                  className="text-xs text-accent mb-2 hover:underline text-left"
                >
                  {showRef ? "▾ 收起答案" : "▸ 完成后展开官方参考代码与预期输出"}
                </button>
                {showRef && (
                  <pre className="text-[11px] leading-relaxed text-ink2 whitespace-pre-wrap font-mono max-h-72 overflow-y-auto bg-surface2 rounded-lg p-3 selectable">
                    {refText}
                  </pre>
                )}
              </>
            ) : (
              <div className="text-xs text-ink3 leading-relaxed">
                官方未公布本题（{group.id}.{sel.idx + 1}）参考答案，可对照素材目录与同组题目答案自评。
              </div>
            )}
          </Card>

          <Card className="flex-1">
            <CardHead title="素材与环境" />
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-surface2">
                <FileSpreadsheet size={15} className="text-accent shrink-0" />
                <span className="flex-1 text-xs font-medium text-ink1 truncate">{dirOf(group)}/</span>
                <button className="text-ink3 hover:text-accent" title="打开素材目录" onClick={() => openFolder(`${materialDir}/${dirOf(group)}`)}>
                  <FolderOpen size={14} />
                </button>
              </div>
              <div className="text-[10px] text-ink3 leading-relaxed">
                运行依赖：pandas · scikit-learn · matplotlib · joblib（环境助手可一键安装）。点击「启动 Jupyter」将在素材目录启动 Notebook。
              </div>
            </div>
          </Card>
        </div>

        <Card className="flex-1 min-w-0 flex flex-col">
          <CardHead
            title={
              <span className="flex items-center gap-2.5">
                <span className={`w-2 h-2 rounded-full ${jp.running ? "bg-ok" : "bg-ink3"}`} />
                Jupyter Notebook
              </span>
            }
            right={
              jp.running ? (
                <div className="flex gap-2.5">
                  <Ghost onClick={stopJp}>停止</Ghost>
                  <Btn onClick={() => window.open(jp.url, "_blank")}>
                    <ExternalLink size={13} /> 独立窗口打开
                  </Btn>
                </div>
              ) : (
                <Btn primary onClick={startJupyter} disabled={starting}>
                  {starting ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={14} />}
                  {starting ? "启动中…" : "启动 Jupyter"}
                </Btn>
              )
            }
          />
          <div className="flex-1 min-h-0 rounded-[10px] bg-inkwell overflow-hidden relative">
            {jp.running && jp.url ? (
              isTauri() ? (
                <iframe src={jp.url} className="w-full h-full border-0" title="jupyter" />
              ) : (
                <div className="w-full h-full p-4 flex flex-col items-center justify-center gap-2 text-center">
                  <LoaderCircle size={18} className="text-blue-300" />
                  <div className="font-mono text-[11px] text-slate-300">Jupyter 服务地址：{jp.url}</div>
                  <div className="text-[11px] text-slate-500 leading-relaxed max-w-[420px]">
                    浏览器预览模式下不内嵌 Notebook；在桌面应用（Tauri）中点击「启动 Jupyter」会在此直接打开实操题的 .ipynb。
                  </div>
                </div>
              )
            ) : (
              <div className="w-full h-full p-4 flex flex-col gap-2.5 overflow-y-auto font-mono text-[11px] leading-relaxed">
                <div className="text-slate-400 select-none">// Jupyter 未启动 — 点击右上角「启动 Jupyter」在此目录打开 Notebook</div>
                {log.length === 0 && (
                  <pre className="text-slate-500 select-none whitespace-pre-wrap">{`# 建议流程
# 1. 阅读左侧「题目要求」
# 2. 启动 Jupyter，打开素材中的 .ipynb
# 3. 逐单元格运行并核对输出
# 4. 完成后点击上方「标记完成」`}</pre>
                )}
                {log.map((l, i) => (
                  <div key={i} className={l.startsWith("$") ? "text-blue-300" : l.startsWith("✓") ? "text-emerald-300" : l.startsWith("[错误]") ? "text-red-300" : "text-slate-300"}>
                    {l}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between pt-3">
            <div className="flex gap-2.5">
              <Btn primary onClick={markDone}>
                <CircleCheck size={14} /> 运行通过 · 标记完成
              </Btn>
              <Btn onClick={() => setLog([])}>
                <Square size={12} /> 清空日志
              </Btn>
            </div>
            <span className="text-[11px] text-ink3 flex items-center gap-1.5">
              <CircleCheck size={13} className="text-ok" /> 保存答案与进度至本地
            </span>
          </div>
        </Card>
      </div>
    </div>
  );

  async function stopJp() {
    await jupyterStop();
    setJp({ running: false, url: "" });
    setLog((l) => [...l, "$ jupyter 已停止"]);
  }
}

// 题组 → 素材目录映射（上网素材目录按题组文件夹组织）
function dirOf(g: { id: string }): string {
  if (g.id === "1.1" || g.id === "1.2") return "1.1.1-1.1.5~1.2.1-1.2.5素材";
  if (g.id === "4.1" || g.id === "4.2") return "4.1.1-4.1.5~4.2.1-4.2.5素材";
  return `${g.id}.1-${g.id}.5素材`;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
