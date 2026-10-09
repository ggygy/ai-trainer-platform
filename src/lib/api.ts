// Tauri 命令封装 + 事件监听；浏览器 dev 环境自动降级为 mock
import { invoke } from "@tauri-apps/api/core";
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
  const un1 = await listen<InstallEvent>("install-log", (e) => onLog(e.payload.line));
  const un2 = await listen<{ ok: boolean }>("install-done", (e) => {
    un1();
    un2();
    onDone(e.payload.ok);
  });
  await invoke("install_packages", { names });
}

export async function openFolder(path: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_folder", { path });
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

function mockEnv(): ToolInfo[] {
  return [
    { name: "python", ok: true, version: "3.11.8", detail: "系统运行时" },
    { name: "pip", ok: true, version: "24.0", detail: "包管理器" },
    { name: "jupyterlab", ok: true, version: "4.2.5", detail: "Notebook 服务" },
    { name: "pandas", ok: true, version: "2.2.2", detail: "数据处理" },
    { name: "numpy", ok: true, version: "1.26.4", detail: "数值计算" },
    { name: "scikit-learn", ok: false, version: "", detail: "机器学习建模" },
    { name: "matplotlib", ok: true, version: "3.8.4", detail: "统计可视化绘图" },
    { name: "onnxruntime", ok: false, version: "", detail: "ONNX 模型推理" },
    { name: "Pillow", ok: true, version: "10.3.0", detail: "图像读取处理" },
    { name: "opencv-python", ok: false, version: "", detail: "图像处理（cv2）" },
    { name: "xgboost", ok: true, version: "2.0.3", detail: "梯度提升模型" },
    { name: "seaborn", ok: true, version: "0.13.2", detail: "统计可视化" },
    { name: "imbalanced-learn", ok: false, version: "", detail: "类别不平衡采样（SMOTE）" },
  ];
}

// —— 本地存储（进度 / 错题 / 考试历史 / 答案） ——
export type Store = {
  practice: Record<string, { done: boolean; wrong?: boolean; lastAt: string }>;
  history: { date: string; score: number | null; theory: number | null; practical: number | null; minutes: number }[];
  wrongBook: { id: string; type: string; text: string; count: number }[];
  answerKey: Record<string, Record<string, string>>; // {"single":{"1":"A",...}}
  mastered: Record<string, boolean>; // 知识点掌握标记 {"k2-2":true}
  materialDir: string;
};

const KEY = "atp.store.v1";
const DEFAULT_STORE: Store = {
  practice: {},
  history: [],
  wrongBook: [],
  answerKey: {},
  mastered: {},
  materialDir: "/Users/zhouwangjun/Desktop/codeing/AI/人工智能训练师三级上网素材",
};

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_STORE, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_STORE };
}

export function saveStore(s: Store) {
  localStorage.setItem(KEY, JSON.stringify(s));
}
