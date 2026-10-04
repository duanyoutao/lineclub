/**
 * Which archives an account has already opened.
 *
 * The detail view's ACCESS LOG is deliberately per-visit and in memory: it
 * describes the current session, so persisting it would be a lie. The 我的
 * panel asks a different question — what is still unread — which is only
 * answerable across visits, and only per account, since two operators share
 * one browser.
 *
 * Storage is best-effort throughout: a locked-down profile simply behaves as
 * if nothing had been read yet, which degrades to "everything is pending"
 * rather than throwing.
 */
const KEY = "rhine-read-v1";
// Long enough that a demo never ages out, short enough that the value cannot
// grow without bound. Oldest entries are dropped first.
const MAX_PER_ACCOUNT = 200;
const RECORD_ID = /^X-\d{3}$/;

type Ledger = Record<string, string[]>;

function store(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Tolerant read: anything that is not the expected shape is discarded rather
 *  than repaired, so a hand-edited or half-written value cannot poison the
 *  panel with junk ids. */
function parse(raw: string | null): Ledger {
  const empty: Ledger = {};
  if (!raw) return empty;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty;
  const ledger: Ledger = {};
  for (const [account, ids] of Object.entries(value as Record<string, unknown>)) {
    const name = account.trim();
    if (!name || name.length > 64 || !Array.isArray(ids)) continue;
    const kept = ids
      .filter((id): id is string => typeof id === "string" && RECORD_ID.test(id))
      .slice(-MAX_PER_ACCOUNT);
    // A duplicate would silently inflate the unread count, so it is dropped on
    // the way in rather than deduplicated on every read.
    ledger[name] = [...new Set(kept)];
  }
  return ledger;
}

function write(ledger: Ledger) {
  try {
    store()?.setItem(KEY, JSON.stringify(ledger));
  } catch {}
}

/** Record numbers this account has already opened, newest last. */
export function loadRead(account: string): Set<string> {
  const name = account.trim();
  if (!name) return new Set();
  return new Set(parse(store()?.getItem(KEY) ?? null)[name] ?? []);
}

/** Appends one opening. Re-reading moves nothing: the set is unordered, and the
 *  cap only ever trims entries that have already been counted. */
export function markRead(account: string, id: string) {
  const name = account.trim();
  if (!name || !RECORD_ID.test(id)) return;
  const ledger = parse(store()?.getItem(KEY) ?? null);
  const ids = ledger[name] ?? [];
  if (ids.includes(id)) return;
  ledger[name] = [...ids, id].slice(-MAX_PER_ACCOUNT);
  write(ledger);
}

/** How many of `owned` are still unopened, for the nav badge. */
export function pendingCount(account: string, owned: readonly string[]) {
  const read = loadRead(account);
  return owned.filter((id) => !read.has(id)).length;
}
