/* ==========================================================
   Couples 💑: every couple has its own diary, opened with its own code.
     · One of you starts a diary and gets a code like  KM7Q-X2PA-9RTD-WH4C
     · The other types it in (or taps the link) and you share that diary
     · The code is the key: everything is encrypted on your phones with it,
       so nobody else (not even the server) can read your pages or pictures,
       and two couples never see each other's diaries.
   Storage is Supabase: small encrypted files in a table (through the
   "couple" edge function) and encrypted pictures in a storage bucket.
   Loaded before core.js; adds window.Couple.
   ========================================================== */
(() => {
  const SB_URL = "https://egvoajakldcsdyhbprxg.supabase.co";
  const SB_ANON = "sb_publishable_77nVBUH5IkF7YmqLrckWlw_C0uorJkg"; // public by design: the tables only open through the couple function
  const FN = SB_URL + "/functions/v1/couple";
  const STORE = "couple-v1";
  const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L: easy to read out loud
  const te = new TextEncoder();
  const store = {
    get(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
    set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} },
  };
  const hex = b => [...b].map(x => x.toString(16).padStart(2, "0")).join("");

  function newCode() {
    let s = "";
    while (s.length < 16) for (const b of crypto.getRandomValues(new Uint8Array(32))) if (b < 248 && s.length < 16) s += ALPHA[b % 31];
    return pretty(s);
  }
  const norm = code => String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const pretty = code => norm(code).replace(/(.{4})(?=.)/g, "$1-");

  // Everything comes from the code: the couple's id, the secret the server checks, and the key that
  // unwraps the diary's own key. (The diary key is random, or the old one for the first diary.)
  async function derive(code) {
    const base = await crypto.subtle.importKey("raw", te.encode("for-you:" + norm(code)), "PBKDF2", false, ["deriveBits"]);
    const seed = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: te.encode("for-you couple v1"), iterations: 310000 }, base, 256);
    const hk = await crypto.subtle.importKey("raw", seed, "HKDF", false, ["deriveBits"]);
    const part = async (info, n) => new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: te.encode(info) }, hk, n * 8));
    const wrap = await crypto.subtle.importKey("raw", await part("wrap", 32), "AES-GCM", false, ["encrypt", "decrypt"]);
    return { cid: hex(await part("id", 16)), auth: Vault.b64(await part("auth", 32)), wrap };
  }
  const sha256hex = async s => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(s))));

  let S = null; // this phone's couple: { code, cid, auth, key (CryptoKey), settings }
  async function call(action, body = {}, who = S) {
    if (!/^https:\/\//.test(SB_URL)) { const e = new Error("New diaries can't be made just yet: the diary server isn't switched on. Try again soon ♥"); e.status = 503; throw e; }
    const r = await fetch(FN, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SB_ANON, ...(who ? { "x-couple": who.cid, "x-auth": who.auth } : {}) },
      body: JSON.stringify({ action, ...body }),
    });
    let j = {}; try { j = await r.json(); } catch {}
    if (!r.ok) { const e = new Error(j.error || `The diary server said ${r.status}`); e.status = r.status; throw e; }
    return j;
  }
  const mediaUrl = path => `${SB_URL}/storage/v1/object/public/couples/${S.cid}/${path}`;
  async function upload(path, bytes) {
    const { url } = await call("upload", { path });
    const r = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "x-upsert": "true" }, body: bytes });
    if (!r.ok) { const e = new Error(`Couldn't upload (${r.status})`); e.status = r.status; throw e; }
  }

  async function remember(code, d, keyRaw, settings) {
    store.set(STORE, JSON.stringify({ code: pretty(code), cid: d.cid, auth: d.auth, key: Vault.b64(keyRaw), settings }));
  }
  // This phone's couple, or null (then the welcome screen asks for a code).
  async function session() {
    if (S) return S;
    try {
      const c = JSON.parse(store.get(STORE) || "null");
      if (!c?.cid) return null;
      const key = await crypto.subtle.importKey("raw", Vault.unb64(c.key), "AES-GCM", true, ["encrypt", "decrypt"]);
      S = { ...c, key };
      return S;
    } catch { return null; }
  }
  const cachedSettings = () => { try { return JSON.parse(store.get(STORE) || "null")?.settings || null; } catch { return null; } };
  function forget() { store.set(STORE, ""); S = null; }
  const has = () => { try { return !!JSON.parse(store.get(STORE) || "null")?.cid; } catch { return false; } };

  // The couple's settings (names, notification topics, FaceTime numbers, goldie rules), encrypted like a page.
  async function loadSettings() {
    const r = await call("get", { path: "settings" });
    if (!r.body) return cachedSettings() || {};
    const s = JSON.parse(await Vault.decryptText(S.key, r.body));
    const c = JSON.parse(store.get(STORE)); c.settings = s; store.set(STORE, JSON.stringify(c));
    S.settings = s;
    return s;
  }
  async function saveSettings(change) {
    for (let i = 0; i < 4; i++) {
      const r = await call("get", { path: "settings" });
      const cur = r.body ? JSON.parse(await Vault.decryptText(S.key, r.body)) : {};
      const next = change(cur);
      try {
        await call("put", { path: "settings", body: await Vault.encryptText(S.key, JSON.stringify(next)), version: r.version });
        const c = JSON.parse(store.get(STORE)); c.settings = next; store.set(STORE, JSON.stringify(c));
        S.settings = next;
        return next;
      } catch (e) { if (e.status !== 409) throw e; }
    }
    throw new Error("Couldn't save, try again.");
  }

  // Starting a diary needs an invite: a link like …/app/#invite=… (one diary per invite).
  const INVITE = "couple-invite";
  function takeInvite() {
    const m = location.hash.match(/^#invite=([A-Za-z0-9-]+)/);
    if (m) { store.set(INVITE, m[1]); history.replaceState(null, "", location.pathname + location.search); }
    return store.get(INVITE);
  }
  // A brand-new diary.
  async function create(code, settings, keyRaw = crypto.getRandomValues(new Uint8Array(32))) {
    const d = await derive(code);
    const meta = JSON.stringify({ v: 1, wrapped: Vault.b64(await Vault.encryptBytes(d.wrap, keyRaw)) });
    await call("create", { cid: d.cid, authHash: await sha256hex(d.auth), meta, invite: store.get(INVITE) }, null);
    store.set(INVITE, "");
    await remember(code, d, keyRaw, settings);
    S = null; await session();
    await call("put", { path: "settings", body: await Vault.encryptText(S.key, JSON.stringify(settings)), version: 0 });
    return S;
  }
  // Opening a diary with its code: unwraps the diary key, reads who's in it.
  async function join(code) {
    const d = await derive(code);
    let r;
    try { r = await call("get", { path: "meta" }, d); }
    catch (e) { if (e.status === 401) throw new Error("That code doesn't open any diary. Check it and try again."); throw e; }
    const keyRaw = await Vault.decryptBytes(d.wrap, Vault.unb64(JSON.parse(r.body).wrapped));
    await remember(code, d, keyRaw, null);
    S = null; await session();
    return loadSettings();
  }

  /* ---------- the welcome screen: start a diary, or come in with a code ---------- */
  const css = `
  .couple-gate .cg-row { display: grid; gap: 10px; }
  .couple-gate .cg-alt { background: transparent !important; color: inherit !important; border: 1px solid rgba(110,35,55,.25) !important; }
  .couple-gate .cg-link { background: none !important; color: #9a7a7f !important; font-size: 13px !important; padding: 6px !important; text-decoration: underline; }
  .couple-gate .cg-code { font-family: ui-monospace, Menlo, monospace; font-size: clamp(20px, 6.5vw, 28px); letter-spacing: .08em; padding: 16px; border-radius: 16px; background: rgba(255,255,255,.7); color: #6e2337; user-select: all; word-break: break-all; }
  .couple-gate .cg-small { font-family: "Jost", system-ui, sans-serif; font-style: normal; font-size: 14px; line-height: 1.5; opacity: .85; }
  .couple-gate .cg-names { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
  .couple-gate .cg-names button { min-width: 120px; }
  :root[data-theme="dark"] .couple-gate .cg-code { background: rgba(255,255,255,.08); color: #f2a7b1; }
  :root[data-theme="dark"] .couple-gate .cg-alt { border-color: rgba(243,214,219,.3) !important; }`;
  const escH = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const shareLink = code => `${location.origin}${location.pathname.replace(/[^/]*$/, "")}#code=${norm(code)}`;

  // Resolves once this phone has a couple.
  function welcome({ first = "home", onClose } = {}) {
    Vault.style();
    if (!document.getElementById("couple-css")) { const s = document.createElement("style"); s.id = "couple-css"; s.textContent = css; document.head.appendChild(s); }
    return new Promise(resolve => {
      const el = document.createElement("div");
      el.className = "vault-lock couple-gate";
      document.body.appendChild(el);
      const done = () => { el.classList.add("gone"); setTimeout(() => el.remove(), 650); resolve(); };
      const view = html => { el.innerHTML = `<form autocomplete="off">${html}<div class="vl-err" role="alert"></div></form>`; };
      const err = msg => { el.querySelector(".vl-err").textContent = msg; el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); };
      const busy = (btn, label) => { btn.disabled = !!label; if (label) { btn.dataset.l = btn.textContent; btn.textContent = label; } else btn.textContent = btn.dataset.l || btn.textContent; };

      function home() {
        view(`<div class="vl-eyebrow">just the two of you</div><h1>Our little diary</h1>
          <p>A private diary for two: notes, pictures, voices and little games.</p>
          <div class="cg-row"><button type="button" data-go="start">✨ start a diary for us</button>
          <button type="button" class="cg-alt" data-go="join">💌 I have a code</button>
          ${onClose ? `<button type="button" class="cg-link" data-go="close">just looking at the sample →</button>` : ""}</div>`);
      }
      function start() {
        if (!takeInvite()) return view(`<div class="vl-eyebrow">a new diary</div><h1>You'll need an invite</h1>
          <p>Diaries here are started from an invite link. Ask whoever told you about it to send you one.</p>
          <p class="cg-small">Already have a diary? Your partner can send you your code.</p>
          <button type="button" class="cg-alt" data-go="join">💌 I have a code</button>
          <button type="button" class="cg-link" data-go="home">← back</button>`);
        view(`<div class="vl-eyebrow">a new diary</div><h1>Who's it for?</h1>
          <input name="me" placeholder="your name" maxlength="30" required>
          <input name="them" placeholder="your partner's name" maxlength="30" required>
          <button type="submit">make our diary ♥</button>
          <button type="button" class="cg-link" data-go="home">← back</button>`);
        el.querySelector("form").onsubmit = async e => {
          e.preventDefault();
          const me = e.target.me.value.trim(), them = e.target.them.value.trim();
          if (!me || !them || me.toLowerCase() === them.toLowerCase()) return err("Type two different names.");
          const btn = e.target.querySelector("[type=submit]"); busy(btn, "making it…");
          try {
            const code = newCode();
            await create(code, { people: [me, them], start: new Date().toISOString() });
            store.set("diary-name", me);
            showCode(code, them);
          } catch (ex) { err(ex.message); busy(btn); }
        };
      }
      function showCode(code, them) {
        view(`<div class="vl-eyebrow">your diary is ready</div><h1>Your code</h1>
          <div class="cg-code">${escH(pretty(code))}</div>
          <p class="cg-small">Send this to ${escH(them)} so you share the same diary. It's the only way in, so keep it safe:
            anyone with it can read your diary, and if you both lose it, nothing can be recovered.<br>(It's also in ⚙ settings on this phone.)</p>
          <button type="button" data-share>💌 send ${escH(them)} the link</button>
          <button type="button" class="cg-alt" data-go="in">open our diary →</button>`);
        el.querySelector("[data-share]").onclick = async () => {
          const link = shareLink(code), text = `Our diary 💌 Tap to open it: ${link}\n(or type the code ${pretty(code)})`;
          try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); err("Copied. Paste it to " + them + " ♥"); } }
          catch { /* closed the share sheet */ }
        };
      }
      function joinView(prefill = "") {
        view(`<div class="vl-eyebrow">come in</div><h1>Your code</h1>
          <p>Type the code your partner sent you.</p>
          <input name="code" placeholder="XXXX-XXXX-XXXX-XXXX" autocapitalize="characters" autocomplete="off" spellcheck="false" required value="${escH(pretty(prefill))}">
          <button type="submit">open our diary ♥</button>
          <button type="button" class="cg-link" data-go="home">← back</button>`);
        const form = el.querySelector("form");
        form.onsubmit = async e => {
          e.preventDefault();
          if (norm(form.code.value).length !== 16) return err("The code has 16 letters and numbers.");
          const btn = form.querySelector("[type=submit]"); busy(btn, "opening…");
          try { const s = await join(form.code.value); pickMe(s.people || []); }
          catch (ex) { err(ex.message); busy(btn); }
        };
        if (prefill) form.requestSubmit();
      }
      function pickMe(people) {
        view(`<div class="vl-eyebrow">one last thing</div><h1>Who are you?</h1>
          <div class="cg-names">${people.map(p => `<button type="button" data-me="${escH(p)}">${escH(p)}</button>`).join("")}</div>`);
      }
      el.addEventListener("click", e => {
        const go = e.target.closest("[data-go]")?.dataset.go;
        if (go === "close") { el.classList.add("gone"); setTimeout(() => el.remove(), 650); onClose(); return; } if (go === "home") home(); else if (go === "start") start(); else if (go === "join") joinView(); else if (go === "in") done();
        const me = e.target.closest("[data-me]")?.dataset.me;
        if (me) { store.set("diary-name", me); done(); }
      });
      // Opened from a shared link: …/diary/#code=KM7QX2PA9RTDWH4C
      const m = location.hash.match(/^#code=([A-Za-z0-9-]+)/);
      if (m) { history.replaceState(null, "", location.pathname + location.search); joinView(m[1]); } else if (first === "join") joinView(); else if (first === "start") start(); else home();
    });
  }

  window.Couple = { has, SB_URL, takeInvite, newCode, pretty, norm, derive, session, call, mediaUrl, upload, create, join, forget, loadSettings, saveSettings, cachedSettings, welcome, shareLink,
    get code() { return S?.code || ""; } };
})();
