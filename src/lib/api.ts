// Tauri 命令封装 + 事件监听；浏览器 dev 环境自动降级为 mock
import { invoke, type InvokeArgs } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export const isTauri = () => "__TAURI_INTERNALS__" in window;

export type ToolInfo = {
  name: string;
  ok: boolean;
  version: string;
  detail: string;
};

export async function detectEnv(): Promise<ToolInfo[]> {
  if (!isTauri()) return mockEnv();
  return invoke<ToolInfo[]>("detect_env");
}

export type InstallEvent = { line: string };

/** 订阅安装日志/完成事件并调用后端命令（install_packages 与 install_python 共用） */
async function streamInstall(
  command: string,
  args: InvokeArgs,
  onLog: (line: string) => void,
  onDone: (ok: boolean) => void,
): Promise<void> {
  const un1 = await listen<InstallEvent>("install-log", (e) => onLog(e.payload.line));
  const un2 = await listen<{ ok: boolean }>("install-done", (e) => {
    un1();
    un2();
    onDone(e.payload.ok);
  });
  await invoke(command, args);
}

export async function installPackages(
  names: string[],
  onLog: (line: string) => void,
  onDone: (ok: boolean) => void,
): Promise<void> {
  if (!isTauri()) {
    for (const n of names) onLog(`(mock) pip install -U ${n} … 完成`);
    onDone(true);
    return;
  }
  await streamInstall("install_packages", { names }, onLog, onDone);
}

/** 安装 Python 运行时本身：Windows winget/python.org 静默装，macOS 下载官方 pkg 并打开图形安装器 */
export async function installPython(onLog: (line: string) => void, onDone: (ok: boolean) => void): Promise<void> {
  if (!isTauri()) {
    onLog("(mock) 按平台安装 Python 运行时（winget / 官方安装包）… 完成");
    onDone(true);
    return;
  }
  await streamInstall("install_python", {}, onLog, onDone);
}

export async function openFolder(path: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_folder", { path });
}

export async function pathIsDir(path: string): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("path_is_dir", { path });
}

export async function dirEntryCount(path: string): Promise<number> {
  if (!isTauri()) return 0;
  return invoke<number>("dir_entry_count", { path });
}

export type JupyterInfo = { running: boolean; url: string; log: string[] };

export async function jupyterStart(dir: string): Promise<JupyterInfo> {
  if (!isTauri()) return { running: true, url: "http://localhost:8889/lab", log: ["(mock) jupyter lab started"] };
  return invoke<JupyterInfo>("jupyter_start", { dir });
}

export async function jupyterStop(): Promise<void> {
  if (!isTauri()) return;
  await invoke("jupyter_stop");
}

export async function jupyterStatus(): Promise<JupyterInfo> {
  if (!isTauri()) return { running: false, url: "", log: [] };
  return invoke<JupyterInfo>("jupyter_status");
}

export async function onJupyterReady(cb: (url: string) => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  return listen<{ url: string }>("jupyter-ready", (e) => cb(e.payload.url));
}

/** Jupyter 服务端日志（含内核启动失败原因），逐行推送 */
export async function onJupyterLog(cb: (line: string) => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  return listen<{ line: string }>("jupyter-log", (e) => cb(e.payload.line));
}

/** Jupyter 启动看门狗：超时端口未通 → 进程已崩，回调 stderr 尾部日志 */
export async function onJupyterFailed(cb: (lines: string[]) => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  return listen<{ lines: string[] }>("jupyter-failed", (e) => cb(e.payload.lines));
}

function mockEnv(): ToolInfo[] {
  return [
    { name: "python", ok: true, version: "3.11.8", detail: "系统运行时" },
    { name: "pip", ok: true, version: "24.0", detail: "包管理器" },
    { name: "jupyterlab", ok: true, version: "4.2.5", detail: "Notebook 服务" },
    { name: "pandas", ok: true, version: "2.2.2", detail: "数据处理" },
    { name: "numpy", ok: true, version: "1.26.4", detail: "数值计算" },
    { name: "scikit-learn", ok: false, version: "", detail: "机器学习建模" },
    { name: "matplotlib", ok: true, version: "3.8.4", detail: "统计可视化绘图" },
    { name: "openpyxl", ok: true, version: "3.1.5", detail: "Excel 数据读取（.xlsx 素材）" },
    { name: "onnxruntime", ok: false, version: "", detail: "ONNX 模型推理" },
    { name: "Pillow", ok: true, version: "10.3.0", detail: "图像读取处理" },
    { name: "opencv-python", ok: false, version: "", detail: "图像处理（cv2）" },
    { name: "xgboost", ok: true, version: "2.0.3", detail: "梯度提升模型" },
    { name: "seaborn", ok: true, version: "0.13.2", detail: "统计可视化" },
    { name: "imbalanced-learn", ok: false, version: "", detail: "类别不平衡采样（SMOTE）" },
  ];
}

// —— 本地持久化状态的数据模型（读写与存储见 lib/store.ts，zustand persist） ——
export type Store = {
  practice: Record<string, { done: boolean; wrong?: boolean; lastAt: string }>;
  history: { date: string; score: number | null; theory: number | null; practical: number | null; minutes: number }[];
  wrongBook: { id: string; type: string; text: string; count: number }[];
  answerKey: { judge?: Record<string, string>; single?: Record<string, string>; multi?: Record<string, string> }; // 全真卷连续编号拆节存放（judge/single/multi 各按题型题号）
  theoryDone: Record<string, string>; // 已作答理论题 {"s5":"2026-10-09"}（key=j/s/m+题号，官方卷不计入）
  mastered: Record<string, boolean>; // 知识点掌握标记 {"k2-2":true}
  materialDir: string;
};
