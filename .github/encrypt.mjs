// Encrypts love-page photos and videos added after the vault was switched on.
// Every plain file in photos/ becomes photos/<name>.enc (what the love page reads)
// and the plain copy is deleted. Commit and push the result afterwards.
//   VAULT_PASS="our secret word" node .github/encrypt.mjs
//   VAULT_PASS="our secret word" node .github/encrypt.mjs --robot-key   (prints the VAULT_KEY secret for Goldiee's robot)
// The secret word is only read from the environment, never saved anywhere.
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), "utf8");
globalThis.window = globalThis;
eval(read("diary/vault.js"));
const { Vault } = globalThis;

const pass = process.env.VAULT_PASS;
if (!pass) throw new Error('Set VAULT_PASS to the secret word: VAULT_PASS="…" node .github/encrypt.mjs');
const vaultFile = new URL("diary/vault.json", root);
if (!fs.existsSync(vaultFile)) throw new Error("The vault isn't switched on yet. Do that first from a phone in the diary's ⚙ settings (it encrypts everything already there).");
const vault = JSON.parse(fs.readFileSync(vaultFile, "utf8"));
const key = await Vault.unlock(vault, pass); // throws "That's not our secret word." if it's wrong

if (process.argv.includes("--robot-key")) {
  console.log(Vault.b64(new Uint8Array(await crypto.subtle.exportKey("raw", key))));
  process.exit(0);
}

const dir = new URL("photos/", root);
const plain = fs.readdirSync(dir).filter(f => !f.endsWith(".enc") && /^(image|video)\//.test(Vault.mimeOf(f)));
for (const f of plain) {
  const bytes = new Uint8Array(fs.readFileSync(new URL(f, dir)));
  fs.writeFileSync(new URL(f + ".enc", dir), await Vault.encryptBytes(key, bytes));
  fs.unlinkSync(new URL(f, dir));
  console.log(`photos/${f} → photos/${f}.enc`);
}
console.log(plain.length ? `Encrypted ${plain.length} file(s).` : "Nothing new to encrypt.");
