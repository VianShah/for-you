// Delivers one notification to one person: a web push to each phone they turned notifications on for
// (tapping it opens the diary app), or the old ntfy ping when they have none.
// Run by workflows/notify.yml when a phone asks for it (repository_dispatch "notify"),
// and imported by goldiee-robot.mjs for the crying pings.
import fs from "node:fs";
import { sendPush } from "./push.mjs";

const PEOPLE = ["Vian", "Jovena"];
const read = p => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");
globalThis.window = globalThis;
if (!globalThis.Vault) eval(read("diary/vault.js"));

// { subs: { Vian: [...], Jovena: [...] }, topics: { Vian, Jovena } }
export async function loadContacts() {
  const raw = process.env.VAULT_KEY;
  if (!raw) throw new Error("Needs the VAULT_KEY secret.");
  const key = await crypto.subtle.importKey("raw", Vault.unb64(raw), "AES-GCM", false, ["decrypt"]);
  const vault = JSON.parse(read("diary/vault.json"));
  const topics = JSON.parse(await Vault.decryptText(key, vault.secrets)).topics || {};
  let subs = {};
  if (fs.existsSync(new URL("../diary/push.json", import.meta.url))) {
    const data = JSON.parse(read("diary/push.json"));
    subs = data.enc ? JSON.parse(await Vault.decryptText(key, data.enc)) : data;
  }
  return { subs, topics };
}

export async function notifyPerson(name, { title, message, url = "diary/", tag }, contacts) {
  const { subs, topics } = contacts || await loadContacts();
  let delivered = 0;
  for (const sub of subs[name] || []) {
    try {
      const status = await sendPush(sub, { title, body: message, url, tag }, process.env.VAPID_PRIVATE);
      console.log(`push to ${name}: ${status}`);
      if (status >= 200 && status < 300) delivered++;
    } catch (e) { console.log(`push to ${name} failed: ${e.message}`); }
  }
  if (delivered || !topics[name]) return delivered;
  const res = await fetch("https://ntfy.sh/", { method: "POST", body: JSON.stringify({ topic: topics[name], title, message, tags: ["love_letter"] }) });
  console.log(`ntfy to ${name}: ${res.status}`);
  return 0;
}

// Run directly: PAYLOAD = { to, title, message, url } from the phone that asked.
if (process.env.PAYLOAD) {
  const p = JSON.parse(process.env.PAYLOAD || "{}");
  if (!PEOPLE.includes(p.to)) { console.log("Nobody to notify."); process.exit(0); }
  const clip = (s, n) => String(s || "").slice(0, n);
  const url = /^diary\/[\w./#-]*$/.test(p.url || "") ? p.url : "diary/";
  await notifyPerson(p.to, { title: clip(p.title, 120) || "Our diary 💌", message: clip(p.message, 300), url });
}
