import { invoke } from "@tauri-apps/api/core";
import { selectMusicFiles } from "./directoryPicker";

const MUSIC_EXTENSIONS = ["mp3", "flac", "wav", "m4a", "ogg", "aac", "wma", "opus"];

let greetInputEl: HTMLInputElement | null;
let greetMsgEl: HTMLElement | null;

async function greet() {
  if (greetMsgEl && greetInputEl) {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    greetMsgEl.textContent = await invoke("greet", {
      name: greetInputEl.value,
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  greetInputEl = document.querySelector("#greet-input");
  greetMsgEl = document.querySelector("#greet-msg");
  document.querySelector("#greet-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    greet();
  });

  const selectMusicBtn = document.querySelector<HTMLButtonElement>("#select-music-btn");
  const selectMusicResultEl = document.querySelector<HTMLElement>("#select-music-result");
  selectMusicBtn?.addEventListener("click", async () => {
    selectMusicBtn.disabled = true;
    try {
      const files = await selectMusicFiles(MUSIC_EXTENSIONS);
      if (selectMusicResultEl) {
        selectMusicResultEl.textContent = JSON.stringify(files, null, 2);
      }
    } finally {
      selectMusicBtn.disabled = false;
    }
  });
});
