import { chromium } from "playwright";
import { ProxyAgent, request as ureq } from "undici";
import fs from "node:fs/promises";

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const dispatcher = proxy
  ? new ProxyAgent({ uri: proxy, requestTls: { ca: await fs.readFile("/root/.ccr/ca-bundle.crt") } })
  : undefined;

const BASE = "https://dapai.lovable.app";
const ROUTES = process.argv.slice(3);
const signedIn = process.argv[2] === "in";

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext();
await ctx.route("**/*", async (route) => {
  const r = route.request();
  try {
    const res = await ureq(r.url(), {
      method: r.method(),
      headers: { ...r.headers(), "accept-encoding": "identity" },
      body: r.postData() ?? undefined,
      dispatcher,
    });
    const buf = Buffer.from(await res.body.arrayBuffer());
    const h = { ...res.headers };
    delete h["content-encoding"]; delete h["content-length"];
    await route.fulfill({ status: res.statusCode, headers: h, body: buf });
  } catch {
    await route.abort();
  }
});

if (signedIn) {
  const sess = JSON.parse(await fs.readFile("./zzsession.json", "utf8"));
  await ctx.addInitScript((s) => {
    try { localStorage.setItem("sb-ydjuoqizridueiuxnbqk-auth-token", JSON.stringify(s)); } catch {}
  }, sess);
}

for (const path of ROUTES) {
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERROR " + (e.message || "").slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console " + m.text().slice(0, 160)); });
  let status = "?";
  try {
    const r = await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45000 });
    status = r?.status() ?? "?";
    await page.waitForTimeout(3500);
  } catch (e) { errs.push("goto " + String(e.message).slice(0, 100)); }
  const boundary = await page.locator("text=Something went wrong").count().catch(() => 0);
  const notFound = await page.locator("text=Page not found").count().catch(() => 0);
  const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 90);
  const uniq = [...new Set(errs)];
  const flag = boundary ? "CRASH" : notFound ? "404page" : uniq.length ? "errs" : "ok";
  console.log(`${flag.padEnd(8)} ${String(status).padEnd(4)} ${path.padEnd(30)} ${body}`);
  for (const e of uniq.slice(0, 3)) console.log(`         ↳ ${e}`);
  await page.close();
}
await browser.close();
