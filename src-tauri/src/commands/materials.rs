// 实操素材包：百度网盘分发 zip，应用内一键导入（选文件 → 校验 → 解压 → 自动定位素材根 → 换入）
// 素材不进安装包不进 git（约 220MB，40 题），安装包保持小巧；素材更新独立于应用发版
// 布局兼容：40 题号平铺（标准）/ 嵌套中文父目录 / 三四级混排（自动定位素材根）；GBK 文件名解码；
// 官方「组合文件夹」布局（…素材/）无法导入，拒绝并给指认目录/完整包指引（issue #4）
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

use super::env::app_data_root;

/// 导入校验阈值：完整包 40 个题号文件夹，少于 30 视为不完整或非目标布局
const MIN_QUESTIONS: u32 = 30;
/// 布局扫描的最大下钻深度（官方包可能套中文父目录/网盘批量下载再包一层）
const MAX_SCAN_DEPTH: u32 = 4;

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

fn is_question_dir(name: &str) -> bool {
    let parts: Vec<&str> = name.split('.').collect();
    parts.len() == 3 && parts.iter().all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()))
}

/// 官方组合文件夹名，如「1.1.1-1.1.5~1.2.1-1.2.5素材」「2.1.1-2.1.5素材」：
/// 含「素材」且名字里出现 N.N.N 数字段
fn is_combined_material_dir(name: &str) -> bool {
    name.contains("素材")
        && name
            .split(|c: char| !(c.is_ascii_digit() || c == '.'))
            .any(is_question_dir)
}

fn subdirs_named(dir: &Path, pred: fn(&str) -> bool) -> u32 {
    std::fs::read_dir(dir)
        .map(|it| {
            it.filter_map(|e| e.ok())
                .filter(|e| e.path().is_dir() && e.file_name().to_str().is_some_and(pred))
                .count() as u32
        })
        .unwrap_or(0)
}

/// 目录内匹配 `N.N.N` 题号形式的子文件夹数（导入校验用，应为 40）
fn question_dir_count(dir: &Path) -> u32 {
    subdirs_named(dir, is_question_dir)
}

/// 目录内「…素材」组合文件夹数（官方原始布局检测用）
fn combined_dir_count(dir: &Path) -> u32 {
    subdirs_named(dir, is_combined_material_dir)
}

/// 目录树的布局扫描结果：某目录的直接题号/组合子文件夹数
struct LayoutScan {
    path: PathBuf,
    questions: u32,
    combined: u32,
    depth: u32,
}

/// 收集目录树里每层的题号/组合文件夹分布（素材根候选）。
/// 不下钻进题号文件夹、隐藏目录与 __MACOSX——素材根不会藏在这些里面。
fn scan_layout(dir: &Path, depth: u32, max_depth: u32, out: &mut Vec<LayoutScan>) {
    let questions = question_dir_count(dir);
    out.push(LayoutScan {
        path: dir.to_path_buf(),
        questions,
        // 已是合格素材根的目录无需再看组合布局
        combined: if questions >= MIN_QUESTIONS { 0 } else { combined_dir_count(dir) },
        depth,
    });
    if depth >= max_depth {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let p = e.path();
        if !p.is_dir() {
            continue;
        }
        let name = e.file_name().to_string_lossy().into_owned();
        if is_question_dir(&name) || name.starts_with('.') || name == "__MACOSX" {
            continue;
        }
        scan_layout(&p, depth + 1, max_depth, out);
    }
}

/// 选素材根：题号文件夹最多者优先；平手时路径含「三级」优先（三四级混排包），再浅者优先
fn pick_question_root(scans: &[LayoutScan]) -> Option<&LayoutScan> {
    scans
        .iter()
        .filter(|s| s.questions >= MIN_QUESTIONS)
        .max_by(|a, b| {
            let a_l3 = a.path.to_string_lossy().contains("三级");
            let b_l3 = b.path.to_string_lossy().contains("三级");
            a.questions
                .cmp(&b.questions)
                .then(a_l3.cmp(&b_l3))
                .then(b.depth.cmp(&a.depth))
                .then(a.path.cmp(&b.path))
        })
}

/// zip 条目名解码：合法 UTF-8 直接用（标准工具会设 EFS 位）；否则按 GBK 解码
/// （Windows 打包默认 CP936，不处理则中文目录名变乱码、无法导航定位——issue #4）
fn decode_entry_name(raw: &[u8]) -> String {
    let mut raw = raw;
    while raw.last() == Some(&0) {
        raw = &raw[..raw.len() - 1]; // 个别打包器用 \0 填充文件名
    }
    if let Ok(s) = std::str::from_utf8(raw) {
        return s.to_string();
    }
    let (decoded, _, had_errors) = encoding_rs::GBK.decode(raw);
    if had_errors {
        String::from_utf8_lossy(raw).into_owned()
    } else {
        decoded.into_owned()
    }
}

/// 跳过 macOS zip 元数据（__MACOSX/、.DS_Store、AppleDouble ._foo），不落入素材目录
fn skip_junk(rel: &str) -> bool {
    rel.split('/').next() == Some("__MACOSX")
        || rel == ".DS_Store"
        || rel.rsplit('/').next().is_some_and(|f| f.starts_with("._"))
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
        let name = decode_entry_name(entry.name_raw());
        if skip_junk(&name) {
            continue;
        }
        let rel = safe_entry_rel(&name).ok_or("zip 内含不安全的路径（绝对路径或 ..）")?;
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
        let name = decode_entry_name(entry.name_raw());
        if skip_junk(&name) {
            continue;
        }
        let rel = match safe_entry_rel(&name) {
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

/// 校验失败的报错文案：组合文件夹布局给针对性指引，其余列出解压现场便于自诊断
fn layout_reject_message(tmp: &Path, scans: &[LayoutScan]) -> String {
    let best_q = scans.iter().map(|s| s.questions).max().unwrap_or(0);
    // 官方组合文件夹布局：任何一层出现 ≥3 个「…素材」文件夹
    let combined = scans.iter().max_by_key(|s| s.combined).filter(|s| s.combined >= 3);
    if let Some(c) = combined {
        let example = std::fs::read_dir(&c.path)
            .ok()
            .and_then(|it| {
                it.flatten()
                    .map(|e| e.file_name().to_string_lossy().into_owned())
                    .find(|n| is_combined_material_dir(n))
            })
            .unwrap_or_else(|| "1.1.1-1.1.5~1.2.1-1.2.5素材".into());
        return format!(
            "校验失败：识别到「组合文件夹」布局（{} 个「…素材」文件夹，如「{example}」），\
             不是导入所需的 40 题号平铺布局（题号文件夹仅 {best_q} 个）。\n\
             官方百度网盘原始素材包（三级+四级）就是这种布局，无法直接导入。两个办法：\n\
             ① 已解压到本机：在「实操训练」页的「素材与环境」卡点「更换素材总目录」，\
             直接指认解压后的文件夹即可使用（含参考代码，部分题缺数据文件）；\n\
             ② 需要含全部 40 题数据文件的完整包：用应用配套的「素材包-完整版.zip」\
             （报考指南 → 资源获取与导入有说明）。",
            c.combined
        );
    }
    format!(
        "校验失败：解压内容里最多只有 {best_q} 个题号文件夹（完整素材包应为 40）。\n\
         解压根目录内容：{}。请确认选择的是完整的素材包 zip。",
        describe_entries(tmp, 6)
    )
}

/// 目录条目名列表（前 max 项，目录带 / 后缀），报错自诊断用
fn describe_entries(dir: &Path, max: usize) -> String {
    let entries: Vec<String> = match std::fs::read_dir(dir) {
        Ok(it) => it
            .flatten()
            .take(max)
            .map(|e| {
                let name = e.file_name().to_string_lossy().into_owned();
                if e.path().is_dir() { format!("{name}/") } else { name }
            })
            .collect(),
        Err(_) => vec!["（读取失败）".into()],
    };
    if entries.is_empty() {
        return "（空）".into();
    }
    let total = std::fs::read_dir(dir).map(|it| it.count()).unwrap_or(0);
    if total > max {
        format!("{}…（共 {total} 项）", entries.join("、"))
    } else {
        entries.join("、")
    }
}

/// 导入的同步主体（base 充当应用数据根，便于单测隔离）：解压 → 扫描定位素材根 → 校验 → 原子换入 → 写标记
fn import_materials_to(zip_path: &Path, base: &Path, emit: &dyn Fn(&str)) -> ImportOutcome {
    let target = base.join("materials");
    let fail = |msg: String| ImportOutcome {
        ok: false,
        dir: target.to_string_lossy().to_string(),
        questions: 0,
        message: msg,
    };
    if !zip_path.is_file() {
        return fail("选择的文件不存在".into());
    }
    let tmp = base.join("materials.tmp");
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp).ok();

    if let Err(e) = extract_zip(zip_path, &tmp) {
        let _ = std::fs::remove_dir_all(&tmp);
        return fail(e);
    }

    // 布局扫描与素材根定位：兼容 40 平铺 / 嵌套父目录 / 三四级混排
    let mut scans = Vec::new();
    scan_layout(&tmp, 0, MAX_SCAN_DEPTH, &mut scans);
    let Some(root_scan) = pick_question_root(&scans) else {
        let msg = layout_reject_message(&tmp, &scans);
        let _ = std::fs::remove_dir_all(&tmp);
        return fail(msg);
    };
    let root = root_scan.path.clone();
    let questions = root_scan.questions;

    // 换入：旧目录改名让位（Windows 下被 Jupyter 占用时改名也会失败 → 提示先停止）
    let existed = target.is_dir();
    if existed {
        let bak = base.join("materials.old");
        let _ = std::fs::remove_dir_all(&bak);
        if let Err(e) = std::fs::rename(&target, &bak) {
            let _ = std::fs::remove_dir_all(&tmp);
            return fail(format!(
                "素材目录被占用（{e}）。请先在应用里「停止 Jupyter」并关闭正在编辑的 Notebook，再重新导入"
            ));
        }
        if let Err(e) = std::fs::rename(&root, &target) {
            let _ = std::fs::rename(&bak, &target); // 回滚，尽量不丢旧素材
            let _ = std::fs::remove_dir_all(&tmp);
            return fail(format!("换入失败：{e}"));
        }
        let _ = std::fs::remove_dir_all(&bak);
    } else if let Err(e) = std::fs::rename(&root, &target) {
        let _ = std::fs::remove_dir_all(&tmp);
        return fail(format!("换入失败：{e}"));
    }
    // 素材根定位在包内深处时，清掉剩余的包装目录
    let _ = std::fs::remove_dir_all(&tmp);
    let _ = std::fs::write(
        target.join(".imported"),
        format!("{}\n{}\n", chrono_today(), env!("CARGO_PKG_VERSION")),
    );

    let located = root
        .strip_prefix(&tmp)
        .ok()
        .filter(|p| !p.as_os_str().is_empty())
        .map(|p| format!("（自动定位到包内「{}」下的素材根）", p.to_string_lossy()))
        .unwrap_or_default();
    emit(&format!(
        "✓ 素材包导入完成：{questions} 题 → {}{located}",
        target.display()
    ));
    ImportOutcome {
        ok: true,
        dir: target.to_string_lossy().to_string(),
        questions,
        message: format!("导入成功：{questions} 题素材已就绪{located}"),
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
    tauri::async_runtime::spawn_blocking(move || {
        let emitter = app.clone();
        import_materials_to(Path::new(&zip_path), &app_data_root(), &move |line| {
            let _ = emitter.emit("install-log", serde_json::json!({ "line": line }));
        })
    })
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
    fn make_zip(path: &Path, entries: &[(String, Vec<u8>)]) {
        let file = std::fs::File::create(path).unwrap();
        let mut z = zip::ZipWriter::new(file);
        let opts: zip::write::SimpleFileOptions = Default::default();
        for (name, data) in entries {
            z.start_file(name.as_str(), opts).unwrap();
            z.write_all(data).unwrap();
        }
        z.finish().unwrap();
    }

    /// 8 大组 × 5 题的标准 40 个题号
    fn qdirs() -> Vec<String> {
        let mut v = Vec::new();
        for g in ["1.1", "1.2", "2.1", "2.2", "3.1", "3.2", "4.1", "4.2"] {
            for i in 1..=5 {
                v.push(format!("{g}.{i}"));
            }
        }
        v
    }

    fn test_base(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("atp-mat-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn strips_parent_and_validates() {
        let dir = test_base("strip");
        let zip = dir.join("m.zip");
        make_zip(
            &zip,
            &[
                ("人工智能训练师三级上网素材/1.1.1/1.1.1.ipynb".into(), b"{}".to_vec()),
                ("人工智能训练师三级上网素材/1.1.1/patient_data.csv".into(), b"a,b".to_vec()),
                ("人工智能训练师三级上网素材/4.2.5/4.2.5.ipynb".into(), b"{}".to_vec()),
            ],
        );
        // 拷到 tmp 下解压并校验（绕开 import_materials_to 的换入流程，测解压纯函数）
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
        let dir = test_base("slip");
        let zip = dir.join("evil.zip");
        make_zip(&zip, &[("../evil.txt".into(), b"x".to_vec()), ("1.1.1/a.ipynb".into(), b"{}".to_vec())]);
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
        assert!(is_combined_material_dir("1.1.1-1.1.5~1.2.1-1.2.5素材"));
        assert!(is_combined_material_dir("2.1.1-2.1.5素材"));
        assert!(!is_combined_material_dir("素材"));
        assert!(!is_combined_material_dir("1.1.1"));
    }

    #[test]
    fn gbk_entry_name_decoding() {
        // UTF-8（标准工具设 EFS 位）原样通过
        assert_eq!(decode_entry_name("1.1.1/素材.csv".as_bytes()), "1.1.1/素材.csv");
        // GBK（Windows 打包默认 CP936）解码恢复中文
        let (gbk_bytes, _, _) = encoding_rs::GBK.encode("人工智能训练师三级上网素材/1.1.1/1.1.1.ipynb");
        assert_eq!(
            decode_entry_name(&gbk_bytes),
            "人工智能训练师三级上网素材/1.1.1/1.1.1.ipynb"
        );
        // \0 填充被剥掉
        let mut padded = gbk_bytes.to_vec();
        padded.push(0);
        assert_eq!(decode_entry_name(&padded).contains("\u{0}"), false);
    }

    /// 官方样式一：素材根嵌在多层中文父目录下（网盘批量下载常再包一层）→ 自动定位
    #[test]
    fn reroots_nested_parent_dirs() {
        let base = test_base("reroot");
        let zip = base.join("m.zip");
        let mut entries: Vec<(String, Vec<u8>)> = vec![("网盘下载说明.txt".into(), b"x".to_vec())];
        for q in qdirs() {
            entries.push((format!("外层包装/内层素材/{q}/{q}.ipynb"), format!("d-{q}").into_bytes()));
        }
        make_zip(&zip, &entries);
        let out = import_materials_to(&zip, &base, &|_| {});
        assert!(out.ok, "应导入成功：{}", out.message);
        assert_eq!(out.questions, 40);
        assert!(base.join("materials/1.1.1/1.1.1.ipynb").is_file(), "素材根应被换入顶层");
        assert!(!base.join("materials/外层包装").exists(), "包装目录不应混入");
        assert!(base.join("materials/.imported").is_file());
        assert!(!base.join("materials.tmp").exists(), "临时目录应被清理");
        let _ = std::fs::remove_dir_all(&base);
    }

    /// 官方样式二：三级/四级混排（各自都有 40 题号文件夹）→ 平手选「三级」
    #[test]
    fn picks_level3_root_over_level4() {
        let base = test_base("l3l4");
        let zip = base.join("m.zip");
        let mut entries: Vec<(String, Vec<u8>)> = Vec::new();
        for q in qdirs() {
            entries.push((format!("官方素材/三级/{q}/{q}.ipynb"), b"3".to_vec()));
            entries.push((format!("官方素材/四级/{q}/{q}.ipynb"), b"4".to_vec()));
        }
        make_zip(&zip, &entries);
        let out = import_materials_to(&zip, &base, &|_| {});
        assert!(out.ok, "应导入成功：{}", out.message);
        assert_eq!(
            std::fs::read_to_string(base.join("materials/1.1.1/1.1.1.ipynb")).unwrap(),
            "3",
            "应选中「三级」分支"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    /// 官方样式三：组合文件夹布局（…素材/ 内放参考代码）→ 拒绝并给指引
    #[test]
    fn rejects_combined_layout_with_guidance() {
        let base = test_base("combined");
        let zip = base.join("m.zip");
        let combos = [
            "1.1.1-1.1.5~1.2.1-1.2.5素材",
            "2.1.1-2.1.5素材",
            "2.2.1-2.2.5素材",
            "3.1.1-3.1.5素材",
            "3.2.1-3.2.5素材",
            "4.1.1-4.1.5~4.2.1-4.2.5素材",
        ];
        let entries: Vec<(String, Vec<u8>)> = combos
            .iter()
            .map(|c| (format!("三级/{c}/1.ipynb"), b"{}".to_vec()))
            .collect();
        make_zip(&zip, &entries);
        let out = import_materials_to(&zip, &base, &|_| {});
        assert!(!out.ok, "组合布局应被拒绝");
        assert!(out.message.contains("组合文件夹"), "报错应说明布局：{}", out.message);
        assert!(out.message.contains("更换素材总目录"), "应指引用户指认目录：{}", out.message);
        assert!(!base.join("materials").exists(), "不应产生素材目录");
        let _ = std::fs::remove_dir_all(&base);
    }

    /// 非素材包（如官方指导手册 zip）→ 报错列出解压现场便于自诊断
    #[test]
    fn generic_failure_lists_top_entries() {
        let base = test_base("generic");
        let zip = base.join("m.zip");
        make_zip(
            &zip,
            &[
                ("4-04-05-05_3_20250701/认定方案.pdf".into(), b"%pdf".to_vec()),
                ("4-04-05-05_3_20250701/细目表.docx".into(), b"docx".to_vec()),
            ],
        );
        let out = import_materials_to(&zip, &base, &|_| {});
        assert!(!out.ok);
        assert!(out.message.contains("认定方案"), "应列出顶层条目：{}", out.message);
        assert!(out.message.contains("题号文件夹"), "应说明缺什么：{}", out.message);
        let _ = std::fs::remove_dir_all(&base);
    }

    /// 真包端到端验证入口（平时跳过）：拿到任何真实素材 zip 后
    /// `ATP_TEST_REAL_ZIP=/path/to.zip cargo test real_world -- --nocapture`
    #[test]
    fn real_world_zip_via_env() {
        let Ok(zip_path) = std::env::var("ATP_TEST_REAL_ZIP") else { return; };
        let base = test_base("real");
        let out = import_materials_to(Path::new(&zip_path), &base, &|_| {});
        println!("ok={} questions={} message={}", out.ok, out.questions, out.message);
        assert!(out.ok, "真实包导入失败：{}", out.message);
        assert!(out.questions >= MIN_QUESTIONS);
        assert!(base.join("materials/1.1.1").is_dir());
        let _ = std::fs::remove_dir_all(&base);
    }
}
