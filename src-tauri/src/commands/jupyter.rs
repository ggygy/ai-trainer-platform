// Jupyter Notebook 进程管理：启动（解析 token URL）/ 停止 / 状态
use serde::Serialize;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

use super::env::python_exe_path;
use super::{no_window, shell_command};

pub struct JupyterState(pub Mutex<Option<Child>>);

impl Default for JupyterState {
    fn default() -> Self {
        JupyterState(Mutex::new(None))
    }
}

#[derive(Serialize, Clone)]
pub struct JupyterInfo {
    pub running: bool,
    pub url: String,
    pub log: Vec<String>,
}

/// Jupyter 启动方式：PATH 上的 jupyter-lab 可执行文件，或 `python -m jupyter lab` 模块方式。
/// mac 命令行工具 Python / Windows pip --user 装的包，其 scripts 目录（~/Library/Python/3.x/bin、
/// %APPDATA%\Python\Python3x\Scripts）都不在 PATH——包明明装了却找不到命令，模块方式兜底。
enum JupyterLaunch {
    Exe(String),
    Module(String), // 可直接 spawn 的 python 绝对路径
}

fn resolve_launch() -> Option<JupyterLaunch> {
    #[cfg(target_os = "macos")]
    let cmd = "command -v jupyter-lab";
    #[cfg(target_os = "windows")]
    let cmd = "where jupyter-lab";
    #[cfg(target_os = "linux")]
    let cmd = "command -v jupyter-lab";
    if let Some(out) = shell_command(cmd).output().ok().filter(|o| o.status.success()) {
        // Windows 的 where 可能返回多行，spawn 只认一个路径
        if let Some(p) = String::from_utf8_lossy(&out.stdout).lines().next().map(str::trim) {
            if !p.is_empty() {
                return Some(JupyterLaunch::Exe(p.to_string()));
            }
        }
    }
    // 模块方式：python 可执行 + `python -m jupyter lab --version` 探活
    let py = python_exe_path()?;
    let mut probe = Command::new(&py);
    probe.args(["-m", "jupyter", "lab", "--version"]);
    no_window(&mut probe);
    let ok = probe
        .output()
        .map(|o| o.status.success() && !o.stdout.is_empty())
        .unwrap_or(false);
    ok.then_some(JupyterLaunch::Module(py))
}

#[tauri::command]
pub fn jupyter_start(dir: String, state: State<'_, JupyterState>, app: AppHandle) -> JupyterInfo {
    let mut guard = state.0.lock().unwrap();
    if let Some(child) = guard.as_mut() {
        if matches!(child.try_wait(), Ok(None)) {
            return JupyterInfo { running: true, url: String::new(), log: vec!["已在运行".into()] };
        }
    }

    let Some(launch) = resolve_launch() else {
        let _ = app.emit(
            "install-log",
            serde_json::json!({ "line": "[错误] 未找到可用的 Jupyter（PATH 与 python -m jupyter 均失败），请到环境助手重新安装 jupyterlab" }),
        );
        return JupyterInfo { running: false, url: String::new(), log: vec!["未找到 jupyter".into()] };
    };

    std::fs::create_dir_all(&dir).ok();
    // 随机空闲端口：上次异常退出留下的僵尸实例会一直占着 8889，固定端口会「启动中」卡死
    let port = std::net::TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(8889);
    // 直接 spawn（不走 cmd /C 拼串），jupyter_stop 才能精确 kill 到这个进程
    let (mut command, desc) = match &launch {
        JupyterLaunch::Exe(jup) => {
            let mut c = Command::new(jup);
            c.args(["--no-browser", &format!("--port={port}"), &format!("--notebook-dir={dir}")]);
            (c, format!("{jup} --port={port} --notebook-dir={dir}"))
        }
        JupyterLaunch::Module(py) => {
            let mut c = Command::new(py);
            c.args(["-m", "jupyter", "lab", "--no-browser", &format!("--port={port}"), &format!("--notebook-dir={dir}")]);
            (c, format!("{py} -m jupyter lab --port={port} --notebook-dir={dir}"))
        }
    };
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    no_window(&mut command);
    let Ok(mut child) = command.spawn() else {
        return JupyterInfo { running: false, url: String::new(), log: vec!["启动失败".into()] };
    };

    // stderr 环形缓冲：启动失败时把最后几行（含 traceback）透给前端，避免「启动中」卡死无信息
    let tail: Arc<std::sync::Mutex<std::collections::VecDeque<String>>> =
        Arc::new(std::sync::Mutex::new(std::collections::VecDeque::with_capacity(8)));
    let ready = Arc::new(std::sync::atomic::AtomicBool::new(false));

    // jupyter 的服务日志（含带 token 的 URL）走 stderr
    let stderr = child.stderr.take().expect("stderr");
    let app2 = app.clone();
    let tail2 = tail.clone();
    let ready2 = ready.clone();
    std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            let _ = app2.emit("jupyter-log", serde_json::json!({ "line": line }));
            {
                let mut t = tail2.lock().unwrap();
                if t.len() == 8 {
                    t.pop_front();
                }
                t.push_back(line.clone());
            }
            if !ready2.load(std::sync::atomic::Ordering::Relaxed) {
                if let Some(url) = line
                    .split_whitespace()
                    .find(|w| w.starts_with("http://") || w.starts_with("https://"))
                {
                    ready2.store(true, std::sync::atomic::Ordering::Relaxed);
                    let _ = app2.emit("jupyter-ready", serde_json::json!({ "url": url }));
                }
            }
        }
    });

    // 就绪看门狗：轮询端口 15s，端口通了但 stderr 的 URL 没抓到就用无 token 地址兜底；
    // 超时未通 → 进程多半已崩（import 错误/启动即退），把 stderr 尾巴发给前端
    let app3 = app.clone();
    let tail3 = tail.clone();
    let ready3 = ready.clone();
    std::thread::spawn(move || {
        for _ in 0..30 {
            std::thread::sleep(std::time::Duration::from_millis(500));
            if std::net::TcpStream::connect(("127.0.0.1", port)).is_ok() {
                if !ready3.swap(true, std::sync::atomic::Ordering::Relaxed) {
                    let _ = app3.emit(
                        "jupyter-ready",
                        serde_json::json!({ "url": format!("http://127.0.0.1:{port}/lab") }),
                    );
                }
                return;
            }
        }
        if !ready3.load(std::sync::atomic::Ordering::Relaxed) {
            let lines: Vec<String> = tail3.lock().unwrap().iter().cloned().collect();
            let _ = app3.emit("jupyter-failed", serde_json::json!({ "lines": lines }));
        }
    });

    *guard = Some(child);
    JupyterInfo { running: true, url: String::new(), log: vec![desc] }
}

#[tauri::command]
pub fn jupyter_stop(state: State<'_, JupyterState>) {
    if let Some(mut child) = state.0.lock().unwrap().take() {
        #[cfg(target_os = "windows")]
        {
            // jupyter 会拉起 kernel 子进程，kill 只杀本体；taskkill /T 连进程树一起清
            let mut tk = Command::new("taskkill");
            tk.args(["/PID", &child.id().to_string(), "/T", "/F"]);
            no_window(&mut tk);
            let _ = tk.output();
        }
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[tauri::command]
pub fn jupyter_status(state: State<'_, JupyterState>) -> JupyterInfo {
    let mut guard = state.0.lock().unwrap();
    let running = match guard.as_mut() {
        Some(child) => matches!(child.try_wait(), Ok(None)),
        None => false,
    };
    if !running {
        *guard = None;
    }
    JupyterInfo { running, url: String::new(), log: vec![] }
}
