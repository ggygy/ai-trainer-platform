// 实操素材包：百度网盘分发 zip，应用内一键导入（选文件 → 校验 → 解压 → 换入）
// 素材不进安装包不进 git（约 220MB，40 题），安装包保持小巧；素材更新独立于应用发版
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

use super::env::app_data_root;

#[derive(Serialize)]
pub struct ImportOutcome {
    pub ok: bool,
    pub dir: String,
    pub questions: u32,
    pub message: String,
}

/// 应用素材目录（导入后的落点，ASCII 路径）
pub fn materials_dir() -> PathBuf {
    app_data_root().join("materials")
}

#[tauri::command]
pub fn material_dir() -> String {
    materials_dir().to_string_lossy().to_string()
}

/// 目录内匹配 `N.N.N` 题号形式的子文件夹数（导入校验用，应为 40）
fn question_dir_count(dir: &Path) -> u32 {
    std::fs::read_dir(dir)
        .map(|it| {
            it.filter_map(|e| e.ok())
                .filter(|e| {
                    e.path().is_dir()
                        && e.file_name()
                            .to_str()
                            .is_some_and(|n| is_question_dir(n))
                })
                .count() as u32
        })
        .unwrap_or(0)
}

fn is_question_dir(name: &str) -> bool {
    let parts: Vec<&str> = name.split('.').collect();
    parts.len() == 3 && parts.iter().all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()))
}

/// zip 内路径安全检查：拒绝绝对路径与 `..` 上跳（zip-slip）
fn safe_entry_rel(name: &str) -> Option<String> {
    let name = name.replace('\\', "/");
    if name.starts_with('/') || name.contains("..") || Path::new(&name).is_absolute() {
        return None;
    }
    Some(name)
}

/// 找出所有条目的公共单层父目录（有则剥离；无则返回 None）
fn common_root(names: &[String]) -> Option<String> {
    let first = names.first()?.split('/').next()?.to_string();
    if first.is_empty() {
        return None;
    }
    names
        .iter()
        .all(|n| n.split('/').next() == Some(first.as_str()))
        .then_some(first)
}

/// 把 zip 解压到 `to`（需为空或不存在）。返回剥离父目录后的条目数。
fn extract_zip(zip_path: &Path, to: &Path) -> Result<usize, String> {
    let file = std::fs::File::open(zip_path).map_err(|e| format!("无法打开 zip：{e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("zip 格式无效：{e}"))?;

    // 先收集安全条目名，判定是否需要剥离公共父目录
    let mut names: Vec<String> = Vec::with_capacity(archive.len());
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|e| format!("zip 读取失败：{e}"))?;
        let rel = safe_entry_rel(entry.name()).ok_or("zip 内含不安全的路径（绝对路径或 ..）")?;
        if !rel.is_empty() {
            names.push(rel);
        }
    }
    if names.is_empty() {
        return Err("zip 是空的".into());
    }
    let strip = common_root(&names);
    let mut extracted = 0usize;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("zip 读取失败：{e}"))?;
        let rel = match safe_entry_rel(entry.name()) {
            Some(r) if !r.is_empty() => r,
            _ => continue,
        };
        let rel = match &strip {
            // 剥离父目录后可能剩下空串（父目录条目本身），跳过
            Some(root) => match rel.strip_prefix(&format!("{root}/")) {
                Some(r) if !r.is_empty() => r.to_string(),
                _ => continue,
            },
            None => rel,
        };
        let out = to.join(&rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&out).map_err(|e| format!("创建目录失败 {rel}：{e}"))?;
        } else {
            if let Some(p) = out.parent() {
                std::fs::create_dir_all(p).map_err(|e| format!("创建目录失败 {rel}：{e}"))?;
            }
            std::io::copy(&mut entry, &mut std::fs::File::create(&out).map_err(|e| format!("写入失败 {rel}：{e}"))?)
                .map_err(|e| format!("解压失败 {rel}：{e}"))?;
        }
        extracted += 1;
    }
    Ok(extracted)
}

/// 导入的同步主体：解压到临时目录 → 校验 → 原子换入 → 写标记
fn import_materials_impl(zip_path: &Path, app: &AppHandle) -> ImportOutcome {
    let target = materials_dir();
    let fail = |msg: String| ImportOutcome {
        ok: false,
        dir: target.to_string_lossy().to_string(),
        questions: 0,
        message: msg,
    };
    if !zip_path.is_file() {
        return fail("选择的文件不存在".into());
    }
    let tmp = app_data_root().join("materials.tmp");
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp).ok();

    if let Err(e) = extract_zip(zip_path, &tmp) {
        let _ = std::fs::remove_dir_all(&tmp);
        return fail(e);
    }
    let questions = question_dir_count(&tmp);
    if questions < 30 {
        let _ = std::fs::remove_dir_all(&tmp);
        return fail(format!(
            "校验失败：只识别到 {questions} 个题号文件夹（应为 40）。请确认选择的是完整的素材包 zip；\
             注意不要用 Windows 资源管理器重新压缩（中文文件名会变成 GBK 无法识别）"
        ));
    }

    // 换入：旧目录改名让位（Windows 下被 Jupyter 占用时改名也会失败 → 提示先停止）
    let existed = target.is_dir();
    if existed {
        let bak = app_data_root().join("materials.old");
        let _ = std::fs::remove_dir_all(&bak);
        if let Err(e) = std::fs::rename(&target, &bak) {
            let _ = std::fs::remove_dir_all(&tmp);
            return fail(format!(
                "素材目录被占用（{e}）。请先在应用里「停止 Jupyter」并关闭正在编辑的 Notebook，再重新导入"
            ));
        }
        if let Err(e) = std::fs::rename(&tmp, &target) {
            let _ = std::fs::rename(&bak, &target); // 回滚，尽量不丢旧素材
            return fail(format!("换入失败：{e}"));
        }
        let _ = std::fs::remove_dir_all(&bak);
    } else if let Err(e) = std::fs::rename(&tmp, &target) {
        return fail(format!("换入失败：{e}"));
    }
    let _ = std::fs::write(
        target.join(".imported"),
        format!("{}\n{}\n", chrono_today(), env!("CARGO_PKG_VERSION")),
    );

    let _ = app.emit(
        "install-log",
        serde_json::json!({ "line": format!("✓ 素材包导入完成：{questions} 题 → {}", target.display()) }),
    );
    ImportOutcome {
        ok: true,
        dir: target.to_string_lossy().to_string(),
        questions,
        message: format!("导入成功：{questions} 题素材已就绪"),
    }
}

fn chrono_today() -> String {
    // 不引 chrono：用标准库算个可读日期就够标记用
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = secs / 86400;
    let (y, m, d) = civil_from_days(days as i64);
    format!("{y:04}-{m:02}-{d:02}")
}

/// 天数 → (年, 月, 日)，Howard Hinnant 算法
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// 选中的素材包 zip → 校验 → 解压到应用素材目录（耗时约 5-15s，放阻塞线程池避免卡 UI）
#[tauri::command]
pub async fn import_materials(zip_path: String, app: AppHandle) -> ImportOutcome {
    tauri::async_runtime::spawn_blocking(move || import_materials_impl(Path::new(&zip_path), &app))
        .await
        .unwrap_or_else(|e| ImportOutcome {
            ok: false,
            dir: materials_dir().to_string_lossy().to_string(),
            questions: 0,
            message: format!("导入任务失败：{e}"),
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// 构造合成 zip：entries 为 (压缩包内路径, 内容)
    fn make_zip(path: &Path, entries: &[(&str, &[u8])]) {
        let file = std::fs::File::create(path).unwrap();
        let mut z = zip::ZipWriter::new(file);
        let opts: zip::write::SimpleFileOptions = Default::default();
        for (name, data) in entries {
            z.start_file(*name, opts).unwrap();
            z.write_all(data).unwrap();
        }
        z.finish().unwrap();
    }

    #[test]
    fn strips_parent_and_validates() {
        let dir = std::env::temp_dir().join(format!("atp-mat-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let zip = dir.join("m.zip");
        make_zip(
            &zip,
            &[
                ("人工智能训练师三级上网素材/1.1.1/1.1.1.ipynb", b"{}"),
                ("人工智能训练师三级上网素材/1.1.1/patient_data.csv", b"a,b"),
                ("人工智能训练师三级上网素材/4.2.5/4.2.5.ipynb", b"{}"),
            ],
        );
        // 拷到 tmp 下解压并校验（绕开 import_materials_impl 的 app 依赖，测纯函数）
        let out = dir.join("out");
        std::fs::create_dir_all(&out).unwrap();
        extract_zip(&zip, &out).unwrap();
        assert!(out.join("1.1.1/1.1.1.ipynb").is_file(), "父目录应被剥离");
        assert!(out.join("4.2.5/4.2.5.ipynb").is_file());
        assert_eq!(question_dir_count(&out), 2);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_zip_slip() {
        let dir = std::env::temp_dir().join(format!("atp-mat-slip-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let zip = dir.join("evil.zip");
        make_zip(
            &zip,
            &[("../evil.txt", b"x"), ("1.1.1/a.ipynb", b"{}")],
        );
        let out = dir.join("out");
        std::fs::create_dir_all(&out).unwrap();
        assert!(extract_zip(&zip, &out).is_err(), "含 .. 条目应被拒绝");
        assert!(!dir.join("evil.txt").exists(), "不应写出目标目录之外的文件");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn question_dir_detection() {
        assert!(is_question_dir("1.1.1"));
        assert!(is_question_dir("4.2.5"));
        assert!(!is_question_dir("1.1"));
        assert!(!is_question_dir("1.1.x"));
        assert!(!is_question_dir("assets"));
    }
}
