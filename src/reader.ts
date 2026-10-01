import { escapeHtml, richText } from "./html";
import { fullMotion, type MotionPreferences } from "./motion-preferences";
import "./reader.css";

/** The fields the reading stage needs; an ArchiveRecord satisfies this. */
export interface ReadableRecord {
  id: string;
  title: string;
  en: string;
  department: string;
  category: string;
  date: string;
  lead: string;
  clearance: string;
  abstract: string;
  findings: string[];
}

const scales = [0.9, 1, 1.12, 1.28, 1.45, 1.65];
const scaleKey = "rhine-reader-v1";

/**
 * Full-screen reading stage for one archive. The detail panel stays the cover;
 * this is the document. Lifecycle mirrors the model viewer: siblings go inert,
 * the overlay owns focus and Escape, and the visible exit completes before
 * focus returns to the opener.
 */
export class ReadingOverlay {
  isOpen = false;
  private root: HTMLElement;
  private body: HTMLElement;
  private opener?: HTMLElement | null;
  private siblings: { node: HTMLElement; inert: boolean }[] = [];
  private transitions: Animation[] = [];
  private closing = false;
  private transitionId = 0;
  private scale = 1;
  private motion: MotionPreferences = fullMotion();

  constructor(
    private parent: HTMLElement,
    private onClose: () => void,
  ) {
    try {
      const saved = Number(localStorage.getItem(scaleKey));
      if (Number.isInteger(saved) && saved >= 0 && saved < scales.length)
        this.scale = scales[saved];
    } catch {}
    this.root = document.createElement("section");
    this.root.className = "reader";
    this.root.hidden = true;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-labelledby", "reader-title");
    this.root.innerHTML = `
      <div class="reader-progress" aria-hidden="true"><i></i></div>
      <header class="reader-header">
        <div class="reader-row">
          <button class="reader-back" data-reader="close">← <span>返回档案</span><kbd>ESC</kbd></button>
          <div class="reader-zoom" role="group" aria-label="正文字号"><button data-reader="smaller" aria-label="减小正文字号">A−</button><button data-reader="larger" aria-label="增大正文字号">A＋</button></div>
        </div>
        <div class="reader-heading"><span>RHINE LAB / DOCUMENT READ</span><h2 id="reader-title"></h2><p id="reader-file"></p></div>
      </header>
      <div class="reader-body" tabindex="0"><dl class="reader-meta" id="reader-meta"></dl><article class="reader-doc" id="reader-doc"></article></div>
      <footer class="reader-footer"><span class="reader-hint">滚轮或方向键滚动 · ESC 返回档案</span><button class="reader-top" data-reader="top">回到顶部 <span>↗</span></button></footer>`;
    parent.appendChild(this.root);
    this.body = this.root.querySelector<HTMLElement>(".reader-body")!;
    this.body.addEventListener("scroll", () => this.progress());
    this.root.addEventListener("click", (event) => {
      if (this.closing) return;
      const action = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-reader]",
      )?.dataset.reader;
      if (action === "close") this.close();
      if (action === "top")
        this.body.scrollTo({
          top: 0,
          behavior: this.motion.surfaceTransitions ? "smooth" : "auto",
        });
      if (action === "smaller") this.zoom(-1);
      if (action === "larger") this.zoom(1);
    });
    this.root.addEventListener("keydown", (event) => this.keydown(event));
  }

  setMotion(value: MotionPreferences) {
    this.motion = { ...value };
    this.root.dataset.motion = value.surfaceTransitions ? "full" : "reduced";
  }

  open(record: ReadableRecord) {
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
    this.render(record);
    this.applyScale();
    this.body.scrollTop = 0;
    this.progress();
    this.body.focus({ preventScroll: true });
    this.enter();
  }

  close() {
    if (!this.isOpen || this.closing) return;
    this.closing = true;
    const ticket = ++this.transitionId;
    // Capture the current fade when Escape interrupts the entrance.
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
    for (const selector of [".reader-header", ".reader-footer"]) {
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

  private render(record: ReadableRecord) {
    this.root.querySelector("#reader-title")!.textContent = record.title;
    this.root.querySelector("#reader-file")!.textContent =
      `FILE ${record.id} / ${record.category}`;
    const meta: [string, string][] = [
      ["DEPARTMENT / 科室", record.department],
      ["COLLECTION / 编目范围", record.date],
      ["RELATED / 相关人物", record.lead],
      [
        "STATUS / 状态",
        record.clearance === "RESTRICTED" ? "目录访问" : "已归档 · 可读取",
      ],
    ];
    this.root.querySelector("#reader-meta")!.innerHTML = meta
      .map(
        ([label, value]) =>
          `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`,
      )
      .join("");
    this.root.querySelector("#reader-doc")!.innerHTML = `
      <section class="reader-section"><div class="reader-label">ABSTRACT / 摘要</div><p>${richText(record.abstract)}</p></section>
      <section class="reader-section"><div class="reader-label">RESEARCH NOTES / 研究记录</div><ol class="reader-notes">${record.findings
        .map(
          (finding, index) =>
            `<li><span>${String(index + 1).padStart(2, "0")}</span><p>${richText(finding)}</p></li>`,
        )
        .join("")}</ol></section>`;
  }

  private zoom(step: number) {
    const next = Math.min(
      scales.length - 1,
      Math.max(0, scales.indexOf(this.scale) + step),
    );
    this.scale = scales[next];
    this.applyScale();
    try {
      localStorage.setItem(scaleKey, String(next));
    } catch {}
  }

  private applyScale() {
    this.root.style.setProperty("--reader-scale", String(this.scale));
  }

  private progress() {
    const max = this.body.scrollHeight - this.body.clientHeight;
    const ratio =
      max > 0 ? Math.min(1, Math.max(0, this.body.scrollTop / max)) : 1;
    this.root.style.setProperty("--reader-progress", String(ratio));
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
