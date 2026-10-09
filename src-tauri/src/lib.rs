mod commands;

use commands::jupyter::JupyterState;

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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
