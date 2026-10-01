import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const requiredFields = [
  "id",
  "title",
  "en",
  "department",
  "category",
  "date",
  "lead",
  "clearance",
  "abstract",
  "source",
];
const isText = (value) => typeof value === "string" && value.trim().length > 0;
/**
 * Mirrors LINK_MARKUP in src/html.ts, which renders the same markup as links in
 * the page. This module stays importable without Node's type stripping, so the
 * pattern is duplicated rather than imported; check-content.mjs keeps the two in
 * step by exercising both renderers on the same sample.
 */
const linkMarkup = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
// The array addresses documents as lane * 32 + row with rows starting at 12, so
// a column holds at most 20 documents before two of them claim the same slot.
const maxPerColumn = 20;
// Optional long-form chapters. Every figure must name a real file under
// public/media, so a broken image reference fails the build instead of the page.
const maxSections = 24;
const figurePattern =
  /^media\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpg|jpeg|png|gif|webp)$/;
const publicDir = fileURLToPath(new URL("../public/", import.meta.url));

/** Reports link markup that the renderer would otherwise show as literal text. */
function linkErrors(value, label, errors) {
  if (typeof value !== "string") return;
  if (
    (value.match(/\]\(/g) ?? []).length !== (value.match(linkMarkup) ?? []).length
  ) {
    errors.push(
      `${label}：超链接须写成 [文字](https://…) 形式，暂不支持其他链接写法`,
    );
  }
}

function validateSections(sections, label, errors) {
  if (!Array.isArray(sections) || sections.length === 0) {
    errors.push(`${label}.sections：必须是至少一章的数组`);
    return;
  }
  if (sections.length > maxSections) {
    errors.push(`${label}.sections：最多 ${maxSections} 章`);
    return;
  }
  sections.forEach((section, index) => {
    const at = `${label}.sections[${index}]`;
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      errors.push(`${at}：必须是章节对象`);
      return;
    }
    if (!isText(section.heading)) errors.push(`${at}.heading：必须是非空文本`);
    let filled = 0;
    for (const key of ["paragraphs", "points"]) {
      const list = section[key];
      if (list === undefined) continue;
      if (!Array.isArray(list) || list.length === 0 || !list.every(isText)) {
        errors.push(`${at}.${key}：必须是非空文本数组`);
        continue;
      }
      filled++;
      list.forEach((item, itemIndex) =>
        linkErrors(item, `${at}.${key}[${itemIndex}]`, errors),
      );
    }
    if (section.figures !== undefined) {
      if (!Array.isArray(section.figures) || section.figures.length === 0) {
        errors.push(`${at}.figures：必须是非空数组`);
      } else {
        filled++;
        section.figures.forEach((figure, figureIndex) => {
          const where = `${at}.figures[${figureIndex}]`;
          if (!figure || typeof figure !== "object" || Array.isArray(figure)) {
            errors.push(`${where}：必须是图片对象`);
            return;
          }
          if (!isText(figure.src) || !figurePattern.test(figure.src)) {
            errors.push(
              `${where}.src：必须是 public/ 下 media/ 目录中的图片路径`,
            );
          } else if (!existsSync(path.join(publicDir, figure.src))) {
            errors.push(`${where}.src：找不到文件 public/${figure.src}`);
          }
          if (figure.caption !== undefined && !isText(figure.caption)) {
            errors.push(`${where}.caption：填写时必须是非空文本`);
          }
        });
      }
    }
    if (!filled) {
      errors.push(`${at}：每章至少要有 paragraphs、points 或 figures 之一`);
    }
  });
}

export function validateContent(content) {
  const errors = [];
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    throw new Error("档案数据必须是 JSON 对象。");
  }
  for (const key of ["categories", "columns"]) {
    const names = content[key];
    if (!Array.isArray(names) || names.length !== 5 || !names.every(isText)) {
      errors.push(`${key}：必须包含五个非空分类名称`);
    } else if (new Set(names).size !== 5 || names.includes("全部档案")) {
      errors.push(`${key}：分类名称不能重复，也不能使用“全部档案”`);
    }
  }
  const categories = Array.isArray(content.categories)
    ? content.categories
    : [];
  const columns = Array.isArray(content.columns) ? content.columns : [];
  if (
    categories.some((name) => !columns.includes(name)) ||
    columns.some((name) => !categories.includes(name))
  ) {
    errors.push("categories 与 columns 必须包含相同的五个分类（顺序可以不同）");
  }
  const records = Array.isArray(content.records) ? content.records : [];
  const ids = new Set();
  records.forEach((record, index) => {
    const label = `records[${index}]`;
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      errors.push(`${label}：必须是档案对象`);
      return;
    }
    for (const key of requiredFields) {
      if (!isText(record[key])) errors.push(`${label}.${key}：必须是非空文本`);
    }
    const expectedId = `X-${String(index + 1).padStart(3, "0")}`;
    if (record.id !== expectedId)
      errors.push(`${label}.id：应为 ${expectedId}，编号须按顺序保持稳定`);
    if (ids.has(record.id)) errors.push(`${label}.id：重复编号 ${record.id}`);
    ids.add(record.id);
    if (!categories.includes(record.category))
      errors.push(`${label}.category：未知分类 ${record.category}`);
    if (
      !Array.isArray(record.findings) ||
      record.findings.length === 0 ||
      !record.findings.every(isText)
    ) {
      errors.push(`${label}.findings：必须包含至少一条非空研究记录`);
    }
    if (Array.isArray(record.findings)) {
      record.findings.forEach((finding, findingIndex) =>
        linkErrors(finding, `${label}.findings[${findingIndex}]`, errors),
      );
    }
    try {
      const url = new URL(record.source);
      if (!["https:", "http:"].includes(url.protocol)) throw new Error();
    } catch {
      errors.push(`${label}.source：必须是有效的 HTTP 或 HTTPS 链接`);
    }
    if (record.sections !== undefined) {
      validateSections(record.sections, label, errors);
    }
  });
  for (const name of columns) {
    const count = records.filter((record) => record?.category === name).length;
    if (count < 1 || count > maxPerColumn) {
      errors.push(
        `分类“${name}”：当前阵列要求 1 至 ${maxPerColumn} 份档案，现有 ${count} 份`,
      );
    }
  }
  if (errors.length)
    throw new Error(`档案数据校验失败：\n- ${errors.join("\n- ")}`);
  return content;
}

export async function loadContent() {
  return validateContent(
    JSON.parse(
      await fs.readFile(
        new URL("../content/archives.json", import.meta.url),
        "utf8",
      ),
    ),
  );
}

/** Downloadable files are plain text, so a link keeps its target visible. */
export function plainText(value) {
  return value.replace(linkMarkup, (_, label, url) => `${label} (${url})`);
}

/** One chapter as downloadable plain text; figures keep their path visible. */
function sectionText(section) {
  const lines = [`【${section.heading}】`];
  for (const paragraph of section.paragraphs ?? []) lines.push(plainText(paragraph));
  for (const point of section.points ?? []) lines.push(`· ${plainText(point)}`);
  for (const figure of section.figures ?? []) {
    lines.push(
      `［图］${figure.caption ? plainText(figure.caption) : "未命名"}（${figure.src}）`,
    );
  }
  return lines.join("\n");
}

export function archiveText(r) {
  const chapters = r.sections?.length
    ? `\n\n${r.sections.map(sectionText).join("\n\n")}`
    : "";
  return `\uFEFFRHINE LAB · INTERNAL DATABASE\nFILE ${r.id} / ${r.title}\n${r.en}\n\n科室：${r.department}\n编目范围：${r.date}\n相关人物：${r.lead}\n访问范围：${r.clearance}\n\n${r.abstract}\n\n研究记录\n${r.findings.map((f, i) => `${i + 1}. ${plainText(f)}`).join("\n")}${chapters}\n\n设定参考：${r.source}\n本文为基于公开设定的档案式改写，非游戏原文。\n`;
}
