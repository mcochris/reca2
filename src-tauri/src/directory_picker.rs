use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
pub struct DirEntryInfo {
    pub name: String,
    pub path: String,
}

#[derive(Serialize)]
pub struct DirectoryListing {
    pub directories: Vec<DirEntryInfo>,
    pub files: Vec<DirEntryInfo>,
}

fn is_hidden(file_name: &str) -> bool {
    file_name.starts_with('.')
}

fn normalize_extensions(extensions: &[String]) -> HashSet<String> {
    extensions
        .iter()
        .map(|ext| ext.trim_start_matches('.').to_ascii_lowercase())
        .collect()
}

fn has_music_extension(path: &Path, extensions: &HashSet<String>) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| extensions.contains(&ext.to_ascii_lowercase()))
        .unwrap_or(false)
}

/// Opens a native multi-select folder dialog and returns the chosen
/// top-level directory paths. Hidden directories are dropped defensively
/// in case one was reached by pasting/typing a path into the dialog.
///
/// Uses the callback-based `pick_folders` API bridged through a oneshot
/// channel rather than `blocking_pick_folders`, which is prone to hanging
/// (it spawns a thread that can fail to acquire the GTK main context on
/// Linux; see https://github.com/tauri-apps/plugins-workspace/issues/956).
#[tauri::command]
pub async fn pick_directories(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folders(move |result| {
        let _ = tx.send(result);
    });

    let Some(selected) = rx.await.map_err(|e| e.to_string())? else {
        return Ok(Vec::new());
    };

    let mut result = Vec::with_capacity(selected.len());
    for file_path in selected {
        let path: PathBuf = file_path.into_path().map_err(|e| e.to_string())?;
        let hidden = path
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(is_hidden);
        if !hidden {
            result.push(path.to_string_lossy().into_owned());
        }
    }
    Ok(result)
}

/// Lists the immediate (non-recursive) contents of `path`: non-hidden
/// subdirectories, and files whose extension matches `music_extensions`
/// (case-insensitive, with or without a leading dot, e.g. "mp3" or ".mp3").
/// Used to populate one level of an expandable directory tree in the UI.
#[tauri::command]
pub fn list_directory(path: String, music_extensions: Vec<String>) -> Result<DirectoryListing, String> {
    let extensions = normalize_extensions(&music_extensions);
    let entries = fs::read_dir(&path).map_err(|e| format!("failed to read {path}: {e}"))?;

    let mut directories = Vec::new();
    let mut files = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_hidden(&name) {
            continue;
        }

        let entry_path = entry.path();
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if file_type.is_dir() {
            directories.push(DirEntryInfo {
                name,
                path: entry_path.to_string_lossy().into_owned(),
            });
        } else if file_type.is_file() && has_music_extension(&entry_path, &extensions) {
            files.push(DirEntryInfo {
                name,
                path: entry_path.to_string_lossy().into_owned(),
            });
        }
    }

    directories.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(DirectoryListing { directories, files })
}

/// Recursively collects every matching music file under `path`, skipping
/// hidden subdirectories. Used when a whole directory is selected (checked)
/// rather than expanded for granular picking.
#[tauri::command]
pub fn collect_music_files(path: String, music_extensions: Vec<String>) -> Result<Vec<String>, String> {
    let extensions = normalize_extensions(&music_extensions);
    let mut result = Vec::new();
    collect_music_files_recursive(Path::new(&path), &extensions, &mut result)?;
    result.sort();
    Ok(result)
}

fn collect_music_files_recursive(
    dir: &Path,
    extensions: &HashSet<String>,
    out: &mut Vec<String>,
) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("failed to read {}: {e}", dir.display()))?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_hidden(&name) {
            continue;
        }

        let entry_path = entry.path();
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if file_type.is_dir() {
            collect_music_files_recursive(&entry_path, extensions, out)?;
        } else if file_type.is_file() && has_music_extension(&entry_path, extensions) {
            out.push(entry_path.to_string_lossy().into_owned());
        }
    }

    Ok(())
}
