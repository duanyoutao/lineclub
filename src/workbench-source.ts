import assignments from "../content/assignments.json" with { type: "json" };
import type { Session } from "./login";
import {
  defaultWorkbenchVisibility,
  workbenchElements,
  type WorkbenchElement,
  type WorkbenchVisibility,
} from "./workbench-visibility";

/**
 * The web terminal's own workbench data.
 *
 * The wallpaper host hands the bench its queue, its timer length and its
 * switches as properties. Nothing does that in a browser, so this is the same
 * bag assembled from local storage plus the signed-in account's own schedule —
 * emitted on the same event, which keeps one renderer for both hosts.
 *
 * Two deliberate differences from the host build: there is no media lane at all
 * (a browser cannot see other applications' playback), and the schedule keeps
 * its fictional "MM-DD HH:MM" wording while being projected onto the next real
 * occurrence, so the countdown still runs against the machine's own clock.
 */
const KEY = "rhine-workbench-web-v1";
const MAX_TASK = 60;
const SLOT = /^(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

type Stored = { tasks: string[]; focus: number; rest: number; show: WorkbenchVisibility };

const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;

const stamp = (time: number) => {
  const date = new Date(time);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export class WorkbenchSource {
  private tasks: string[] = ["", "", ""];
  private focus = 25;
  private rest = 5;
  private show: WorkbenchVisibility = defaultWorkbenchVisibility();
  private session?: Session;

  constructor() {
    this.load();
  }

  private load() {
    let saved: Partial<Stored> | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    } catch {
      saved = null;
    }
    if (Array.isArray(saved?.tasks)) {
      this.tasks = [0, 1, 2].map((i) => {
        const value = saved!.tasks![i];
        return typeof value === "string" ? value.slice(0, MAX_TASK) : "";
      });
    }
    this.focus = clamp(saved?.focus, 1, 120, 25);
    this.rest = clamp(saved?.rest, 1, 60, 5);
    if (saved?.show && typeof saved.show === "object") {
      for (const [key] of workbenchElements) {
        const value = (saved.show as Partial<WorkbenchVisibility>)[key];
        if (typeof value === "boolean") this.show[key] = value;
      }
    }
  }

  private save() {
    const stored: Stored = { tasks: this.tasks, focus: this.focus, rest: this.rest, show: this.show };
    try {
      localStorage.setItem(KEY, JSON.stringify(stored));
    } catch {
      // A locked-down profile keeps the session's values and loses them on
      // reload, which is the same bargain the host build makes.
    }
  }

  state() {
    return { tasks: [...this.tasks], focus: this.focus, rest: this.rest, show: { ...this.show } };
  }

  setTask(index: number, text: string) {
    if (index < 0 || index > 2) return;
    this.tasks[index] = text.replace(/\s+/g, " ").trim().slice(0, MAX_TASK);
    this.save();
    this.publish();
  }

  setMinutes(phase: "focus" | "break", value: number) {
    if (phase === "focus") this.focus = clamp(value, 1, 120, this.focus);
    else this.rest = clamp(value, 1, 60, this.rest);
    this.save();
    this.publish();
  }

  setVisibility(element: WorkbenchElement, value: boolean) {
    if (!(element in this.show)) return;
    this.show[element] = value;
    this.save();
    this.publish();
  }

  setSession(session?: Session) {
    this.session = session;
    this.publish();
  }

  /** The account's next slot on the real calendar: the data keeps its fictional
   *  wording, only the display decides which occurrence is coming. */
  private nextAppointment() {
    const account = this.session?.account;
    if (!account) return undefined;
    const now = Date.now();
    let best: { title: string; at: string; time: number } | undefined;
    for (const slot of assignments.appointments as { account: string; title: string; at: string }[]) {
      if (slot.account !== account) continue;
      const parts = SLOT.exec(slot.at);
      if (!parts) continue;
      const [, month, day, hour, minute] = parts.map(Number) as unknown as number[];
      const year = new Date(now).getFullYear();
      let time = new Date(year, month - 1, day, hour, minute).getTime();
      if (time < now) time = new Date(year + 1, month - 1, day, hour, minute).getTime();
      if (!best || time < best.time) best = { title: slot.title, at: stamp(time), time };
    }
    return best;
  }

  /** One properties bag, the same shape the wallpaper host writes. */
  publish() {
    const appointment = this.nextAppointment();
    const detail: Record<string, { value: unknown }> = {
      enabletime: { value: true },
      enabletasks: { value: true },
      enableevent: { value: true },
      // No system media session is visible to a page, so the lane is not offered.
      enablemedia: { value: false },
      enablefocus: { value: true },
      focusminutes: { value: this.focus },
      breakminutes: { value: this.rest },
      eventname: { value: appointment?.title ?? "" },
      eventdate: { value: appointment?.at ?? "" },
    };
    this.tasks.forEach((task, index) => (detail[`task${index + 1}`] = { value: task }));
    for (const [key] of workbenchElements) detail[`show${key}`] = { value: this.show[key] };
    window.dispatchEvent(new CustomEvent("rhine-wallpaper-properties", { detail }));
  }
}
