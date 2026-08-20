import fs from "node:fs";
const model = process.argv[2];
const tok = JSON.parse(fs.readFileSync("./zzsession.json", "utf8")).access_token;
const t0 = Date.now();
const res = await fetch("https://dapai.lovable.app/api/chat", {
  method: "POST",
  headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    chatId: "66666666-7777-4888-8999-aaaaaaaaaaaa",
    text: "List three facts about the Moon, one short sentence each.",
    model,
  }),
});
const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = "", tokens = 0, chars = 0, first = null, last = null, stages = [], err = null;
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  const parts = buf.split(/\n\n/); buf = parts.pop() ?? "";
  for (const p of parts) {
    const line = p.split("\n").find((l) => l.startsWith("data:"));
    if (!line) continue;
    let f; try { f = JSON.parse(line.slice(5).trim()); } catch { continue; }
    const at = Date.now() - t0;
    if (f.type === "token") { tokens++; chars += (f.text || "").length; if (first === null) first = at; last = at; }
    else if (f.type === "status") stages.push(f.stage);
    else if (f.type === "error") err = `${f.message} | ${f.detail ?? ""}`;
  }
}
const s = (ms) => ms === null ? "-" : (ms / 1000).toFixed(1) + "s";
console.log(`${model.padEnd(16)} frames=${String(tokens).padEnd(4)} chars=${String(chars).padEnd(5)} first=${s(first).padEnd(6)} last=${s(last).padEnd(6)} spread=${first !== null ? s(last - first) : "-"} stages=[${stages.join(",")}]`);
if (err) console.log(`  ERROR ${err}`);
