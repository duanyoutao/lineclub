import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  loadContent,
  loadPersonnel,
  validateContent,
  validatePersonnel,
  archiveText,
  leadNames,
  plainText,
} from "./archive-content.mjs";
import { escapeHtml, richBlocks, richText } from "../src/html.ts";

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
    "missing figure file",
    (c) => {
      const record = c.records.find((r) => r.sections);
      record.sections[0].figures[0].src = "media/does-not-exist.jpg";
    },
    /找不到文件/,
  ],
  [
    "figure outside media",
    (c) => {
      const record = c.records.find((r) => r.sections);
      record.sections[0].figures[0].src = "../../secrets.jpg";
    },
    /media\/ 目录/,
  ],
  [
    "chapter without content",
    (c) => {
      const section = c.records.find((r) => r.sections).sections[0];
      delete section.paragraphs;
      delete section.points;
      delete section.figures;
    },
    /每章至少要有/,
  ],
  [
    "unclosed backtick",
    (c) => {
      c.records[0].findings[0] = "这里的 ` 没有闭合。";
    },
    /反引号须成对/,
  ],
  [
    "unclosed bold marker",
    (c) => {
      c.records[0].findings[0] = "**重点没有闭合。";
    },
    /\*\* 须成对/,
  ],
  [
    "substrate outside marks",
    (c) => {
      c.records.find((r) => r.substrate).substrate = "../secrets.png";
    },
    /marks\/ 目录/,
  ],
  [
    "missing substrate file",
    (c) => {
      c.records.find((r) => r.substrate).substrate = "marks/does-not-exist.png";
    },
    /找不到文件/,
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
const personnel = await loadPersonnel(content);
const credentials = JSON.parse(
  await readFile(new URL("../content/credentials.json", import.meta.url), "utf8"),
);
test("every person has a usable sign-in account", () => {
  assert.equal(credentials.length, personnel.personnel.length);
  const byAccount = new Map(credentials.map((row) => [row.account, row]));
  assert.equal(byAccount.size, credentials.length, "账号必须唯一");
  assert.equal(
    new Set(credentials.map((row) => row.password)).size,
    credentials.length,
    "密码必须唯一",
  );
  for (const person of personnel.personnel) {
    const match = credentials.find((item) => item.name === person.name);
    assert.ok(match, `${person.name} 没有登录账号`);
    assert.equal(match.id, person.id);
    assert.equal(match.department, person.department);
    assert.equal(match.status, person.status);
    // Accounts are derived from the English name, so they stay typable.
    assert.match(match.account, /^[a-z0-9]+(\.[a-z0-9]+)*$/);
    assert.match(match.password, /^\d{6}$/);
  }
});
test("the directory covers every name the archives credit", () => {
  const credited = new Set(content.records.flatMap((r) => leadNames(r.lead)));
  const listed = new Set(personnel.personnel.map((p) => p.name));
  assert.deepEqual([...credited].sort(), [...listed].sort());
  // The directory adds fields no archive carries, so presence has to be declared.
  for (const person of personnel.personnel) {
    assert.ok(person.position.length > 0);
    assert.ok(person.department.length > 0);
    assert.ok(["online", "busy", "offline"].includes(person.status));
  }
});
test("linked archives credit the person they are linked to", () => {
  for (const person of personnel.personnel) {
    for (const id of person.records ?? []) {
      const record = content.records.find((r) => r.id === id);
      assert.ok(record, `${person.name} 指向不存在的 ${id}`);
      assert.ok(
        leadNames(record.lead).includes(person.name),
        `${id} 的 lead 中没有 ${person.name}`,
      );
    }
  }
});
const personnelCases = [
  [
    "unknown department",
    (p) => {
      p.personnel[0].department = "不存在的科";
    },
    /未在 departments 中声明/,
  ],
  [
    "unknown status",
    (p) => {
      p.personnel[0].status = "away";
    },
    /status/,
  ],
  [
    "unknown kind",
    (p) => {
      p.personnel[0].kind = "robot";
    },
    /kind/,
  ],
  [
    "name absent from the archives",
    (p) => {
      p.personnel[0].name = "凭空出现的人";
    },
    /未出现在任何档案/,
  ],
  [
    "duplicate name",
    (p) => {
      p.personnel[1].name = p.personnel[0].name;
    },
    /重复姓名/,
  ],
  [
    "reordered id",
    (p) => {
      [p.personnel[0], p.personnel[1]] = [p.personnel[1], p.personnel[0]];
    },
    /P-001/,
  ],
  [
    "linked archive without the person",
    (p) => {
      p.personnel[0].records = [content.records.at(-1).id];
    },
    /lead 字段中没有/,
  ],
  [
    "linked archive that does not exist",
    (p) => {
      p.personnel[0].records = ["X-999"];
    },
    /找不到档案/,
  ],
];
for (const [name, mutate, error] of personnelCases) {
  test(`rejects personnel ${name}`, () => {
    const invalid = structuredClone(personnel);
    mutate(invalid);
    assert.throws(() => validatePersonnel(invalid, content), error);
  });
}
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
test("chapters and figures carry into the downloadable text", () => {
  const record = content.records.find((r) => r.sections);
  assert.ok(record, "at least one archive has chapters");
  const text = archiveText(record);
  assert.equal((text.match(/【/g) ?? []).length, record.sections.length);
  assert.ok(text.includes(`【${record.sections[0].heading}】`));
  for (const section of record.sections)
    for (const figure of section.figures ?? [])
      assert.ok(
        text.includes(figure.src),
        `${figure.src} is listed in the text`,
      );
});
test("records without chapters keep their previous download text", () => {
  const plain = content.records.find((r) => !r.sections);
  const text = archiveText(plain);
  assert.ok(!text.includes("【"));
  assert.ok(text.includes(`FILE ${plain.id} / ${plain.title}`));
  assert.ok(text.endsWith("本文为基于公开设定的档案式改写，非游戏原文。\n"));
});
test("inline markup renders, and escaping still wins over it", () => {
  const html = richText("**重点** 与 *强调* 与 `console.log(1)`");
  assert.ok(html.includes("<strong>重点</strong>"));
  assert.ok(html.includes("<em>强调</em>"));
  assert.ok(html.includes("<code>console.log(1)</code>"));
  const hostile = richText("**<script>alert(1)</script>**");
  assert.ok(!hostile.includes("<script>"));
  assert.ok(hostile.includes("<strong>&lt;script&gt;"));
});
test("code spans keep markup literal", () => {
  const html = richText("写作 `**加粗**` 即可");
  assert.ok(html.includes("<code>**加粗**</code>"));
  assert.ok(!html.includes("<strong>"));
});
test("a blank line starts a new paragraph", () => {
  const blocks = richBlocks("第一段\n\n第二段");
  assert.equal((blocks.match(/<p>/g) ?? []).length, 2);
  assert.ok(blocks.includes("<p>第一段</p>"));
  assert.ok(blocks.includes("<p>第二段</p>"));
  assert.equal((richBlocks("第一行\n第二行").match(/<p>/g) ?? []).length, 1);
  assert.ok(richBlocks("第一行\n第二行").includes("<br />"));
});
test("markup is unwrapped in the downloadable text", () => {
  const sample = "**重点**与 `代码`，见 [文档](https://example.test/doc)。";
  assert.equal(
    plainText(sample),
    "重点与 代码，见 文档 (https://example.test/doc)。",
  );
  assert.ok(
    archiveText({ ...content.records[0], findings: [sample] }).includes(
      "重点与 代码，见 文档 (https://example.test/doc)。",
    ),
  );
});
test("text without markup renders exactly as before", () => {
  const plain = content.records.find((r) => !r.sections).abstract;
  assert.equal(richText(plain), escapeHtml(plain));
  assert.equal(plainText(plain), plain);
});
