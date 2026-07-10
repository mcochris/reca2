mod directory_picker;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // WebKitGTK's DMA-BUF renderer aborts the WebView process on hosts with an
    // incomplete/virtualized EGL stack (NVIDIA+Wayland, remote-desktop tools like
    // NoMachine that LD_PRELOAD their own libEGL, etc). Tauri's documented workaround:
    // https://v2.tauri.app/develop/debug/linux-graphics/
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        unsafe { std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1") };
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            directory_picker::pick_directories,
            directory_picker::list_directory,
            directory_picker::collect_music_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
