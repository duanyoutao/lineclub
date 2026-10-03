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
const linkMarkup = /\[([^\]\n]+)\]\((https?:\/\/[^\s)*`]+)\)/g;
// The array addresses documents as lane * 32 + row with rows starting at 12, so
// a column holds at most 20 documents before two of them claim the same slot.
const maxPerColumn = 20;
// Optional long-form chapters. Every figure must name a real file under
// public/media, so a broken image reference fails the build instead of the page.
const maxSections = 24;
const figurePattern =
  /^media\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpg|jpeg|png|gif|webp)$/;
// Optional per-document substrate artwork, kept apart from chapter figures.
const markPattern =
  /^marks\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpg|jpeg|png|gif|webp)$/;
const publicDir = fileURLToPath(new URL("../public/", import.meta.url));

/** Reports markup the renderer would otherwise show as literal text. */
function markupErrors(value, label, errors) {
  if (typeof value !== "string") return;
  if (
    (value.match(/\]\(/g) ?? []).length !==
    (value.match(linkMarkup) ?? []).length
  ) {
    errors.push(
      `${label}：超链接须写成 [文字](https://…) 形式，暂不支持其他链接写法`,
    );
  }
  if ((value.match(/`/g) ?? []).length % 2 !== 0) {
    errors.push(`${label}：反引号须成对出现，例如 \`代码\``);
  }
  if ((value.match(/\*\*/g) ?? []).length % 2 !== 0) {
    errors.push(`${label}：** 须成对出现，例如 **加粗**`);
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
        markupErrors(item, `${at}.${key}[${itemIndex}]`, errors),
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
          } else if (typeof figure.caption === "string") {
            markupErrors(figure.caption, `${where}.caption`, errors);
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
        markupErrors(finding, `${label}.findings[${findingIndex}]`, errors),
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
    if (record.substrate !== undefined) {
      if (!isText(record.substrate) || !markPattern.test(record.substrate)) {
        errors.push(
          `${label}.substrate：必须是 public/ 下 marks/ 目录中的图片路径`,
        );
      } else if (!existsSync(path.join(publicDir, record.substrate))) {
        errors.push(
          `${label}.substrate：找不到文件 public/${record.substrate}`,
        );
      }
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

/** Splits a record's `lead` field the way the directory does, so a person entry
 *  can be traced back to the archives that name them. */
export function leadNames(lead) {
  return String(lead)
    .split(/\s*(?:\/|／|、|,|，|&)\s*/)
    .map((token) => token.trim())
    .filter(Boolean);
}

const personnelFields = [
  "id",
  "name",
  "en",
  "kind",
  "department",
  "position",
  "status",
  "clearance",
  "note",
];
const personnelKinds = ["person", "unit"];
const personnelStatuses = ["on-roll", "field", "leave"];

/**
 * The directory is a second content file rather than a view over `records`: it
 * adds position and presence, which no archive field carries. Names and linked
 * archives are still checked against the shared content so the two files cannot
 * drift apart silently.
 */
export function validatePersonnel(personnel, content) {
  const errors = [];
  if (!personnel || typeof personnel !== "object" || Array.isArray(personnel)) {
    throw new Error("人员数据必须是 JSON 对象。");
  }
  const list = Array.isArray(personnel.personnel) ? personnel.personnel : [];
  if (!list.length) errors.push("personnel：至少需要一名人员");
  if (
    !Array.isArray(personnel.departments) ||
    !personnel.departments.length ||
    !personnel.departments.every(isText)
  ) {
    errors.push("departments：必须是非空科室名称数组");
  }
  const departments = new Set(
    Array.isArray(personnel.departments) ? personnel.departments : [],
  );
  const records = Array.isArray(content?.records) ? content.records : [];
  const recordIds = new Set(records.map((record) => record?.id));
  const archiveLeads = new Set(
    records.flatMap((record) => leadNames(record?.lead ?? "")),
  );
  const seenIds = new Set();
  const seenNames = new Set();
  list.forEach((person, index) => {
    const label = `personnel[${index}]`;
    if (!person || typeof person !== "object" || Array.isArray(person)) {
      errors.push(`${label}：必须是人员对象`);
      return;
    }
    for (const key of personnelFields) {
      if (!isText(person[key])) errors.push(`${label}.${key}：必须是非空文本`);
    }
    const expectedId = `P-${String(index + 1).padStart(3, "0")}`;
    if (person.id !== expectedId)
      errors.push(`${label}.id：应为 ${expectedId}，编号须按顺序保持稳定`);
    if (seenIds.has(person.id))
      errors.push(`${label}.id：重复编号 ${person.id}`);
    seenIds.add(person.id);
    if (seenNames.has(person.name))
      errors.push(`${label}.name：重复姓名 ${person.name}，请合并为一条`);
    seenNames.add(person.name);
    if (!personnelKinds.includes(person.kind))
      errors.push(`${label}.kind：只能是 ${personnelKinds.join(" 或 ")}`);
    if (!personnelStatuses.includes(person.status))
      errors.push(`${label}.status：只能是 ${personnelStatuses.join("、")}`);
    if (!departments.has(person.department))
      errors.push(
        `${label}.department：未在 departments 中声明 ${person.department}`,
      );
    // A directory entry with no archive behind it is either a typo or a record
    // waiting to be written; either way the catalogue should notice.
    if (archiveLeads.size && !archiveLeads.has(person.name))
      errors.push(
        `${label}.name：${person.name} 未出现在任何档案的 lead 字段中`,
      );
    if (person.records !== undefined && !Array.isArray(person.records))
      errors.push(`${label}.records：必须是档案编号数组`);
    for (const [position, id] of (person.records ?? []).entries()) {
      const where = `${label}.records[${position}]`;
      if (!isText(id)) {
        errors.push(`${where}：必须是非空文本`);
        continue;
      }
      if (!recordIds.has(id)) {
        errors.push(`${where}：找不到档案 ${id}`);
        continue;
      }
      const record = records.find((item) => item?.id === id);
      if (!leadNames(record.lead).includes(person.name))
        errors.push(`${where}：档案 ${id} 的 lead 字段中没有 ${person.name}`);
    }
  });
  if (errors.length)
    throw new Error(`人员数据校验失败：\n- ${errors.join("\n- ")}`);
  return personnel;
}

export async function loadPersonnel(content) {
  return validatePersonnel(
    JSON.parse(
      await fs.readFile(
        new URL("../content/personnel.json", import.meta.url),
        "utf8",
      ),
    ),
    content ?? (await loadContent()),
  );
}

/** Downloadable files are plain text, so markup is unwrapped and links keep
 *  their target visible. */
export function plainText(value) {
  return value
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(linkMarkup, (_, label, url) => `${label} (${url})`);
}

/** One chapter as downloadable plain text; figures keep their path visible. */
function sectionText(section) {
  const lines = [`【${section.heading}】`];
  for (const paragraph of section.paragraphs ?? [])
    lines.push(plainText(paragraph));
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
