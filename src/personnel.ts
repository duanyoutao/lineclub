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
  status: "on-roll" | "field" | "leave";
  clearance: string;
  note: string;
  records: string[];
}

// Duty states of an institution, not the presence dots of a chat client: a
// roster records whether someone is on the books, out in the field or away.
const presence: Record<StaffRecord["status"], [string, string]> = {
  "on-roll": ["在编", "ON-ROLL"],
  field: ["外勤", "FIELD"],
  leave: ["休假", "ON LEAVE"],
};

// The record's own access level, glossed for the table. Both values come from
// personnel.json; nothing here is invented for the sake of the layout.
const access: Record<string, [string, string]> = {
  "REFERENCE AREA": ["可调阅", "REFERENCE"],
  "CATALOG ONLY": ["仅目录", "CATALOG"],
};
const accessLabel = (clearance: string) => access[clearance] ?? [clearance, ""];

// Columns the register can be ordered by, in header order.
type SortKey = "id" | "name" | "department" | "position" | "clearance" | "status" | "records";
const columns: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "id", label: "编目号 / INDEX", numeric: true },
  { key: "name", label: "姓名 / NAME" },
  { key: "department", label: "科室 / DEPARTMENT" },
  { key: "position", label: "职位 / POSITION" },
  { key: "clearance", label: "权限 / ACCESS" },
  { key: "status", label: "在编状态 / DUTY" },
  { key: "records", label: "关联档案 / FILES", numeric: true },
];
const dutyOrder: Record<StaffRecord["status"], number> = { "on-roll": 0, field: 1, leave: 2 };

/** Full-screen staff directory. Lifecycle mirrors the reading stage: siblings go
 *  inert, the overlay owns focus and Escape, and the exit finishes before focus
 *  returns to the opener. The register is a table plus a fold-out record, so a
 *  name can be read, selected and followed into the archive it belongs to. */
export class PersonnelOverlay {
  isOpen = false;
  private root: HTMLElement;
  private body: HTMLElement;
  private detail: HTMLElement;
  private opener?: HTMLElement | null;
  private siblings: { node: HTMLElement; inert: boolean }[] = [];
  private transitions: Animation[] = [];
  private closing = false;
  private transitionId = 0;
  private motion: MotionPreferences = fullMotion();
  private query = "";
  private department = "全部科室";
  private selectedId?: string;
  private sortKey: SortKey = "id";
  private sortDirection: 1 | -1 = 1;
  private staff: StaffRecord[] = directory.personnel as StaffRecord[];
  private departments: string[] = directory.departments;

  constructor(
    private parent: HTMLElement,
    private onClose: () => void,
    private onOpenRecord?: (id: string) => void,
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
      <div class="personnel-main">
        <div class="personnel-body" tabindex="0">
          <table class="personnel-table">
            <thead><tr id="personnel-head"></tr></thead>
            <tbody id="personnel-rows"></tbody>
          </table>
          <p class="personnel-empty" id="personnel-empty" hidden>没有匹配的人员。尝试其他姓名、科室或职位。</p>
        </div>
        <aside class="personnel-detail" id="personnel-detail" aria-label="编目详情" aria-live="polite"></aside>
      </div>
      <footer class="personnel-footer"><span>姓名取自档案的相关人物字段；职位、在编状态与科室编目为本终端的设定</span><span id="personnel-count"></span></footer>`;
    parent.appendChild(this.root);
    this.body = this.root.querySelector<HTMLElement>(".personnel-body")!;
    this.detail = this.root.querySelector<HTMLElement>("#personnel-detail")!;
    this.renderHead();
    this.renderFilters();
    const search =
      this.root.querySelector<HTMLInputElement>("#personnel-query")!;
    search.addEventListener("input", () => {
      this.query = search.value.trim();
      this.renderRows();
    });
    this.root.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const filter = target.closest<HTMLElement>("[data-department]")?.dataset
        .department;
      if (filter) {
        this.department = filter;
        this.renderFilters();
        this.renderRows();
        return;
      }
      const sort = target.closest<HTMLElement>("[data-sort]")?.dataset
        .sort as SortKey | undefined;
      if (sort) {
        this.sortDirection =
          sort === this.sortKey && this.sortDirection === 1 ? -1 : 1;
        this.sortKey = sort;
        this.renderHead();
        this.renderRows();
        return;
      }
      const record = target.closest<HTMLElement>("[data-record]")?.dataset
        .record;
      if (record) {
        this.onOpenRecord?.(record);
        return;
      }
      const row = target.closest<HTMLElement>("[data-person]")?.dataset.person;
      if (row) {
        this.select(row);
        return;
      }
      const action = target.closest<HTMLElement>("[data-personnel]")?.dataset
        .personnel;
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

  private renderHead() {
    this.root.querySelector("#personnel-head")!.innerHTML = columns
      .map(({ key, label, numeric }) => {
        const active = key === this.sortKey;
        const mark = active ? (this.sortDirection === 1 ? "▲" : "▼") : "";
        return `<th${numeric ? ' class="num"' : ""}><button type="button" data-sort="${key}" aria-pressed="${String(active)}">${label}<i aria-hidden="true">${mark}</i></button></th>`;
      })
      .join("");
  }

  private rows() {
    const query = this.query.toLowerCase();
    const filtered = this.staff.filter((person) => {
      if (
        this.department !== "全部科室" &&
        person.department !== this.department
      )
        return false;
      if (!query) return true;
      return `${person.name} ${person.en} ${person.department} ${person.position} ${presence[person.status][0]} ${person.clearance} ${person.records.join(" ")}`
        .toLowerCase()
        .includes(query);
    });
    const value = (person: StaffRecord) => {
      switch (this.sortKey) {
        case "name": return person.name;
        case "department": return person.department;
        case "position": return person.position;
        case "clearance": return person.clearance;
        case "status": return dutyOrder[person.status];
        case "records": return person.records.length;
        default: return person.id;
      }
    };
    return [...filtered].sort((a, b) => {
      const left = value(a), right = value(b);
      const order = typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), "zh");
      return order * this.sortDirection || a.id.localeCompare(b.id);
    });
  }

  /** Selects one record; the fold-out keeps showing it while the register is
   *  filtered, and falls back to the first visible row when it disappears. */
  private select(id: string, focusRow = false) {
    this.selectedId = id;
    this.root.querySelectorAll<HTMLElement>(".personnel-row").forEach((row) => {
      const current = row.dataset.person === id;
      row.classList.toggle("selected", current);
      row.setAttribute("aria-selected", String(current));
      if (current && focusRow) row.focus({ preventScroll: false });
    });
    this.renderDetail();
  }

  private renderDetail() {
    const person = this.visibleRow(this.selectedId);
    if (!person) {
      this.detail.innerHTML =
        '<p class="detail-empty">选择一条记录，查看完整编目与关联档案。</p>';
      return;
    }
    const [accessCn, accessEn] = accessLabel(person.clearance);
    const field = (label: string, value: string) =>
      `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`;
    this.detail.innerHTML = `
      <div class="detail-top"><span class="detail-index">${escapeHtml(person.id)}</span><span class="detail-kind">${person.kind === "unit" ? "机构 / UNIT" : "自然人 / PERSON"}</span></div>
      <h3>${escapeHtml(person.name)}<small>${escapeHtml(person.en)}</small></h3>
      <dl>
        ${field("科室 / DEPARTMENT", person.department)}
        ${field("职位 / POSITION", person.position)}
        ${field("权限 / ACCESS", `${accessCn} ${accessEn}`.trim())}
        ${field("在编状态 / DUTY", `${presence[person.status][0]} ${presence[person.status][1]}`)}
      </dl>
      <p class="detail-note">${escapeHtml(person.note)}</p>
      <div class="detail-records"><span>关联档案 / FILES<i>${String(person.records.length).padStart(2, "0")}</i></span><div>${
        person.records.length
          ? person.records.map((id) => `<button type="button" data-record="${escapeHtml(id)}">${escapeHtml(id)}<em>↗</em></button>`).join("")
          : "—"
      }</div></div>`;
  }

  private visibleRow(id?: string) {
    if (!id) return undefined;
    return this.rows().find((person) => person.id === id);
  }

  private renderRows() {
    const rows = this.rows();
    const body = this.root.querySelector<HTMLElement>("#personnel-rows")!;
    const empty = this.root.querySelector<HTMLElement>("#personnel-empty")!;
    // Units and people are two registers in one document, so each gets its own
    // section header instead of a footnote next to the English name.
    const section = (title: string, caption: string, list: StaffRecord[]) =>
      !list.length
        ? ""
        : `<tr class="personnel-section"><th colspan="7"><span>${title}</span><small>${caption}</small><i>${String(list.length).padStart(2, "0")}</i></th></tr>${list.map((person) => this.row(person)).join("")}`;
    body.innerHTML =
      section("在编人员", "PERSONNEL", rows.filter((p) => p.kind === "person")) +
      section("所属机构", "UNITS", rows.filter((p) => p.kind === "unit"));
    empty.hidden = rows.length > 0;
    this.root.querySelector<HTMLElement>("#personnel-count")!.textContent =
      `${String(rows.length).padStart(2, "0")} / ${this.staff.length} PERSONNEL`;
    const tally = (status: StaffRecord["status"]) =>
      rows.filter((person) => person.status === status).length;
    this.root.querySelector("#personnel-summary")!.textContent =
      `在编 ${tally("on-roll")} · 外勤 ${tally("field")} · 休假 ${tally("leave")} · 覆盖 ${new Set(rows.map((p) => p.department)).size} 个科室`;
    // Keep a selection on screen; a filtered-out record hands over to the first
    // row rather than leaving the fold-out describing something invisible.
    const current = this.visibleRow(this.selectedId);
    if (current) this.select(current.id);
    else if (rows.length) this.select(rows[0].id);
    else this.select("");
  }

  private row(person: StaffRecord) {
    const [accessCn, accessEn] = accessLabel(person.clearance);
    const selected = person.id === this.selectedId;
    return `<tr class="personnel-row${selected ? " selected" : ""}" data-status="${person.status}" data-person="${escapeHtml(person.id)}" aria-selected="${String(selected)}" tabindex="-1">
        <td class="num id">${escapeHtml(person.id)}</td>
        <td class="name"><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.en)}</small></td>
        <td class="department">${escapeHtml(person.department)}</td>
        <td class="position">${escapeHtml(person.position)}</td>
        <td class="clearance">${escapeHtml(accessCn)}<small>${escapeHtml(accessEn)}</small></td>
        <td class="presence"><i></i>${presence[person.status][0]}<small>${presence[person.status][1]}</small></td>
        <td class="num records">${person.records.length ? person.records.map((id) => escapeHtml(id)).join(" ") : "—"}</td>
      </tr>`;
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
      return;
    }
    // Rows are reached with the arrows, the way a register is read top to bottom.
    const typing = (event.target as HTMLElement | null)?.tagName === "INPUT";
    if (event.key === "/" && !typing) {
      event.preventDefault();
      this.root
        .querySelector<HTMLInputElement>("#personnel-query")
        ?.focus({ preventScroll: true });
      return;
    }
    if (typing) return;
    const rows = this.rows();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!rows.length) return;
      const at = rows.findIndex((person) => person.id === this.selectedId);
      const step = event.key === "ArrowDown" ? 1 : -1;
      const index = (((at < 0 ? 0 : at) + step) % rows.length + rows.length) % rows.length;
      this.select(rows[index].id, true);
      return;
    }
    if (event.key === "Enter") {
      const person = this.visibleRow(this.selectedId);
      if (!person?.records.length) return;
      // Enter follows the record into its first linked archive.
      event.preventDefault();
      this.onOpenRecord?.(person.records[0]);
    }
  }
}
