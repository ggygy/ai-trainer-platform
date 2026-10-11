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
