import { useEffect, useState } from "react";
import Sidebar, { type PageId } from "./components/Sidebar";
import UpdateModal from "./components/UpdateModal";
import Dashboard from "./pages/Dashboard";
import Guide from "./pages/Guide";
import TheoryLearn from "./pages/TheoryLearn";
import TheoryExam from "./pages/TheoryExam";
import PracticalTrain from "./pages/PracticalTrain";
import PracticalExam from "./pages/PracticalExam";
import EnvAssistant from "./pages/EnvAssistant";
import Report from "./pages/Report";
import { detectEnv, isTauri, pathIsDir, type ToolInfo } from "./lib/api";
import { APP_VERSION, checkForUpdate, type UpdateHandle } from "./lib/updater";
import { materialDir as appMaterialDir } from "./lib/materials";
import { useStore } from "./lib/store";

const PAGE_IDS: PageId[] = ["home", "guide", "learn", "exam", "practical", "practical-exam", "env", "report"];

function initialPage(): PageId {
  const p = new URLSearchParams(window.location.search).get("page");
  return PAGE_IDS.includes(p as PageId) ? (p as PageId) : "home";
}

function initialPractical(): { groupId: string; idx: number } | undefined {
  const sp = new URLSearchParams(window.location.search);
  const g = sp.get("group");
  return g ? { groupId: g, idx: parseInt(sp.get("idx") ?? "0") || 0 } : undefined;
}

export default function App() {
  const [page, setPage] = useState<PageId>(initialPage);
  const [tools, setTools] = useState<ToolInfo[] | null>(null);
  const [practicalInitial, setPracticalInitial] = useState<{ groupId: string; idx: number } | undefined>(initialPractical);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateHandle, setUpdateHandle] = useState<UpdateHandle | null>(null);
  // ?paper=official|wrong 深链自动开卷；手动导航进考试页时清掉，避免再次进入自动重开
  const [examAuto, setExamAuto] = useState<"official" | "wrong" | null>(() => {
    const p = new URLSearchParams(window.location.search).get("paper");
    return p === "official" || p === "wrong" ? p : null;
  });
  // 答题回顾/错题本「去看讲义」→ 理论学习页直接落到该章；手动导航时清掉回默认章
  const [learnInitial, setLearnInitial] = useState<string | undefined>();

  const refreshEnv = () => {
    detectEnv()
      .then((t) => setTools(t))
      .catch(() => setTools(null));
  };
  useEffect(() => {
    refreshEnv();
    // 素材目录默认迁移：老用户的默认目录里没有真实素材（旧版只建过空壳），
    // 未显式指认过目录时自动切到应用素材目录（导入素材包后的落点）
    if (isTauri()) {
      (async () => {
        const st = useStore.getState();
        if (st.materialDirCustom) return;
        const md = await appMaterialDir();
        if (!md) return;
        if (!(await pathIsDir(`${st.materialDir}/1.1.1`))) {
          useStore.getState().update({ materialDir: md });
        }
      })();
    }
  }, []);

  // 启动静默检查更新：失败不打扰（网络问题常见），发现新版只亮侧边栏入口，不弹窗
  useEffect(() => {
    if (!isTauri()) return;
    checkForUpdate().then((r) => {
      if (r.status === "available") setUpdateHandle(r.update);
    });
  }, []);

  const missing = tools ? tools.filter((t) => !t.ok && !["python", "pip"].includes(t.name)).length : 0;
  const envState = tools === null ? null : { ok: missing === 0, missing };

  const navigate = (p: PageId) => {
    setPage(p);
    setExamAuto(null);
    setLearnInitial(undefined);
  };

  const openExamPaper = (paper: "official" | "wrong") => {
    setExamAuto(paper);
    setPage("exam");
  };

  const openLesson = (code: string) => {
    setLearnInitial(code);
    setPage("learn");
  };

  const openPractical = (groupId: string, idx: number) => {
    setPracticalInitial({ groupId, idx });
    setPage("practical-exam");
  };

  return (
    <div className="flex h-full min-h-0">
      <Sidebar
        page={page}
        onNavigate={navigate}
        envOk={tools === null ? null : missing === 0}
        envText={tools === null ? "正在检测环境…" : missing === 0 ? "环境就绪 · Jupyter 可启动" : `环境待修复 · ${missing} 项依赖`}
        version={APP_VERSION}
        hasUpdate={updateHandle !== null}
        onCheckUpdate={() => setUpdateOpen(true)}
      />
      <main className="flex-1 min-w-0 min-h-0">
        {page === "home" && <Dashboard go={navigate} env={envState} />}
        {page === "guide" && <Guide go={navigate} />}
        {page === "learn" && <TheoryLearn go={navigate} initial={learnInitial} />}
        {page === "exam" && <TheoryExam autoPaper={examAuto} onOpenLesson={openLesson} />}
        {page === "practical" && <PracticalTrain openQ={openPractical} />}
        {page === "practical-exam" && <PracticalExam initial={practicalInitial} />}
        {page === "env" && <EnvAssistant onEnvChanged={refreshEnv} go={navigate} />}
        {page === "report" && <Report onGo={navigate} onWrongPractice={() => openExamPaper("wrong")} onOpenLesson={openLesson} />}
      </main>
      <UpdateModal open={updateOpen} onClose={() => setUpdateOpen(false)} />
    </div>
  );
}
