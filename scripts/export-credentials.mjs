// 生成终端登录凭据：由 content/personnel.json 的 26 条人员条目派生账号与密码，
// 写入 content/credentials.json（页面与登录校验读取）和
// docs/CREDENTIALS.txt（便于查看的清单）。
// 派生规则是纯函数，同样的输入永远得到同样的凭据。
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const personnel = JSON.parse(
  await readFile(path.join(root, "content", "personnel.json"), "utf8"),
);

/** 账号取自英文名的点分小写形式，保证可输入且与人员一一对应。 */
function accountOf(entry) {
  const slug = entry.en
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  if (!slug) throw new Error(`${entry.id} ${entry.name}：英文名无法派生账号`);
  return slug;
}

/** 密码为 6 位数字，由「姓名 + 科室」散列而来；不存明文规则以外的东西，重跑结果不变。 */
function passwordOf(entry) {
  const digest = createHash("sha256")
    .update(`rhine-lab/${entry.name}/${entry.department}`)
    .digest("hex");
  return String(Number.parseInt(digest.slice(0, 12), 16) % 1_000_000).padStart(
    6,
    "0",
  );
}

const presence = { "on-roll": "在编", field: "外勤", leave: "休假" };
const credentials = personnel.personnel.map((entry) => ({
  id: entry.id,
  account: accountOf(entry),
  password: passwordOf(entry),
  name: entry.name,
  en: entry.en,
  kind: entry.kind,
  department: entry.department,
  position: entry.position,
  status: entry.status,
}));

const accounts = new Set(credentials.map((row) => row.account));
if (accounts.size !== credentials.length)
  throw new Error("账号重复，需要为重名人员改用不同的派生规则");
const passwords = new Set(credentials.map((row) => row.password));
if (passwords.size !== credentials.length)
  console.warn(
    `警告：${credentials.length} 个账号中有 ${credentials.length - passwords.size} 组密码重复`,
  );

await writeFile(
  path.join(root, "content", "credentials.json"),
  `${JSON.stringify(credentials, null, 2)}\n`,
  "utf8",
);

// 面向人阅读的清单：等宽对齐，附派生规则与注意事项。
const widths = [8, 26, 9, 24, 20, 6];
const rule = "-".repeat(78);
const pad = (value, width) => {
  // 中文字符占两列，按显示宽度对齐才不会错位。
  let shown = 0;
  let out = "";
  for (const character of value) {
    const step =
      /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/.test(
        character,
      )
        ? 2
        : 1;
    if (shown + step > width - 1) break;
    out += character;
    shown += step;
  }
  return out.padEnd(width - (shown > width - 2 ? shown - width + 1 : 0)) + " ";
};

const lines = [
  "RHINE LAB · 内部资料终端 — 账号与密码",
  "=".repeat(78),
  "",
  `共 ${credentials.length} 个账号，由 content/personnel.json 的人员条目生成。`,
  "账号取自英文名的点分小写形式；密码为 6 位数字，由「姓名 + 科室」散列而来，",
  "重新生成结果不变。登录后可在人员表查看该账号对应的档案。",
  "",
  "本终端是公开演示项目，凭据随源码一起分发，只用于挡下随手点开的访客，",
  "不具备真实的安全强度。",
  "",
  rule,
  `${pad("编号", widths[0])}${pad("账号", widths[1])}${pad("密码", widths[2])}${pad("姓名", widths[3])}${pad("科室", widths[4])}状态`,
  rule,
  ...credentials.map(
    (row) =>
      `${pad(row.id, widths[0])}${pad(row.account, widths[1])}${pad(row.password, widths[2])}${pad(row.name, widths[3])}${pad(row.department, widths[4])}${presence[row.status]}`,
  ),
  rule,
  "",
  "说明",
  "  · Engineering Section、Rhine Lab、Trimounts Project 等是科室、机构和项目署名，",
  "    不是自然人，但同样可以登录 —— 终端不区分登录者类型。",
  "  · Kristen 与 Kristen Wright、Ferdinand 与 Ferdinand Clooney、Dorothy 与 Dorothy",
  "    Franks 在档案里本就是不同写法，因此是两个独立账号，而不是同一个人的别名。",
  "  · 修改人员后重新执行 npm run export:credentials；新增人员会得到新账号。",
  "",
];
await mkdir(path.join(root, "docs"), { recursive: true });
await writeFile(
  path.join(root, "docs", "CREDENTIALS.txt"),
  `${lines.join("\n")}\n`,
  "utf8",
);

console.log(
  `已生成 ${credentials.length} 个账号 → content/credentials.json 与 docs/CREDENTIALS.txt`,
);
