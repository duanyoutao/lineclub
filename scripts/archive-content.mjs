import fs from "node:fs/promises";

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
      for (const finding of record.findings) {
        if (typeof finding !== "string") continue;
        if (
          (finding.match(/\]\(/g) ?? []).length !==
          (finding.match(linkMarkup) ?? []).length
        ) {
          errors.push(
            `${label}.findings：超链接须写成 [文字](https://…) 形式，暂不支持其他链接写法`,
          );
        }
      }
    }
    try {
      const url = new URL(record.source);
      if (!["https:", "http:"].includes(url.protocol)) throw new Error();
    } catch {
      errors.push(`${label}.source：必须是有效的 HTTP 或 HTTPS 链接`);
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

export function archiveText(r) {
  return `\uFEFFRHINE LAB · INTERNAL DATABASE\nFILE ${r.id} / ${r.title}\n${r.en}\n\n科室：${r.department}\n编目范围：${r.date}\n相关人物：${r.lead}\n访问范围：${r.clearance}\n\n${r.abstract}\n\n研究记录\n${r.findings.map((f, i) => `${i + 1}. ${plainText(f)}`).join("\n")}\n\n设定参考：${r.source}\n本文为基于公开设定的档案式改写，非游戏原文。\n`;
}
