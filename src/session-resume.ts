export type ResumeMode = "archive" | "detail";
export type SessionResume = { selected: number; mode: ResumeMode };

// A discarded or reloaded tab keeps its own session storage, so the terminal
// can continue where it was left instead of replaying the entry and opening.
// A new tab starts empty and still shows the entry.
const KEY = "rhine-session";

function store(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    // Storage can be disabled; the entry then behaves as before.
    return undefined;
  }
}

export function readSessionResume(total: number): SessionResume | undefined {
  try {
    const raw = store()?.getItem(KEY);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as { entered?: unknown; selected?: unknown; mode?: unknown };
    const selected = Number(value.selected);
    if (value.entered !== true || !Number.isInteger(selected) || selected < 0 || selected >= total)
      return undefined;
    return { selected, mode: value.mode === "detail" ? "detail" : "archive" };
  } catch {
    return undefined;
  }
}

export function saveSessionResume(selected: number, mode: ResumeMode) {
  try {
    store()?.setItem(KEY, JSON.stringify({ entered: true, selected, mode }));
  } catch {}
}
