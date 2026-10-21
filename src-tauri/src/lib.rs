mod paths;
mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(vault::VaultState::default())
        .invoke_handler(tauri::generate_handler![
            vault::select_vault,
            vault::list_vault,
            vault::read_note,
            vault::create_note,
            vault::write_note,
            vault::rename_note,
            vault::delete_note,
            vault::create_folder,
            vault::rename_folder,
            vault::delete_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
