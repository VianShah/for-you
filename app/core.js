/* ==========================================================
   Shared by the diary, the mini games and the shop.
   Each couple has its own diary (see couple.js), opened with its code:
     diary/entries.json  → the list of all pages (encrypted)
     diary/media/…       → pictures, videos and voice notes (encrypted)
   Both live on the diary server (Supabase); the code's key never leaves the phones.
   ========================================================== */
const OWNER = "VianShah"; // the site's GitHub repo (and where the first diary lived before it moved)
const REPO = "for-you";
const BRANCH = "main";
const INDEX = "diary/entries.json";
const MEDIA_DIR = "diary/media/";

// From the couple's settings (encrypted on the server): ntfy topics for phones without
// notifications switched on, and each person's FaceTime number.
let NOTIFY_TOPICS = {};
let PHONES = {};

// The diary's key (CRYPTO_KEY); VAULT is set once this phone is in a couple's diary.
let VAULT = null;
let CRYPTO_KEY = null;

const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- per-device settings (may be unavailable in private mode) ---------- */
const store = {
  get(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
  set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} },
};
// The two names come from this phone's couple, remembered so they're known before anything is drawn.
// No code on this phone yet: it shows the sample diary (demo.js), read-only, with a way to start your own.
const DEMO = !Couple.has();
const PEOPLE = DEMO ? [...DEMO_PEOPLE] : [...(Couple.cachedSettings()?.people || []), "", ""].slice(0, 2);
let KEY = ""; // truthy once this phone is in a diary: it can write
let NAME = store.get("diary-name") && PEOPLE.includes(store.get("diary-name")) ? store.get("diary-name") : "";
const partnerOf = name => PEOPLE.find(p => p !== name) || PEOPLE[1];
const justPaired = false;
// Each couple's goldie rules: points count from the day the diary started (plus any by-hand bonuses).
function applyCoupleRules(s) {
  if (!s || !window.Goldies) return;
  Goldies.configure({ START: s.start || new Date().toISOString(), BONUS: s.rules?.BONUS || {}, SET_TO: s.rules?.SET_TO || {}, CALLER_FROM: s.rules?.CALLER_FROM || s.start });
}
applyCoupleRules(DEMO ? demoSettings() : Couple.cachedSettings());

/* ---------- GitHub helpers ---------- */
const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents/`;
function headers() {
  const h = { Accept: "application/vnd.github+json" };
  if (KEY) h.Authorization = `Bearer ${KEY}`;
  return h;
}
function toB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromB64(b64) {
  const bin = atob(b64.replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}
function blobToB64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}
async function ghError(res) {
  let msg = `GitHub said ${res.status}`;
  try { msg += ": " + (await res.json()).message; } catch {}
  if (res.status === 401) msg = "The diary key isn't working. Check it in ⚙ settings.";
  if (res.status === 403 || res.status === 404) msg = "The diary key can't write to this diary. It needs Contents: read & write on " + REPO + ".";
  const e = new Error(msg); e.status = res.status; return e;
}

/* ---------- vault ---------- */
const rawUrl = path => `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${path}`; // the site's own files on GitHub

// Returns "unlocked" once this phone is in a couple's diary. Without one, the welcome screen
// (start a diary, or come in with a code) stays up until it is, then the page starts over.
async function initVault() {
  // Every script on the page has to be in before anything is drawn.
  if (document.readyState === "loading") await new Promise(r => document.addEventListener("DOMContentLoaded", r, { once: true }));
  let s = await Couple.session();
  const linkCode = location.hash.match(/^#code=([A-Za-z0-9-]+)/)?.[1];
  if (s && linkCode && Couple.norm(linkCode) !== Couple.norm(s.code)) { Couple.forget(); s = null; } // a link to another diary
  if (s && linkCode) history.replaceState(null, "", location.pathname + location.search);
  if (!s && linkCode) { await openGate(); return new Promise(() => {}); } // opened from a partner's link: straight to joining
  if (!s && Couple.takeInvite()) { await openGate("start"); return new Promise(() => {}); } // opened from an invite: straight to starting one
  if (!s) { showDemoBar(); return "demo"; }
  CRYPTO_KEY = s.key; VAULT = { couple: true }; KEY = "couple";
  let settings = s.settings || {};
  try { settings = await Couple.loadSettings(); } catch {}
  NOTIFY_TOPICS = settings.topics || {};
  PHONES = settings.phones || {};
  // Scores set by hand for this couple only (kept on the server against their diary, never shared).
  let byHand = {};
  try { byHand = (await Couple.call("rules")).rules || {}; } catch {}
  applyCoupleRules({ ...settings, rules: { ...settings.rules, ...byHand } });
  if (!settings.lovePage) $$("a.back").forEach(a => { a.hidden = true; }); // the love page is the first couple's own
  // Names changed since this phone last looked (e.g. just joined): start over with the right ones.
  if (settings.people?.length === 2 && settings.people.join("|") !== PEOPLE.join("|")) { location.reload(); return new Promise(() => {}); }
  return "unlocked";
}
async function applyVaultKey(key) { CRYPTO_KEY = key; }

// The welcome screen (start a diary with an invite, or come in with a code), then a fresh start.
async function openGate(first = "home") {
  let closed = false;
  await Couple.welcome({ first, onClose: DEMO && !location.hash.startsWith("#code=") ? () => { closed = true; } : null });
  if (!closed) location.reload();
}
function showDemoBar() {
  const bar = document.createElement("div");
  bar.className = "demo-bar";
  bar.innerHTML = `<span>👀 a sample diary for two</span><button type="button" data-gate="start">✨ start yours</button><button type="button" data-gate="join">💌 I have a code</button>`;
  bar.addEventListener("click", e => { const b = e.target.closest("[data-gate]"); if (b) openGate(b.dataset.gate === "join" ? "join" : "home"); });
  document.body.prepend(bar);
  document.body.classList.add("is-demo");
  $$("a.back").forEach(a => { a.hidden = true; }); // the love page belongs to a real couple
}
const demoOnly = () => { openGate(); const e = new Error("This is a sample diary. Start your own to write in it ✨"); e.demo = true; return e; };
// entries.json is either a plain list or { v, enc } once the vault is on.
async function decodeIndex(data) {
  if (Array.isArray(data)) return data;
  if (data && data.enc) {
    if (!CRYPTO_KEY) throw new Error("The diary is locked.");
    return JSON.parse(await Vault.decryptText(CRYPTO_KEY, data.enc));
  }
  return [];
}
async function encodeIndex(list) {
  const text = JSON.stringify(list, null, 2);
  return VAULT && CRYPTO_KEY ? JSON.stringify({ v: 1, enc: await Vault.encryptText(CRYPTO_KEY, text) }) + "\n" : text + "\n";
}

let indexVersion = 0;
async function loadIndex() {
  if (DEMO) return { entries: demoEntries(), sha: null };
  const r = await Couple.call("get", { path: INDEX });
  indexVersion = r.version;
  return { entries: r.body ? await decodeIndex(JSON.parse(r.body)) : [], sha: null };
}

/* ---------- auto refresh ---------- */
// Every 15–25 seconds (and straight away when you come back to the page, e.g. from a
// notification) the page checks for changes and redraws only if something changed.
// GitHub answers "nothing new" (304) for free, so this barely touches the rate limit.
// It waits while you're busy: writing, recording, playing something, or in a popup.
async function fetchIndexIfChanged() {
  if (DEMO) return null;
  const r = await Couple.call("get", { path: INDEX, have: indexVersion });
  if (r.same || r.version === indexVersion) return null;
  indexVersion = r.version;
  return r.body ? decodeIndex(JSON.parse(r.body)) : [];
}
function pageBusy() {
  if (document.hidden) return true;
  if ($$(".sheet-back, .lightbox, .vault-lock").some(el => !el.hidden && el.isConnected && !el.matches("#postBack"))) return true; // an open page is fine, it refreshes too
  if ($$("video, audio").some(m => !m.paused)) return true;
  if ($$(".recording").length) return true;
  // Something typed but not sent yet, anywhere on the page.
  return $$("textarea, input[type=text], input:not([type])").some(el => el.value.trim() && el.offsetParent !== null) || document.activeElement?.matches?.("textarea, input");
}
function startAutoRefresh(apply, first) {
  let last = JSON.stringify(first || []), running = false;
  async function check() {
    if (running || pageBusy()) return;
    running = true;
    try {
      const list = await fetchIndexIfChanged();
      const text = list && JSON.stringify(list);
      if (list && text !== last) { last = text; apply(list); }
    } catch {} finally { running = false; }
  }
  (function loop() { setTimeout(async () => { await check(); loop(); }, 15000 + Math.random() * 10000); })();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(check, 400); });
}

// A picture, video or voice note (already encrypted by packMedia) goes up to the couple's storage.
async function putFile(path, b64) {
  if (DEMO) throw demoOnly();
  await Couple.upload(path, Vault.unb64(b64));
  return { content: { sha: "" } };
}
async function deleteFile(path) {
  if (DEMO) throw demoOnly();
  await Couple.call("remove", { paths: [path] });
}

// Read-modify-write the page list, retrying if the other person saved at the same moment.
async function updateIndex(change) {
  if (DEMO) throw demoOnly();
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await Couple.call("get", { path: INDEX });
    const list = r.body ? await decodeIndex(JSON.parse(r.body)) : [];
    const next = change(list);
    try {
      const w = await Couple.call("put", { path: INDEX, body: (await encodeIndex(next)).trim(), version: r.version });
      indexVersion = w.version;
      return next;
    } catch (e) {
      if (e.status !== 409) throw e;
    }
  }
  throw new Error("Couldn't save. Try again in a moment.");
}

function mediaUrl(path) { return DEMO ? path.replace(/^diary\//, "") : Couple.mediaUrl(path); }
const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
// <img> attributes: plain files load directly, encrypted ones are filled in by hydrateMedia().
function imgSrcAttrs(path) {
  return path.endsWith(".enc") ? `src="${BLANK}" data-enc="${esc(path)}"` : `src="${esc(mediaUrl(path))}"`;
}
// A <video> for a page or reply, with its thumbnail as the poster; encrypted ones are filled in by hydrateMedia() too.
function videoHtml(path, cls = "", thumb = "") {
  const poster = !thumb ? "" : thumb.endsWith(".enc") ? `data-enc-poster="${esc(thumb)}"` : `poster="${esc(mediaUrl(thumb))}"`;
  return `<video class="${cls}" controls playsinline preload="metadata" ${poster} ${path.endsWith(".enc") ? `data-enc="${esc(path)}"` : `src="${esc(mediaUrl(path))}#t=0.1"`}></video>`;
}
// When a video is picked: a thumbnail (a frame half a second in) and whether it's landscape.
// Never fails: without a thumbnail the page just shows ▶.
function videoInfo(file) {
  return new Promise(resolve => {
    const v = document.createElement("video"), url = URL.createObjectURL(file);
    let done = false;
    const finish = r => { if (done) return; done = true; URL.revokeObjectURL(url); resolve(r); };
    setTimeout(() => finish({ thumb: null, wide: v.videoWidth > v.videoHeight }), 8000);
    Object.assign(v, { muted: true, playsInline: true, preload: "auto", src: url });
    v.setAttribute("playsinline", ""); v.setAttribute("muted", "");
    v.addEventListener("loadedmetadata", () => { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); }, { once: true });
    v.addEventListener("seeked", () => {
      const scale = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
      try { c.getContext("2d").drawImage(v, 0, 0, c.width, c.height); } catch { return finish({ thumb: null, wide: v.videoWidth > v.videoHeight }); }
      c.toBlob(b => finish({ thumb: b, wide: v.videoWidth > v.videoHeight }), "image/jpeg", 0.8);
    }, { once: true });
    v.addEventListener("error", () => finish({ thumb: null, wide: false }), { once: true });
    v.load();
  });
}
// Videos are big, so a page or reply takes one up to this size (about a minute of iPhone video).
const VIDEO_MAX_MB = 40;
const isVideoFile = f => /^video\//.test(f?.type || "") || /\.(mov|mp4|m4v)$/i.test(f?.name || "");
const videoExt = f => ({ "video/quicktime": "mov", "video/mp4": "mp4", "video/x-m4v": "mp4" }[f.type] || (f.name.match(/\.(mov|mp4|m4v)$/i)?.[1] || "mp4").toLowerCase().replace("m4v", "mp4"));
function videoTooBig(f) {
  if (f.size <= VIDEO_MAX_MB * 1e6) return false;
  toast(`That video is ${Math.round(f.size / 1e6)} MB. Keep it under ${VIDEO_MAX_MB} MB: trim it in Photos first (about a minute).`);
  return true;
}
function hydrateMedia(root = document) {
  if (!CRYPTO_KEY) return;
  $$("video[data-enc-poster]", root).forEach(v => {
    const path = v.dataset.encPoster;
    v.removeAttribute("data-enc-poster");
    Vault.mediaUrl(CRYPTO_KEY, mediaUrl(path), path).then(u => { v.poster = u; }).catch(() => {});
  });
  $$("video[data-enc]", root).forEach(v => {
    const path = v.dataset.enc;
    v.removeAttribute("data-enc");
    // Safari won't play a decrypted (blob:) video with a "#t=" on the end, so the first frame is shown by seeking instead.
    v.addEventListener("loadedmetadata", () => { if (!v.currentTime) v.currentTime = 0.05; }, { once: true });
    Vault.mediaUrl(CRYPTO_KEY, mediaUrl(path), path).then(u => {
      // If this phone still can't play it, offer to open it in the phone's own player instead.
      v.addEventListener("error", () => {
        const a = Object.assign(document.createElement("a"), { className: "ghost video-open", href: u, target: "_blank", rel: "noopener", textContent: "▶ open the video" });
        v.replaceWith(a);
      }, { once: true });
      v.src = u;
    }).catch(() => { v.replaceWith(Object.assign(document.createElement("p"), { className: "hint", textContent: "couldn't open this video" })); });
  });
  $$("img[data-enc]", root).forEach(img => {
    const path = img.dataset.enc;
    img.removeAttribute("data-enc");
    Vault.mediaUrl(CRYPTO_KEY, mediaUrl(path), path).then(u => { img.src = u; }).catch(() => { img.alt = "couldn't open this picture"; });
  });
}
// A URL the <audio>/<img> can use right now (decrypting first if needed).
async function playableUrl(path) {
  return path.endsWith(".enc") ? Vault.mediaUrl(CRYPTO_KEY, mediaUrl(path), path) : mediaUrl(path);
}
// Encrypts a file's bytes when the vault is on; returns { path, b64 } ready to upload.
async function packMedia(path, blob) {
  if (!(VAULT && CRYPTO_KEY)) return { path, b64: await blobToB64(blob) };
  const bytes = await Vault.encryptBytes(CRYPTO_KEY, new Uint8Array(await blob.arrayBuffer()));
  return { path: path + ".enc", b64: Vault.b64(bytes) };
}

/* ---------- notifications ---------- */
// Pings the other person's phone (never blocks or breaks a save). Phones that switched notifications
// on get a real one: tapping it opens the diary app from the home screen. Others get the ntfy ping, if set.
// `page` is where the tap should land, relative to app/ (e.g. "games.html", "shop.html#coupons").
function notifyPartner(title, message, page, tag) {
  const to = NAME && partnerOf(NAME);
  if (!to || !KEY) return;
  if (!page) page = /mini games/i.test(message + title) ? "games.html" : "./";
  const u = new URL(page, location.origin + "/" + REPO + "/app/"), url = (u.pathname + u.hash).replace("/" + REPO + "/", "");
  Couple.call("notify", { to, title, body: message, url, tag })
    .then(r => { if (!r.delivered) ntfyPartner(to, title, message); })
    .catch(() => ntfyPartner(to, title, message));
}
function ntfyPartner(to, title, message, extra = {}) {
  const topic = NOTIFY_TOPICS[to];
  if (!topic) return;
  fetch("https://ntfy.sh/", { method: "POST", body: JSON.stringify({ topic, title, message, tags: ["love_letter"], ...extra }) }).catch(() => {});
}

/* ---------- notifications on this phone 🔔 (web push) ---------- */
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
// "on": this phone gets notifications · "off": it could, tap to turn on · "blocked": said no in the past
// "homescreen": an iPhone in Safari, it has to be opened from the home screen first · "no": can't here
function pushState() {
  if (isIOS && !isStandalone()) return "homescreen";
  if (!pushSupported()) return "no";
  if (Notification.permission === "denied") return "blocked";
  return Notification.permission === "granted" && store.get("push-on") === `${NAME}@${Couple.code}` ? "on" : "off";
}
function swRegister() {
  if (!("serviceWorker" in navigator)) return null;
  const root = LOCAL ? "/" : "/" + REPO + "/";
  return navigator.serviceWorker.register(root + "sw.js", { scope: root }).catch(() => null);
}
const unb64url = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function enablePush() {
  if (!NAME) throw new Error("Choose whose phone this is first.");
  if (await Notification.requestPermission() !== "granted") throw new Error("Notifications weren't allowed. Turn them on in Settings → Notifications.");
  await swRegister();
  const reg = await navigator.serviceWorker.ready;
  const { key } = await Couple.call("vapid");
  let sub = await reg.pushManager.getSubscription();
  // A subscription made for another server key can't be reused.
  if (sub && sub.options?.applicationServerKey && b64url(sub.options.applicationServerKey) !== key) { await sub.unsubscribe(); sub = null; }
  sub = sub || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64url(key) });
  const j = sub.toJSON();
  await Couple.call("subscribe", { person: NAME, endpoint: j.endpoint, keys: j.keys });
  store.set("push-on", `${NAME}@${Couple.code}`);
}
swRegister();

// "Goldiee is crying" pings go out even when nobody has the diary open: each time a phone sees the
// diary, it works out when each of you would next drop below zero and leaves those for the server to send.
let lastAlerts = "";
function scheduleCryAlerts(list) {
  if (!KEY || !window.Goldies || PEOPLE.some(p => !p)) return;
  const now = Date.now(), out = [];
  for (const name of PEOPLE) {
    let t = Goldies.score(list, name, now).nextPenaltyAt;
    for (let k = 0; k < 4 && t && t - now < 2 * 864e5; k++) {
      const s = Goldies.score(list, name, t + 60000);
      if (s.points < Goldies.RULES.CRY_BELOW) {
        out.push({ key: `cry-${name}-${k}`, at: new Date(t + 60000).toISOString(), person: partnerOf(name), url: "app/",
          title: "😢 Goldiee is crying", body: `${name} is at ${s.points} goldies. Send them a little nudge?` });
      }
      t = s.nextPenaltyAt;
    }
  }
  const text = JSON.stringify(out);
  if (text === lastAlerts) return;
  lastAlerts = text;
  Couple.call("alerts", { list: out }).catch(() => { lastAlerts = ""; });
}

/* ---------- "come and check" ping 🔔 ---------- */
// A button on both pages: sends the other phone a notification that opens this page.
const PING_GAP_MIN = 5; // so it can't be spammed
function pingPartner() {
  if (!NAME) return toast("Choose whose phone this is in ⚙ settings first.");
  const left = PING_GAP_MIN * 60000 - (Date.now() - (Number(store.get("last-ping")) || 0));
  if (left > 0) return toast(`You just pinged ${partnerOf(NAME)}. Try again in ${Math.ceil(left / 60000)} min ♥`);
  const games = /games\.html$/.test(location.pathname);
  notifyPartner(`🔔 ${NAME} wants you to come and check`, games ? "Open the mini games 🎲" : "Open the diary 💌");
  store.set("last-ping", String(Date.now()));
  toast(`Pinged ${partnerOf(NAME)} 🔔`);
}
document.addEventListener("click", e => { if (e.target.closest("[data-ping]")) pingPartner(); });

/* ---------- goldie points 🪙 (rules live in goldies.js) ---------- */
function fmtMins(m) { m = Math.max(0, Math.round(m)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; }
// "2:14:07": awake time left before the next −50, ticking every second.
function fmtLeft(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
let goldieList = null;
setInterval(() => {
  const el = $(".gb-count"); if (!el || !window.Goldies) return;
  const left = Goldies.awakeMs(Date.now(), Number(el.dataset.penaltyAt));
  if (left <= 0) return renderGoldieBar(goldieList); // it landed: show the new score and start the next 3.5 hours
  el.textContent = fmtLeft(left);
}, 1000);
function renderGoldieBar(list) {
  const el = $("#goldieBar"); if (!el || !window.Goldies) return;
  const s = PEOPLE.map(p => Goldies.score(list, p));
  const side = x => `<span class="gb-side${x.name === NAME ? " me" : ""}${x.crying ? " sad" : ""}"><span class="gb-name">${esc(x.name)}${x.crying ? " · sad" : ""}</span><span class="gb-num">${x.points}</span></span>`;
  const mine = s.find(x => x.name === NAME);
  const hint = !mine ? "" : mine.shieldUntil ? `🛡 shielded till ${new Date(mine.shieldUntil).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase()} · no −${Goldies.RULES.PENALTY}s` : `−${Goldies.RULES.PENALTY} in <b class="gb-count" data-penalty-at="${mine.nextPenaltyAt}">${fmtLeft(Goldies.awakeMs(Date.now(), mine.nextPenaltyAt))}</b>${Goldies.isAwake(Date.now()) ? "" : " · paused, you're asleep 💤"}`;
  const st = Goldies.streak(list, PEOPLE);
  goldieList = list;
  scheduleCryAlerts(list);
  // Bought in the shop (shop-items.js): Goldiee's outfit, and today's backdrop on every page.
  if (typeof currentOutfit === "function") {
    window.goldiee?.wear?.(currentOutfit(list));
    const t = todaysThemeBuy(list);
    document.body.dataset.dayTheme = t ? t.theme : "";
    // One of your own pictures as the backdrop: decrypted once, then shown behind everything.
    if (t?.theme === "photo" && t.photo && document.body.dataset.dayPhoto !== t.photo) {
      document.body.dataset.dayPhoto = t.photo;
      playableUrl(t.photo).then(u => document.body.style.setProperty("--day-photo", `url("${u}")`)).catch(() => {});
    }
  }
  el.innerHTML = `${side(s[0])}<span class="gb-mid" title="days in a row you both posted"><span class="gb-streak">${st}</span><span class="gb-lbl">day${st === 1 ? "" : "s"} together</span></span>${side(s[1])}${hint ? `<small class="gb-hint">goldies · ${hint}</small>` : ""}`;
  el.hidden = false;
  el.onclick = () => openGoldieRules(list);
}
function openGoldieRules(list) {
  const R = Goldies.RULES, me = NAME && Goldies.score(list, NAME);
  const when = at => new Date(at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
  const hist = me ? me.history.slice(0, 10).map(h => `<li><b class="${h.pts < 0 ? "minus" : ""}">${h.pts > 0 ? "+" : ""}${h.pts}</b> ${esc(h.why)} <small>${when(h.at)}</small></li>`).join("") : "";
  const back = document.createElement("div");
  back.className = "sheet-back";
  back.innerHTML = `<div class="sheet small goldie-rules"><div class="sheet-head"><h2>Goldie points</h2><button type="button" class="icon-btn close" data-close>✕</button></div>
    <p class="help">Goldiee loves it when you two keep writing to each other. Earn goldies 🪙 by showing up, and lose a few when it goes quiet.</p>
    <ul class="rules">
      <li><b>+${R.TEXT}</b> a note or a text reply</li>
      <li><b>+${R.VOICE}</b> a voice note</li>
      <li><b>+${R.LONG}</b> opening your heart (over ${R.LONG_CHARS} characters)</li>
      <li><b>+${R.PHOTO}</b> a picture or a video</li>
      <li><b>+${R.KW_SPOT}</b> a spot-on guess in “who knows whom” (+${R.KW_CLOSE} if close, +${R.KW_ANSWER} for answering about yourself)</li>
      <li><b class="minus">−${R.PENALTY}</b> every ${R.GAP_MIN / 60} hours without posting or replying</li>
      <li><b>💤</b> sleep time, 1 am – 8:30 am: nothing counts (nothing lost, nothing earned)</li>
      <li><b>🧩</b> a puzzle race bet: the winner takes it from the other</li>
      <li><b class="minus">−${R.PIN_COST}</b> pin one of your pictures to the love page for ${R.PIN_DAYS} days 🏠</li>
    </ul>
    <p class="help">Below 0, Goldiee starts crying 😢, and every 15 minutes (outside sleep time) the other one gets a ping about it. Each call is +${R.CALL} for every ${R.CALL_BLOCK_MIN} minutes together, and whoever starts it from the diary gets +${R.CALLER} more. The middle number counts the days in a row you <em>both</em> posted.</p>
    ${me ? `<div class="label">your last goldies</div><ul class="history">${hist || "<li>nothing yet, so go write something ♥</li>"}</ul>` : ""}</div>`;
  back.addEventListener("click", e => { if (e.target === back || e.target.closest("[data-close]")) back.remove(); });
  document.body.appendChild(back);
}
// After saving: "+15 goldies 🪙"
function pointsToast(before, list) {
  if (!NAME || !window.Goldies) return;
  const d = Goldies.score(list, NAME).points - before;
  if (d > 0) setTimeout(() => toast(`+${d} goldies 🪙`), 900);
}
const myPoints = list => NAME && window.Goldies ? Goldies.score(list, NAME).points : 0;
// Below 0, Goldiee cries; tapping her takes you somewhere to cheer her up.
function goldieeCry(list, action) {
  const g = window.goldiee; if (!g || !NAME || !window.Goldies) return false;
  const me = Goldies.score(list, NAME);
  g.cry(me.crying);
  if (!me.crying) return false;
  g.say(`I'm crying… you're at ${me.points} goldies 😢 write something to cheer me up?`, action, "cheer me up →");
  return true;
}

/* ---------- freeze the page behind any open popup ---------- */
// iPhones ignore overflow:hidden on the page, so the page is pinned in place while a
// sheet, lightbox or dialog is open, and put back exactly where it was when it closes.
let frozenAt = null;
function syncScrollLock() {
  const open = $$(".sheet-back, .lightbox").some(el => !el.hidden && el.isConnected);
  const s = document.body.style;
  if (open && frozenAt === null) {
    frozenAt = scrollY;
    Object.assign(s, { position: "fixed", top: `-${frozenAt}px`, left: "0", right: "0", width: "100%" });
  } else if (!open && frozenAt !== null) {
    Object.assign(s, { position: "", top: "", left: "", right: "", width: "" });
    window.scrollTo(0, frozenAt);
    frozenAt = null;
  }
}
new MutationObserver(() => { syncScrollLock(); syncHistory(); }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden"] });

/* ---------- the phone's back gesture closes popups ---------- */
// Each open popup adds a step to the browser history, so swiping back (or the back
// button) closes the popup on top instead of leaving the diary.
let overlayDepth = 0, popsToIgnore = 0;
const openOverlays = () => $$(".sheet-back, .lightbox").filter(el => !el.hidden && el.isConnected);
function syncHistory() {
  const n = openOverlays().length;
  while (overlayDepth < n) { overlayDepth++; history.pushState({ overlay: overlayDepth }, ""); }
  while (overlayDepth > n) { overlayDepth--; popsToIgnore++; history.back(); } // closed with ✕: tidy the step away
}
addEventListener("popstate", () => {
  if (popsToIgnore) { popsToIgnore--; return; }
  const top = openOverlays().pop();
  if (!top) { overlayDepth = 0; return; }
  overlayDepth--;
  const close = top.querySelector("[data-close], [data-race-close]");
  if (close) close.click();
  else if (top.id === "lightbox") top.hidden = true;
  else if (top.matches(".call-ask")) { overlayDepth++; history.pushState({ overlay: overlayDepth }, ""); } // needs an answer
  else top.remove();
});

/* ---------- keep popups above the phone's keyboard ---------- */
// iPhones don't shrink the page when the keyboard opens, so popups are sized to the part
// of the screen you can actually see, and what you're typing stays in view.
if (window.visualViewport) {
  const vv = visualViewport, root = document.documentElement;
  const fit = () => { root.style.setProperty("--vvh", `${vv.height}px`); root.style.setProperty("--vvtop", `${vv.offsetTop}px`); };
  vv.addEventListener("resize", fit); vv.addEventListener("scroll", fit); fit();
}
document.addEventListener("focusin", e => {
  if (!e.target.matches?.("textarea, input") || !e.target.closest(".sheet")) return;
  setTimeout(() => e.target.scrollIntoView({ block: "nearest", behavior: "smooth" }), 350);
});

/* ---------- small helpers ---------- */
function hash(str) { let h = 2166136261; for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function rand(seed, i) { return ((hash(seed + ":" + i) % 1000) / 1000); }
function shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
const answeredBy = (list, name, qid) => list.some(x => x.prompt?.id === qid && (x.together || x.author === name));
function setStatus(el, msg, err = false) { el.textContent = msg; el.classList.toggle("err", err); }
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

/* ---------- heart cursor + trail (same feel as the first page) ---------- */
const HEART = "M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4h2c.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z";
const COLORS = ["#d97b86", "#e8a0a8", "#6e2337", "#f3b6bd", "#c4566a"];
const cursor = $("#cursor");
let mx = innerWidth / 2, my = innerHeight / 2, cx = mx, cy = my, lx = mx, ly = my, live = 0;
function spawnHeart(x, y, o = {}) {
  if (reduceMotion || live > 60) return;
  live++;
  const s = o.size || 8 + Math.random() * 12;
  const el = document.createElement("div");
  el.className = "trail-heart"; el.style.width = el.style.height = s + "px";
  el.innerHTML = `<svg viewBox="0 0 24 24"><path fill="${COLORS[Math.random() * COLORS.length | 0]}" d="${HEART}"/></svg>`;
  document.body.appendChild(el);
  const dx = o.vx ?? (Math.random() - .5) * 50, dy = o.vy ?? -(40 + Math.random() * 60);
  el.animate([
    { transform: `translate(${x - s / 2}px,${y - s / 2}px) scale(.2)`, opacity: 0 },
    { transform: `translate(${x - s / 2 + dx * .2}px,${y - s / 2 + dy * .2}px) scale(1)`, opacity: .9, offset: .15 },
    { transform: `translate(${x - s / 2 + dx}px,${y - s / 2 + dy}px) scale(.6) rotate(${(Math.random() - .5) * 60}deg)`, opacity: 0 },
  ], { duration: o.life || 1100 + Math.random() * 600, easing: "cubic-bezier(.2,.6,.3,1)" }).onfinish = () => { el.remove(); live--; };
}
function burst(x, y, n = 14) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, d = 70 + Math.random() * 100;
    spawnHeart(x, y, { size: 12 + Math.random() * 14, vx: Math.cos(a) * d, vy: Math.sin(a) * d - 30, life: 1300 + Math.random() * 500 });
  }
}
function trail(x, y) { if (Math.hypot(x - lx, y - ly) > 24) { spawnHeart(x, y); lx = x; ly = y; } }
addEventListener("mousemove", e => { mx = e.clientX; my = e.clientY; trail(mx, my); }, { passive: true });
addEventListener("touchmove", e => { const t = e.touches[0]; if (!e.target.closest(".sheet")) trail(t.clientX, t.clientY); }, { passive: true });
document.addEventListener("mouseover", e => cursor.classList.toggle("big", !!e.target.closest("button, a, label, .photo img")));
(function follow() {
  cx += (mx - cx) * .22; cy += (my - cy) * .22;
  cursor.style.transform = `translate3d(${cx}px,${cy}px,0)`;
  requestAnimationFrame(follow);
})();
