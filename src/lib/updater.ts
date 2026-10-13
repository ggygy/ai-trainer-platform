// 应用内更新封装（Tauri updater 插件）：检查/下载/安装/重启；浏览器预览模式不可用
import { isTauri } from "./api";
import pkg from "../../package.json";

export const APP_VERSION = pkg.version;

export type UpdateInfo = { version: string; notes: string; date?: string };

export type UpdateHandle = {
  info: UpdateInfo;
  /** 下载并安装，onProgress 回调累计已收字节与总字节（未知为 null）。
   *  Windows 上安装器接管后本进程退出，Promise 不会 resolve（不会走到调用方后续代码）。 */
  downloadAndInstall: (onProgress: (received: number, total: number | null) => void) => Promise<void>;
};

export type CheckResult =
  | { status: "latest" }
  | { status: "available"; update: UpdateHandle }
  | { status: "error"; message: string };

export async function checkForUpdate(): Promise<CheckResult> {
  if (!isTauri()) {
    return { status: "error", message: "浏览器预览模式不支持更新检查，请使用安装的桌面应用。" };
  }
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (update?.available) {
      return {
        status: "available",
        update: {
          info: { version: update.version, notes: update.body ?? "", date: update.date ?? undefined },
          downloadAndInstall: (onProgress) => {
            let received = 0;
            let total: number | null = null;
            return update.downloadAndInstall((e) => {
              if (e.event === "Started") {
                total = e.data.contentLength ?? null;
                onProgress(0, total);
              } else if (e.event === "Progress") {
                received += e.data.chunkLength;
                onProgress(received, total);
              } else {
                onProgress(total ?? received, total);
              }
            });
          },
        },
      };
    }
    return { status: "latest" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "error", message: `检查更新失败：${msg}` };
  }
}

export async function relaunchApp(): Promise<void> {
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
