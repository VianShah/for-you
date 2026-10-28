// Goldiee's robot: runs every 15 minutes (see workflows/goldiee.yml).
// If someone's goldie points are below 0 during awake hours, Goldiee "cries"
// and the OTHER person gets a ping through ntfy. Uses the same rules as the site
// (diary/goldies.js). When the diary is encrypted it needs the VAULT_KEY secret.
import fs from "node:fs";
import { notifyPerson, loadContacts } from "./notify.mjs";

const PEOPLE = ["Vian", "Jovena"];
const read = p => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");

globalThis.window = globalThis;
eval(read("diary/vault.js"));
eval(read("diary/goldies.js"));
const { Vault, Goldies } = globalThis;

async function load() {
  let entries = JSON.parse(read("diary/entries.json"));
  let topics;
  const vaultPath = new URL("../diary/vault.json", import.meta.url);
  if (fs.existsSync(vaultPath)) {
    const raw = process.env.VAULT_KEY;
    if (!raw) throw new Error("The diary is encrypted: add the VAULT_KEY secret so Goldiee's robot can read the scores.");
    const vault = JSON.parse(fs.readFileSync(vaultPath, "utf8"));
    const key = await crypto.subtle.importKey("raw", Vault.unb64(raw), "AES-GCM", false, ["decrypt"]);
    if (entries.enc) entries = JSON.parse(await Vault.decryptText(key, entries.enc));
    topics = JSON.parse(await Vault.decryptText(key, vault.secrets)).topics;
  } else {
    // Before the vault: the topics are the plain ones in core.js.
    const m = read("diary/core.js").match(/let NOTIFY_TOPICS = (\{[^}]*\})/);
    topics = m && Function(`return (${m[1]})`)();
  }
  return { entries: Array.isArray(entries) ? entries : [], topics: topics || {} };
}

// DRY=1 prints instead of sending; NOW=<ISO time> pretends it is another moment (both for testing).
const now = process.env.NOW ? Date.parse(process.env.NOW) : Date.now();
const DRY = !!process.env.DRY;
// TEST=1 (the "test" box when running the workflow by hand) sends both phones a test notification.
if (process.env.TEST === "true" || process.env.TEST === "1") {
  const contacts = await loadContacts();
  for (const name of PEOPLE) await notifyPerson(name, { title: "🔔 Test from the diary", message: `Hi ${name}! If you can read this, notifications work 💌` }, contacts);
  process.exit(0);
}
if (!Goldies.isAwake(now)) { console.log("Night time: Goldiee is asleep too."); process.exit(0); }
const { entries, topics } = await load();
for (const name of PEOPLE) {
  const s = Goldies.score(entries, name, now);
  console.log(`${name}: ${s.points} goldies${s.crying ? " (crying)" : ""}`);
  if (!s.crying) continue;
  const other = PEOPLE.find(p => p !== name);
  if (!topics[other]) continue;
  const quiet = s.lastActive ? Math.round((now - s.lastActive) / 3600000) : null;
  if (DRY) { console.log(`  would ping ${other}: ${name} is at ${s.points} goldies`); continue; }
  await notifyPerson(other, {
    title: "😢 Goldiee is crying",
    message: `${name} is at ${s.points} goldies${quiet ? ` and hasn't written in ${quiet} h` : ""}. Send them a little nudge?`,
    tag: "crying",
  });
}
