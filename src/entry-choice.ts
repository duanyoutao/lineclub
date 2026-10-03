import { escapeHtml } from "./html";
import { fullMotion, type MotionPreferences } from "./motion-preferences";
import "./entry-choice.css";

export type EntryTarget = "archive" | "personnel";

/**
 * The two destinations the terminal offers once the opening has finished. It is
 * a transition surface, not navigation: it owns focus while visible and always
 * resolves to one of the two directories, so the array is never left half-open.
 */
export class EntryChoice {
  isOpen = false;
  private root: HTMLElement;
  private transitions: Animation[] = [];
  private closing = false;
  private transitionId = 0;
  private motion: MotionPreferences = fullMotion();

  constructor(
    private parent: HTMLElement,
    private onPick: (target: EntryTarget) => void,
  ) {
    this.root = document.createElement("section");
    this.root.className = "entry-choice";
    this.root.hidden = true;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-label", "选择要进入的目录");
    this.root.innerHTML = `
      <div class="entry-choice-inner">
        <p class="entry-choice-kicker">RHINE LAB / INTERNAL DATABASE</p>
        <h2 class="entry-choice-title">选择要进入的目录</h2>
        <div class="entry-choice-options">
          <button class="entry-choice-option" data-entry="archive">
            <span class="entry-choice-index">01</span>
            <span class="entry-choice-body"><strong>档案表</strong><small>ARCHIVE DIRECTORY</small><em>五列循环档案阵列 · 抽取与解密</em></span>
            <span class="entry-choice-mark">→</span>
          </button>
          <button class="entry-choice-option" data-entry="personnel">
            <span class="entry-choice-index">02</span>
            <span class="entry-choice-body"><strong>人员表</strong><small>PERSONNEL DIRECTORY</small><em>科室与职位 · 在线状态 · 关联档案</em></span>
            <span class="entry-choice-mark">→</span>
          </button>
        </div>
        <p class="entry-choice-hint">方向键选择 · <kbd>ENTER</kbd> 进入 · <kbd>ESC</kbd> 默认进入档案表</p>
      </div>`;
    parent.appendChild(this.root);
    this.root.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-entry]",
      )?.dataset.entry as EntryTarget | undefined;
      if (target) this.pick(target);
    });
    this.root.addEventListener("keydown", (event) => this.keydown(event));
  }

  setMotion(value: MotionPreferences) {
    this.motion = { ...value };
    this.root.dataset.motion = value.surfaceTransitions ? "full" : "reduced";
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.closing = false;
    this.root.hidden = false;
    this.root.dataset.transition = "opening";
    this.highlight(0);
    this.enter();
    requestAnimationFrame(() => {
      if (this.isOpen && !this.closing)
        this.root.querySelector<HTMLElement>(".entry-choice-option")?.focus({
          preventScroll: true,
        });
    });
  }

  private pick(target: EntryTarget) {
    if (!this.isOpen || this.closing) return;
    this.closing = true;
    const ticket = ++this.transitionId;
    this.transitions.forEach((animation) => animation.cancel());
    this.transitions = [];
    if (!this.motion.surfaceTransitions) {
      this.finish(target);
      return;
    }
    const fade = this.root.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 200,
      easing: "cubic-bezier(0.4, 0, 1, 1)",
      fill: "forwards",
    });
    this.transitions.push(fade);
    void fade.finished
      .then(() => {
        if (ticket === this.transitionId) this.finish(target);
      })
      .catch(() => {
        if (ticket === this.transitionId) this.finish(target);
      });
  }

  private finish(target: EntryTarget) {
    this.isOpen = false;
    this.closing = false;
    this.root.hidden = true;
    this.root.dataset.transition = "closed";
    this.transitions.forEach((animation) => animation.cancel());
    this.transitions = [];
    this.onPick(target);
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
      duration: 300,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    });
    this.transitions.push(fade);
    for (const [selector, delay] of [
      [".entry-choice-kicker", 40],
      [".entry-choice-title", 90],
      [".entry-choice-option", 150],
      [".entry-choice-hint", 220],
    ] as const) {
      const element = this.root.querySelector<HTMLElement>(selector)!;
      this.transitions.push(
        element.animate(
          [
            { opacity: 0, translate: "0 12px" },
            { opacity: 1, translate: "0 0" },
          ],
          {
            duration: 320,
            delay,
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

  private options() {
    return [...this.root.querySelectorAll<HTMLElement>(".entry-choice-option")];
  }

  private highlight(index: number) {
    const options = this.options();
    if (!options.length) return;
    const wrapped = (index + options.length) % options.length;
    options.forEach((option, position) =>
      option.setAttribute("aria-current", String(position === wrapped)),
    );
    options[wrapped].focus({ preventScroll: true });
  }

  private focusedIndex() {
    const options = this.options();
    return Math.max(
      0,
      options.findIndex((option) => option === document.activeElement),
    );
  }

  private keydown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      this.pick("archive");
      return;
    }
    if (this.closing) {
      event.preventDefault();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      this.highlight(this.focusedIndex() + 1);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      this.highlight(this.focusedIndex() - 1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.pick(
        (this.options()[this.focusedIndex()]?.dataset.entry as EntryTarget) ??
          "archive",
      );
    }
  }
}
