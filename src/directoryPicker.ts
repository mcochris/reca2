import { invoke } from "@tauri-apps/api/core";

interface DirEntryInfo {
	name: string;
	path: string;
}

interface DirectoryListing {
	directories: DirEntryInfo[];
	files: DirEntryInfo[];
}

/**
 * Opens a native multi-select folder dialog, then lets the user expand any
 * selected (or subsequently discovered) directory to pick subdirectories
 * and/or music files inside it, recursively, until they click "Done".
 * Checking a directory (without expanding it) selects every matching music
 * file under it, recursively. Resolves to the sorted, de-duplicated list of
 * selected absolute file paths (empty array if the user cancels).
 */
export async function selectMusicFiles(musicExtensions: string[]): Promise<string[]> {
	const topLevelDirs = await invoke<string[]>("pick_directories");
	if (topLevelDirs.length === 0) return [];

	return new Promise<string[]>((resolve) => {
		injectStylesOnce();

		const selectedByNode = new Map<string, string[]>();

		function collectAll(): string[] {
			const out = new Set<string>();
			for (const paths of selectedByNode.values()) {
				for (const p of paths) out.add(p);
			}
			return [...out].sort();
		}

		const overlay = document.createElement("div");
		overlay.className = "dp-overlay";

		const dialog = document.createElement("div");
		dialog.className = "dp-dialog";

		const heading = document.createElement("h2");
		heading.textContent = "Select music files";
		dialog.appendChild(heading);

		const tree = document.createElement("ul");
		tree.className = "dp-tree";
		dialog.appendChild(tree);

		const footer = document.createElement("div");
		footer.className = "dp-footer";
		const cancelBtn = document.createElement("button");
		cancelBtn.textContent = "Cancel";
		cancelBtn.className = "dp-btn dp-btn-secondary";
		const doneBtn = document.createElement("button");
		doneBtn.textContent = "Done";
		doneBtn.className = "dp-btn dp-btn-primary";
		footer.appendChild(cancelBtn);
		footer.appendChild(doneBtn);
		dialog.appendChild(footer);

		overlay.appendChild(dialog);
		document.body.appendChild(overlay);

		function cleanup() {
			overlay.remove();
		}

		cancelBtn.onclick = () => {
			cleanup();
			resolve([]);
		};
		doneBtn.onclick = () => {
			cleanup();
			resolve(collectAll());
		};

		function renderNode(
			parentEl: HTMLElement,
			name: string,
			path: string,
			isDir: boolean,
		): { setChecked: (checked: boolean) => Promise<void> } {
			const li = document.createElement("li");
			li.className = "dp-node";

			const row = document.createElement("div");
			row.className = "dp-row";

			let childList: HTMLUListElement | null = null;
			let expanded = false;
			let loaded = false;
			let childNodes: { setChecked: (checked: boolean) => Promise<void> }[] = [];

			let expandBtn: HTMLButtonElement | null = null;
			if (isDir) {
				expandBtn = document.createElement("button");
				expandBtn.type = "button";
				expandBtn.className = "dp-expand";
				expandBtn.textContent = "▶";
				expandBtn.setAttribute("aria-label", `Expand ${name}`);
				row.appendChild(expandBtn);
			} else {
				const spacer = document.createElement("span");
				spacer.className = "dp-expand-spacer";
				row.appendChild(spacer);
			}

			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			row.appendChild(checkbox);

			const label = document.createElement("span");
			label.className = "dp-label";
			label.textContent = name;
			row.appendChild(label);

			li.appendChild(row);
			parentEl.appendChild(li);

			// Applies `checked` to this node. For an expanded directory this cascades
			// to every rendered child so their checkboxes and the collected file list
			// stay in sync; for a not-yet-expanded directory it falls back to asking
			// the backend to recursively collect the files under it.
			async function setChecked(checked: boolean): Promise<void> {
				checkbox.checked = checked;

				if (!isDir) {
					if (checked) {
						selectedByNode.set(path, [path]);
					} else {
						selectedByNode.delete(path);
					}
					return;
				}

				if (loaded) {
					checkbox.disabled = true;
					try {
						selectedByNode.delete(path);
						for (const child of childNodes) {
							await child.setChecked(checked);
						}
					} finally {
						checkbox.disabled = false;
					}
					return;
				}

				if (checked) {
					checkbox.disabled = true;
					try {
						const files = await invoke<string[]>("collect_music_files", {
							path,
							musicExtensions,
						});
						selectedByNode.set(path, files);
					} finally {
						checkbox.disabled = false;
					}
				} else {
					selectedByNode.delete(path);
				}
			}

			if (isDir) {
				checkbox.onchange = () => setChecked(checkbox.checked);

				expandBtn!.onclick = async () => {
					if (!loaded) {
						expandBtn!.disabled = true;
						const listing = await invoke<DirectoryListing>("list_directory", {
							path,
							musicExtensions,
						});
						expandBtn!.disabled = false;
						loaded = true;

						// Expanding clears any prior whole-directory pick, but the checkbox
						// stays clickable so the whole (sub)directory can still be selected.
						checkbox.checked = false;
						selectedByNode.delete(path);

						childList = document.createElement("ul");
						childList.className = "dp-tree dp-nested";
						for (const dir of listing.directories) {
							childNodes.push(renderNode(childList, dir.name, dir.path, true));
						}
						for (const file of listing.files) {
							childNodes.push(renderNode(childList, file.name, file.path, false));
						}
						li.appendChild(childList);

						if (listing.directories.length === 0 && listing.files.length === 0) {
							const empty = document.createElement("div");
							empty.className = "dp-empty";
							empty.textContent = "(no subdirectories or music files)";
							childList.appendChild(empty);
						}
					}

					expanded = !expanded;
					expandBtn!.textContent = expanded ? "▼" : "▶";
					if (childList) childList.style.display = expanded ? "block" : "none";
				};
			} else {
				checkbox.onchange = () => setChecked(checkbox.checked);
			}

			return { setChecked };
		}

		for (const dirPath of topLevelDirs) {
			const name = dirPath.split(/[/\\]/).filter(Boolean).pop() ?? dirPath;
			renderNode(tree, name, dirPath, true);
		}
	});
}

function injectStylesOnce() {
	if (document.getElementById("dp-styles")) return;
	const style = document.createElement("style");
	style.id = "dp-styles";
	style.textContent = `
.dp-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.dp-dialog {
  background: #fff;
  color: #0f0f0f;
  border-radius: 8px;
  padding: 1.25rem;
  width: min(480px, 90vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}
.dp-dialog h2 {
  margin: 0 0 0.75rem;
  font-size: 1.1rem;
}
.dp-tree {
  list-style: none;
  margin: 0;
  padding-left: 0;
  overflow-y: auto;
  flex: 1;
}
.dp-nested {
  padding-left: 1.25rem;
  display: block;
}
.dp-node {
  margin: 2px 0;
}
.dp-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.dp-expand {
  width: 1.25rem;
  height: 1.25rem;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.7rem;
  padding: 0;
}
.dp-expand-spacer {
  display: inline-block;
  width: 1.25rem;
}
.dp-label {
  font-size: 0.9rem;
}
.dp-empty {
  color: #888;
  font-size: 0.8rem;
  padding: 2px 0 2px 1.25rem;
}
.dp-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
}
.dp-btn {
  padding: 0.4rem 0.9rem;
  border-radius: 6px;
  border: 1px solid #ccc;
  cursor: pointer;
  font-size: 0.9rem;
}
.dp-btn-primary {
  background: #396cd8;
  color: #fff;
  border-color: #396cd8;
}
.dp-btn-secondary {
  background: #f6f6f6;
}
`;
	document.head.appendChild(style);
}
