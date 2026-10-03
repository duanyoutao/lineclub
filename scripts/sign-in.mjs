// 验证脚本共用的终端进入动作。
// 登录页取代了原来的「点击进入」启动门，因此脚本改用一组账号密码提交，
// 凭据来自 content/credentials.json —— 与页面读取的是同一份，不额外硬编码。
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const credentials = JSON.parse(
  await readFile(
    fileURLToPath(new URL("../content/credentials.json", import.meta.url)),
    "utf8",
  ),
);

const DEFAULT = credentials[0];

/** 在页面上完成一次登录。默认用清单里的第一个账号。 */
export async function signIn(
  page,
  account = DEFAULT.account,
  password = DEFAULT.password,
) {
  await page.waitForSelector(".login-form", { timeout: 60000 });
  // 账号由上次登录写入 localStorage，先清掉再填，保证走到校验分支。
  await page.fill("#login-account", "");
  await page.fill("#login-secret", "");
  await page.fill("#login-account", account);
  await page.fill("#login-secret", password);
  await page.click(".login-submit");
}

/** 登录页是否还在等待身份验证。 */
export async function atSignIn(page) {
  return page
    .locator(".login-form")
    .count()
    .then((count) => count > 0);
}

export const sampleAccount = DEFAULT;
