import directory from "../content/personnel.json" with { type: "json" };
import assignments from "../content/assignments.json" with { type: "json" };
import { records } from "./data";
import { escapeHtml } from "./html";
import { loadRead, pendingCount } from "./read-history";
import { fullMotion, type MotionPreferences } from "./motion-preferences";
import type { Session } from "./login";
import type { StaffRecord } from "./personnel";
import "./profile.css";

interface Appointment {
  id: string;
  account: string;
  title: string;
  kind: string;
  at: string;
  place: string;
  with: string[];
  records: string[];
  note: string;
}

// Same wording the register uses, so 权限 reads identically in both places.
const access: Record<string, [string, string]> = {
  "REFERENCE AREA": ["可调阅", "REFERENCE"],
  "CATALOG ONLY": ["仅目录", "CATALOG"],
};
const presence: Record<StaffRecord["status"], [string, string]> = {
  "on-roll": ["在编", "ON-ROLL"],
  field: ["外勤", "FIELD"],
  leave: ["休假", "ON LEAVE"],
};

const staff: StaffRecord[] = directory.personnel as StaffRecord[];
const schedule: Appointment[] = assignments.appointments as Appointment[];
// An account can hold more than one slot, and slots are written "MM-DD HH:MM" —
// fixed width, so lexical order is chronological within one season (the demo's
// dates never cross a year boundary). Grouping keeps all of them: a Map keyed by
// account would silently retain only the one written last, and the panel would
// report a count that disagreed with its own list.
const byAccount = new Map<string, Appointment[]>();
for (const entry of schedule) {
  const held = byAccount.get(entry.account);
  if (held) held.push(entry);
  else byAccount.set(entry.account, [entry]);
}
for (const held of byAccount.values())
  held.sort((a, b) => a.at.localeCompare(b.at));

/** How many of the signed-in account's own files are still unopened, for the
 *  nav badge. Kept beside the data it reads so main.ts only ever holds a number. */
export function pendingFor(session?: Session): number {
  if (!session) return 0;
  const person = staff.find((entry) => entry.id === session.id);
  if (!person) return 0;
  return pendingCount(session.account, person.records ?? []);
}

/**
 * The operator's own file: identity, what the account may reach, where it sits
 * in the institution, what is still unread, and what the terminal has
 * scheduled for it.
 *
 * Lifecycle is the register's: siblings go inert, the overlay owns focus and
 * Escape, and the exit finishes before focus returns. Nothing here writes —
 * the panel is a view of three other documents plus the local read ledger, so
 * there is no state to reconcile when it closes.
 */
export class ProfileOverlay {
  isOpen = false;
  private root: HTMLElement;
  private body: HTMLElement;
  private opener?: HTMLElement | null;
  private siblings: { node: HTMLElement; inert: boolean }[] = [];
  private transitions: Animation[] = [];
  private closing = false;
  private transitionId = 0;
  private motion: MotionPreferences = fullMotion();
  private session?: Session;

  constructor(
    private parent: HTMLElement,
    private onClose: () => void,
    private onOpenRecord?: (id: string) => void,
  ) {
    this.root = document.createElement("section");
    this.root.className = "profile";
    this.root.hidden = true;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-labelledby", "profile-title");
    this.root.innerHTML = `
      <header class="profile-header">
        <div class="profile-bar">
          <button class="profile-back" data-profile="close">← <span>返回档案阵列</span><kbd>ESC</kbd></button>
          <span class="profile-state" id="profile-state"></span>
        </div>
        <div class="profile-heading" id="profile-heading"></div>
      </header>
      <div class="profile-stats" id="profile-stats"></div>
      <div class="profile-body" id="profile-body"></div>
      <footer class="profile-footer"><span>身份与权限取自人员名录，排期取自终端登记，待办由名下档案减去本机已读记录得出</span><span id="profile-count"></span></footer>`;
    parent.appendChild(this.root);
    this.body = this.root.querySelector<HTMLElement>("#profile-body")!;
    this.root.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const record = target.closest<HTMLElement>("[data-record]")?.dataset.record;
      if (record) {
        this.onOpenRecord?.(record);
        return;
      }
      const action = target.closest<HTMLElement>("[data-profile]")?.dataset
        .profile;
      if (action === "close") this.close();
    });
    this.root.addEventListener("keydown", (event) => this.keydown(event));
  }

  setMotion(value: MotionPreferences) {
    this.motion = { ...value };
    this.root.dataset.motion = value.surfaceTransitions ? "full" : "reduced";
  }

  /** The wallpaper and review entries never sign in, so the caller may hand
   *  over nothing; the panel then says so instead of inventing an operator. */
  setSession(session?: Session) {
    this.session = session;
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.closing = false;
    this.opener = document.activeElement as HTMLElement | null;
    this.siblings = [...this.parent.children]
      .filter(
        (node): node is HTMLElement =>
          node instanceof HTMLElement && node !== this.root,
      )
      .map((node) => ({ node, inert: node.inert }));
    this.siblings.forEach(({ node }) => (node.inert = true));
    this.root.hidden = false;
    this.root.dataset.transition = "opening";
    // Rendered on open, not on construction: the read ledger changes while the
    // panel is closed, and a stale 待办 list is the one thing here that would
    // be wrong rather than merely out of date.
    this.render();
    this.body.scrollTop = 0;
    requestAnimationFrame(() => {
      if (this.isOpen && !this.closing)
        this.root
          .querySelector<HTMLElement>(".profile-back")
          ?.focus({ preventScroll: true });
    });
    this.enter();
  }

  close() {
    if (!this.isOpen || this.closing) return;
    this.closing = true;
    const ticket = ++this.transitionId;
    const opacity = getComputedStyle(this.root).opacity;
    this.transitions.forEach((animation) => animation.cancel());
    this.transitions = [];
    this.root.dataset.transition = "closing";
    if (!this.motion.surfaceTransitions) {
      this.finishClose();
      return;
    }
    const fade = this.root.animate([{ opacity }, { opacity: 0 }], {
      duration: 220,
      easing: "cubic-bezier(0.4, 0, 1, 1)",
      fill: "forwards",
    });
    this.transitions.push(fade);
    void fade.finished
      .then(() => {
        if (ticket === this.transitionId) this.finishClose();
      })
      .catch(() => {});
  }

  private finishClose() {
    this.isOpen = false;
    this.closing = false;
    this.root.hidden = true;
    this.root.dataset.transition = "closed";
    this.transitions.forEach((animation) => animation.cancel());
    this.transitions = [];
    this.siblings.forEach(({ node, inert }) => (node.inert = inert));
    this.siblings = [];
    this.opener?.focus({ preventScroll: true });
    this.onClose();
  }

  private enter() {
    const ticket = ++this.transitionId;
    this.transitions.forEach((animation) => animation.cancel());
    this.transitions = [];
    if (!this.motion.surfaceTransitions) {
      this.root.dataset.transition = "open";
      return;
    }
    const fade = this.root.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 320,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    });
    this.transitions.push(fade);
    for (const selector of [
      ".profile-header",
      ".profile-stats",
      ".profile-footer",
    ]) {
      const element = this.root.querySelector<HTMLElement>(selector)!;
      this.transitions.push(
        element.animate(
          [
            { opacity: 0, translate: "0 10px" },
            { opacity: 1, translate: "0 0" },
          ],
          {
            duration: 300,
            delay: 60,
            fill: "backwards",
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          },
        ),
      );
    }
    const cards = this.body.querySelectorAll<HTMLElement>(".profile-card");
    cards.forEach((card, index) => {
      this.transitions.push(
        card.animate(
          [
            { opacity: 0, translate: "0 14px" },
            { opacity: 1, translate: "0 0" },
          ],
          {
            duration: 340,
            delay: 90 + index * 45,
            fill: "backwards",
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          },
        ),
      );
    });
    void fade.finished
      .then(() => {
        if (ticket === this.transitionId) this.root.dataset.transition = "open";
      })
      .catch(() => {});
  }

  /** Resolved from the session, so the panel never shows a second opinion about
   *  who is signed in. The roster entry supplies the fields the session lacks. */
  private current() {
    if (!this.session) return undefined;
    const person = staff.find((entry) => entry.id === this.session!.id);
    return person ? { person, session: this.session } : undefined;
  }

  private render() {
    const state = this.root.querySelector<HTMLElement>("#profile-state")!;
    const heading = this.root.querySelector<HTMLElement>("#profile-heading")!;
    const stats = this.root.querySelector<HTMLElement>("#profile-stats")!;
    const count = this.root.querySelector<HTMLElement>("#profile-count")!;
    const current = this.current();

    if (!current) {
      state.innerHTML = "";
      heading.innerHTML =
        '<span class="profile-eyebrow">RHINE LAB / OPERATOR FILE</span><h2 id="profile-title">未登录<small>NO SESSION</small></h2><p class="profile-sub">当前入口没有身份</p>';
      stats.innerHTML = "";
      this.body.innerHTML =
        '<section class="profile-card wide"><div class="card-head"><span>IDENTITY</span><h3>身份</h3></div><p class="card-note">壁纸端与带参数的对照入口跳过登录，因此没有可显示的操作员档案。从登录页进入终端后，此处会显示该账号的身份、权限、所属、待办与预约。</p></section>';
      count.textContent = "";
      return;
    }

    const { person, session } = current;
    const read = loadRead(session.account);
    const owned = person.records ?? [];
    const pending = records.filter(
      (record) => owned.includes(record.id) && !read.has(record.id),
    );
    const [accessCn, accessEn] = access[person.clearance] ?? [person.clearance, ""];
    const [dutyCn, dutyEn] = presence[person.status] ?? [person.status, ""];
    const mine = byAccount.get(session.account) ?? [];
    const colleagues = staff.filter(
      (entry) =>
        entry.kind === "person" &&
        entry.department === person.department &&
        entry.id !== person.id,
    );
    // The columns this account's files sit in: a real consequence of the
    // catalogue rather than a permission the data does not carry.
    const spread = [
      ...new Set(
        owned
          .map((id) => records.find((record) => record.id === id)?.category)
          .filter((name): name is string => Boolean(name)),
      ),
    ];

    state.innerHTML = `<i></i>SESSION AUTHORIZED<i>／</i>${escapeHtml(session.account)}`;
    heading.innerHTML = `
      <span class="profile-eyebrow">RHINE LAB / OPERATOR FILE</span>
      <h2 id="profile-title">${escapeHtml(person.name)}<small>${escapeHtml(person.en)}</small></h2>
      <p class="profile-sub">${escapeHtml(person.department)} <i>／</i> ${escapeHtml(person.position)} <i>／</i> ${escapeHtml(person.id)}</p>`;

    // Escaped like every other data path in this file, even though the captions
    // are catalogue text rather than operator input.
    const stat = (label: string, value: number, caption: string) =>
      `<div><span>${escapeHtml(label)}</span><strong>${String(value).padStart(2, "0")}</strong><small>${escapeHtml(caption)}</small></div>`;
    stats.innerHTML =
      stat("待办 / PENDING", pending.length, `共 ${owned.length} 份名下档案`) +
      stat(
        "预约 / SCHEDULED",
        mine.length,
        // The list is ordered by its fixed-width slot, so this is the first one
        // on the books, not the next one to happen.
        mine.length ? `首场 ${mine[0].at}` : "无排期",
      ) +
      stat("已读 / READ", owned.length - pending.length, "跨会话累计") +
      stat("同科室 / SECTION", colleagues.length, person.department);

    const card = (en: string, cn: string, wide: boolean, inner: string) =>
      `<section class="profile-card${wide ? " wide" : ""}"><div class="card-head"><span>${en}</span><h3>${cn}</h3></div>${inner}</section>`;
    const field = (label: string, value: string, note = "") =>
      `<div class="card-field"><dt>${label}</dt><dd>${escapeHtml(value)}${note ? `<small>${escapeHtml(note)}</small>` : ""}</dd></div>`;
    const chips = (list: string[]) =>
      `<div class="card-chips">${list.map((name) => `<span>${escapeHtml(name)}</span>`).join("")}</div>`;

    const identity = `<dl class="card-fields">
        ${field("编目号 / INDEX", person.id, person.kind === "unit" ? "机构 / UNIT" : "自然人 / PERSON")}
        ${field("账号 / ACCOUNT", session.account)}
        ${field("在编状态 / DUTY", `${dutyCn} ${dutyEn}`.trim())}
      </dl>
      <p class="card-note">${escapeHtml(person.note)}</p>`;

    const clearance = `<dl class="card-fields">
        ${field("访问范围 / ACCESS", `${accessCn} ${accessEn}`.trim(), "与人员名录同一套措辞")}
        ${field("名下档案 / FILES", `${owned.length} 份`, pending.length ? `其中 ${pending.length} 份尚未读取` : "已全部读取")}
      </dl>
      <div class="card-sub"><span>可读取列 / COLUMNS</span>${spread.length ? chips(spread) : "<p>—</p>"}</div>`;

    const affiliation = `<dl class="card-fields">
        ${field("科室 / DEPARTMENT", person.department)}
        ${field("职位 / POSITION", person.position)}
      </dl>
      <div class="card-sub"><span>同科室 / SECTION<i>${String(colleagues.length).padStart(2, "0")}</i></span>${colleagues.length ? chips(colleagues.map((entry) => entry.name)) : "<p>—</p>"}</div>`;

    const pendingList = pending.length
      ? `<ul class="card-list">${pending
          .map(
            (record) =>
              `<li><button type="button" data-record="${escapeHtml(record.id)}"><span class="list-id">${escapeHtml(record.id)}</span><span class="list-title">${escapeHtml(record.title)}</span><span class="list-meta">${escapeHtml(record.category)} · ${escapeHtml(record.department)}</span><em>↗</em></button></li>`,
          )
          .join("")}</ul>`
      : `<p class="card-empty">名下 ${owned.length} 份档案均已读取。归档在别处新写之后，未读的会出现在这里。</p>`;

    const appointmentBlock = (entry: Appointment) => `<div class="card-appointment">
          <div class="appointment-top"><span class="appointment-at">${escapeHtml(entry.at)}</span><span class="appointment-kind">${escapeHtml(entry.kind)}</span></div>
          <strong>${escapeHtml(entry.title)}</strong>
          <p class="appointment-place">${escapeHtml(entry.place)}</p>
          <p class="card-note">${escapeHtml(entry.note)}</p>
          ${
            entry.with.length
              ? `<div class="card-sub"><span>同行 / WITH</span>${chips(entry.with)}</div>`
              : ""
          }
          ${
            entry.records.length
              ? `<div class="card-sub"><span>关联档案 / FILES</span><div class="card-chips">${entry.records
                  .map(
                    (id) =>
                      `<button type="button" class="chip-link" data-record="${escapeHtml(id)}">${escapeHtml(id)}<em>↗</em></button>`,
                  )
                  .join("")}</div></div>`
              : ""
          }
        </div>`;

    // Earliest first, all of them: the count in the stats row and the footer
    // both read off this same list, so the three can no longer disagree.
    const appointment = mine.length
      ? mine.map(appointmentBlock).join("")
      : `<p class="card-empty">该账号没有登记排期。</p>`;

    this.body.innerHTML =
      card("IDENTITY", "身份", false, identity) +
      card("CLEARANCE", "权限", false, clearance) +
      card("AFFILIATION", "所属", false, affiliation) +
      card("PENDING", "待办", true, pendingList) +
      card("APPOINTMENTS", "预约", true, appointment);

    count.textContent = `${String(pending.length).padStart(2, "0")} PENDING / ${String(mine.length).padStart(2, "0")} SCHEDULED`;
  }

  private keydown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
      return;
    }
    if (this.closing) {
      event.preventDefault();
      return;
    }
    if (event.key !== "Tab") return;
    // Only real controls are focusable here, so the trap is the whole surface.
    const elements = [
      ...this.root.querySelectorAll<HTMLElement>("button:not([disabled])"),
    ];
    const first = elements[0];
    const last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
}
