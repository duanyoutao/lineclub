/* Rhine Lab UI — 档案内容数据画像页面逻辑
   由 scripts/build-archive-insights.mjs 内联到单页报告中；读取 window.__ARCHIVE_INSIGHTS__。
   全部图表使用原生 DOM / SVG，不依赖外部库与网络资源。 */

(function () {
  "use strict";

  var DATA = window.__ARCHIVE_INSIGHTS__;
  var CATEGORY_COLOR = DATA.meta.categoryColors;
  var state = { category: null, query: "", sort: "id", dir: 1 };

  /* ---------------- 基础工具 ---------------- */

  function h(tag, attrs, kids) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined) return;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (key === "html") node.innerHTML = value;
        else if (key.slice(0, 2) === "on")
          node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value);
      });
    }
    (kids || []).forEach(function (kid) {
      if (kid === null || kid === undefined) return;
      node.appendChild(
        typeof kid === "string" ? document.createTextNode(kid) : kid,
      );
    });
    return node;
  }

  function svg(tag, attrs, kids) {
    var node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.keys(attrs || {}).forEach(function (key) {
      var value = attrs[key];
      if (value === null || value === undefined) return;
      if (key === "text") node.textContent = value;
      else node.setAttribute(key, value);
    });
    (kids || []).forEach(function (kid) {
      if (kid) node.appendChild(kid);
    });
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function mount(id) {
    return document.getElementById(id);
  }

  function pct(part, whole) {
    if (!whole) return "0%";
    return ((part / whole) * 100).toFixed(part / whole < 0.1 ? 1 : 0) + "%";
  }

  function color(category) {
    return CATEGORY_COLOR[category] || "#9b968b";
  }

  /* ---------------- 筛选 ---------------- */

  function view() {
    var rows = DATA.records.filter(function (row) {
      if (state.category && row.category !== state.category) return false;
      if (state.query) {
        var hay = [
          row.id,
          row.title,
          row.en,
          row.department,
          row.lead,
          row.abstract,
          row.source,
          row.findings.join(" "),
        ]
          .join(" ")
          .toLowerCase();
        if (hay.indexOf(state.query.toLowerCase()) === -1) return false;
      }
      return true;
    });
    return rows;
  }

  function countBy(rows, key) {
    var map = new Map();
    rows.forEach(function (row) {
      map.set(row[key], (map.get(row[key]) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(function (entry) {
        return { name: entry[0], count: entry[1] };
      })
      .sort(function (a, b) {
        return (
          b.count - a.count ||
          String(a.name).localeCompare(String(b.name), "zh-Hans-CN")
        );
      });
  }

  /* ---------------- KPI ---------------- */

  function renderKpis(rows) {
    var bodyChars = rows.reduce(function (sum, row) {
      return sum + row.bodyChars;
    }, 0);
    var findings = rows.reduce(function (sum, row) {
      return sum + row.findingsCount;
    }, 0);
    var items = [
      {
        value: rows.length,
        label: "档案总数",
        note: "共 " + DATA.meta.total + " 份，当前显示 " + rows.length + " 份",
      },
      {
        value: new Set(rows.map((r) => r.category)).size,
        label: "分类",
        note: "阵列固定五列，上限 20 份/列",
      },
      {
        value: new Set(rows.map((r) => r.department)).size,
        label: "涉及科室",
        note: "全库 " + DATA.meta.departmentCount + " 个",
      },
      {
        value: new Set(rows.flatMap((r) => r.leadTokens)).size,
        label: "相关人物",
        note: "lead 字段按分隔符拆开统计",
      },
      {
        value: new Set(rows.map((r) => r.source)).size,
        label: "参考来源",
        note:
          "覆盖 " + new Set(rows.map((r) => r.sourceDomain)).size + " 个域名",
      },
      { value: findings, label: "研究记录条数", note: "每份档案固定 3 条" },
      {
        value: bodyChars.toLocaleString("en-US"),
        label: "摘要与记录字数",
        note: "不含编号、标题等短字段",
      },
      {
        value: rows.length ? Math.round(bodyChars / rows.length) : 0,
        label: "单份平均字数",
        note: "全库均值 " + DATA.meta.avgBodyChars,
      },
    ];
    var root = mount("kpis");
    clear(root);
    items.forEach(function (item) {
      root.appendChild(
        h("div", { class: "kpi" }, [
          h("div", { class: "value", text: String(item.value) }),
          h("div", { class: "label", text: item.label }),
          h("div", { class: "note", text: item.note }),
        ]),
      );
    });
  }

  /* ---------------- 分类条形 + 堆叠 ---------------- */

  function renderCategoryBars(rows) {
    var counts = countBy(rows, "category");
    var max = Math.max.apply(null, counts.map((c) => c.count).concat([1]));
    var root = mount("category-bars");
    clear(root);
    if (!counts.length) {
      root.appendChild(h("div", { class: "empty", text: "当前筛选无数据" }));
    }
    counts.forEach(function (item) {
      root.appendChild(
        h(
          "div",
          {
            class: "bar-row",
            onclick: function () {
              select(item.name);
            },
          },
          [
            h("div", { class: "name", text: item.name }),
            h("div", { class: "bar-track" }, [
              h("div", {
                class: "bar-fill",
                style:
                  "width:" +
                  (item.count / max) * 100 +
                  "%;background:" +
                  color(item.name),
              }),
            ]),
            h("div", { class: "num", text: String(item.count) }),
          ],
        ),
      );
    });

    var stack = mount("category-stack");
    clear(stack);
    var legend = mount("category-legend");
    clear(legend);
    var total = rows.length || 1;
    counts.forEach(function (item) {
      stack.appendChild(
        h("span", {
          style:
            "width:" +
            (item.count / total) * 100 +
            "%;background:" +
            color(item.name),
          title: item.name + " " + item.count + " 份",
        }),
      );
      legend.appendChild(
        h("div", {}, [
          h("b", { style: "background:" + color(item.name) }),
          document.createTextNode(
            item.name + " " + item.count + " 份 · " + pct(item.count, total),
          ),
        ]),
      );
    });
  }

  /* ---------------- 编号序列带 ---------------- */

  function renderRibbon(rows) {
    var root = mount("ribbon");
    clear(root);
    DATA.records.forEach(function (row) {
      var active = rows.indexOf(row) !== -1;
      var node = h(
        "button",
        {
          class: active ? "" : "dim",
          style: "background:" + color(row.category),
          title: row.id + " · " + row.category + " · " + row.title,
          onclick: function () {
            showReadout(row);
          },
        },
        [h("span", { class: "tick", text: row.id.slice(2) })],
      );
      root.appendChild(node);
    });
  }

  /* ---------------- 文本量直方图 ---------------- */

  function renderHistogram(rows) {
    var root = mount("histogram");
    clear(root);
    if (!rows.length) return;
    var bins = [];
    var step = 20;
    for (var start = 60; start <= 240; start += step) {
      bins.push({ from: start, to: start + step, count: 0 });
    }
    rows.forEach(function (row) {
      var value = row.bodyChars;
      for (var i = bins.length - 1; i >= 0; i--) {
        if (value >= bins[i].from) {
          bins[i].count++;
          break;
        }
      }
    });
    var width = 640;
    var height = 190;
    var pad = { top: 12, right: 8, bottom: 26, left: 30 };
    var max = Math.max.apply(null, bins.map((b) => b.count).concat([1]));
    var plotW = width - pad.left - pad.right;
    var plotH = height - pad.top - pad.bottom;
    var chart = svg("svg", {
      class: "chart",
      viewBox: "0 0 " + width + " " + height,
      role: "img",
    });
    [0, 0.5, 1].forEach(function (ratio) {
      var y = pad.top + plotH * (1 - ratio);
      chart.appendChild(
        svg("line", {
          class: "grid-line",
          x1: pad.left,
          x2: width - pad.right,
          y1: y,
          y2: y,
        }),
      );
      chart.appendChild(
        svg("text", {
          x: pad.left - 6,
          y: y + 3,
          "text-anchor": "end",
          class: "tick-label",
          text: String(Math.round(max * ratio)),
        }),
      );
    });
    var band = plotW / bins.length;
    bins.forEach(function (bin, index) {
      var barH = (bin.count / max) * plotH;
      var x = pad.left + index * band + band * 0.16;
      var w = band * 0.68;
      var rect = svg("rect", {
        class: "bar",
        x: x,
        y: pad.top + plotH - barH,
        width: w,
        height: barH,
        fill: index >= 3 && index <= 5 ? "var(--accent)" : "var(--faint)",
      });
      rect.appendChild(
        svg("title", {
          text: bin.from + "–" + bin.to + " 字：" + bin.count + " 份",
        }),
      );
      chart.appendChild(rect);
      if (index % 2 === 0) {
        chart.appendChild(
          svg("text", {
            x: x + w / 2,
            y: height - 8,
            "text-anchor": "middle",
            class: "tick-label",
            text: String(bin.from),
          }),
        );
      }
    });
    chart.appendChild(
      svg("line", {
        class: "axis",
        x1: pad.left,
        x2: width - pad.right,
        y1: pad.top + plotH,
        y2: pad.top + plotH,
      }),
    );
    root.appendChild(chart);

    var sorted = rows.slice().sort(function (a, b) {
      return b.bodyChars - a.bodyChars;
    });
    var list = mount("text-top");
    clear(list);
    var top = sorted.slice(0, 8);
    var topMax = top.length ? top[0].bodyChars : 1;
    top.forEach(function (row) {
      list.appendChild(
        h(
          "div",
          {
            class: "bar-row",
            onclick: function () {
              showReadout(row);
            },
          },
          [
            h("div", { class: "name", text: row.id + " " + row.title }),
            h("div", { class: "bar-track" }, [
              h("div", {
                class: "bar-fill",
                style: "width:" + (row.bodyChars / topMax) * 100 + "%",
              }),
            ]),
            h("div", { class: "num", text: String(row.bodyChars) }),
          ],
        ),
      );
    });
  }

  /* ---------------- 科室分布 ---------------- */

  function renderDepartments(rows) {
    var counts = countBy(rows, "department");
    var root = mount("departments");
    clear(root);
    var max = counts.length ? counts[0].count : 1;
    counts.slice(0, 14).forEach(function (item) {
      root.appendChild(
        h("div", { class: "bar-row lead" }, [
          h("div", { class: "name", title: item.name, text: item.name }),
          h("div", { class: "bar-track" }, [
            h("div", {
              class: "bar-fill",
              style: "width:" + (item.count / max) * 100 + "%",
            }),
          ]),
          h("div", { class: "num", text: String(item.count) }),
        ]),
      );
    });
    var excluded = counts.length - Math.min(14, counts.length);
    if (excluded > 0) {
      root.appendChild(
        h("div", {
          class: "note",
          style: "font-size:12px;color:var(--faint)",
          text: "另有 " + excluded + " 个科室各 1 份",
        }),
      );
    }
  }

  /* ---------------- 人物共现网络 ---------------- */

  function renderNetwork(rows) {
    var counts = new Map();
    rows.forEach(function (row) {
      row.leadTokens.forEach(function (name) {
        counts.set(name, (counts.get(name) || 0) + 1);
      });
    });
    var root = mount("network");
    clear(root);
    var nodeGroup = DATA.network.nodes;
    if (!nodeGroup.length) return;
    var width = 620;
    var height = 440;
    var chart = svg("svg", {
      class: "network",
      viewBox: "0 0 " + width + " " + height,
      role: "img",
    });
    var toXY = function (node) {
      return { x: 20 + node.x * (width - 40), y: 20 + node.y * (height - 40) };
    };

    var linkGroup = svg("g", {});
    var nodeLayer = svg("g", {});
    chart.appendChild(linkGroup);
    chart.appendChild(nodeLayer);

    DATA.network.edges.forEach(function (edge) {
      var a = toXY(byName(edge.a));
      var b = toXY(byName(edge.b));
      var line = svg("line", {
        class: "link",
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        "stroke-width": Math.min(3.2, 0.5 + edge.w * 0.55),
        opacity: 0.25 + Math.min(0.5, edge.w * 0.14),
      });
      line.dataset.a = edge.a;
      line.dataset.b = edge.b;
      linkGroup.appendChild(line);
    });

    nodeGroup.forEach(function (node) {
      var point = toXY(node);
      var leaf = node.kind === "leaf";
      var size = leaf
        ? 3.4
        : 4.2 + Math.sqrt(counts.get(node.name) || node.count) * 2.2;
      var group = svg("g", {
        class:
          (counts.get(node.name) ? "node" : "node dim") + (leaf ? " leaf" : ""),
      });
      group.dataset.name = node.name;
      group.appendChild(
        svg("circle", {
          cx: point.x,
          cy: point.y,
          r: size,
          "stroke-width": leaf ? 1 : 1.3,
        }),
      );
      var offset = size + 5;
      group.appendChild(
        svg("text", {
          x: point.x + node.ldx * offset,
          y:
            node.ldx === 0 || node.above
              ? node.above
                ? point.y - size - 4
                : point.y + size + 10
              : point.y + 3.5,
          "text-anchor": node.anch,
          "font-size": leaf ? 8.5 : 10.5,
          text: node.name,
        }),
      );
      group.appendChild(
        svg("title", {
          text:
            node.name +
            " · 当前 " +
            (counts.get(node.name) || 0) +
            " 份 / 全库 " +
            node.count +
            " 份",
        }),
      );
      group.addEventListener("mouseenter", function () {
        highlight(node.name);
      });
      group.addEventListener("mouseleave", function () {
        highlight(null);
      });
      group.addEventListener("click", function () {
        pick(node.name);
      });
      nodeLayer.appendChild(group);
    });

    root.appendChild(chart);
    if (DATA.network.singles && DATA.network.singles.length) {
      root.appendChild(
        h("p", {
          class: "singles",
          text:
            "仅被提及一次（" +
            DATA.network.singles.length +
            " 人）：" +
            DATA.network.singles.join("、"),
        }),
      );
    }

    function byName(name) {
      return nodeGroup.find(function (node) {
        return node.name === name;
      });
    }

    function highlight(name) {
      Array.prototype.forEach.call(nodeLayer.children, function (group) {
        if (!name) {
          group.classList.toggle(
            "dim",
            counts.get(group.dataset.name) === undefined,
          );
          group.classList.remove("hot");
          return;
        }
        var near =
          group.dataset.name === name ||
          (DATA.network.byPerson[name] || []).indexOf(group.dataset.name) !==
            -1;
        group.classList.toggle("dim", !near);
        group.classList.toggle("hot", near);
      });
      Array.prototype.forEach.call(linkGroup.children, function (line) {
        line.classList.toggle(
          "active",
          !!name && (line.dataset.a === name || line.dataset.b === name),
        );
      });
    }

    function pick(name) {
      state.query = name;
      mount("search").value = name;
      refresh();
      window.scrollTo({
        top: mount("table-section").offsetTop - 20,
        behavior: "smooth",
      });
    }
  }

  /* ---------------- 来源环形图 ---------------- */

  function renderSources(rows) {
    var counts = countBy(rows, "sourceDomain");
    var root = mount("donut");
    clear(root);
    var rowsRoot = mount("donut-rows");
    clear(rowsRoot);
    var total = counts.reduce(function (sum, item) {
      return sum + item.count;
    }, 0);
    if (!total) return;
    var size = 168;
    var r = 62;
    var stroke = 24;
    var c = 2 * Math.PI * r;
    var chart = svg("svg", {
      viewBox: "0 0 " + size + " " + size,
      role: "img",
    });
    var palette = ["#20221c", "#9b7247", "#5d6373", "#77756d", "#9b968b"];
    var offset = 0;
    counts.forEach(function (item, index) {
      var length = (item.count / total) * c;
      var circle = svg("circle", {
        cx: size / 2,
        cy: size / 2,
        r: r,
        fill: "none",
        stroke: palette[index % palette.length],
        "stroke-width": stroke,
        "stroke-dasharray": length + " " + (c - length),
        "stroke-dashoffset": -offset,
        transform: "rotate(-90 " + size / 2 + " " + size / 2 + ")",
      });
      circle.appendChild(
        svg("title", { text: item.name + " " + item.count + " 份" }),
      );
      chart.appendChild(circle);
      chart.appendChild(
        svg("text", {
          x: size / 2,
          y: size / 2 + 4,
          "text-anchor": "middle",
          style:
            "font-size:22px;fill:var(--ink);font-variant-numeric:tabular-nums",
          text: String(total),
        }),
      );
      offset += length;
      rowsRoot.appendChild(
        h("div", {}, [
          h("b", { style: "background:" + palette[index % palette.length] }),
          document.createTextNode(item.name),
          h("span", { text: item.count + " · " + pct(item.count, total) }),
        ]),
      );
    });
    root.appendChild(chart);

    var list = mount("source-list");
    clear(list);
    countBy(rows, "source")
      .slice(0, 10)
      .forEach(function (item) {
        list.appendChild(
          h(
            "div",
            {
              style:
                "display:flex;justify-content:space-between;gap:12px;padding:3px 0;border-bottom:1px dotted var(--line-soft)",
            },
            [
              h(
                "span",
                {
                  style:
                    "overflow:hidden;text-overflow:ellipsis;white-space:nowrap",
                },
                [
                  h(
                    "a",
                    {
                      href: item.name,
                      target: "_blank",
                      rel: "noreferrer",
                      style: "color:var(--ink);text-decoration:none",
                    },
                    [item.name.replace(/^https?:\/\//, "")],
                  ),
                ],
              ),
              h("span", {
                style: "color:var(--muted);font-variant-numeric:tabular-nums",
                text: String(item.count),
              }),
            ],
          ),
        );
      });
  }

  /* ---------------- 明细分录表 ---------------- */

  var COLUMNS = [
    { key: "id", label: "编号", num: false },
    { key: "category", label: "分类", num: false },
    { key: "title", label: "标题", num: false },
    { key: "department", label: "科室", num: false },
    { key: "lead", label: "相关人物", num: false },
    { key: "bodyChars", label: "摘要字数", num: true },
    { key: "findingsCount", label: "记录条数", num: true },
    { key: "date", label: "编目范围", num: false },
    { key: "sourceDomain", label: "来源域名", num: false },
  ];

  function renderTable(rows) {
    var head = mount("table-head");
    var body = mount("table-body");
    clear(head);
    clear(body);
    COLUMNS.forEach(function (col) {
      head.appendChild(
        h(
          "th",
          {
            class: col.num ? "num" : "",
            onclick: function () {
              if (state.sort === col.key) state.dir *= -1;
              else {
                state.sort = col.key;
                state.dir = 1;
              }
              refresh();
            },
            title: "按" + col.label + "排序",
          },
          [
            col.label +
              (state.sort === col.key ? (state.dir > 0 ? " ↑" : " ↓") : ""),
          ],
        ),
      );
    });

    var sorted = rows.slice().sort(function (a, b) {
      var left = a[state.sort];
      var right = b[state.sort];
      if (typeof left === "number" && typeof right === "number")
        return (left - right) * state.dir;
      return (
        String(left).localeCompare(String(right), "zh-Hans-CN") * state.dir
      );
    });

    sorted.forEach(function (row) {
      var tr = h("tr", {
        onclick: function () {
          showReadout(row);
        },
      });
      COLUMNS.forEach(function (col) {
        var value = row[col.key];
        tr.appendChild(
          h(
            "td",
            { class: (col.num ? "num " : "") + (col.key === "id" ? "id" : "") },
            [
              col.key === "category"
                ? h("span", {
                    class: "tag",
                    style: "border-color:" + color(row.category),
                    text: String(value),
                  })
                : document.createTextNode(
                    col.key === "lead"
                      ? value.replace(/ \/ /g, "、")
                      : String(value),
                  ),
            ],
          ),
        );
      });
      body.appendChild(tr);
    });

    var counter = mount("table-count");
    clear(counter);
    counter.textContent = rows.length + " / " + DATA.records.length + " 份档案";
  }

  /* ---------------- 单份档案读数 ---------------- */

  function showReadout(row) {
    var root = mount("readout");
    clear(root);
    if (!row) {
      root.appendChild(
        h("div", {
          class: "empty",
          text: "点击编号序列、图表条目或表格中的任意一行，这里显示该档案的完整元数据。",
        }),
      );
      return;
    }
    root.appendChild(
      h("div", {}, [
        h("h4", {}, [
          h("span", {
            style:
              "color:var(--muted);font-family:var(--mono);font-size:12px;margin-right:8px",
            text: row.id,
          }),
          document.createTextNode(row.title + " · " + row.en),
        ]),
        h("div", {
          class: "meta",
          text:
            row.category +
            " / " +
            row.department +
            " / 相关：" +
            row.lead.replace(/ \/ /g, "、") +
            " / " +
            row.date +
            " / " +
            row.clearance,
        }),
        h("p", { style: "margin:0", text: row.abstract }),
        h(
          "ul",
          {},
          row.findings.map((text) => h("li", { text: text })),
        ),
        h("div", { style: "margin-top:8px;font-size:12px" }, [
          h("a", {
            href: row.source,
            target: "_blank",
            rel: "noreferrer",
            text: row.source,
          }),
          h("span", {
            style: "color:var(--muted);margin-left:12px",
            text:
              "摘要 " +
              row.bodyChars +
              " 字" +
              (row.sectionsCount ? " · " + row.sectionsCount + " 个章节" : "") +
              (row.substrate ? " · 专属基板图案" : ""),
          }),
        ]),
      ]),
    );
  }

  /* ---------------- 完整度表 ---------------- */

  function renderCompleteness() {
    var body = mount("completeness");
    clear(body);
    DATA.completeness.forEach(function (item) {
      body.appendChild(
        h("tr", {}, [
          h("td", {}, [
            h("code", {
              style: "font-family:var(--mono);font-size:12px",
              text: item.field,
            }),
          ]),
          h("td", { text: item.present + " / " + item.total }),
          h("td", { class: "num", text: pct(item.present, item.total) }),
          h("td", { text: item.required ? "必填" : "可选" }),
          h("td", { text: item.note }),
        ]),
      );
    });
  }

  function renderInsights() {
    var root = mount("insights");
    clear(root);
    DATA.insights.forEach(function (item) {
      root.appendChild(
        h("div", { class: "insight " + item.kind }, [
          h("div", {
            class: "kind",
            text:
              item.kind === "warn"
                ? "需留意"
                : item.kind === "ok"
                  ? "已达标"
                  : "观察项",
          }),
          h("div", {}, [
            h("strong", { text: item.title }),
            h("p", { html: item.detail }),
          ]),
        ]),
      );
    });
  }

  /* ---------------- 主流程 ---------------- */

  function renderFilters() {
    var root = mount("filters");
    clear(root);
    var total = state.category
      ? DATA.records.filter(function (row) {
          return row.category === state.category;
        }).length
      : DATA.records.length;
    root.appendChild(
      h(
        "button",
        {
          class: "chip",
          "aria-pressed": String(!state.category),
          onclick: function () {
            select(null);
          },
        },
        [
          "全部档案",
          h("span", { class: "count", text: String(DATA.records.length) }),
        ],
      ),
    );
    DATA.meta.categories.forEach(function (name) {
      root.appendChild(
        h(
          "button",
          {
            class: "chip",
            "aria-pressed": String(state.category === name),
            onclick: function () {
              select(name);
            },
          },
          [
            h("span", { class: "swatch", style: "background:" + color(name) }),
            name,
            h("span", {
              class: "count",
              text: String(DATA.meta.categoryCounts[name]),
            }),
          ],
        ),
      );
    });
    return total;
  }

  function select(name) {
    state.category = state.category === name ? null : name;
    refresh();
  }

  function refresh() {
    renderFilters();
    var rows = view();
    renderKpis(rows);
    renderCategoryBars(rows);
    renderRibbon(rows);
    renderHistogram(rows);
    renderDepartments(rows);
    renderNetwork(rows);
    renderSources(rows);
    renderTable(rows);
  }

  document.addEventListener("DOMContentLoaded", function () {
    mount("search").addEventListener("input", function (event) {
      state.query = event.target.value.trim();
      renderTable(view());
      renderKpis(view());
    });
    renderFilters();
    renderCompleteness();
    renderInsights();
    showReadout(null);
    refresh();
  });
})();
