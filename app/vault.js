/* ==========================================================
   The vault: everything personal in the repo is encrypted with
   AES-GCM using a key derived from your shared secret word
   (PBKDF2-SHA256, 600k rounds). The repo only ever holds
   scrambled bytes; the secret word never leaves your devices.
     diary/vault.json  → salt + a check value + encrypted secrets
                          (the GitHub key and notification topics)
   Used by the love page and the diary, so it only adds window.Vault.
   ========================================================== */
(() => {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const ITER = 600000;
  const CHECK = "for-you:ok";

  const b64 = bytes => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = str => Uint8Array.from(atob(str.replace(/\s/g, "")), c => c.charCodeAt(0));
  const store = {
    get(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
    set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} },
  };

  async function derive(pass, saltB64, iter = ITER) {
    const base = await crypto.subtle.importKey("raw", enc.encode(pass.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: unb64(saltB64), iterations: iter },
      base, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  }
  async function encryptBytes(key, bytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
    return out;
  }
  async function decryptBytes(key, bytes) {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.subarray(0, 12) }, key, bytes.subarray(12)));
  }
  const encryptText = async (key, str) => b64(await encryptBytes(key, enc.encode(str)));
  const decryptText = async (key, str) => dec.decode(await decryptBytes(key, unb64(str)));

  async function fetchVault(url) {
    try {
      const r = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return null;
      const v = await r.json();
      return v && v.salt && v.check ? v : null;
    } catch { return null; }
  }
  async function verify(vault, key) {
    try { return (await decryptText(key, vault.check)) === CHECK; } catch { return false; }
  }
  // Remembered per device (and per vault, so a new secret word invalidates old phones).
  const cacheName = vault => "diary-vault-key:" + vault.salt;
  async function cached(vault) {
    const raw = store.get(cacheName(vault));
    if (!raw) return null;
    try {
      const key = await crypto.subtle.importKey("raw", unb64(raw), "AES-GCM", true, ["encrypt", "decrypt"]);
      return (await verify(vault, key)) ? key : null;
    } catch { return null; }
  }
  async function remember(vault, key) {
    store.set(cacheName(vault), b64(new Uint8Array(await crypto.subtle.exportKey("raw", key))));
  }
  async function unlock(vault, pass) {
    const key = await derive(pass, vault.salt, vault.iter || ITER);
    if (!(await verify(vault, key))) throw new Error("That's not our secret word.");
    await remember(vault, key);
    return key;
  }
  function forget(vault) { if (vault) store.set(cacheName(vault), ""); }
  async function create(pass) {
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    const key = await derive(pass, salt);
    return { key, vault: { v: 1, kdf: "PBKDF2-SHA256", iter: ITER, salt, check: await encryptText(key, CHECK) } };
  }

  const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", m4a: "audio/mp4", mp4: "video/mp4", mov: "video/quicktime", webm: "audio/webm", ogg: "audio/ogg" };
  const mimeOf = path => MIME[(path.replace(/\.enc$/, "").split(".").pop() || "").toLowerCase()] || "application/octet-stream";
  const blobCache = new Map();
  // Fetches an encrypted file and hands back a local blob: URL to show or play it.
  async function mediaUrl(key, url, path = url) {
    if (blobCache.has(url)) return blobCache.get(url);
    const p = (async () => {
      const r = await fetch(url);
      if (!r.ok) throw new Error("couldn't load " + path);
      const bytes = await decryptBytes(key, new Uint8Array(await r.arrayBuffer()));
      return URL.createObjectURL(new Blob([bytes], { type: mimeOf(path) }));
    })();
    blobCache.set(url, p);
    p.catch(() => blobCache.delete(url));
    return p;
  }

  /* ---------- the "what's our secret word?" screen ---------- */
  const css = `
  .vault-lock { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; padding: 16px; text-align: center;
    background: radial-gradient(ellipse at 50% 40%, #f3d9d4, #fbf5ef 70%); color: #3a2026; font-family: "Jost", system-ui, sans-serif; transition: opacity .6s; }
  .vault-lock.gone { opacity: 0; pointer-events: none; }
  .vault-lock, .vault-lock * { cursor: auto !important; }
  .vault-lock button { cursor: pointer !important; }
  .vault-lock form { width: min(380px, 100%); display: grid; gap: 14px; }
  .vault-lock .vl-eyebrow { font-size: 11px; letter-spacing: .4em; text-transform: uppercase; color: #9a7a7f; }
  .vault-lock h1 { font-family: "Pinyon Script", cursive; font-weight: 400; color: #6e2337; font-size: clamp(48px, 12vw, 72px); line-height: 1.05; }
  .vault-lock p { font-family: "Cormorant Garamond", Georgia, serif; font-style: italic; font-size: 19px; }
  .vault-lock input { font: inherit; font-size: 17px; text-align: center; padding: 14px 16px; border-radius: 999px; border: 1px solid rgba(110,35,55,.2); background: #fff; color: #3a2026; outline: none; }
  .vault-lock input:focus { border-color: #d97b86; }
  .vault-lock button { font: inherit; font-size: 15px; padding: 14px 22px; border-radius: 999px; border: none; background: #6e2337; color: #fbf5ef; cursor: pointer; }
  .vault-lock button:disabled { opacity: .6; }
  .vault-lock .vl-err { min-height: 20px; font-size: 14px; color: #b3263e; }
  .vault-lock.shake form { animation: vl-shake .45s; }
  @keyframes vl-shake { 20%, 60% { transform: translateX(-8px); } 40%, 80% { transform: translateX(8px); } }
  :root[data-theme="dark"] .vault-lock { background: radial-gradient(ellipse at 50% 40%, #3a1a24, #161013 70%); color: #f2e4e7; }
  :root[data-theme="dark"] .vault-lock h1 { color: #f2a7b1; }
  :root[data-theme="dark"] .vault-lock .vl-eyebrow { color: #b79ca2; }
  :root[data-theme="dark"] .vault-lock input { background: #1a1214; color: #f2e4e7; border-color: rgba(243,214,219,.2); }
  :root[data-theme="dark"] .vault-lock button { background: #a33a55; color: #fff; }
  :root[data-theme="dark"] .vault-lock .vl-err { color: #ff9aa8; }
  @media (prefers-reduced-motion: reduce) { .vault-lock, .vault-lock * { animation: none !important; transition: none !important; } }`;
  function style() {
    if (document.getElementById("vault-lock-css")) return;
    const s = document.createElement("style"); s.id = "vault-lock-css"; s.textContent = css; document.head.appendChild(s);
  }
  function lockScreen(vault, { title = "For your eyes only", hint = "Type our secret word to come in." } = {}) {
    return new Promise(resolve => {
      style();
      const el = document.createElement("div");
      el.className = "vault-lock";
      el.innerHTML = `<form autocomplete="off">
        <div class="vl-eyebrow">just the two of us</div>
        <h1></h1><p></p>
        <input type="password" placeholder="our secret word" autocomplete="current-password" aria-label="Secret word" required>
        <button type="submit">come in ♥</button>
        <div class="vl-err" role="alert"></div></form>`;
      el.querySelector("h1").textContent = title;
      el.querySelector("p").textContent = hint;
      document.body.appendChild(el);
      const input = el.querySelector("input"), btn = el.querySelector("button"), err = el.querySelector(".vl-err");
      setTimeout(() => input.focus(), 50);
      el.querySelector("form").addEventListener("submit", async e => {
        e.preventDefault();
        btn.disabled = true; err.textContent = ""; btn.textContent = "unlocking…";
        try {
          const key = await unlock(vault, input.value);
          el.classList.add("gone");
          setTimeout(() => el.remove(), 650);
          resolve(key);
        } catch (ex) {
          err.textContent = ex.message || "That didn't work.";
          el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake");
          input.select();
        } finally { btn.disabled = false; btn.textContent = "come in ♥"; }
      });
    });
  }

  window.Vault = { b64, unb64, derive, encryptBytes, decryptBytes, encryptText, decryptText, fetchVault, cached, unlock, remember, forget, create, mediaUrl, mimeOf, lockScreen, style };
})();
