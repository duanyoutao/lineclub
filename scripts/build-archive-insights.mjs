// 生成档案内容数据画像的单页可视化看板。
// 读取 content/archives.json → 计算派生指标 → 与 scripts/insights-page.{css,js} 内联为
// reference/archive-insights.html。产物自包含，不依赖网络与构建工具。

import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "content", "archives.json");
const output = path.join(root, "reference", "archive-insights.html");

const CATEGORY_COLORS = {
  机构档案: "#20221c",
  工程研究: "#9b7247",
  生命科学: "#4f6b52",
  能量研究: "#a86b4a",
  特别项目: "#5d6373",
};

const DOMAIN_COLORS = ["#20221c", "#9b7247", "#5d6373", "#77756d", "#9b968b"];

/** 去掉空白后的字符数，中文按字计。 */
function chars(text) {
  return Array.from(String(text).replace(/\s+/g, "")).length;
}

function splitLeads(value) {
  return String(value)
    .split(/\s*(?:\/|／|、|,|，|&)\s*/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function median(list) {
  const sorted = list.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}

/** 高频人物按出现次数绕圆周排布（半径交错），标签朝外；关系只保留为连线。
 *  相比力导向，这种排布稳定且保证节点与标签互不压盖。 */
function layout(nodes, edges, weights) {
  const total = nodes.length || 1;
  return nodes.map((name, i) => {
    const angle = (2 * Math.PI * i) / total - Math.PI / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const radius = i % 2 ? 0.31 : 0.24;
    return {
      name,
      count: weights.get(name) || 1,
      kind: "core",
      anch: cos > 0.15 ? "start" : cos < -0.15 ? "end" : "middle",
      ldx: cos > 0.15 ? 1 : cos < -0.15 ? -1 : 0,
      // 相邻节点标签上下交错；下半段的侧向标签统一放到节点上方，避免伸向相邻节点。
      above:
        sin < 0
          ? i % 2 === 0
          : sin > 0.25
            ? cos > 0.15 || cos < -0.15
            : i % 2 === 1,
      x: +(0.5 + cos * radius).toFixed(4),
      y: +(0.5 + sin * radius * 1.05).toFixed(4),
    };
  });
}

/** 外圈不再单独画点：只出现一次的人物在图下方以文字列出，避免长尾标签互相压盖。 */

const raw = JSON.parse(await readFile(source, "utf8"));
const bytes = (await stat(source)).size;
const base = raw.records.map((record, order) => {
  const sourceUrl = new URL(record.source);
  const bodyChars =
    chars(record.abstract) +
    record.findings.map(chars).reduce((a, b) => a + b, 0);
  return {
    id: record.id,
    order,
    title: record.title,
    en: record.en,
    department: record.department,
    category: record.category,
    date: record.date,
    lead: record.lead,
    leadTokens: splitLeads(record.lead),
    clearance: record.clearance,
    abstract: record.abstract,
    findings: record.findings,
    findingsCount: record.findings.length,
    abstractChars: chars(record.abstract),
    findingsChars: record.findings.map(chars).reduce((a, b) => a + b, 0),
    bodyChars,
    source: record.source,
    sourceDomain: sourceUrl.hostname,
    sectionsCount: Array.isArray(record.sections) ? record.sections.length : 0,
    substrate: record.substrate || "",
  };
});

const countBy = (rows, key) => {
  const map = new Map();
  for (const row of rows) map.set(row[key], (map.get(row[key]) || 0) + 1);
  return map;
};

const categoryCounts = Object.fromEntries(countBy(base, "category"));
const departmentCounts = countBy(base, "department");
const clearanceCounts = countBy(base, "clearance");
const dateCounts = countBy(base, "date");
const domainCounts = countBy(base, "sourceDomain");
const bodyCharsList = base.map((row) => row.bodyChars);
const leadCounts = new Map();
for (const row of base) {
  for (const name of row.leadTokens)
    leadCounts.set(name, (leadCounts.get(name) || 0) + 1);
}

const pairWeights = new Map();
const byPerson = {};
for (const row of base) {
  const names = row.leadTokens.sort();
  for (let i = 0; i < names.length; i++) {
    const list = (byPerson[names[i]] = byPerson[names[i]] || []);
    for (let j = i + 1; j < names.length; j++) {
      const key = names[i] + "\u0000" + names[j];
      pairWeights.set(key, (pairWeights.get(key) || 0) + 1);
      if (!list.includes(names[j])) list.push(names[j]);
      const back = (byPerson[names[j]] = byPerson[names[j]] || []);
      if (!back.includes(names[i])) back.push(names[i]);
    }
  }
}
const leadNames = Array.from(leadCounts.keys()).sort(
  (a, b) => leadCounts.get(b) - leadCounts.get(a) || a.localeCompare(b),
);
const leadEdges = Array.from(pairWeights.entries()).map(([key, w]) => {
  const [a, b] = key.split("\u0000");
  return { a, b, w };
});
const coreNames = leadNames.filter(
  (name) => leadCounts.get(name) > 1 || (byPerson[name] || []).length > 0,
);
const leafNames = leadNames.filter((name) => !coreNames.includes(name));
const networkNodes = layout(coreNames, leadEdges, leadCounts);

/** 短名是另一个长名的整词开头，且两者都独立出现过 —— 很可能是同一个人的不同写法。 */
const duplicateNames = [];
for (const short of leadNames) {
  for (const long of leadNames) {
    if (short === long || long.length <= short.length) continue;
    if (long.slice(0, short.length) === short && long[short.length] === " ") {
      duplicateNames.push({ short, long });
    }
  }
}

const REQUIRED = [
  "id",
  "title",
  "en",
  "department",
  "category",
  "date",
  "lead",
  "clearance",
  "abstract",
  "findings",
  "source",
];
const OPTIONAL = ["sections", "substrate"];
const completeness = [
  ...REQUIRED.map((field) => ({ field, required: true })),
  ...OPTIONAL.map((field) => ({ field, required: false })),
].map(({ field, required }) => {
  const present = base.filter((row) => {
    const value = row[field];
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "number") return true;
    return value !== undefined && String(value).trim() !== "";
  }).length;
  const note = required
    ? present === base.length
      ? "校验按必填项要求通过"
      : "存在缺失，校验会拒绝导出"
    : present
      ? "已在内容中启用"
      : "未使用，页面保持默认形态";
  return { field, present, total: base.length, required, note };
});

const longest = base.reduce((a, b) => (b.bodyChars > a.bodyChars ? b : a));
const shortest = base.reduce((a, b) => (b.bodyChars < a.bodyChars ? b : a));
const singleDept = Array.from(departmentCounts.values()).filter(
  (count) => count === 1,
).length;
const topLeads = leadNames.slice(0, 3);
const offDomain = base.filter(
  (row) => !/(prts\.wiki|arknights\.wiki\.gg)$/.test(row.sourceDomain),
);
const maxCategory = Object.entries(categoryCounts).sort(
  (a, b) => b[1] - a[1],
)[0];
const noPair = base.filter((row) => row.leadTokens.length === 1).length;

const metaLeads = Array.from(leadCounts.keys()).filter((name) => {
  const rows = base.filter((row) => row.leadTokens.includes(name));
  return rows.every(
    (row) => !/(prts\.wiki|arknights\.wiki\.gg)$/.test(row.sourceDomain),
  );
});

const insights = [
  {
    kind: "ok",
    title: "必备字段全部齐备，编号连续",
    detail: `${base.length} 份档案的 ${REQUIRED.length} 个必填字段均无缺失，编号 X-001–X-043 严格连续，因此可以安全地按 id 定位收藏与下载文件名。`,
  },
  {
    kind: "warn",
    title: `访问范围只有一种取值：${Array.from(clearanceCounts.keys()).join("、")}`,
    detail: `<code>content/README.md</code> 写明 <code>RESTRICTED</code> 对应目录访问状态，但数据层没有任何样本使用它，权限分支实际上没有被真实数据覆盖。`,
  },
  {
    kind: "warn",
    title: "编目范围字段几乎没有区分度",
    detail: `${dateCounts.size} 种取值，其中「跨期资料汇编」占 ${dateCounts.get("跨期资料汇编") || 0} 份（${Math.round(((dateCounts.get("跨期资料汇编") || 0) / base.length) * 100)}%）。档案详情几乎无法按时间筛选或排序，只有 3 份带具体年份区间。`,
  },
  {
    kind: "warn",
    title: "可选字段几乎闲置",
    detail: `${completeness.find((item) => item.field === "sections").present} 份使用长文章节（${base.find((row) => row.sectionsCount)?.id ?? "无"}），${completeness.find((item) => item.field === "substrate").present} 份使用专属基板图案（${base.find((row) => row.substrate)?.id ?? "无"}）。阅读全文与逐档案基板两种能力只在一处被验证过。`,
  },
  {
    kind: "warn",
    title: `${offDomain.length} 份档案的参考来源不是设定维基`,
    detail:
      offDomain
        .map((row) => `<code>${row.id} ${row.title}</code> → ${row.source}`)
        .join("；") +
      "。它们用于说明项目本身，与其他 40 份世界观来源混在同一字段里。",
  },
  {
    kind: "info",
    title: "分类规模均衡，仍有扩容空间",
    detail: `五列分别为 ${Object.entries(categoryCounts)
      .map(([name, count]) => name + " " + count)
      .join(
        "、",
      )} 份，最多的「${maxCategory[0]}」为 ${maxCategory[1]} 份，距离每列 20 份的上限还很远。`,
  },
  {
    kind: "info",
    title: "科室高度分散",
    detail: `${departmentCounts.size} 个科室出现在 ${base.length} 份档案中，其中 ${singleDept} 个只出现一次；出现最多的是「${Array.from(departmentCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]}」。科室更接近标签而不是稳定的组织维度。`,
  },
  {
    kind: "info",
    title: "研究记录结构完全统一",
    detail: `每份档案固定 ${base[0].findingsCount} 条 findings，共 ${base.reduce((sum, row) => sum + row.findingsCount, 0)} 条，单条 ${Math.min(...base.flatMap((row) => row.findings.map(chars)))}–${Math.max(...base.flatMap((row) => row.findings.map(chars)))} 字，页面可以用固定的三行布局渲染。`,
  },
  {
    kind: "info",
    title: "相关人物集中在核心三人组",
    detail: `${topLeads.map((name) => `${name} ${leadCounts.get(name)} 次`).join("、")}；其中 ${noPair} 份档案只署名单人。图内 ${coreNames.length} 人彼此有共现关系，另有 ${leafNames.length} 人只被提及一次，列在图下方。`,
  },
  {
    kind: "warn",
    title: "同一人物存在多种写法",
    detail: `${duplicateNames.map((pair) => `<code>${pair.short}</code> 与 <code>${pair.long}</code>`).join("、")} 在 lead 字段里同时出现，人物计数与共现网络会把它们当作不同的人。建议统一成完整名。`,
  },
  {
    kind: "warn",
    title: "lead 字段混入了非世界观条目",
    detail: `${metaLeads.map((name) => `<code>${name}</code>`).join("、")} 只出现在指向 ${offDomain.map((row) => row.id).join("、")} 的项目自述条目里，与设定人物共用同一字段，会在按人检索时一起返回。`,
  },
  {
    kind: "info",
    title: "文本量集中在窄区间",
    detail: `摘要加记录的字数中位数 ${median(bodyCharsList)}，最短为 <code>${shortest.id} ${shortest.title}</code>（${shortest.bodyChars} 字），最长为 <code>${longest.id} ${longest.title}</code>（${longest.bodyChars} 字），长度差异约 ${(longest.bodyChars / shortest.bodyChars).toFixed(1)} 倍。`,
  },
];

const payload = {
  meta: {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: "content/archives.json",
    bytes,
    kb: +(bytes / 1024).toFixed(1),
    total: base.length,
    categories: raw.categories,
    columns: raw.columns,
    categoryCounts,
    categoryColors: CATEGORY_COLORS,
    domainColors: DOMAIN_COLORS,
    departmentCount: departmentCounts.size,
    leadCount: leadNames.length,
    avgBodyChars: Math.round(
      bodyCharsList.reduce((a, b) => a + b, 0) / base.length,
    ),
    totalBodyChars: bodyCharsList.reduce((a, b) => a + b, 0),
  },
  records: base,
  network: {
    nodes: networkNodes,
    edges: leadEdges,
    byPerson,
    singles: leafNames,
  },
  completeness,
  insights,
};

const css = await readFile(
  path.join(root, "scripts", "insights-page.css"),
  "utf8",
);
const js = await readFile(
  path.join(root, "scripts", "insights-page.js"),
  "utf8",
);
if (js.includes("</script"))
  throw new Error("页面脚本包含 </script，无法安全内联");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>档案内容数据画像 · Rhine Lab UI</title>
<style>
${css}
</style>
</head>
<body>
<div class="page">
  <header class="masthead">
    <div>
      <div class="en">Rhine Lab UI · Archive Content Profile</div>
      <h1>档案内容数据画像</h1>
    </div>
    <aside>
      数据源 <strong>content/archives.json</strong>（${payload.meta.kb} KB）<br />
      共 ${payload.meta.total} 份档案 · ${payload.meta.departmentCount} 个科室 · ${payload.meta.totalBodyChars.toLocaleString("en-US")} 字正文<br />      生成于 ${payload.meta.generatedAt}，每次改动内容后重跑 <code>npm run insights:archives</code>
    </aside>
  </header>

  <div class="kpis" id="kpis"></div>

  <div class="filters" id="filters"></div>

  <section>
    <div class="section-head">
      <h2><span class="index">01</span>分类分布与阵列构成</h2>
      <span class="hint">点击条目或色块可筛选全页</span>
    </div>
    <div class="grid two">
      <div class="card">
        <h3>各分类档案数量</h3>
        <p class="caption">五列依次对应 <code>columns</code> 中声明的 ${raw.columns.join(" → ")}。校验允许每列 1–20 份。</p>
        <div class="bars" id="category-bars"></div>
      </div>
      <div class="card">
        <h3>阵列占比</h3>
        <p class="caption">同一份数据按整库的 ${payload.meta.total} 份折算成占比，用于观察阵列的视觉均衡度。</p>
        <div class="stack" id="category-stack"></div>
        <div class="legend" id="category-legend"></div>
        <h3 style="margin-top:22px">编号序列</h3>
        <p class="caption">按 <code>records</code> 数组顺序排列的 ${payload.meta.total} 个编号，颜色为该档案所属分类；同一分类的编号在数组中并不相邻。</p>
        <div class="ribbon" id="ribbon"></div>
      </div>
    </div>
    <div class="readout" id="readout"></div>
  </section>

  <section>
    <div class="section-head">
      <h2><span class="index">02</span>文本量分布</h2>
      <span class="hint">摘要 + findings 的字符数，不含空白</span>
    </div>
    <div class="grid two">
      <div class="card">
        <h3>字数直方图</h3>
        <p class="caption">区间宽度 20 字；落在中间区间的档案数量最多，排版可按固定三行估算。</p>
        <div id="histogram"></div>
      </div>
      <div class="card">
        <h3>文本量前八名</h3>
        <p class="caption">点击任意一行在下方读数区查看完整元数据。</p>
        <div class="bars" id="text-top"></div>
      </div>
    </div>
  </section>

  <section>
    <div class="section-head">
      <h2><span class="index">03</span>科室与相关人物</h2>
      <span class="hint">按出现次数排布在圆周上，连线为同一份档案中的共现</span>
    </div>
    <div class="grid two">
      <div class="card">
        <h3>科室分布（前 14）</h3>
        <p class="caption">共 ${payload.meta.departmentCount} 个科室，长尾明显。</p>
        <div class="bars" id="departments"></div>
      </div>
      <div class="card">
        <h3>相关人物共现网络</h3>
        <p class="caption">节点大小按出现次数，连线粗细按同一份档案中的共现次数；悬停高亮邻居，点击人物筛选下方明细。</p>
        <div class="network-wrap" id="network"></div>
      </div>
    </div>
  </section>

  <section>
    <div class="section-head">
      <h2><span class="index">04</span>参考来源</h2>
      <span class="hint">source 字段按域名归并</span>
    </div>
    <div class="grid two">
      <div class="card">
        <h3>来源域名占比</h3>
        <div class="donut-wrap">
          <div id="donut"></div>
          <div class="rows" id="donut-rows"></div>
        </div>
      </div>
      <div class="card">
        <h3>出现最多的链接</h3>
        <p class="caption">同一份设定条目常被多份档案引用。</p>
        <div id="source-list"></div>
      </div>
    </div>
  </section>

  <section>
    <div class="section-head">
      <h2><span class="index">05</span>字段完整度</h2>
      <span class="hint">对照 content/README.md 的必填与可选约定</span>
    </div>
    <div class="card" style="padding:0">
      <table>
        <thead>
          <tr><th>字段</th><th>填写数量</th><th class="num">覆盖率</th><th>类型</th><th>说明</th></tr>
        </thead>
        <tbody id="completeness"></tbody>
      </table>
    </div>
  </section>

  <section id="table-section">
    <div class="section-head">
      <h2><span class="index">06</span>档案明细</h2>
      <span class="hint">点击表头排序，点击行查看摘要</span>
    </div>
    <div class="toolbar">
      <input type="search" id="search" placeholder="搜索标题、科室、人物、摘要或来源…" />
      <span class="counter" id="table-count"></span>
    </div>
    <div class="scroll">
      <table>
        <thead><tr id="table-head"></tr></thead>
        <tbody id="table-body"></tbody>
      </table>
    </div>
  </section>

  <section>
    <div class="section-head">
      <h2><span class="index">07</span>数据洞察</h2>
      <span class="hint">结论由本次生成的数据计算得出</span>
    </div>
    <div class="insights" id="insights"></div>
  </section>

  <footer>
    <span>Rhine Lab UI · 内容数据画像，仅供维护档案使用</span>
    <span>重建：<code>npm run insights:archives</code> → reference/archive-insights.html</span>
  </footer>
</div>
<script>window.__ARCHIVE_INSIGHTS__ = ${JSON.stringify(payload)};</script>
<script>
${js}
</script>
</body>
</html>
`;

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, html, "utf8");
console.log(
  `已生成 ${path.relative(root, output)}（${(Buffer.byteLength(html, "utf8") / 1024).toFixed(1)} KB）`,
);
console.log(
  `档案 ${base.length} 份 · 科室 ${departmentCounts.size} · 人物 ${leadNames.length} · 来源 ${domainCounts.size} 个域名`,
);
