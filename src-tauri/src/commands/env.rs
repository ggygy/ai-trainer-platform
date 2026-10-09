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

/// 解析可用的 Python 启动命令，返回 (参数前缀, --version 输出)。
/// Windows 上 `python3` 常是 Microsoft Store 的跳转 stub（未装 Python 时也存在），
/// 故按候选逐个探测 `--version`，只认真实输出；`py` 启动器需要 "-3" 参数。
fn python_prefix() -> Option<(Vec<String>, String)> {
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
    None
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
    let p = py.join(" ");

    result.push(ToolInfo {
        name: "python".into(),
        ok: true,
        version: py_ver.trim_start_matches("Python ").to_string(),
        detail: "系统运行时".into(),
    });

    let pip_ver = sh(&format!("{p} -m pip --version 2>&1")).unwrap_or_default();
    result.push(ToolInfo {
        name: "pip".into(),
        ok: pip_ver.starts_with("pip "),
        version: pip_ver.split_whitespace().nth(1).unwrap_or("").to_string(),
        detail: "包管理器".into(),
    });

    // pip list 一次拿到全部已装包
    let freeze = sh(&format!("{p} -m pip list --format=freeze")).unwrap_or_default();
    let mut installed: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for line in freeze.lines() {
        if let Some((n, v)) = line.split_once("==") {
            installed.insert(norm(n), v.to_string());
        }
    }

    let jl_ver = sh("jupyter lab --version || jupyter-lab --version").unwrap_or_default();
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

        let Some((py, _)) = python_prefix() else {
            emit_line(&app, "[错误] 未找到可用的 Python，请先安装 Python 并勾选加入 PATH".into());
            let _ = app.emit("install-done", serde_json::json!({ "ok": false }));
            return;
        };
        let p = py.join(" ");
        let list = names.join(" ");

        emit_line(&app, format!("$ {p} -m pip install -U {list}"));
        let mut ok = run_pip(&format!("{p} -m pip install --progress-bar off -U {list}"), &app);

        // PEP 668（如 Homebrew Python）外部管理环境：自动降级重试（见 ADR-0008）
        if !ok {
            emit_line(&app, "! 检测到外部管理环境，改用 --break-system-packages 重试".into());
            ok = run_pip(
                &format!("{p} -m pip install --progress-bar off --break-system-packages -U {list}"),
                &app,
            );
        }
        emit_line(&app, if ok { "$ 安装完成 ✓".into() } else { "$ 安装失败，请查看上方日志".into() });
        let _ = app.emit("install-done", serde_json::json!({ "ok": ok }));
    });
}

fn run_pip(cmd: &str, app: &AppHandle) -> bool {
    let mut command = shell_command(cmd);
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    no_window(&mut command);
    let Ok(mut child) = command.spawn() else {
        let _ = app.emit("install-log", serde_json::json!({ "line": "[错误] 无法启动 pip" }));
        return false;
    };

    let stdout = child.stdout.take().expect("stdout");
    let stderr = child.stderr.take().expect("stderr");
    let app2 = app.clone();
    let t1 = std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let _ = app2.emit("install-log", serde_json::json!({ "line": line }));
        }
    });
    let app3 = app.clone();
    let t2 = std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            let _ = app3.emit("install-log", serde_json::json!({ "line": line }));
        }
    });
    t1.join().ok();
    t2.join().ok();
    child.wait().map(|s| s.success()).unwrap_or(false)
}

#[tauri::command]
pub fn open_folder(path: String) {
    #[cfg(target_os = "macos")]
    let _ = Command::new("open").arg(&path).spawn();
    #[cfg(target_os = "windows")]
    let _ = Command::new("explorer").arg(&path).spawn();
    #[cfg(target_os = "linux")]
    let _ = Command::new("xdg-open").arg(&path).spawn();
}
