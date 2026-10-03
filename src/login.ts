import credentials from "../content/credentials.json" with { type: "json" };
import { brandHeading, logo } from "./brand";
import "./login.css";

export interface Session {
  id: string;
  account: string;
  name: string;
  en: string;
  kind: "person" | "unit";
  department: string;
  position: string;
  status: "online" | "busy" | "offline";
}

type Credential = (typeof credentials)[number];

const sessionKey = "rhine-session-v1";
const submitLabel = "LOGIN";
const busyLabel = "PREPARING AUDIO…";
// A founder, the institute itself and the maintainer: three accounts that read
// as a roster instead of three variations of the same entry. The full list stays
// in docs/CREDENTIALS.txt; this is only what the demo needs to be openable.
const showcaseAccounts = ["kristen.wright", "rhine.lab", "lbeilc"];

/** The three accounts offered inline by DEMO ACCESS, in preference order with a
 *  head-of-list fallback so the row survives edits to the credential list. */
function showcase(): Credential[] {
  const rows = credentials as readonly Credential[];
  const byAccount = new Map(rows.map((row) => [row.account, row]));
  const picked = showcaseAccounts
    .map((account) => byAccount.get(account))
    .filter((row): row is Credential => Boolean(row));
  for (const row of rows) {
    if (picked.length >= showcaseAccounts.length) break;
    if (!picked.includes(row)) picked.push(row);
  }
  return picked;
}

const showcaseRows = showcase()
  .map(
    (row) =>
      `<li><button class="login-sample" type="button" data-account="${row.account}"><b>${row.account}</b><i>${row.password}</i><small>${row.name} · ${row.department}</small></button></li>`,
  )
  .join("");

/**
 * Sign-in surface shown before the opening. It absorbs the role the loading
 * screen's entry gesture used to play: the credential submit is the user
 * activation that unlocks audio, so identity and audio cost one click rather
 * than two, and the silent path stays available when audio is unwanted or
 * unavailable.
 *
 * The surface reads --theme-* rather than fixed colours. paintTheme() runs
 * before this gate is built, so it already paints the boot background's own
 * gradient and the handover into the opening has no seam.
 */
export class LoginGate {
  private root: HTMLElement;
  private form: HTMLFormElement;
  private account: HTMLInputElement;
  private secret: HTMLInputElement;
  private status: HTMLElement;
  private submitButton: HTMLButtonElement;
  private silent: HTMLButtonElement;
  private demo: HTMLButtonElement;
  private samples: HTMLElement;
  private busy = false;
  private failed = 0;

  constructor(
    parent: HTMLElement,
    private options: {
      wantsAudio: boolean;
      unlock: () => Promise<boolean>;
      cancel: () => void;
      enter: (session: Session, silent: boolean) => void;
    },
  ) {
    this.root = document.createElement("section");
    this.root.className = "login";
    this.root.setAttribute("aria-labelledby", "login-title");
    this.root.innerHTML = `
      <header class="brand login-brand">${brandHeading}</header>
      <div class="login-body">
        <div class="login-mark" aria-hidden="true"><span class="login-mark-halo"></span><span class="login-mark-svg">${logo}</span></div>
        <div class="login-main">
          <p class="login-kicker">RHINE LAB · INTERNAL DATABASE</p>
          <h2 class="login-title" id="login-title">WELCOME<span>身份验证</span></h2>
          <p class="login-lede">使用内部资料终端分配的账号进入。验证通过后开始播放启动流程。</p>
          <form class="login-form" novalidate>
            <label class="login-field"><span>账号 / USERNAME:</span><input id="login-account" name="account" type="text" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" required aria-describedby="login-status" /></label>
            <label class="login-field"><span>密码 / PASSWORD:</span><input id="login-secret" name="secret" type="password" autocomplete="current-password" required aria-describedby="login-status" /></label>
            <p class="login-status" id="login-status" role="status">等待身份信息。</p>
            <button class="login-submit" type="submit" disabled>${submitLabel}</button>
            <div class="login-links">
              <button class="login-demo" type="button" aria-expanded="false" aria-controls="login-samples">DEMO ACCESS</button>
              <button class="login-silent" type="button" hidden>ENTER WITHOUT AUDIO</button>
            </div>
            <ul class="login-samples" id="login-samples" hidden>${showcaseRows}</ul>
          </form>
          <p class="login-note">完整 ${credentials.length} 组账号见仓库中的 <code>docs/CREDENTIALS.txt</code>。公开演示项目，凭据随源码分发，不代表真实权限。</p>
        </div>
      </div>`;
    parent.appendChild(this.root);
    this.form = this.root.querySelector<HTMLFormElement>(".login-form")!;
    this.account = this.root.querySelector<HTMLInputElement>("#login-account")!;
    this.secret = this.root.querySelector<HTMLInputElement>("#login-secret")!;
    this.status = this.root.querySelector<HTMLElement>("#login-status")!;
    this.submitButton =
      this.root.querySelector<HTMLButtonElement>(".login-submit")!;
    this.silent = this.root.querySelector<HTMLButtonElement>(".login-silent")!;
    this.demo = this.root.querySelector<HTMLButtonElement>(".login-demo")!;
    this.samples = this.root.querySelector<HTMLElement>("#login-samples")!;
    this.restore();
    for (const input of [this.account, this.secret])
      input.addEventListener("input", () => this.sync());
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.submit();
    });
    this.silent.addEventListener("click", () => {
      if (this.busy) return;
      // The silent path is only reachable with a verified identity in hand.
      const session = this.verify();
      if (session) this.finish(session, true);
    });
    this.demo.addEventListener("click", () => {
      const open = this.samples.hidden;
      this.samples.hidden = !open;
      this.demo.setAttribute("aria-expanded", String(open));
    });
    this.samples.addEventListener("click", (event) => this.fill(event));
    this.sync();
  }

  get element() {
    return this.root;
  }

  /** Called when startup finishes loading, unless the visitor logged in first. */
  focus() {
    this.account.focus({ preventScroll: true });
  }

  remove() {
    this.root.remove();
  }

  private restore() {
    try {
      const last = localStorage.getItem(sessionKey);
      if (last) this.account.value = last;
    } catch {}
  }

  /** Fills the form from a DEMO ACCESS row, so the demo can be entered without
   *  leaving the page for the credential file. */
  private fill(event: Event) {
    const target = event.target as HTMLElement | null;
    const account = target?.closest<HTMLButtonElement>(".login-sample")?.dataset
      .account;
    if (!account) return;
    const row = (credentials as readonly Credential[]).find(
      (entry) => entry.account === account,
    );
    if (!row) return;
    this.account.value = row.account;
    this.secret.value = row.password;
    this.root.dataset.failed = "false";
    this.status.textContent = `已填入 ${row.name} 的凭据，可直接验证。`;
    this.sync();
    this.submitButton.focus({ preventScroll: true });
  }

  private sync() {
    this.submitButton.disabled =
      this.busy ||
      this.account.value.trim().length === 0 ||
      this.secret.value.length === 0;
  }

  private verify(): Session | undefined {
    const account = this.account.value.trim().toLowerCase();
    const secret = this.secret.value.trim();
    const match = (credentials as readonly Credential[]).find(
      (row) => row.account.toLowerCase() === account && row.password === secret,
    );
    if (!match) return undefined;
    return {
      id: match.id,
      account: match.account,
      name: match.name,
      en: match.en,
      kind: match.kind as Session["kind"],
      department: match.department,
      position: match.position,
      status: match.status as Session["status"],
    };
  }

  private async submit() {
    if (this.busy) return;
    const session = this.verify();
    if (!session) {
      this.failed++;
      this.secret.value = "";
      this.secret.focus({ preventScroll: true });
      this.root.dataset.failed = "true";
      this.status.textContent =
        this.failed > 1
          ? `账号或密码不正确，已连续失败 ${this.failed} 次。`
          : "账号或密码不正确。";
      this.sync();
      return;
    }
    if (!this.options.wantsAudio) {
      this.finish(session, true);
      return;
    }
    this.busy = true;
    this.submitButton.setAttribute("aria-disabled", "true");
    this.submitButton.textContent = busyLabel;
    this.status.textContent = "正在准备声音资源。";
    this.silent.hidden = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const unlocked = await Promise.race([
        this.options.unlock(),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), 20000);
        }),
      ]);
      // A failed unlock is not a failed sign-in: offer the silent path instead
      // of stranding the visitor on a form that has already passed.
      this.finish(session, !unlocked);
    } catch {
      this.options.cancel();
      this.busy = false;
      this.submitButton.removeAttribute("aria-disabled");
      // The form is usable again, so it must not keep advertising the wait.
      this.submitButton.textContent = submitLabel;
      this.status.textContent = "声音暂未就绪，可重试或选择无声进入。";
      this.sync();
    } finally {
      clearTimeout(timer);
    }
  }

  private finish(session: Session, silent: boolean) {
    this.busy = false;
    try {
      localStorage.setItem(sessionKey, session.account);
    } catch {}
    this.options.enter(session, silent);
  }
}
