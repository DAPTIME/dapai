import { chromium } from "playwright";
import { ProxyAgent, request as ureq } from "undici";
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const dispatcher = proxy ? new ProxyAgent({ uri: proxy, requestTls: { ca: await (await import("node:fs/promises")).readFile("/root/.ccr/ca-bundle.crt") } }) : undefined;

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext();
// Fulfil every request through Node so TLS terminates against the proxy CA.
await ctx.route("**/*", async (route) => {
  const r = route.request();
  try {
    const res = await ureq(r.url(), {
      method: r.method(), headers: { ...r.headers(), "accept-encoding": "identity" },
      body: r.postData() ?? undefined, dispatcher,
    });
    const buf = Buffer.from(await res.body.arrayBuffer());
    const h = { ...res.headers }; delete h["content-encoding"]; delete h["content-length"];
    await route.fulfill({ status: res.statusCode, headers: h, body: buf });
  } catch (e) { console.log("ROUTE FAIL", r.url().slice(0,80), String(e).slice(0,200)); await route.abort(); }
});

const errors = [];
// Sign the browser in the way supabase-js does: the session in localStorage.
const sess = JSON.parse(await (await import("node:fs/promises")).readFile("./zzsession.json", "utf8"));
await ctx.addInitScript((sess) => {
  try {
    localStorage.setItem("sb-ydjuoqizridueiuxnbqk-auth-token", JSON.stringify(sess));
  } catch { /* ignore */ }
}, sess);
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 400)); });
page.on("pageerror", (e) => errors.push("PAGEERROR: " + (e.stack || e.message).slice(0, 700)));

const url = process.argv[2];
await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch((e) => errors.push("goto: " + e.message));
await page.waitForTimeout(3000);
const boundary = await page.locator("text=Something went wrong").count().catch(() => 0);
const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 300);
console.log("URL:", url);
console.log("error-boundary visible:", boundary);
console.log("--- visible text ---\n" + body);
console.log("--- errors ---");
for (const e of [...new Set(errors)].slice(0, 6)) console.log(e);
await browser.close();
