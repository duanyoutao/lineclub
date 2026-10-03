export type ResumeMode = "archive" | "detail";
export type SessionResume = { selected: number; mode: ResumeMode; account: string };

// A discarded or reloaded tab keeps its own session storage, so the terminal
// can continue where it was left instead of replaying the opening. A new tab
// starts empty and still shows the entry. The record also carries the signed-in
// account, which is what lets a restored tab skip re-entering a password: the
// marker only exists after a sign-in in this very tab session.
const KEY = "rhine-resume";

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
    const value = JSON.parse(raw) as { entered?: unknown; selected?: unknown; mode?: unknown; account?: unknown };
    const selected = Number(value.selected);
    const account = typeof value.account === "string" ? value.account.trim() : "";
    if (value.entered !== true || !Number.isInteger(selected) || selected < 0 || selected >= total) return undefined;
    if (!account || account.length > 64) return undefined;
    return { selected, mode: value.mode === "detail" ? "detail" : "archive", account };
  } catch {
    return undefined;
  }
}

export function saveSessionResume(selected: number, mode: ResumeMode, account: string) {
  try {
    store()?.setItem(KEY, JSON.stringify({ entered: true, selected, mode, account }));
  } catch {}
}
