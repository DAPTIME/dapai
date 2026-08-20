import { chromium } from "playwright";
import { ProxyAgent, request as ureq } from "undici";
import fs from "node:fs/promises";
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const dispatcher = proxy ? new ProxyAgent({ uri: proxy, requestTls: { ca: await fs.readFile("/root/.ccr/ca-bundle.crt") } }) : undefined;
const BASE = "https://dapai.lovable.app";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const sess = JSON.parse(await fs.readFile("./zzsession.json", "utf8"));
const ctx = await browser.newContext();
await ctx.route("**/*", async (route) => {
  const r = route.request();
  try {
    const res = await ureq(r.url(), { method: r.method(), headers: { ...r.headers(), "accept-encoding": "identity" }, body: r.postData() ?? undefined, dispatcher });
    const buf = Buffer.from(await res.body.arrayBuffer());
    const h = { ...res.headers }; delete h["content-encoding"]; delete h["content-length"];
    await route.fulfill({ status: res.statusCode, headers: h, body: buf });
  } catch { await route.abort(); }
});
await ctx.addInitScript((s) => { try { localStorage.setItem("sb-ydjuoqizridueiuxnbqk-auth-token", JSON.stringify(s)); } catch {} }, sess);

const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message.slice(0, 140)));

await page.goto(BASE + "/rooms", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(3000);

console.log("=== what /rooms renders ===");
console.log((await page.locator("body").innerText().catch(()=> "")).replace(/\s+/g," ").slice(0, 400));
console.log("=== buttons ===");
for (const b of await page.locator("button").allInnerTexts()) console.log("  [" + b.replace(/\s+/g," ").slice(0,50) + "]");
await browser.close(); process.exit(0);
// Create a room through the UI, exactly as a person would.
await page.fill('input[placeholder*="Physics"], input:below(:text("Start a room"))', "crawl room test").catch(() => {});
const nameBox = page.locator('input').first();
await nameBox.fill("crawl room test").catch(() => {});
await page.click('button:has-text("Create room")');
await page.waitForTimeout(6000);
const url = page.url();
const code = url.split("/rooms/")[1] ?? "(no redirect)";
const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
console.log("after create → url:", url);
console.log("  code:", code);
console.log("  page says:", body.slice(0, 150));
console.log("  crashed:", body.includes("Room not found") ? "YES — Room not found" : "no");

// Now open the same code in a fresh tab, the way a shared link is used.
if (code && !code.includes("(")) {
  const p2 = await ctx.newPage();
  await p2.goto(`${BASE}/rooms/${code}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await p2.waitForTimeout(4000);
  const b2 = (await p2.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  console.log("reopening the code →", b2.includes("Room not found") ? "Room not found" : b2.slice(0, 120));
}
for (const e of [...new Set(errs)].slice(0, 4)) console.log("  " + e);
await browser.close();
