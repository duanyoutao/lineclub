import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  loadContent,
  validateContent,
  archiveText,
} from "./archive-content.mjs";
import { escapeHtml, richText } from "../src/html.ts";

const content = await loadContent();
test("all downloads match the shared content, including the UTF-8 BOM", async () => {
  for (const record of content.records) {
    assert.equal(
      (
        await readFile(
          new URL(
            `../public/archives/RHINE-LAB-${record.id}.txt`,
            import.meta.url,
          ),
          "utf8",
        )
      ).replace(/\r\n/g, "\n"),
      archiveText(record),
    );
  }
});

const invalidCases = [
  [
    "missing title",
    (c) => {
      delete c.records[0].title;
    },
    /records\[0\].title/,
  ],
  [
    "blank abstract",
    (c) => {
      c.records[0].abstract = "  ";
    },
    /abstract/,
  ],
  [
    "duplicate ID",
    (c) => {
      c.records[1].id = "X-001";
    },
    /重复编号/,
  ],
  [
    "reordered ID",
    (c) => {
      [c.records[0], c.records[1]] = [c.records[1], c.records[0]];
    },
    /X-001/,
  ],
  [
    "unknown category",
    (c) => {
      c.records[0].category = "未知";
    },
    /未知分类/,
  ],
  [
    "empty column",
    (c) => {
      c.records.forEach((record) => {
        if (record.category === c.columns[0]) record.category = c.columns[1];
      });
    },
    /1 至 20 份档案/,
  ],
  [
    "overfull column",
    (c) => {
      const source = c.records.find((r) => r.category === c.columns[0]);
      for (let i = 0; i < 13; i++)
        c.records.push({
          ...source,
          id: `X-${String(c.records.length + 1).padStart(3, "0")}`,
        });
    },
    /1 至 20 份档案/,
  ],
  [
    "unsafe findings link",
    (c) => {
      c.records[0].findings[0] = "入口见 [用量页](javascript:alert(1))。";
    },
    /超链接须写成/,
  ],
  [
    "null record",
    (c) => {
      c.records[0] = null;
    },
    /必须是档案对象/,
  ],
  [
    "empty findings",
    (c) => {
      c.records[0].findings = [];
    },
    /findings/,
  ],
  [
    "non-text findings",
    (c) => {
      c.records[0].findings = [42];
    },
    /findings/,
  ],
  [
    "unsafe URL",
    (c) => {
      c.records[0].source = "javascript:alert(1)";
    },
    /HTTPS/,
  ],
  [
    "invalid URL",
    (c) => {
      c.records[0].source = "example.com";
    },
    /HTTPS/,
  ],
  [
    "duplicate categories",
    (c) => {
      c.categories[1] = c.categories[0];
    },
    /不能重复/,
  ],
  [
    "reserved category",
    (c) => {
      c.categories[0] = "全部档案";
    },
    /全部档案/,
  ],
  [
    "mismatched columns",
    (c) => {
      c.columns[0] = "其他";
    },
    /相同的五个分类/,
  ],
];
for (const [name, mutate, error] of invalidCases) {
  test(`rejects ${name}`, () => {
    const invalid = structuredClone(content);
    mutate(invalid);
    assert.throws(() => validateContent(invalid), error);
  });
}
test("accepts independent filter and column order", () => {
  const edited = structuredClone(content);
  edited.categories.reverse();
  assert.equal(validateContent(edited), edited);
});
test("plain-text punctuation stays literal in HTML and downloadable text", () => {
  const title = `<玻璃> & "实验" 'A'`;
  const edited = structuredClone(content);
  edited.records[0].title = title;
  validateContent(edited);
  assert.equal(
    escapeHtml(title),
    "&lt;玻璃&gt; &amp; &quot;实验&quot; &#39;A&#39;",
  );
  assert.ok(archiveText(edited.records[0]).includes(title));
});
test("findings links render as links in the page and stay readable in downloads", () => {
  const sample =
    "用量与计费入口见 [API 平台用量](https://platform.deepseek.com/usage)。";
  assert.ok(
    richText(sample).includes(
      '<a href="https://platform.deepseek.com/usage" target="_blank" rel="noopener">API 平台用量</a>',
    ),
  );
  assert.ok(
    archiveText({ ...content.records[0], findings: [sample] }).includes(
      "API 平台用量 (https://platform.deepseek.com/usage)",
    ),
  );
});
test("only http and https targets become anchors", () => {
  const unsafe = richText("[点我](javascript:alert(1))");
  assert.ok(!unsafe.includes("<a "));
  assert.ok(unsafe.includes("javascript:alert(1)"));
  const injected = richText('[点我](https://a.test/"onmouseover="alert(1))');
  assert.ok(!injected.includes('"onmouseover="'));
});
