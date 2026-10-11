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
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Card, CardHead, Badge, Btn, Ghost } from "../components/ui";
import { practicalTasks, QUESTION_GROUPS, taskSteps, type PracticalTask } from "../data/content";
import { practicalRef } from "../lib/answers";
import { useStore } from "../lib/store";
import { open as pickDirectory } from "@tauri-apps/plugin-dialog";
import { pickAndImportMaterials } from "../lib/materials";
import { jupyterStart, jupyterStop, onJupyterFailed, onJupyterLog, onJupyterReady, jupyterStatus, isTauri, openFolder, pathIsDir, dirEntryCount } from "../lib/api";

export default function PracticalExam({ initial }: { initial?: { groupId: string; idx: number } }) {
  const [sel, setSel] = useState(initial ?? { groupId: "2.2", idx: 0 });
  const group = QUESTION_GROUPS.find((g) => g.id === sel.groupId) ?? QUESTION_GROUPS[3];

  const [answer, setAnswer] = useState("");
  const [jp, setJp] = useState<{ running: boolean; url: string }>({ running: false, url: "" });
  const [starting, setStarting] = useState(false);
  const [full, setFull] = useState(false); // Notebook 区域铺满整个窗口
  const [folder, setFolder] = useState<string | null>(null); // 当前题实际存在的素材文件夹（null=落根目录）
  const [importing, setImporting] = useState(false);
  const folderRef = useRef<string | null>(null);
  folderRef.current = folder;
  const [seconds, setSeconds] = useState(120 * 60);
  const [log, setLog] = useState<string[]>([]);
  const unReady = useRef<(() => void) | null>(null);
  const unFailed = useRef<(() => void) | null>(null);
  const unLog = useRef<(() => void) | null>(null);

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  // 放大状态下 Esc 退出
  useEffect(() => {
    if (!full) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [full]);

  useEffect(() => {
    (async () => {
      if (!isTauri()) return;
      const st = await jupyterStatus();
      // 恢复已运行的服务：直接落到当前题的素材文件夹
      setJp({ running: st.running, url: st.running ? withTree(st.url, folderRef.current) : "" });
      unReady.current = await onJupyterReady((url) => setJp({ running: true, url: withTree(url, folderRef.current) }));
      unFailed.current = await onJupyterFailed(onStartFailed);
      unLog.current = await onJupyterLog((line) => {
        // 内核启动/崩溃的关键行透到日志区，其余服务心跳不刷屏
        if (/kernel|error|traceback|failed|died/i.test(line)) {
          setLog((l) => [...l.slice(-400), `[jupyter] ${line}`]);
        }
      });
    })();
    return () => {
      unReady.current?.();
      unFailed.current?.();
      unLog.current?.();
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

  const materialDir = useStore((s) => s.materialDir);
  const setMaterialDir = useStore((s) => s.setMaterialDir);
  const markPracticeDone = useStore((s) => s.markPracticeDone);

  // 导入素材包（网盘下载的 zip）；成功后 materialDir 更新 → 解析 effect 自动重跑
  const runImport = async () => {
    setImporting(true);
    try {
      const r = await pickAndImportMaterials();
      if (r) setLog((l) => [...l, r.ok ? `✓ ${r.message} → ${r.dir}` : `[错误] ${r.message}`]);
    } finally {
      setImporting(false);
    }
  };

  // 更换素材总目录（素材包解压到别处时在此直接指认，不用绕环境助手）
  const changeMaterialDir = async () => {
    if (!isTauri()) return;
    const dir = await pickDirectory({ directory: true, multiple: false, title: "选择实操素材总目录" });
    if (typeof dir === "string" && dir) {
      setMaterialDir(dir);
      setLog((l) => [...l, `$ 素材目录已更换: ${dir}`]);
    }
  };

  // 解析当前题真实存在且有内容的素材文件夹（两种布局兼容）。
  // 只判「存在」不够：旧版误建的空壳文件夹存在但为空，选中它 Jupyter 里什么都看不到
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const c of folderCandidates(sel)) {
        const p = `${materialDir}/${c}`;
        if ((await pathIsDir(p)) && (await dirEntryCount(p)) > 0) {
          if (alive) setFolder(c);
          return;
        }
      }
      if (alive) setFolder(null);
    })();
    return () => {
      alive = false;
    };
  }, [sel.groupId, sel.idx, materialDir]);

  // 题目要求优先用官方任务书原文（40 题全覆盖），缺失时退回题组概括
  const official: PracticalTask | undefined = practicalTasks[`${group.id}.${sel.idx + 1}`];
  const steps = official?.requirements?.length ? official.requirements : taskSteps(group.id);
  const qKey = `${group.id}-${sel.idx}`;
  const refText = practicalRef.answers[`${group.id}.${sel.idx + 1}`] ?? "";
  const [showRef, setShowRef] = useState(() => new URLSearchParams(window.location.search).get("ref") === "1");

  // 启动失败：后端看门狗 15s 内端口未通即判崩，回传 stderr 尾部
  const onStartFailed = (lines: string[]) => {
    setStarting(false);
    setJp({ running: false, url: "" });
    setLog((l) => [...l, "[错误] Jupyter 启动失败（进程已退出），日志尾部：", ...lines.map((x) => "  " + x)]);
  };

  const startJupyter = async () => {
    setStarting(true);
    const dir = materialDir; // 服务根 = 素材总目录；具体题的文件夹由 withTree 落位
    try {
      const info = await jupyterStart(dir);
      if (info.running && info.url) setJp({ running: true, url: withTree(info.url, folderRef.current) });
      unReady.current = await onJupyterReady((url) => setJp({ running: true, url: withTree(url, folderRef.current) }));
      unFailed.current = await onJupyterFailed(onStartFailed);
      setLog((l) => [
        ...l,
        `$ jupyter lab --notebook-dir ${dir}`,
        ...info.log.filter((x) => x !== "已在运行"),
        ...(folderRef.current ? [] : [`[提示] 素材目录里没有「${folderCandidates(sel).join("」或「")}」文件夹（或为空），已在根目录打开。若素材包解压在别处，点左侧「素材与环境」里的更换按钮重新指认`]),
        info.url ? `✓ 就绪: ${info.url}` : "✓ 启动中…",
      ]);
    } catch (e) {
      setLog((l) => [...l, `[错误] ${String(e)}`]);
    }
    setStarting(false);
  };

  // 切题跟随：把同一 Jupyter 服务的文件浏览器带到当前题的素材文件夹
  useEffect(() => {
    setJp((s) => (s.running && s.url ? { running: true, url: withTree(s.url, folderRef.current) } : s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel.groupId, sel.idx]);

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
            <CardHead title="题目要求（官方原文）" right={<Badge tone="accent">{group.form === "填空" ? "填空 5 分" : `代码 ${group.score}`}</Badge>} />
            {official && (
              <div className="text-[10px] text-ink3 -mt-1">
                官方考核时间 {official.minutes ?? "—"} 分钟{official.equipment ? ` · ${official.equipment}` : ""}
              </div>
            )}
            {official?.background && (
              <div className="text-[11px] leading-relaxed text-ink2 bg-surface2 rounded-lg p-2.5 max-h-24 overflow-y-auto selectable">
                {official.background}
              </div>
            )}
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
            {(official?.skills.length ?? 0) + (official?.quality.length ?? 0) > 0 && (
              <div className="mt-1 pt-2 border-t border-line">
                <div className="text-[10px] font-semibold text-ink3 mb-1">评分要点（技能要求 / 质量指标）</div>
                {[...(official?.skills ?? []), ...(official?.quality ?? [])].map((s2, i) => (
                  <div key={i} className="text-[10px] text-ink3 leading-relaxed">· {s2}</div>
                ))}
              </div>
            )}
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
                <span className="flex-1 text-xs font-medium text-ink1 truncate">
                  {folder ?? `${folderCandidates(sel)[0]}（未找到或为空，显示根目录）`}
                </span>
                <button className="text-ink3 hover:text-accent" title="更换素材总目录" onClick={changeMaterialDir}>
                  <FolderOpen size={14} />
                </button>
                <button className="text-ink3 hover:text-accent" title="在资源管理器中打开" onClick={() => openFolder(folder ? `${materialDir}/${folder}` : materialDir)}>
                  <ExternalLink size={14} />
                </button>
              </div>
              {folder === null && (
                <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-warn-soft">
                  <span className="flex-1 text-[10px] text-ink2 leading-relaxed">素材目录里没有本题素材。若尚未导入素材包，先导入 zip：</span>
                  <Btn onClick={runImport} disabled={importing}>
                    {importing ? "导入中…" : "导入素材包"}
                  </Btn>
                </div>
              )}
              <div className="text-[10px] text-ink3 leading-relaxed">
                运行依赖：pandas · scikit-learn · matplotlib · joblib（环境助手可一键安装）。点击「启动 Jupyter」将在素材目录启动 Notebook。
              </div>
            </div>
          </Card>
        </div>

        <Card
          className={`${full ? "fixed inset-0 z-50" : "flex-1 min-w-0"} flex flex-col`}
        >
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
                  <Btn primary onClick={() => setFull((v) => !v)}>
                    {full ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                    {full ? "还原" : "放大"}
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
# 1. 阅读左侧「题目要求」，打开素材里的 .ipynb 考卷（挖空+分值标注）
# 2. 补全挖空代码，Shift+Enter 逐格运行
# 3. 怎样算成功：全部空格填完、运行无报错、
#    结果与左侧「参考答案」一致（可展开对照）
# 4. 点击上方「标记完成」记进度`}</pre>
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

// 题组 → 素材文件夹候选（按存在与否逐个尝试）：
// ① 题号平铺（1.1.1/，每题一个文件夹）；② 题组组合文件夹（部分素材包按 1.1.1-1.1.5~… 组织，
// 参考代码放里面）。都没有 → null，落到 Jupyter 根目录并在日志里说明去哪找参考文件
function folderCandidates(sel: { groupId: string; idx: number }): string[] {
  const grouped =
    sel.groupId === "1.1" || sel.groupId === "1.2"
      ? "1.1.1-1.1.5~1.2.1-1.2.5素材"
      : sel.groupId === "4.1" || sel.groupId === "4.2"
        ? "4.1.1-4.1.5~4.2.1-4.2.5素材"
        : `${sel.groupId}.1-${sel.groupId}.5素材`;
  return [`${sel.groupId}.${sel.idx + 1}`, grouped];
}

// 在 Jupyter 服务地址上定位到某题的素材文件夹（保留 token 等查询参数）；folder=null 则停留根目录
function withTree(base: string, folder: string | null): string {
  if (!folder) return base;
  try {
    const u = new URL(base);
    u.pathname = `/lab/tree/${encodeURIComponent(folder)}`;
    return u.toString();
  } catch {
    return base;
  }
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
