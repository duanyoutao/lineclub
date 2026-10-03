import directory from "../content/personnel.json" with { type: "json" };
import { escapeHtml } from "./html";
import { fullMotion, type MotionPreferences } from "./motion-preferences";
import "./personnel.css";

export interface StaffRecord {
  id: string;
  name: string;
  en: string;
  kind: "person" | "unit";
  department: string;
  position: string;
  status: "online" | "busy" | "offline";
  clearance: string;
  note: string;
  records: string[];
}

const presence: Record<StaffRecord["status"], [string, string]> = {
  online: ["在线", "ONLINE"],
  busy: ["忙碌", "IN SESSION"],
  offline: ["离线", "OFFLINE"],
};

/** Full-screen staff directory. Lifecycle mirrors the reading stage: siblings go
 *  inert, the overlay owns focus and Escape, and the exit finishes before focus
 *  returns to the opener. */
export class PersonnelOverlay {
  isOpen = false;
  private root: HTMLElement;
  private body: HTMLElement;
  private opener?: HTMLElement | null;
  private siblings: { node: HTMLElement; inert: boolean }[] = [];
  private transitions: Animation[] = [];
  private closing = false;
  private transitionId = 0;
  private motion: MotionPreferences = fullMotion();
  private query = "";
  private department = "全部科室";
  private staff: StaffRecord[] = directory.personnel as StaffRecord[];
  private departments: string[] = directory.departments;

  constructor(
    private parent: HTMLElement,
    private onClose: () => void,
  ) {
    this.root = document.createElement("section");
    this.root.className = "personnel";
    this.root.hidden = true;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-labelledby", "personnel-title");
    this.root.innerHTML = `
      <header class="personnel-header">
        <div class="personnel-bar">
          <button class="personnel-back" data-personnel="close">← <span>返回档案阵列</span><kbd>ESC</kbd></button>
          <div class="personnel-legend">${(
            Object.keys(presence) as StaffRecord["status"][]
          )
            .map(
              (status) =>
                `<span data-legend="${status}"><i></i>${presence[status][1]}</span>`,
            )
            .join("")}</div>
        </div>
        <div class="personnel-heading"><span>RHINE LAB / PERSONNEL DIRECTORY</span><h2 id="personnel-title">人员名录</h2><p id="personnel-summary"></p></div>
      </header>
      <div class="personnel-tools">
        <div class="personnel-search"><span>⌕</span><input id="personnel-query" type="search" autocomplete="off" placeholder="输入姓名、科室或职位" aria-label="检索人员"/><span class="key">ESC</span></div>
        <div class="personnel-filters" id="personnel-filters" role="group" aria-label="按科室筛选"></div>
      </div>
      <div class="personnel-body" tabindex="0">
        <table class="personnel-table">
          <thead><tr><th class="num">编号</th><th>姓名 / NAME</th><th>科室 / DEPARTMENT</th><th>职位 / POSITION</th><th>状态 / PRESENCE</th><th class="num">档案</th></tr></thead>
          <tbody id="personnel-rows"></tbody>
        </table>
        <p class="personnel-empty" id="personnel-empty" hidden>没有匹配的人员。尝试其他姓名、科室或职位。</p>
      </div>
      <footer class="personnel-footer"><span>姓名取自档案的相关人物字段；职位与在线状态为本终端的编目设定</span><span id="personnel-count"></span></footer>`;
    parent.appendChild(this.root);
    this.body = this.root.querySelector<HTMLElement>(".personnel-body")!;
    this.renderFilters();
    const search =
      this.root.querySelector<HTMLInputElement>("#personnel-query")!;
    search.addEventListener("input", () => {
      this.query = search.value.trim();
      this.renderRows();
    });
    this.root.addEventListener("click", (event) => {
      const filter = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-department]",
      )?.dataset.department;
      if (filter) {
        this.department = filter;
        this.renderFilters();
        this.renderRows();
        return;
      }
      const action = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-personnel]",
      )?.dataset.personnel;
      if (action === "close") this.close();
    });
    this.root.addEventListener("keydown", (event) => this.keydown(event));
  }

  setMotion(value: MotionPreferences) {
    this.motion = { ...value };
    this.root.dataset.motion = value.surfaceTransitions ? "full" : "reduced";
  }

  /** Callers use this to decide whether a file click should hand over. */
  get visible() {
    return this.isOpen;
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
    this.renderRows();
    this.body.scrollTop = 0;
    requestAnimationFrame(() => {
      if (this.isOpen && !this.closing)
        this.root.querySelector<HTMLInputElement>("#personnel-query")?.focus({
          preventScroll: true,
        });
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
      ".personnel-header",
      ".personnel-tools",
      ".personnel-footer",
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
    void fade.finished
      .then(() => {
        if (ticket === this.transitionId) this.root.dataset.transition = "open";
      })
      .catch(() => {});
  }

  private renderFilters() {
    const used = new Set(this.staff.map((person) => person.department));
    const names = [
      "全部科室",
      ...this.departments.filter((name) => used.has(name)),
    ];
    this.root.querySelector("#personnel-filters")!.innerHTML = names
      .map(
        (name) =>
          `<button data-department="${escapeHtml(name)}" aria-pressed="${String(name === this.department)}">${escapeHtml(name)}<i>${String(this.staff.filter((p) => name === "全部科室" || p.department === name).length).padStart(2, "0")}</i></button>`,
      )
      .join("");
  }

  private rows() {
    const query = this.query.toLowerCase();
    return this.staff.filter((person) => {
      if (
        this.department !== "全部科室" &&
        person.department !== this.department
      )
        return false;
      if (!query) return true;
      return `${person.name} ${person.en} ${person.department} ${person.position} ${presence[person.status][0]} ${person.records.join(" ")}`
        .toLowerCase()
        .includes(query);
    });
  }

  private renderRows() {
    const rows = this.rows();
    const body = this.root.querySelector<HTMLElement>("#personnel-rows")!;
    const empty = this.root.querySelector<HTMLElement>("#personnel-empty")!;
    body.innerHTML = rows
      .map(
        (person) => `<tr class="personnel-row" data-status="${person.status}">
        <td class="num id">${escapeHtml(person.id)}</td>
        <td class="name"><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.en)}${person.kind === "unit" ? " · 团体" : ""}</small></td>
        <td class="department">${escapeHtml(person.department)}</td>
        <td class="position">${escapeHtml(person.position)}</td>
        <td class="presence"><i></i>${presence[person.status][0]}<small>${presence[person.status][1]}</small></td>
        <td class="num records">${person.records.length ? person.records.map((id) => escapeHtml(id)).join(" ") : "—"}</td>
      </tr>`,
      )
      .join("");
    empty.hidden = rows.length > 0;
    this.root.querySelector<HTMLElement>("#personnel-count")!.textContent =
      `${String(rows.length).padStart(2, "0")} / ${this.staff.length} PERSONNEL`;
    const online = rows.filter((person) => person.status === "online").length;
    const busy = rows.filter((person) => person.status === "busy").length;
    this.root.querySelector("#personnel-summary")!.textContent =
      `在线 ${online} 人 · 忙碌 ${busy} 人 · 覆盖 ${new Set(rows.map((p) => p.department)).size} 个科室`;
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
    if (event.key === "Tab") {
      const elements = [
        ...this.root.querySelectorAll<HTMLElement>("button:not([disabled])"),
        ...this.root.querySelectorAll<HTMLElement>("input"),
      ];
      const first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }
}
