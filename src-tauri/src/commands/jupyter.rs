// Jupyter Notebook 进程管理：启动（解析 token URL）/ 停止 / 状态
use serde::Serialize;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

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

fn find_jupyter() -> Option<String> {
    // 只认 jupyter-lab 可执行文件（`jupyter` 元启动器需要额外 "lab" 子命令，spawn 参数不同）
    #[cfg(target_os = "macos")]
    let cmd = "command -v jupyter-lab";
    #[cfg(target_os = "windows")]
    let cmd = "where jupyter-lab";
    #[cfg(target_os = "linux")]
    let cmd = "command -v jupyter-lab";
    let out = shell_command(cmd).output().ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() { None } else { Some(s) }
}

#[tauri::command]
pub fn jupyter_start(dir: String, state: State<'_, JupyterState>, app: AppHandle) -> JupyterInfo {
    let mut guard = state.0.lock().unwrap();
    if let Some(child) = guard.as_mut() {
        if matches!(child.try_wait(), Ok(None)) {
            return JupyterInfo { running: true, url: String::new(), log: vec!["已在运行".into()] };
        }
    }

    let Some(jup) = find_jupyter() else {
        let _ = app.emit("install-log", serde_json::json!({ "line": "[错误] 未找到 jupyter-lab，请先在环境助手安装 jupyterlab" }));
        return JupyterInfo { running: false, url: String::new(), log: vec!["未找到 jupyter-lab".into()] };
    };

    std::fs::create_dir_all(&dir).ok();
    let mut command = Command::new(&jup);
    command
        .args(["--no-browser", "--port=8889", &format!("--notebook-dir={dir}")])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    no_window(&mut command);
    let Ok(mut child) = command.spawn() else {
        return JupyterInfo { running: false, url: String::new(), log: vec!["启动失败".into()] };
    };

    // jupyter 的服务日志（含带 token 的 URL）走 stderr
    let stderr = child.stderr.take().expect("stderr");
    let app2 = app.clone();
    std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            let _ = app2.emit("jupyter-log", serde_json::json!({ "line": line }));
            if line.contains("http://127.0.0.1:8889") || line.contains("http://localhost:8889") {
                if let Some(url) = line.split_whitespace().find(|w| w.starts_with("http")) {
                    let _ = app2.emit("jupyter-ready", serde_json::json!({ "url": url }));
                }
            }
        }
    });

    *guard = Some(child);
    JupyterInfo { running: true, url: String::new(), log: vec![format!("{} --notebook-dir={}", jup, dir)] }
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
