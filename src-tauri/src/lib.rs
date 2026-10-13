mod commands;

use commands::jupyter::JupyterState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(JupyterState::default())
        .invoke_handler(tauri::generate_handler![
            commands::env::detect_env,
            commands::env::install_packages,
            commands::env::install_python,
            commands::env::open_folder,
            commands::env::path_is_dir,
            commands::env::dir_entry_count,
            commands::materials::import_materials,
            commands::materials::material_dir,
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
