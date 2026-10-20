import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  CircleCheck,
  CircleAlert,
  Download,
  RotateCw,
  LoaderCircle,
  FolderOpen,
  ExternalLink,
  BookOpenCheck,
} from "lucide-react";
import { Card, CardHead, Badge, Btn, Ghost, PageHead } from "../components/ui";
import { DEPENDENCIES } from "../data/content";
import { useStore } from "../lib/store";
import {
  detectEnv,
  installPackages,
  installPython,
  jupyterStart,
  jupyterStatus,
  jupyterStop,
  onJupyterFailed,
  onJupyterReady,
  isTauri,
  openFolder,
  pathIsDir,
  type ToolInfo,
} from "../lib/api";
import { pickAndImportMaterials } from "../lib/materials";
import type { PageId } from "../components/Sidebar";

type Phase = "idle" | "detecting" | "installing";

export default function EnvAssistant({ onEnvChanged, go }: { onEnvChanged: () => void; go?: (p: PageId) => void }) {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [jupyter, setJupyter] = useState<{ running: boolean; url: string }>({ running: false, url: "" });
  const materialDir = useStore((s) => s.materialDir);
  const setMaterialDir = useStore((s) => s.setMaterialDir);
  const [jupyterDir, setJupyterDir] = useState(materialDir);
  const [importing, setImporting] = useState(false);
  const [materialsReady, setMaterialsReady] = useState<boolean | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const unReadyRef = useRef<(() => void) | null>(null);
  const unFailedRef = useRef<(() => void) | null>(null);

  const detect = async () => {
    setPhase("detecting");
    try {
      setTools(await detectEnv());
    } catch (e) {
      setLogs((l) => [...l, `[错误] 检测失败: ${String(e)}`]);
    }
    setPhase("idle");
    onEnvChanged();
  };

  useEffect(() => {
    detect();
    return () => {
      unReadyRef.current?.();
      unFailedRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logs]);

  useEffect(() => {
    let alive = true;
    pathIsDir(`${materialDir}/1.1.1`).then((ok) => alive && setMaterialsReady(ok));
    return () => {
      alive = false;
    };
  }, [materialDir]);

  // 导入素材包 zip（百度网盘下载后在此指认）
  const runImport = async () => {
    setImporting(true);
    try {
      const r = await pickAndImportMaterials();
      if (r) {
        setLogs((l) => [...l, r.ok ? `✓ ${r.message} → ${r.dir}` : `[错误] ${r.message}`]);
        if (r.ok) setMaterialsReady(true);
      }
    } finally {
      setImporting(false);
    }
  };

  const missing = tools.filter((t) => !t.ok && !["python", "pip"].includes(t.name));
  const coreInstalled = tools.filter((t) => t.ok && !["python", "pip"].includes(t.name)).length;
  const pyMissing = tools.length > 0 && !tools.find((t) => t.name === "python")?.ok;

  const runInstall = async () => {
    const names = missing.map((m) => m.name);
    if (!names.length) return;
    setPhase("installing");
    setLogs((l) => [...l, `$ ai-trainer env install ${names.join(" ")}`]);
    await installPackages(
      names,
      (line) => setLogs((l) => [...l.slice(-400), line]),
      (ok) => {
        setLogs((l) => [...l, ok ? "$ 安装完成 ✓" : "$ 安装过程出现错误，详见上方日志"]);
        setPhase("idle");
        detect();
      },
    );
  };

  // 未检测到 Python 时的一键引导安装（Windows 静默装 / macOS 打开官方安装器）
  const runPythonInstall = async () => {
    setPhase("installing");
    setLogs((l) => [...l, "$ ai-trainer env install-python"]);
    await installPython(
      (line) => setLogs((l) => [...l.slice(-400), line]),
      (ok) => {
        setLogs((l) => [...l, ok ? "$ Python 就绪 ✓" : "$ Python 自动安装未完成，详见上方日志"]);
        setPhase("idle");
        detect();
      },
    );
  };

  const startJupyter = async () => {
    setMaterialDir(jupyterDir); // 落库后 PracticalExam 的 Jupyter 工作目录随之生效
    setLogs((l) => [...l, `$ jupyter lab --no-browser（随机空闲端口）--notebook-dir=${jupyterDir}`]);
    unFailedRef.current = await onJupyterFailed((lines) => {
      setJupyter({ running: false, url: "" });
      setLogs((l) => [...l, "[错误] Jupyter 启动失败（进程已退出），日志尾部：", ...lines.map((x) => "  " + x)]);
    });
    try {
      const info = await jupyterStart(jupyterDir);
      unReadyRef.current = await onJupyterReady((url) => {
        setJupyter({ running: true, url });
        setLogs((l) => [...l, `✓ Jupyter 已就绪: ${url}`]);
      });
      if (info.running && info.url) {
        setJupyter({ running: true, url: info.url });
        setLogs((l) => [...l, `✓ Jupyter 已就绪: ${info.url}`]);
      } else if (!info.running) {
        setLogs((l) => [...l, info.log.join(" ") || "启动失败"]);
      } else {
        setLogs((l) => [...l, "✓ 启动中，等待服务就绪…"]);
      }
    } catch (e) {
      setLogs((l) => [...l, `[错误] ${String(e)}`]);
    }
  };

  const stopJupyter = async () => {
    await jupyterStop();
    setJupyter({ running: false, url: "" });
    setLogs((l) => [...l, "$ jupyter 已停止"]);
    unReadyRef.current?.();
  };

  // 运行中每 5s 复核进程存活，崩溃后徽标回落而不是挂着假「运行中」
  useEffect(() => {
    if (!jupyter.running || !isTauri()) return;
    const t = setInterval(async () => {
      try {
        if (!(await jupyterStatus()).running) {
          setJupyter({ running: false, url: "" });
          setLogs((l) => [...l, "✗ Jupyter 进程已退出，请重新启动"]);
        }
      } catch {
        // 单次查询失败等下一轮
      }
    }, 5000);
    return () => clearInterval(t);
  }, [jupyter.running]);

  const pickDir = async () => {
    if (!isTauri()) return;
    const dir = await open({ directory: true, multiple: false, title: "选择实操素材目录" });
    if (typeof dir === "string") setJupyterDir(dir);
  };

  return (
    <div className="flex flex-col gap-4 p-7 h-full overflow-y-auto">
      <PageHead
        title="环境助手"
        sub="一键检测并安装实操题所需的 Python 环境与依赖，Jupyter 就绪后可直接在应用内运行"
        right={
          <>
            {pyMissing && (
              <Btn onClick={runPythonInstall} disabled={phase !== "idle"}>
                <Download size={14} /> 安装 Python 运行时
              </Btn>
            )}
            <Btn onClick={detect} disabled={phase !== "idle"}>
              <RotateCw size={14} className={phase === "detecting" ? "animate-spin" : ""} /> 重新检测
            </Btn>
            <Btn primary onClick={runInstall} disabled={phase !== "idle" || !missing.length}>
              <Download size={14} /> 一键安装缺失依赖{missing.length ? `（${missing.length}）` : ""}
            </Btn>
          </>
        }
      />

      <div className="grid grid-cols-4 gap-3.5">
        <StatCard label="Python 运行时" value={tools.find((t) => t.name === "python")?.version || "—"} delta={tools.find((t) => t.name === "python")?.ok ? "已安装" : "未安装"} ok={!!tools.find((t) => t.name === "python")?.ok} />
        <StatCard
          label="Jupyter 服务"
          value={jupyter.running ? "运行中" : tools.find((t) => t.name.startsWith("jupyter"))?.version || "—"}
          delta={jupyter.running ? "已就绪 · 可在应用内打开" : tools.some((t) => t.name.startsWith("jupyter") && t.ok) ? "已安装 · 未启动" : "未安装"}
          ok={jupyter.running}
        />
        <StatCard
          label="核心依赖包"
          value={`${coreInstalled}/${DEPENDENCIES.length - 2}`}
          delta={missing.length ? `${missing.length} 项待安装` : "全部就绪"}
          ok={!missing.length}
        />
        <StatCard
          label="实操题可用"
          value={missing.length ? `${Math.max(0, 40 - missing.length * 3)}/40` : "40/40"}
          delta={missing.length ? "依赖补齐后恢复" : "全部可练习"}
          ok={!missing.length}
        />
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        <Card className="flex-1 min-w-0 flex flex-col">
          <CardHead
            title="依赖清单"
            sub={`环境 ai-trainer · 共 ${DEPENDENCIES.length} 项`}
            right={missing.length ? <Badge tone="bad">{missing.length} 项缺失</Badge> : <Badge>全部就绪</Badge>}
          />
          <div className="flex text-[11px] font-medium text-ink3 px-3 pb-2 gap-3">
            <span className="w-5" />
            <span className="w-[150px]">包名</span>
            <span className="flex-1">用途</span>
            <span className="w-[90px]">建议版本</span>
            <span className="w-[88px]">状态</span>
          </div>
          <div className="flex flex-col gap-1 flex-1 overflow-y-auto">
            {tools.length === 0 && <div className="text-xs text-ink3 px-3 py-6">正在检测本机环境…</div>}
            {DEPENDENCIES.map((dep) => {
              const t = tools.find((x) => x.name === dep.pip);
              const ok = !!t?.ok;
              return (
                <div key={dep.pip} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${ok ? "" : "bg-bad-soft"}`}>
                  {ok ? (
                    <CircleCheck size={15} className="text-ok shrink-0" />
                  ) : (
                    <CircleAlert size={15} className="text-bad shrink-0" />
                  )}
                  <span className="w-[150px] font-mono text-xs font-medium text-ink1 truncate">{dep.pip}</span>
                  <span className="flex-1 text-[11px] text-ink2 truncate">{dep.use}</span>
                  <span className="w-[90px] font-mono text-[11px] text-ink3">{dep.version}</span>
                  <span className="w-[88px]">
                    {!t && phase === "detecting" ? (
                      <span className="text-[11px] text-ink3">检测中…</span>
                    ) : ok ? (
                      <Badge>已安装</Badge>
                    ) : (
                      <Badge tone="bad" dot={false}>
                        未安装
                      </Badge>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="w-[360px] shrink-0 flex flex-col gap-3.5">
          <Card>
            <CardHead
              title="实操素材包"
              right={materialsReady === null ? <Badge tone="muted">检测中</Badge> : materialsReady ? <Badge>已就绪</Badge> : <Badge tone="warn">未导入</Badge>}
            />
            <div className="text-[11px] text-ink3 mb-2.5 break-all leading-relaxed">
              {materialsReady ? "40 题考卷与数据已就绪。" : "素材包（约 220MB）不含在安装包内：从网盘下载 zip 后在此导入。"}
              {!materialsReady && (
                <button
                  className="text-accent hover:underline underline-offset-2 ml-1 inline-flex items-center gap-0.5"
                  onClick={() => go?.("guide")}
                >
                  <BookOpenCheck size={11} /> 下载与导入指引
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <Btn primary className="!justify-center flex-1" onClick={runImport} disabled={importing}>
                {importing ? "导入中（约十几秒）…" : "导入素材包（.zip）"}
              </Btn>
              <Btn onClick={() => openFolder(materialDir)} title="打开素材目录">
                <FolderOpen size={14} />
              </Btn>
            </div>
          </Card>

          <Card>
            <CardHead
              title="Jupyter 服务"
              right={jupyter.running ? <Badge>运行中</Badge> : <Badge tone="muted">未启动</Badge>}
            />
            <div className="text-[11px] text-ink3 mb-2.5 break-all leading-relaxed">工作目录：{jupyterDir}</div>
            <div className="flex gap-2">
              {jupyter.running ? (
                <>
                  <Btn
                    primary
                    className="!justify-center flex-1"
                    onClick={() => {
                      if (!isTauri()) {
                        setLogs((l) => [...l, "(mock) 浏览器预览模式：桌面应用中将打开独立 Lab 窗口"]);
                        return;
                      }
                      if (!jupyter.url) {
                        setLogs((l) => [...l, "[错误] Jupyter 尚未就绪（地址未就绪），稍候再试"]);
                        return;
                      }
                      window.open(jupyter.url, "_blank");
                    }}
                  >
                    <ExternalLink size={13} /> 打开 Lab
                  </Btn>
                  <Btn onClick={stopJupyter}>停止</Btn>
                </>
              ) : (
                <>
                  <Btn primary className="!justify-center flex-1" onClick={startJupyter}>
                    启动 Jupyter
                  </Btn>
                  <Btn onClick={pickDir} title="选择素材目录">
                    <FolderOpen size={14} />
                  </Btn>
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHead
              title="安装队列"
              right={phase === "installing" ? <Badge tone="accent">进行中</Badge> : <Badge tone="muted">空闲</Badge>}
            />
            {/* 缺失项多时内部滚动：此前整卡撑高把下方「安装日志」压到只剩两三行（issue #5 显示不全） */}
            <div className="flex flex-col gap-2 max-h-[128px] overflow-y-auto">
              {missing.length === 0 ? (
                <div className="text-xs text-ink3">没有待安装的依赖 ✓</div>
              ) : (
                missing.map((m, i) => (
                  <div key={m.name} className="flex items-center gap-2">
                    {phase === "installing" && i === 0 ? (
                      <LoaderCircle size={13} className="text-accent animate-spin shrink-0" />
                    ) : (
                      <span className="w-[5px] h-[5px] rounded-full bg-ink3 shrink-0 ml-1 mr-1.5" />
                    )}
                    <span className="font-mono text-[11px] text-ink2">
                      {phase === "installing" && i === 0 ? "正在安装 " : i === 0 ? "下一个 " : "等待 "}
                      {m.name} {m.version}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="flex-1 min-h-[190px] flex flex-col">
            <CardHead title="安装日志" right={<Ghost onClick={() => setLogs([])}>清空</Ghost>} />
            <div ref={logRef} className="flex-1 min-h-0 overflow-y-auto rounded-[10px] bg-inkwell p-3.5 flex flex-col gap-[3px]">
              {logs.length === 0 && (
                <div className="font-mono text-[11px] leading-relaxed text-slate-500 whitespace-pre-wrap select-none">
                  {"$ 等待操作…\n\n点击「一键安装缺失依赖」开始安装；\n检测与安装日志都会显示在这里。"}
                </div>
              )}
              {logs.map((l, i) => (
                <div
                  key={i}
                  className={`font-mono text-[11px] leading-[1.55] whitespace-pre-wrap break-words selectable ${
                    l.startsWith("$") ? "text-blue-300" : l.startsWith("✓") ? "text-emerald-300" : l.startsWith("[错误]") || l.startsWith("!") ? "text-red-300" : "text-slate-300"
                  }`}
                >
                  {l}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, delta, ok }: { label: string; value: string; delta: string; ok: boolean }) {
  return (
    <Card className="!p-[18px]">
      <div className="text-xs text-ink2">{label}</div>
      <div className="text-[26px] font-bold text-ink1 mt-2 leading-none">{value}</div>
      <div className={`text-[11px] mt-2 ${ok ? "text-ok" : "text-warn"}`}>{delta}</div>
    </Card>
  );
}
