// 环境检测与依赖安装
use serde::Serialize;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

use super::{no_window, shell_command};

#[derive(Serialize)]
pub struct ToolInfo {
    pub name: String,
    pub ok: bool,
    pub version: String,
    pub detail: String,
}

const TARGETS: &[(&str, &str)] = &[
    ("python", "系统运行时"),
    ("pip", "包管理器"),
    ("jupyterlab", "Notebook 服务"),
    ("pandas", "数据处理"),
    ("numpy", "数值计算"),
    ("scikit-learn", "机器学习建模"),
    ("matplotlib", "统计可视化绘图"),
    ("openpyxl", "Excel 读取（.xlsx 素材）"),
    ("onnxruntime", "ONNX 模型推理"),
    ("Pillow", "图像读取处理"),
    ("opencv-python", "图像处理（cv2）"),
    ("xgboost", "梯度提升模型"),
    ("seaborn", "统计可视化"),
    ("imbalanced-learn", "类别不平衡采样（SMOTE）"),
];

// 归一化 pip 包名（pip list 输出全小写下划线）
fn norm(name: &str) -> String {
    name.to_lowercase().replace(['-', '_', '.'], "")
}

// 执行一行 shell 命令，成功且 stdout 非空时返回 stdout（PATH 由 shell_command 保证）
fn sh(cmd: &str) -> Option<String> {
    let out = shell_command(cmd).output().ok()?;
    if out.status.success() {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !s.is_empty() {
            return Some(s);
        }
    }
    None
}

/// 解析可用的 Python 启动命令，返回 (命令前缀, --version 输出)。
/// Windows 上 `python3` 常是 Microsoft Store 的跳转 stub（未装 Python 时也存在），
/// 故按候选逐个探测 `--version`，只认真实输出；`py` 启动器需要 "-3" 参数。
fn python_prefix() -> Option<(Vec<String>, String)> {
    // ① 应用自管 venv（uv 创建）优先：绝对路径直接探测，绕开 GUI PATH、用户站点目录与系统 Python 版本问题
    if let Some(py) = app_venv_python() {
        let mut c = Command::new(&py);
        c.arg("--version");
        no_window(&mut c);
        if let Ok(out) = c.output() {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if out.status.success() && s.starts_with("Python ") {
                return Some((vec![py], s));
            }
        }
    }

    #[cfg(target_os = "macos")]
    let candidates: &[&[&str]] = &[&["python3"]];
    #[cfg(target_os = "windows")]
    let candidates: &[&[&str]] = &[&["python"], &["py", "-3"]];
    #[cfg(target_os = "linux")]
    let candidates: &[&[&str]] = &[&["python3"]];

    for cand in candidates {
        if let Some(out) = sh(&format!("{} --version 2>&1", cand.join(" "))) {
            if out.starts_with("Python ") {
                return Some((cand.iter().map(|s| s.to_string()).collect(), out));
            }
        }
    }
    // PATH 探测全部失败后，Windows 回落：直接探测常见安装目录里的 python.exe
    // （装 Python 时没勾「Add python.exe to PATH」的用户装了也探测不到，见 issue #1）
    #[cfg(target_os = "windows")]
    if let Some(found) = windows_python_fallback() {
        return Some(found);
    }
    None
}

/// Windows 常见 Python 安装位置回落探测（不走 PATH，直接 spawn python.exe）：
/// 用户级 %LOCALAPPDATA%\Programs\Python\Python3xx、全用户级 Program Files\Python3xx、
/// 旧版默认 C:\Python3xx。
#[cfg(target_os = "windows")]
fn windows_python_fallback() -> Option<(Vec<String>, String)> {
    let mut roots: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(la) = std::env::var("LOCALAPPDATA") {
        roots.push(std::path::PathBuf::from(&la).join("Programs").join("Python"));
    }
    for base in ["C:\\Program Files\\Python", "C:\\Program Files (x86)\\Python", "C:\\Python"] {
        roots.push(std::path::PathBuf::from(base));
    }
    // 3.15 → 3.8 从新到旧逐个试
    for ver in (38..=315).rev() {
        for root in &roots {
            let exe = root.join(format!("Python{ver}")).join("python.exe");
            let mut c = Command::new(&exe);
            c.arg("--version");
            no_window(&mut c);
            let Ok(out) = c.output() else { continue };
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if out.status.success() && s.starts_with("Python ") {
                return Some((vec![exe.to_string_lossy().to_string()], s));
            }
        }
    }
    None
}

/// 供 shell_command 使用的前缀：python 可能是含空格的完整路径（Windows 回落探测），
/// 需要加引号；cmd /C 收到 Rust 再包一层引号后恰好命中其「保留内部引号」的解析分支。
fn shell_prefix(py: &[String]) -> String {
    let head = &py[0];
    if head.contains(' ') {
        format!("\"{head}\"")
    } else {
        head.clone()
    }
}

// ── uv 托管环境（ADR-0014）───────────────────────────────────────────────
// 系统 Python 的坑太多：mac 命令行工具 Python 3.9（pip 21、PEP 668、脚本目录不在 PATH）、
// Windows 未加 PATH / Store stub。应用改为自管：uv（用户级安装）→ uv 装 Python 3.13 →
// 应用专属 venv → 依赖全装 venv 里。检测 / 安装 / Jupyter 一律优先这个环境。

/// 应用专属 venv 位置：固定路径，检测与启动都直接指向它
fn app_venv_dir() -> std::path::PathBuf {
    app_data_root().join("venv")
}

/// 应用数据根目录（ASCII 路径）：%LOCALAPPDATA%\AI Trainer Prep 等，
/// 供 venv 与 jupyter runtime 使用——避开 Windows 中文用户名目录的编码坑
pub(crate) fn app_data_root() -> std::path::PathBuf {
    #[cfg(target_os = "windows")]
    {
        let base = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| std::env::var("USERPROFILE").unwrap_or_default());
        std::path::PathBuf::from(base).join("AI Trainer Prep")
    }
    #[cfg(target_os = "macos")]
    {
        let base = std::env::var("HOME").unwrap_or_else(|_| ".".into());
        std::path::PathBuf::from(base).join("Library/Application Support/AI Trainer Prep")
    }
    #[cfg(target_os = "linux")]
    {
        let base = std::env::var("HOME").unwrap_or_else(|_| ".".into());
        std::path::PathBuf::from(base).join(".local/share/ai-trainer-prep")
    }
}

fn venv_python(dir: &std::path::Path) -> std::path::PathBuf {
    #[cfg(target_os = "windows")]
    {
        dir.join("Scripts").join("python.exe")
    }
    #[cfg(not(target_os = "windows"))]
    {
        dir.join("bin").join("python")
    }
}

/// 应用专属 uv 缓存目录（issue #2）：uv 默认写 ~/.cache/uv，该目录一旦被 sudo 运行的
/// uv 污染成 root 属主，用户级 uv 装包解 wheel 时就报 permission denied (os error 13)。
/// 改在应用数据目录里自管缓存（uv 全系命令都尊重 UV_CACHE_DIR）；连它也建不出来时
/// （极端磁盘/权限状况）回落系统临时目录，保证 uv 永远拿到一个可写的缓存。
fn uv_cache_dir() -> std::path::PathBuf {
    let owned = app_data_root().join("uv-cache");
    if std::fs::create_dir_all(&owned).is_ok() && dir_writable(&owned) {
        return owned;
    }
    let fallback = std::env::temp_dir().join("ai-trainer-uv-cache");
    let _ = std::fs::create_dir_all(&fallback);
    fallback
}

fn dir_writable(dir: &std::path::Path) -> bool {
    let probe = dir.join(".uv-cache-probe");
    let ok = std::fs::File::create(&probe).is_ok();
    if ok {
        let _ = std::fs::remove_file(&probe);
    }
    ok
}

/// 所有 uv 调用统一带应用专属缓存环境变量
fn uv_command(uv: &str) -> Command {
    let mut c = Command::new(uv);
    c.env("UV_CACHE_DIR", uv_cache_dir());
    c
}

/// 应用 venv 的 python（存在才返回），绝对路径可直接 spawn
pub(crate) fn app_venv_python() -> Option<String> {
    let p = venv_python(&app_venv_dir());
    p.is_file().then(|| p.to_string_lossy().to_string())
}

/// 定位 uv：先 PATH，再官方安装脚本的用户级默认位置 ~/.local/bin（GUI 进程 PATH 通常没有它）
fn uv_path() -> Option<String> {
    #[cfg(target_os = "windows")]
    let cmd = "where uv";
    #[cfg(not(target_os = "windows"))]
    let cmd = "command -v uv";
    if let Some(out) = sh(cmd) {
        if let Some(p) = out.lines().next().map(str::trim) {
            if !p.is_empty() {
                return Some(p.to_string());
            }
        }
    }
    #[cfg(target_os = "windows")]
    let cand = std::env::var("USERPROFILE").ok().map(|h| std::path::PathBuf::from(h).join(".local/bin/uv.exe"));
    #[cfg(not(target_os = "windows"))]
    let cand = std::env::var("HOME").ok().map(|h| std::path::PathBuf::from(h).join(".local/bin/uv"));
    let cand = cand?;
    cand.is_file().then(|| cand.to_string_lossy().to_string())
}

/// 确保 uv + 应用 venv 就绪，返回 venv python 绝对路径。
/// uv 缺失时用官方脚本装到用户目录（无需管理员）；失败返回 None 由调用方走平台兜底。
fn ensure_uv_and_venv(app: &AppHandle) -> Option<String> {
    let emit = |line: &str| {
        let _ = app.emit("install-log", serde_json::json!({ "line": line }));
    };
    let uv = match uv_path() {
        Some(u) => u,
        None => {
            emit("未找到 uv，正在安装（Astral 官方脚本，用户级安装，无需管理员）…");
            #[cfg(target_os = "windows")]
            {
                let mut c = Command::new("powershell");
                c.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "irm https://astral.sh/uv/install.ps1 | iex"]);
                run_streamed(c, app);
            }
            #[cfg(not(target_os = "windows"))]
            {
                run_streamed(shell_command("curl -LsSf https://astral.sh/uv/install.sh | sh"), app);
            }
            match uv_path() {
                Some(u) => u,
                None => {
                    emit("[错误] uv 安装未成功（网络或安全软件拦截），将回退系统 pip。也可手动安装 uv 后重试：https://docs.astral.sh/uv/");
                    return None;
                }
            }
        }
    };
    emit(&format!("✓ uv 就绪：{uv}"));

    let venv = app_venv_dir();
    let vpy = venv_python(&venv);
    if !vpy.is_file() {
        emit("正在安装 uv 托管的 Python 3.13（用户级，约 30MB，无需管理员）…");
        let mut c = uv_command(&uv);
        c.args(["python", "install", "3.13"]);
        if !run_streamed(c, app) {
            emit("! Python 3.13 下载未成功（网络原因），仍尝试创建 venv…");
        }
        emit(&format!("正在创建应用专属虚拟环境：{}", venv.display()));
        let mut c = uv_command(&uv);
        c.args(["venv"]).arg(&venv).args(["--python", "3.13"]);
        if !run_streamed(c, app) {
            emit("! venv 创建命令未成功");
        }
    }
    let s = vpy.to_string_lossy().to_string();
    if vpy.is_file() {
        Some(s)
    } else {
        emit("[错误] 应用专属环境创建失败，将回退系统 pip");
        None
    }
}

/// 未找到 Python 时的平台化指引（写入安装日志）
fn python_missing_hint() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "未找到可用的 Python。请到 python.org 下载安装包，安装首页勾选「Add python.exe to PATH」；\
         若已安装请勾选该项重装（或手动把 Python 目录加入 PATH），完成后重启本应用再试。\
         也可以直接在 Microsoft Store 搜索 Python 3 安装。"
    }
    #[cfg(target_os = "macos")]
    {
        "未找到可用的 Python。终端执行 xcode-select --install 可装系统级 python3，\
         或到 python.org 下载安装包，完成后重启本应用再试。"
    }
    #[cfg(target_os = "linux")]
    {
        "未找到可用的 Python。请用系统包管理器安装（如 sudo apt install python3 python3-pip），完成后重启本应用再试。"
    }
}

/// 应用内自动安装所用 Python 版本（bugfix 期版本，带官方二进制安装器；科学计算包 wheel 覆盖最全）
const PY_DL_VERSION: &str = "3.13.7";

/// 一键安装 Python 运行时本身（「环境助手」在未检测到 Python 时展示该入口）：
/// - Windows：优先 winget 静默安装（PrependPath=1），无 winget 或失败则下载 python.org 安装器 /passive 安装；
///   装到 %LOCALAPPDATA%\Programs\Python\Python3xx——windows_python_fallback 无需重启即可探测到；
/// - macOS：下载 python.org 官方 pkg 并打开图形安装器（用户点「继续→安装」输密码，无需终端 sudo）；
///   pkg 会写 /etc/paths.d，新开的 zsh -lc 即可探测到；
/// - Linux：输出发行版包管理器指引。
#[tauri::command]
pub fn install_python(app: AppHandle) {
    std::thread::spawn(move || {
        let emit_line = |line: &str| {
            let _ = app.emit("install-log", serde_json::json!({ "line": line }));
        };
        // ① uv 托管：一条路同时解决 Python 运行时 + venv，绕开系统 Python 的版本/权限/PATH 坑
        if let Some(vpy) = ensure_uv_and_venv(&app) {
            emit_line(&format!("✓ 应用专属 Python 环境就绪：{vpy}"));
            let _ = app.emit("install-done", serde_json::json!({ "ok": true }));
            return;
        }

        if python_prefix().is_some() {
            emit_line("✓ 已检测到可用的 Python，且 uv 不可用无需安装");
            let _ = app.emit("install-done", serde_json::json!({ "ok": true }));
            return;
        }
        emit_line(&format!("$ uv 不可用，按平台尝试安装 Python {PY_DL_VERSION}…"));
        let ok = install_python_impl(&app);
        emit_line(
            if ok {
                "$ Python 安装流程完成 ✓ 请点「重新检测」"
            } else {
                "[错误] Python 自动安装未完成，请按上方日志手动安装后点「重新检测」"
            },
        );
        let _ = app.emit("install-done", serde_json::json!({ "ok": ok }));
    });
}

/// 解析可直接 spawn 的 python 绝对路径（jupyter 模块方式启动用）：
/// PATH 候选经 shell `command -v/where` 解析成绝对路径，Windows 再叠加常见目录回落。
/// GUI 应用拿到绝对路径后可直接 spawn，不必再依赖进程 PATH。
pub(crate) fn python_exe_path() -> Option<String> {
    #[cfg(target_os = "windows")]
    let cands: &[&str] = &["python", "py"];
    #[cfg(not(target_os = "windows"))]
    let cands: &[&str] = &["python3"];
    for c in cands {
        #[cfg(target_os = "windows")]
        let cmd = format!("where {c}");
        #[cfg(not(target_os = "windows"))]
        let cmd = format!("command -v {c}");
        if let Some(out) = sh(&cmd) {
            if let Some(p) = out.lines().next().map(str::trim) {
                if !p.is_empty() {
                    return Some(p.to_string());
                }
            }
        }
    }
    #[cfg(target_os = "windows")]
    if let Some((py, _)) = windows_python_fallback() {
        return Some(py[0].clone());
    }
    None
}

fn install_python_impl(app: &AppHandle) -> bool {
    #[cfg(target_os = "windows")]
    {
        windows_python_install(app)
    }
    #[cfg(target_os = "macos")]
    {
        macos_python_install(app)
    }
    #[cfg(target_os = "linux")]
    {
        let _ = app.emit(
            "install-log",
            serde_json::json!({ "line": "[提示] Linux 请用系统包管理器安装：sudo apt install python3 python3-pip（Debian/Ubuntu）或 sudo dnf install python3（Fedora）" }),
        );
        false
    }
}

/// Windows：winget 静默安装 → 失败回落 python.org 官方安装器直接下载。
/// 全部直接 spawn（不经 cmd /C 拼串）：参数含引号/空格，cmd 引号会被 Rust 转义破坏（见 ADR-0011 修订）。
#[cfg(target_os = "windows")]
fn windows_python_install(app: &AppHandle) -> bool {
    let ver = PY_DL_VERSION;
    if sh("winget --version").is_some() {
        app.emit("install-log", serde_json::json!({ "line": "检测到 winget，正在静默安装（下载约 25MB，请耐心等待）…" })).ok();
        let mut winget = Command::new("winget");
        winget.args([
            "install",
            "--id",
            "Python.Python.313",
            "-e",
            "--silent",
            "--disable-interactivity",
            "--accept-package-agreements",
            "--accept-source-agreements",
            "--override",
            "/quiet InstallAllUsers=0 PrependPath=1 Include_test=0",
        ]);
        if run_streamed(winget, app) {
            app.emit("install-log", serde_json::json!({ "line": "✓ winget 安装完成，Python 位于 %LOCALAPPDATA%\\Programs\\Python" })).ok();
            return true;
        }
        app.emit("install-log", serde_json::json!({ "line": "! winget 安装未成功，改用 python.org 官方安装器" })).ok();
    }
    let arch = if std::env::consts::ARCH == "aarch64" { "arm64" } else { "amd64" };
    let exe_name = format!("python-{ver}-{arch}.exe");
    let url = format!("https://www.python.org/ftp/python/{ver}/{exe_name}");
    let tmp = std::env::temp_dir().join(&exe_name);
    app.emit("install-log", serde_json::json!({ "line": &format!("正在下载官方安装器 {url} …") })).ok();
    let mut curl = Command::new("curl");
    curl.args(["-L", "-f", "-o"]).arg(&tmp).arg(&url);
    if !run_streamed(curl, app) {
        app.emit("install-log", serde_json::json!({ "line": "[错误] 下载失败：请检查网络后重试，或到 python.org 手动下载安装（勾选 Add python.exe to PATH）" })).ok();
        return false;
    }
    app.emit("install-log", serde_json::json!({ "line": &format!("正在安装 {}（/passive 显示进度条，PrependPath=1 自动加入 PATH）…", tmp.display()) })).ok();
    let mut installer = Command::new(&tmp);
    installer.args(["/passive", "InstallAllUsers=0", "PrependPath=1", "Include_test=0"]);
    let ok = run_streamed(installer, app);
    if ok {
        app.emit("install-log", serde_json::json!({ "line": "✓ 安装完成，Python 位于 %LOCALAPPDATA%\\Programs\\Python" })).ok();
    }
    ok
}

/// macOS：下载官方 pkg（universal2）到「下载」文件夹并打开图形安装器
#[cfg(target_os = "macos")]
fn macos_python_install(app: &AppHandle) -> bool {
    let ver = PY_DL_VERSION;
    let pkg = format!("python-{ver}-macos11.pkg");
    let url = format!("https://www.python.org/ftp/python/{ver}/{pkg}");
    app.emit("install-log", serde_json::json!({ "line": &format!("正在下载官方安装包（约 65MB）：{url}") })).ok();
    if !run_streamed(
        shell_command(&format!("curl -L -f -o \"$HOME/Downloads/{pkg}\" \"{url}\"")),
        app,
    ) {
        app.emit("install-log", serde_json::json!({ "line": "[错误] 下载失败：请检查网络后重试；也可手动下载后打开，或用 Homebrew：brew install python@3.13" })).ok();
        return false;
    }
    let home = std::env::var("HOME").unwrap_or_default();
    let _ = std::process::Command::new("open").arg(format!("{home}/Downloads/{pkg}")).spawn();
    app.emit(
        "install-log",
        serde_json::json!({ "line": "✓ 已打开图形安装器：请点「继续 → 安装」并输入开机密码，装完回到本应用点「重新检测」" }),
    )
    .ok();
    true
}

/// 构建「python …」命令：PATH 候选（python / py -3 / python3）走用户 shell（macOS 需 zsh -l 补 PATH）；
/// 全路径回落（Windows 常见目录探测出的 python.exe）直接 spawn，绕开 cmd 引号问题（见 ADR-0011 修订）。
fn py_command(py: &[String], extra: &[&str]) -> Command {
    let head = &py[0];
    if head.contains('\\') || head.contains('/') {
        let mut c = Command::new(head);
        c.args(&py[1..]);
        c.args(extra);
        c
    } else {
        let mut s = shell_prefix(py);
        for e in extra {
            s.push(' ');
            s.push_str(e);
        }
        shell_command(&s)
    }
}

/// py_command 的捕获输出版（detect_env 探测用）
fn sh_py(py: &[String], extra: &[&str]) -> Option<String> {
    let out = py_command(py, extra).output().ok()?;
    if out.status.success() {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !s.is_empty() {
            return Some(s);
        }
    }
    None
}

/// 枚举已装包的脚本：经 stdin 喂给 `python -`。不用 `pip list`——uv 创建的 venv 没有 pip
/// 模块，pip list 必然失败，装好的包会假性「全部未安装」；importlib.metadata 是 stdlib，
/// 任何解释器都有。stdin 方式不经 argv/cmd 拼串，Windows 引号规则完全无关（ADR-0011 修订）。
const LIST_DISTS_SCRIPT: &str = "\
import importlib.metadata as m
for d in m.distributions():
    n = d.metadata.get('Name') or ''
    if n and d.version:
        print(n + '==' + d.version)
";

/// 用指定解释器枚举已装包，输出 freeze 风格行（Name==Version）
fn python_dists(py: &[String]) -> String {
    use std::io::Write;
    let mut c = py_command(py, &["-"]);
    c.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
    no_window(&mut c);
    let Ok(mut child) = c.spawn() else {
        return String::new();
    };
    let Some(mut stdin) = child.stdin.take() else {
        return String::new();
    };
    // 脚本仅百余字节，管道缓冲足以一次写入，写完即关、不存在读写互等死锁
    let fed = stdin.write_all(LIST_DISTS_SCRIPT.as_bytes()).is_ok();
    drop(stdin);
    if !fed {
        let _ = child.kill();
        let _ = child.wait();
        return String::new();
    }
    match child.wait_with_output() {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).trim().to_string(),
        _ => String::new(),
    }
}

#[tauri::command]
pub fn detect_env() -> Vec<ToolInfo> {
    let mut result: Vec<ToolInfo> = Vec::new();

    let Some((py, py_ver)) = python_prefix() else {
        // 连 Python 都没有时其余项无从探测，全部标未安装
        result.push(ToolInfo { name: "python".into(), ok: false, version: String::new(), detail: "系统运行时".into() });
        for (name, detail) in TARGETS.iter().skip(1) {
            result.push(ToolInfo { name: name.to_string(), ok: false, version: String::new(), detail: detail.to_string() });
        }
        return result;
    };

    result.push(ToolInfo {
        name: "python".into(),
        ok: true,
        version: py_ver.trim_start_matches("Python ").to_string(),
        detail: "系统运行时".into(),
    });

    let pip_ver = sh_py(&py, &["-m", "pip", "--version"]).unwrap_or_default();
    // uv venv 不带 pip 模块，但包管理由 uv pip 承担——按「由 uv 提供」标记就绪，避免误报缺失
    let is_venv = app_venv_python().as_deref() == Some(py[0].as_str());
    let pip_ok = pip_ver.starts_with("pip ") || is_venv;
    result.push(ToolInfo {
        name: "pip".into(),
        ok: pip_ok,
        version: if is_venv && !pip_ver.starts_with("pip ") { "uv".into() } else { pip_ver.split_whitespace().nth(1).unwrap_or("").to_string() },
        detail: "包管理器".into(),
    });

    // 已装包枚举走 importlib.metadata（uv venv 无 pip 模块，pip list 会假性全缺）
    let freeze = python_dists(&py);
    let mut installed: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for line in freeze.lines() {
        if let Some((n, v)) = line.split_once("==") {
            installed.insert(norm(n), v.to_string());
        }
    }

    // jupyter 优先用当前解释器模块探测：venv/用户站点装的 jupyter 不一定在 PATH 上
    let mut jl_ver = sh_py(&py, &["-m", "jupyter", "lab", "--version"]).unwrap_or_default();
    if jl_ver.is_empty() {
        jl_ver = sh("jupyter lab --version || jupyter-lab --version").unwrap_or_default();
    }
    let jl_ok = !jl_ver.is_empty();
    result.push(ToolInfo {
        name: "jupyterlab".into(),
        ok: jl_ok,
        version: if jl_ok { jl_ver } else { installed.get("jupyterlab").cloned().unwrap_or_default() },
        detail: "Notebook 服务".into(),
    });

    for (name, detail) in TARGETS.iter().skip(3) {
        let v = installed.get(&norm(name)).cloned().unwrap_or_default();
        result.push(ToolInfo {
            name: name.to_string(),
            ok: !v.is_empty(),
            version: v,
            detail: detail.to_string(),
        });
    }
    result
}

#[tauri::command]
pub fn install_packages(names: Vec<String>, app: AppHandle) {
    if names.is_empty() {
        let _ = app.emit("install-done", serde_json::json!({ "ok": true }));
        return;
    }
    std::thread::spawn(move || {
        let emit_line = |app: &AppHandle, line: String| {
            let _ = app.emit("install-log", serde_json::json!({ "line": line }));
        };

        let list = names.join(" ");

        // ① uv 托管：依赖装进应用专属 venv，不受 PEP 668 / 目录权限 / 用户站点 / PATH 影响（ADR-0014）
        if let Some(vpy) = ensure_uv_and_venv(&app) {
            emit_line(&app, format!("$ uv pip install -U {list}（应用专属环境 {vpy}）"));
            let uv = uv_path().expect("ensure_uv_and_venv 成功则 uv 必在");
            let mut c = uv_command(&uv);
            c.args(["pip", "install", "--python", &vpy, "--upgrade"]);
            c.args(names.iter().map(String::as_str));
            let (ok, err_tail) = run_streamed_capture(c, &app);
            if !ok && err_tail.to_lowercase().contains("permission denied") {
                emit_line(
                    &app,
                    format!(
                        "[提示] 检测到写入被拒（permission denied）：多为历史 sudo 运行残留的 root 属主目录所致。\
                         终端执行 `sudo chown -R $(whoami) \"$HOME/.cache\" \"$HOME/.local\"` 修复属主后重试；\
                         若仍失败，删除应用环境目录 {} 后重新安装（缓存已改为应用专属路径，不再受 ~/.cache 污染影响）",
                        app_venv_dir().display()
                    ),
                );
            }
            emit_line(&app, if ok { "$ 安装完成 ✓".into() } else { "$ 安装失败，请查看上方日志".into() });
            let _ = app.emit("install-done", serde_json::json!({ "ok": ok }));
            return;
        }
        emit_line(&app, "! uv 环境创建失败，回退系统 pip 安装".into());

        let Some((py, _)) = python_prefix() else {
            emit_line(&app, format!("[错误] {}", python_missing_hint()));
            let _ = app.emit("install-done", serde_json::json!({ "ok": false }));
            return;
        };

        emit_line(&app, format!("$ {} -m pip install -U {list}", py.join(" ")));
        let mut extra: Vec<&str> = vec!["-m", "pip", "install", "--progress-bar", "off", "-U"];
        extra.extend(names.iter().map(String::as_str));
        let mut ok = run_streamed(py_command(&py, &extra), &app);

        // PEP 668（如 Homebrew Python）外部管理环境：自动降级重试（见 ADR-0008）
        if !ok {
            emit_line(&app, "! 检测到外部管理环境，改用 --break-system-packages 重试".into());
            let n = extra.iter().position(|&a| a == "-U").unwrap_or(extra.len());
            extra.insert(n, "--break-system-packages");
            ok = run_streamed(py_command(&py, &extra), &app);
        }
        emit_line(&app, if ok { "$ 安装完成 ✓".into() } else { "$ 安装失败，请查看上方日志".into() });
        let _ = app.emit("install-done", serde_json::json!({ "ok": ok }));
    });
}

/// 流式执行一条命令：stdout/stderr 逐行 emit 到 install-log，返回是否成功退出。
/// 调用方自行构建 Command——Windows 上含参数/引号的命令必须直接 spawn，
/// 走 cmd /C 拼串时内层引号会被 Rust 的 `\"` 转义破坏（见 ADR-0011 修订）。
fn run_streamed(command: Command, app: &AppHandle) -> bool {
    run_streamed_capture(command, app).0
}

/// run_streamed 的收集版：附带清洗后的 stderr 尾部（最后 30 行），供失败归因
/// （如按内容识别 permission denied 给针对性提示）。
fn run_streamed_capture(mut command: Command, app: &AppHandle) -> (bool, String) {
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    no_window(&mut command);
    let Ok(mut child) = command.spawn() else {
        let _ = app.emit("install-log", serde_json::json!({ "line": "[错误] 无法启动命令" }));
        return (false, String::new());
    };

    let stdout = child.stdout.take().expect("stdout");
    let stderr = child.stderr.take().expect("stderr");
    let app2 = app.clone();
    let t1 = std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let line = super::clean_progress_line(&line);
            if line.is_empty() {
                continue;
            }
            let _ = app2.emit("install-log", serde_json::json!({ "line": line }));
        }
    });
    let app3 = app.clone();
    let t2 = std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        use std::collections::VecDeque;
        let mut tail: VecDeque<String> = VecDeque::with_capacity(30);
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            let line = super::clean_progress_line(&line);
            if line.is_empty() {
                continue;
            }
            if tail.len() == 30 {
                tail.pop_front();
            }
            tail.push_back(line.clone());
            let _ = app3.emit("install-log", serde_json::json!({ "line": line }));
        }
        tail.into_iter().collect::<Vec<_>>().join("\n")
    });
    t1.join().ok();
    let err_tail = t2.join().unwrap_or_default();
    (child.wait().map(|s| s.success()).unwrap_or(false), err_tail)
}

#[tauri::command]
pub fn open_folder(path: String) {
    // 路径必须真实存在且用平台原生分隔符：explorer 对正斜杠路径经常不认、
    // 静默回落打开「文档」目录（用户实测）。不存在时逐级上溯到最近的祖先。
    let mut root = std::path::PathBuf::from(&path);
    while !root.is_dir() {
        match root.parent() {
            Some(p) if !p.as_os_str().is_empty() => root = p.to_path_buf(),
            _ => break,
        }
    }
    if !root.is_dir() {
        return;
    }
    #[cfg(target_os = "windows")]
    let native = root.to_string_lossy().replace('/', "\\");
    #[cfg(not(target_os = "windows"))]
    let native = root.to_string_lossy().to_string();
    #[cfg(target_os = "macos")]
    let _ = Command::new("open").arg(&native).spawn();
    #[cfg(target_os = "windows")]
    let _ = Command::new("explorer").arg(&native).spawn();
    #[cfg(target_os = "linux")]
    let _ = Command::new("xdg-open").arg(&native).spawn();
}

/// 目录内的条目数（非目录/不存在返回 0）：素材文件夹解析用「存在且有内容」判定，
/// 避免选中旧版误建的空壳文件夹后 Jupyter 里什么都看不到
#[tauri::command]
pub fn dir_entry_count(path: String) -> u32 {
    std::fs::read_dir(std::path::Path::new(&path))
        .map(|it| it.filter_map(|e| e.ok()).count() as u32)
        .unwrap_or(0)
}

/// 目录是否存在（前端判断素材文件夹布局用：题号平铺 / 题组组合文件夹 / 都没有则落根目录）
#[tauri::command]
pub fn path_is_dir(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
}
