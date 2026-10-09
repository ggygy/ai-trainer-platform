import { useEffect, useState } from "react";
import Sidebar, { type PageId } from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import TheoryLearn from "./pages/TheoryLearn";
import TheoryExam from "./pages/TheoryExam";
import PracticalTrain from "./pages/PracticalTrain";
import PracticalExam from "./pages/PracticalExam";
import EnvAssistant from "./pages/EnvAssistant";
import Report from "./pages/Report";
import { detectEnv, type ToolInfo } from "./lib/api";

const PAGE_IDS: PageId[] = ["home", "learn", "exam", "practical", "practical-exam", "env", "report"];

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
  const autoOfficial = new URLSearchParams(window.location.search).get("paper") === "official";

  const refreshEnv = () => {
    detectEnv()
      .then((t) => setTools(t))
      .catch(() => setTools(null));
  };
  useEffect(() => {
    refreshEnv();
  }, []);

  const missing = tools ? tools.filter((t) => !t.ok && !["python", "pip"].includes(t.name)).length : 0;
  const envState = tools === null ? null : { ok: missing === 0, missing };

  const navigate = (p: PageId) => {
    setPage(p);
  };

  const openPractical = (groupId: string, idx: number) => {
    setPracticalInitial({ groupId, idx });
    setPage("practical-exam");
  };

  return (
    <div className="flex h-full min-h-0">
      <Sidebar page={page} onNavigate={navigate} envOk={tools === null ? null : missing === 0} envText={tools === null ? "正在检测环境…" : missing === 0 ? "环境就绪 · Jupyter 可启动" : `环境待修复 · ${missing} 项依赖`} />
      <main className="flex-1 min-w-0 min-h-0">
        {page === "home" && <Dashboard go={navigate} env={envState} />}
        {page === "learn" && <TheoryLearn go={navigate} />}
        {page === "exam" && <TheoryExam autoOfficial={autoOfficial} />}
        {page === "practical" && <PracticalTrain openQ={openPractical} />}
        {page === "practical-exam" && <PracticalExam initial={practicalInitial} />}
        {page === "env" && <EnvAssistant onEnvChanged={refreshEnv} />}
        {page === "report" && <Report onGo={navigate} />}
      </main>
    </div>
  );
}
