// 应用内更新弹窗：检查更新 → 发现新版本（说明 + 立即更新）→ 下载进度 → 重启完成安装
import { useEffect, useState } from "react";
import { CircleCheck, RefreshCw, TriangleAlert, X } from "lucide-react";
import { Btn, Ghost, Progress } from "./ui";
import { openExternal } from "../lib/api";
import { APP_VERSION, checkForUpdate, relaunchApp, type UpdateHandle } from "../lib/updater";

export const RELEASES_URL = "https://github.com/ggygy/ai-trainer-platform/releases";

type Phase =
  | { k: "checking" }
  | { k: "latest" }
  | { k: "available"; update: UpdateHandle }
  | { k: "downloading"; received: number; total: number | null }
  | { k: "ready" }
  | { k: "error"; message: string };

const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;

export default function UpdateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>({ k: "checking" });

  const runCheck = () => {
    setPhase({ k: "checking" });
    checkForUpdate().then((r) => {
      if (r.status === "available") setPhase({ k: "available", update: r.update });
      else if (r.status === "latest") setPhase({ k: "latest" });
      else setPhase({ k: "error", message: r.message });
    });
  };

  useEffect(() => {
    if (open) runCheck();
    // eslint 不在依赖里展开 runCheck：只在弹窗打开时触发一次检查
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase.k !== "downloading") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, phase.k, onClose]);

  if (!open) return null;

  const busy = phase.k === "downloading";

  const startDownload = async (update: UpdateHandle) => {
    setPhase({ k: "downloading", received: 0, total: null });
    try {
      await update.downloadAndInstall((received, total) => setPhase({ k: "downloading", received, total }));
      // Windows 上安装器接管后进程退出，走不到这里；macOS/Linux 下载安装完成，等用户确认重启
      setPhase({ k: "ready" });
    } catch (e) {
      setPhase({ k: "error", message: `下载或安装失败：${e instanceof Error ? e.message : String(e)}` });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="w-[430px] bg-surface border border-line rounded-[14px] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-[15px] font-semibold text-ink1">检查更新</div>
          <button
            onClick={onClose}
            disabled={busy}
            title={busy ? "正在下载，无法关闭" : "关闭"}
            className="text-ink3 hover:text-ink1 disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        {phase.k === "checking" && (
          <div className="flex items-center gap-2.5 py-3 text-[13px] text-ink2">
            <RefreshCw size={16} className="animate-spin text-accent" />
            正在检查更新…
          </div>
        )}

        {phase.k === "latest" && (
          <div className="py-2">
            <div className="flex items-center gap-2.5 text-[13px] text-ink1 font-medium">
              <CircleCheck size={16} className="text-ok" />
              已是最新版本
            </div>
            <div className="text-xs text-ink3 mt-1.5 ml-6.5">当前 v{APP_VERSION}</div>
          </div>
        )}

        {phase.k === "available" && (
          <div className="py-1">
            <div className="flex items-center gap-2.5 text-[13px] text-ink1 font-medium">
              <RefreshCw size={16} className="text-accent" />
              发现新版本 v{phase.update.info.version}
              <span className="text-[11px] text-ink3 font-normal">（当前 v{APP_VERSION}）</span>
            </div>
            {phase.update.info.date && (
              <div className="text-[11px] text-ink3 mt-1 ml-6.5">发布于 {phase.update.info.date.slice(0, 10)}</div>
            )}
            {phase.update.info.notes.trim() && (
              <div className="mt-3 max-h-40 overflow-auto bg-surface2 rounded-lg p-3 text-xs text-ink2 leading-relaxed whitespace-pre-wrap break-words">
                {phase.update.info.notes.trim()}
              </div>
            )}
            <div className="flex items-center gap-2.5 mt-4">
              <Btn primary onClick={() => startDownload(phase.update)}>
                立即更新
              </Btn>
              <Btn onClick={onClose}>稍后再说</Btn>
              <Ghost className="ml-auto" onClick={() => openExternal(RELEASES_URL)}>
                发布页
              </Ghost>
            </div>
          </div>
        )}

        {phase.k === "downloading" && (
          <div className="py-2">
            <div className="text-[13px] text-ink1 font-medium mb-3">正在下载更新…</div>
            <Progress
              value={phase.total ? (phase.received / phase.total) * 100 : 90}
              className="w-full"
            />
            <div className="text-[11px] text-ink3 mt-2">
              {phase.total
                ? `${mb(phase.received)} / ${mb(phase.total)}（${Math.floor((phase.received / phase.total) * 100)}%）`
                : `已下载 ${mb(phase.received)}`}
            </div>
          </div>
        )}

        {phase.k === "ready" && (
          <div className="py-2">
            <div className="flex items-center gap-2.5 text-[13px] text-ink1 font-medium">
              <CircleCheck size={16} className="text-ok" />
              新版本已就绪
            </div>
            <div className="text-xs text-ink3 mt-1.5 ml-6.5">重启应用后完成安装，学习进度与错题本不会丢失。</div>
            <div className="flex items-center gap-2.5 mt-4">
              <Btn
                primary
                onClick={() => {
                  relaunchApp().catch(() => {});
                }}
              >
                立即重启
              </Btn>
              <Btn onClick={onClose}>稍后重启</Btn>
            </div>
          </div>
        )}

        {phase.k === "error" && (
          <div className="py-2">
            <div className="flex items-center gap-2.5 text-[13px] text-ink1 font-medium">
              <TriangleAlert size={16} className="text-warn" />
              无法完成检查
            </div>
            <div className="text-xs text-ink3 mt-1.5 ml-6.5 break-words">{phase.message}</div>
            <div className="text-xs text-ink3 mt-1.5 ml-6.5">
              也可以从
              <Ghost className="mx-1" onClick={() => openExternal(RELEASES_URL)}>
                GitHub Releases
              </Ghost>
              页手动下载安装包。
            </div>
            <div className="flex items-center gap-2.5 mt-4">
              <Btn onClick={runCheck}>重试</Btn>
              <Btn onClick={onClose}>关闭</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
