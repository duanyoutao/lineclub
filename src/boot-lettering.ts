import artwork from "./boot-lettering-art.json";
import "./boot-lettering.css";
import { assetUrl } from "./asset-url";

declare const __RHINE_NOVECENTO__: boolean;
const letterings = new Set<BootLettering>();

/** Only a locally installed, licensed kit enables native webfont rendering. */
export async function loadBootWebfonts() {
  if (!__RHINE_NOVECENTO__) return false;
  const faces = ["Normal", "DemiBold", "Bold"].map(weight => new FontFace(
    `Rhine Novecento ${weight}`,
    `url("${assetUrl(`fonts/novecento/webFonts/NovecentoSansWide${weight}/font.woff2`)}") format("woff2")`,
    { weight: "400", style: "normal", display: "swap" },
  ));
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all(faces.map(face => face.load())),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("Novecento load timeout")), 8000); }),
    ]);
    faces.forEach(face => document.fonts.add(face));
    letterings.forEach(lettering => lettering.useWebfonts());
    return true;
  } catch (error) {
    console.warn("Novecento kit unavailable; retaining authored phrase graphics.", error);
    return false;
  } finally { clearTimeout(timeout); }
}

type PhraseKey = keyof typeof artwork;
const ns = "http://www.w3.org/2000/svg";

/** Width of one glyph in the licensed face, in em, measured once per character.
 *  The authored cells carry widths measured from the same font offline; a
 *  dynamic operator has to measure at runtime instead of being re-exported. */
const widths = new Map<string, number>();
function glyphWidth(character: string, family: string) {
  const key = `${family}:${character}`;
  const cached = widths.get(key);
  if (cached !== undefined) return cached;
  let width = 0.62;
  try {
    if (document.fonts.check(`1em ${family}`)) {
      const context = document.createElement("canvas").getContext("2d");
      if (context) {
        context.font = `1em ${family}`;
        width = context.measureText(character).width || width;
      }
    }
  } catch {}
  widths.set(key, width);
  return width;
}

/** Fixed phrase reveal cells, backed by licensed webfonts or authored artwork.
 *  A phrase may name a static prefix; anything typed after it is the operator,
 *  rendered from the same face instead of being baked into the reference. */
export class BootLettering {
  private label = document.createElement("span");
  private phrases: {
    key: PhraseKey;
    text: string;
    tail?: string;
    node: HTMLSpanElement;
    tailHost?: HTMLSpanElement;
    tailCells: HTMLSpanElement[];
    letters: HTMLSpanElement[];
    weight: string;
  }[];
  private value: string | undefined;
  private webfonts = false;

  constructor(
    private host: HTMLElement,
    keys: PhraseKey[],
    tails: Partial<Record<PhraseKey, string>> = {},
  ) {
    this.label.className = "boot-phrase-label";
    this.phrases = keys.map((key) => {
      const art = artwork[key];
      const node = document.createElement("span");
      node.className = "boot-phrase";
      node.dataset.phrase = key;
      node.dataset.weight = art.weight;
      node.setAttribute("aria-hidden", "true");
      node.hidden = true;
      const letters = art.letters.map((letter) => {
        const cell = document.createElement("span");
        cell.className = "boot-phrase-letter";
        cell.style.width = `${letter.width}em`;
        if (letter.path) {
          const svg = document.createElementNS(ns, "svg");
          svg.classList.add("boot-letter-art");
          svg.setAttribute("viewBox", `0 0 ${letter.width * art.units} ${art.units}`);
          svg.setAttribute("focusable", "false");
          const path = document.createElementNS(ns, "path");
          path.setAttribute("d", letter.path);
          svg.append(path);
          cell.append(svg);
        }
        node.append(cell);
        return cell;
      });
      return { key, text: art.text, tail: tails[key], node, letters, tailCells: [], weight: art.weight };
    });
    host.classList.add("has-boot-lettering");
    host.replaceChildren(this.label, ...this.phrases.map((p) => p.node));
    host.dataset.letteringRenderer = "artwork";
    letterings.add(this);
  }

  useWebfonts() {
    // Retain the measured cells and the reveal timeline. Only the glyph source
    // changes: actual WOFF2 text replaces each pre-authored SVG drawing.
    this.webfonts = true;
    for (const phrase of this.phrases) {
      phrase.node.style.setProperty("--boot-webfont-family", `"Rhine Novecento ${phrase.weight}"`);
      phrase.letters.forEach((letter, i) => {
        letter.replaceChildren();
        letter.dataset.letter = phrase.text[i];
        letter.classList.add("boot-font-letter");
      });
      // A tail built before the font arrived is rebuilt from the face.
      phrase.tailHost?.remove();
      phrase.tailHost = undefined;
      phrase.tailCells = [];
    }
    this.value = undefined;
    this.host.dataset.letteringRenderer = "webfont";
  }

  setText(value: string) {
    if (this.value === value) return;
    this.value = value;
    this.label.textContent = value;
    const authored = value ? this.phrases.find((p) => p.text.startsWith(value)) : undefined;
    // A different operator never matches an authored phrase; it continues from
    // the phrase's static prefix instead, so the reveal timeline is untouched.
    const phrase = authored ?? (value ? this.phrases.find((p) => p.tail && value.startsWith(p.tail)) : undefined);
    const tail = phrase && !authored && phrase.tail ? value.slice(phrase.tail.length) : "";
    // A new, unauthored phrase remains readable until its artwork is exported.
    this.host.classList.toggle("boot-lettering-fallback", Boolean(value && !phrase));
    for (const candidate of this.phrases) {
      const visible = candidate === phrase;
      if (candidate.node.hidden === visible) candidate.node.hidden = !visible;
      if (!visible) continue;
      const staticCells = tail ? candidate.tail!.length : value.length;
      candidate.letters.forEach((letter, i) => {
        const hidden = i >= staticCells;
        if (letter.hidden !== hidden) letter.hidden = hidden;
      });
      this.renderTail(candidate, tail);
    }
  }

  /** The operator run: measured glyph cells with the licensed kit, plain text
   *  without it, since the authored artwork only covers the reference name. */
  private renderTail(phrase: (typeof this.phrases)[number], tail: string) {
    if (!tail) {
      if (phrase.tailHost) phrase.tailHost.hidden = true;
      delete phrase.node.dataset.tail;
      return;
    }
    phrase.node.dataset.tail = tail.length > 15 ? "long" : tail.length > 11 ? "medium" : "short";
    const reuse = this.webfonts ? phrase.tailCells.length >= tail.length : Boolean(phrase.tailHost);
    if (phrase.tailHost && reuse) {
      phrase.tailHost.hidden = false;
      if (this.webfonts) {
        phrase.tailCells.forEach((cell, i) => {
          cell.hidden = i >= tail.length;
          if (cell.hidden) return;
          const character = tail[i];
          if (cell.dataset.letter !== character) {
            cell.dataset.letter = character;
            cell.style.width = `${glyphWidth(character, `"Rhine Novecento ${phrase.weight}"`)}em`;
          }
        });
      } else {
        phrase.tailHost.textContent = tail;
      }
      return;
    }
    phrase.tailHost?.remove();
    const host = document.createElement("span");
    host.className = "boot-phrase-tail";
    phrase.tailCells = [];
    if (this.webfonts) {
      for (const character of tail) {
        const cell = document.createElement("span");
        cell.className = "boot-phrase-letter boot-font-letter";
        cell.dataset.letter = character;
        cell.style.width = `${glyphWidth(character, `"Rhine Novecento ${phrase.weight}"`)}em`;
        host.append(cell);
        phrase.tailCells.push(cell);
      }
    } else {
      host.textContent = tail;
    }
    phrase.node.append(host);
    phrase.tailHost = host;
  }
}
