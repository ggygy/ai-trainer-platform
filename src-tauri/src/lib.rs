mod commands;

use commands::jupyter::JupyterState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(JupyterState::default())
        .invoke_handler(tauri::generate_handler![
            commands::env::detect_env,
            commands::env::install_packages,
            commands::env::install_python,
            commands::env::open_folder,
            commands::jupyter::jupyter_start,
            commands::jupyter::jupyter_stop,
            commands::jupyter::jupyter_status,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // 退出时带走 jupyter 进程树：不留占端口/占内存的残留实例
            if let tauri::RunEvent::Exit = event {
                commands::jupyter::shutdown(app.state::<JupyterState>().inner());
            }
        });
}
