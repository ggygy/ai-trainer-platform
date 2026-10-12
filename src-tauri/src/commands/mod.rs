pub mod env;
pub mod jupyter;
pub mod materials;

use std::process::Command;

/// 在「用户环境」中执行一行 shell 命令：
/// - macOS：GUI 应用不继承用户 shell 的 PATH，走 zsh 登录 shell（-l）补齐（见 ADR-0004）；
/// - Windows：GUI 进程的 PATH 取自注册表（装 Python 勾选 Add to PATH 即生效），cmd /C 即可，
///   并加 CREATE_NO_WINDOW 防止后台命令闪现控制台窗口（见 ADR-0010）。
pub(crate) fn shell_command(cmd: &str) -> Command {
    #[cfg(target_os = "macos")]
    {
        let mut c = Command::new("/bin/zsh");
        c.args(["-lc", cmd]);
        c
    }
    #[cfg(target_os = "windows")]
    {
        let mut c = Command::new("cmd");
        c.args(["/C", cmd]);
        no_window(&mut c);
        c
    }
    #[cfg(target_os = "linux")]
    {
        let mut c = Command::new("/bin/bash");
        c.args(["-lc", cmd]);
        c
    }
}

/// 清洗子进程输出行，供安装 / Jupyter 日志展示：
/// - 去 ANSI 转义序列（颜色、擦行、光标控制），前端按纯文本渲染不会花屏；
/// - \r 覆写式进度（curl 进度条、pip/uv 的 spinner 经管道进来是「多帧拼在一行」）
///   只保留最后一帧，原样透传会变成一串残缺叠影（issue #2 截图里的乱行）。
pub(crate) fn clean_progress_line(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut it = line.chars();
    while let Some(c) = it.next() {
        match c {
            '\x1b' => match it.next() {
                // CSI 序列：参数字节 + 中间字节后，遇 0x40–0x7E 终止
                Some('[') => {
                    for t in it.by_ref() {
                        if ('\x40'..='\x7e').contains(&t) {
                            break;
                        }
                    }
                }
                // OSC 序列：BEL 或 ESC \ 终止
                Some(']') => {
                    let mut prev = '\0';
                    for t in it.by_ref() {
                        if t == '\x07' || (prev == '\x1b' && t == '\\') {
                            break;
                        }
                        prev = t;
                    }
                }
                // 其余单字符转义（\x1b7 等）吞掉引导后的一个字节即可
                Some(_) => {}
                None => {}
            },
            _ => out.push(c),
        }
    }
    out.split('\r')
        .filter(|s| !s.trim().is_empty())
        .last()
        .unwrap_or_default()
        .trim_end()
        .to_string()
}

/// 直接 spawn 可执行文件时的 Windows 防闪窗（其余平台为空操作）。
pub(crate) fn no_window(c: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    #[cfg(not(target_os = "windows"))]
    let _ = c;
}

#[cfg(test)]
mod tests {
    use super::clean_progress_line;

    #[test]
    fn strips_ansi_colors_and_cursor_codes() {
        assert_eq!(clean_progress_line("\x1b[1;31mError\x1b[0m: boom"), "Error: boom");
        assert_eq!(clean_progress_line("done\x1b[K"), "done");
        assert_eq!(clean_progress_line("\x1b]0;窗口标题\x07正文"), "正文");
        assert_eq!(clean_progress_line("\x1b]8;;http://x\x1b\\链接\x1b]8;;\x1b\\"), "链接");
    }

    #[test]
    fn keeps_only_last_carriage_return_frame() {
        // curl 进度条 / spinner 经管道是「多帧拼一行」
        assert_eq!(clean_progress_line("  0 B\r 15 MB\r 30 MB"), " 30 MB");
        assert_eq!(clean_progress_line("  3% |==\r 50% |=====\r100%"), "100%");
        // 结尾孤立 \r 不能吞掉正文
        assert_eq!(clean_progress_line("Installed 14 packages\r"), "Installed 14 packages");
    }

    #[test]
    fn plain_lines_pass_through() {
        assert_eq!(clean_progress_line("✓ uv 就绪"), "✓ uv 就绪");
        assert_eq!(clean_progress_line("  × Failed to unpack wheel"), "  × Failed to unpack wheel");
    }
}
