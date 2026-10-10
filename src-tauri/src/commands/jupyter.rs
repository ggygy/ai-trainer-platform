// Jupyter Notebook 进程管理：启动（解析 token URL）/ 停止 / 状态
use serde::Serialize;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

use super::env::python_exe_path;
use super::{no_window, shell_command};

pub struct JupyterState {
    child: Mutex<Option<Child>>,
    /// 就绪地址（带 token）：stderr 捕获或看门狗兜底，status/已运行查询带回给前端。
    /// 此前 status 永远返回空 url——页面切换重挂载后绿点还在、iframe 却永远停在
    /// 「未启动」占位符（用户看到的「无法交互」即此）。
    ready_url: Arc<Mutex<String>>,
}

impl Default for JupyterState {
    fn default() -> Self {
        JupyterState { child: Mutex::new(None), ready_url: Arc::new(Mutex::new(String::new())) }
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
struct JupyterLaunch {
    /// 真正 spawn 的程序：jupyter-lab 可执行文件，或 python 绝对路径（module=true）
    program: String,
    module: bool,
    /// jupyter lab 主版本（探测失败为 0）：>=4 时走自设 token（jupyter_server 2.x）
    lab_major: u32,
}

/// 探测版本输出（"4.6.4"）的主版本号，失败返回 0
fn probe_lab_major(mut c: Command) -> u32 {
    no_window(&mut c);
    c.output()
        .ok()
        .and_then(|o| {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if !o.status.success() || s.is_empty() {
                return None;
            }
            s.split('.').next()?.parse().ok()
        })
        .unwrap_or(0)
}

fn resolve_launch() -> Option<JupyterLaunch> {
    // ① 应用自管 venv（uv）里的 jupyter 最可靠：版本对、权限对、不依赖 PATH
    if let Some(py) = super::env::app_venv_python() {
        let mut probe = Command::new(&py);
        probe.args(["-m", "jupyter", "lab", "--version"]);
        let major = probe_lab_major(probe);
        if major > 0 {
            return Some(JupyterLaunch { program: py, module: true, lab_major: major });
        }
    }
    // ② PATH 上的 jupyter-lab
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
                let mut probe = Command::new(p);
                probe.arg("--version");
                let major = probe_lab_major(probe);
                return Some(JupyterLaunch { program: p.to_string(), module: false, lab_major: major });
            }
        }
    }
    // ③ 系统解释器模块方式：包可能装在用户目录（mac CLT ~/Library/Python/3.x/bin、
    // Windows %APPDATA%\Python\Python3x\Scripts 都不在 PATH）
    let py = python_exe_path()?;
    let mut probe = Command::new(&py);
    probe.args(["-m", "jupyter", "lab", "--version"]);
    let major = probe_lab_major(probe);
    if major > 0 {
        Some(JupyterLaunch { program: py, module: true, lab_major: major })
    } else {
        None
    }
}

/// 允许被 Tauri WebView（异源）内嵌所需的两类参数：
/// ① CSP frame-ancestors：jupyter 4.x 默认 'self'，iframe 会被浏览器静默拦截；
/// ② SameSite=None(+Secure)：跨站 iframe 里 Lax cookie 一律不收不发——实测 Chromium 下
///    连 `?token=` 自动登录都会被拦（会话 cookie 种不上，永远弹登录墙）。
/// 注意值必须是 **Python 字面量**（True 大写）：traitlets 用 literal_eval 解析 dict 参数，
/// JSON 的 `true` 会报 "expected a dict, not the list"。
fn embed_args(lab_major: u32) -> Vec<String> {
    let settings = if lab_major >= 4 {
        "{'headers':{'Content-Security-Policy':'frame-ancestors *'},'cookie_options':{'samesite':'None','secure':True},'xsrf_cookie_kwargs':{'samesite':'None','secure':True}}"
    } else {
        "{'headers':{'Content-Security-Policy':'frame-ancestors *'}}"
    };
    vec![format!("--ServerApp.tornado_settings={settings}")]
}

/// 无外部依赖的随机 token（RandomState 每实例由系统熵播种）
fn random_token() -> String {
    use std::hash::{BuildHasher, Hasher};
    let a = std::collections::hash_map::RandomState::new().build_hasher().finish();
    let b = std::collections::hash_map::RandomState::new().build_hasher().finish();
    format!("{a:016x}{b:016x}")
}

#[tauri::command]
pub fn jupyter_start(dir: String, state: State<'_, JupyterState>, app: AppHandle) -> JupyterInfo {
    let already_running = {
        let mut guard = state.child.lock().unwrap();
        let running = match guard.as_mut() {
            Some(child) => matches!(child.try_wait(), Ok(None)),
            None => false,
        };
        if !running {
            *guard = None;
        }
        running
    };
    if already_running {
        let url = state.ready_url.lock().unwrap().clone();
        return JupyterInfo { running: true, url, log: vec!["已在运行".into()] };
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
    // jupyter_server 2.x（jupyterlab 4+）用自设 token：不依赖 stderr 抓包，地址完全确定；
    // 旧版 jupyter 无此参数（未知参数会启动即退），走 stderr 抓带 token 的 URL
    let token = random_token();
    let known_url = (launch.lab_major >= 4)
        .then(|| format!("http://127.0.0.1:{port}/lab?token={token}"));
    let mut args: Vec<String> = vec!["--no-browser".into()];
    args.extend(embed_args(launch.lab_major));
    if launch.lab_major >= 4 {
        args.push(format!("--IdentityProvider.token={token}"));
    }
    args.push(format!("--port={port}"));
    args.push(format!("--notebook-dir={dir}"));
    // 直接 spawn（不走 cmd /C 拼串），jupyter_stop 才能精确 kill 到这个进程
    let (mut command, desc) = if launch.module {
        let mut c = Command::new(&launch.program);
        c.arg("-m").args(["jupyter", "lab"]).args(&args);
        (c, format!("{} -m jupyter lab --port={port} --notebook-dir={dir}", launch.program))
    } else {
        let mut c = Command::new(&launch.program);
        c.args(&args);
        (c, format!("{} --port={port} --notebook-dir={dir}", launch.program))
    };
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    no_window(&mut command);
    let Ok(mut child) = command.spawn() else {
        return JupyterInfo { running: false, url: String::new(), log: vec!["启动失败".into()] };
    };
    *state.ready_url.lock().unwrap() = String::new();

    // stderr 环形缓冲：启动失败时把最后几行（含 traceback）透给前端，避免「启动中」卡死无信息
    let tail: Arc<std::sync::Mutex<std::collections::VecDeque<String>>> =
        Arc::new(std::sync::Mutex::new(std::collections::VecDeque::with_capacity(8)));
    let ready = Arc::new(std::sync::atomic::AtomicBool::new(false));

    // jupyter 的服务日志（含带 token 的 URL）走 stderr
    let stderr = child.stderr.take().expect("stderr");
    let app2 = app.clone();
    let tail2 = tail.clone();
    let ready2 = ready.clone();
    let url2 = state.ready_url.clone();
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
                    *url2.lock().unwrap() = url.to_string();
                    let _ = app2.emit("jupyter-ready", serde_json::json!({ "url": url }));
                }
            }
        }
    });

    // 就绪看门狗：轮询端口最多 20s（冷启动慢的机器也够）。
    // 端口通了 → 自设 token 的直接发确定地址；旧版 jupyter 再给 stderr 4s 抓带 token 的
    // URL，超时才用无 token 地址兜底（会停在登录页，但至少可手动粘 token）；
    // 端口一直不通 → 进程多半已崩（import 错误/启动即退），把 stderr 尾巴发给前端
    let app3 = app.clone();
    let tail3 = tail.clone();
    let ready3 = ready.clone();
    let url3 = state.ready_url.clone();
    std::thread::spawn(move || {
        let mut up = false;
        for _ in 0..40 {
            std::thread::sleep(std::time::Duration::from_millis(500));
            if std::net::TcpStream::connect(("127.0.0.1", port)).is_ok() {
                up = true;
                break;
            }
        }
        if !up {
            if !ready3.load(std::sync::atomic::Ordering::Relaxed) {
                let lines: Vec<String> = tail3.lock().unwrap().iter().cloned().collect();
                let _ = app3.emit("jupyter-failed", serde_json::json!({ "lines": lines }));
            }
            return;
        }
        if let Some(u) = known_url {
            if !ready3.swap(true, std::sync::atomic::Ordering::Relaxed) {
                *url3.lock().unwrap() = u.clone();
                let _ = app3.emit("jupyter-ready", serde_json::json!({ "url": u }));
            }
            return;
        }
        for _ in 0..20 {
            if ready3.load(std::sync::atomic::Ordering::Relaxed) {
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(200));
        }
        if !ready3.swap(true, std::sync::atomic::Ordering::Relaxed) {
            let fallback = format!("http://127.0.0.1:{port}/lab");
            *url3.lock().unwrap() = fallback.clone();
            let _ = app3.emit("jupyter-ready", serde_json::json!({ "url": fallback }));
        }
    });

    {
        let mut guard = state.child.lock().unwrap();
        *guard = Some(child);
    }
    JupyterInfo { running: true, url: String::new(), log: vec![desc] }
}

#[tauri::command]
pub fn jupyter_stop(state: State<'_, JupyterState>) {
    shutdown(state.inner());
}

/// 杀掉运行中的 jupyter（Windows 连内核子进程树一起清）并清空就绪地址。
/// 应用退出时也调用：不留占端口的僵尸实例。
pub fn shutdown(state: &JupyterState) {
    if let Some(mut child) = state.child.lock().unwrap().take() {
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
    state.ready_url.lock().unwrap().clear();
}

#[tauri::command]
pub fn jupyter_status(state: State<'_, JupyterState>) -> JupyterInfo {
    let running = {
        let mut guard = state.child.lock().unwrap();
        let running = match guard.as_mut() {
            Some(child) => matches!(child.try_wait(), Ok(None)),
            None => false,
        };
        if !running {
            *guard = None;
        }
        running
    };
    let mut url = state.ready_url.lock().unwrap();
    if !running {
        url.clear();
    }
    JupyterInfo { running, url: url.clone(), log: vec![] }
}
