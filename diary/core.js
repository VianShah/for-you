/* ==========================================================
   Shared by the diary and the mini games.
   Every page is saved straight into the GitHub repo:
     diary/entries.json  → list of all pages (text, styles, stickers)
     diary/media/…       → pictures and voice notes
   Writing needs the diary key (a fine-grained GitHub token that
   only has "Contents: read & write" on this one repo). It's kept
   in this browser only — never in the code.
   ========================================================== */
const PEOPLE = ["Vian", "Jovena"];
const OWNER = "VianShah";
const REPO = "for-you";
const BRANCH = "main";
const INDEX = "diary/entries.json";
const MEDIA_DIR = "diary/media/";

// Notifications go through ntfy.sh (free, no account). Each person installs the
// ntfy app and subscribes to their own topic. Only "X added a page" is sent,
// never what the page says. Once the vault is on, the topics live encrypted
// inside it (these public ones are only used before that).
let NOTIFY_TOPICS = { Vian: "for-you-vian-k7q2m9x4", Jovena: "for-you-jovena-r3w8p1z6" };

// Each person's FaceTime number, kept encrypted inside the vault so both phones have it.
let PHONES = {};

// The vault (see vault.js). null = not switched on yet, so files are plain.
let VAULT = null;
let CRYPTO_KEY = null;

// On a local preview, read from the files next to this page instead of GitHub.
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
let KEY = store.get("diary-key");
let NAME = PEOPLE.includes(store.get("diary-name")) ? store.get("diary-name") : "";
const partnerOf = name => PEOPLE.find(p => p !== name) || PEOPLE[1];

// One-tap setup: opening …/diary/#pair=<key> unlocks this phone, then the key
// is wiped from the address bar so it isn't left in history or screenshots.
let justPaired = false;
if (location.hash.startsWith("#pair=")) {
  KEY = decodeURIComponent(location.hash.slice(6)).trim();
  store.set("diary-key", KEY);
  history.replaceState(null, "", location.pathname + location.search);
  justPaired = true;
}

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
const rawUrl = path => LOCAL ? path.replace(/^diary\//, "") : `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${path}`;

// Returns "plain" (vault not switched on), "locked" or "unlocked".
async function initVault() {
  VAULT = await Vault.fetchVault(rawUrl("diary/vault.json"));
  if (!VAULT) return "plain";
  const key = await Vault.cached(VAULT);
  if (!key) return "locked";
  await applyVaultKey(key);
  return "unlocked";
}
async function applyVaultKey(key) {
  CRYPTO_KEY = key;
  if (VAULT.secrets) {
    const s = JSON.parse(await Vault.decryptText(key, VAULT.secrets));
    KEY = s.token || "";
    if (s.topics) NOTIFY_TOPICS = s.topics;
    if (s.phones) PHONES = s.phones;
    store.set("diary-key", ""); // the key now lives only inside the vault
  }
}
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

async function loadIndex() {
  if (LOCAL) {
    const r = await fetch("entries.json?t=" + Date.now(), { cache: "no-store" });
    return { entries: r.ok ? await decodeIndex(await r.json()) : [], sha: null };
  }
  let data;
  try {
    const r = await fetch(API + INDEX + "?ref=" + BRANCH, { headers: headers(), cache: "no-store" });
    if (r.status === 404) return { entries: [], sha: null };
    if (!r.ok) throw await ghError(r);
    data = JSON.parse(fromB64((await r.json()).content));
  } catch (e) {
    // Rate-limited or offline API → fall back to the raw file (can lag a few minutes).
    const r = await fetch(`${rawUrl(INDEX)}?t=${Date.now()}`);
    if (!r.ok) throw e;
    data = await r.json();
  }
  return { entries: await decodeIndex(data), sha: null };
}

async function putFile(path, b64, message, sha) {
  const body = { message, content: b64, branch: BRANCH };
  if (sha) body.sha = sha;
  const r = await fetch(API + path, { method: "PUT", headers: headers(), body: JSON.stringify(body) });
  if (!r.ok) throw await ghError(r);
  return r.json();
}

async function deleteFile(path, sha, message) {
  const r = await fetch(API + path, { method: "DELETE", headers: headers(), body: JSON.stringify({ message, sha, branch: BRANCH }) });
  if (!r.ok) throw await ghError(r);
}

// Read-modify-write the index, retrying if the other person saved at the same moment.
async function updateIndex(change, message) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(API + INDEX + "?ref=" + BRANCH, { headers: headers(), cache: "no-store" });
    let list = [], sha;
    if (r.ok) { const j = await r.json(); list = await decodeIndex(JSON.parse(fromB64(j.content))); sha = j.sha; }
    else if (r.status !== 404) throw await ghError(r);
    const next = change(list);
    try {
      await putFile(INDEX, toB64(await encodeIndex(next)), message, sha);
      return next;
    } catch (e) {
      if (e.status !== 409 && e.status !== 422) throw e;
    }
  }
  throw new Error("Couldn't save. Try again in a moment.");
}

function mediaUrl(path) { return rawUrl(path); }
const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
// <img> attributes: plain files load directly, encrypted ones are filled in by hydrateMedia().
function imgSrcAttrs(path) {
  return path.endsWith(".enc") ? `src="${BLANK}" data-enc="${esc(path)}"` : `src="${esc(mediaUrl(path))}"`;
}
// A <video> for a page or reply; encrypted ones are filled in by hydrateMedia() too.
function videoHtml(path, cls = "") {
  return `<video class="${cls}" controls playsinline preload="metadata" ${path.endsWith(".enc") ? `data-enc="${esc(path)}"` : `src="${esc(mediaUrl(path))}#t=0.1"`}></video>`;
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
// Pings the other person's phone. Never blocks or breaks a save.
// Tapping it opens the page it was sent from (the diary, or the mini games), or `page` if given.
function notifyPartner(title, message, page = /games\.html$/.test(location.pathname) ? "games.html" : "./") {
  const to = NAME && NOTIFY_TOPICS[partnerOf(NAME)];
  if (!to || LOCAL) return;
  fetch("https://ntfy.sh/", {
    method: "POST",
    body: JSON.stringify({ topic: to, title, message, tags: ["love_letter"], click: new URL(page, location.href).href }),
  }).catch(() => {});
}

/* ---------- "come and check" ping 🔔 ---------- */
// A button on both pages: sends the other phone a notification that opens this page.
const PING_GAP_MIN = 5; // so it can't be spammed
function pingPartner() {
  if (!NAME) return toast("Choose whose phone this is in ⚙ settings first.");
  const left = PING_GAP_MIN * 60000 - (Date.now() - (Number(store.get("last-ping")) || 0));
  if (left > 0) return toast(`You just pinged ${partnerOf(NAME)}. Try again in ${Math.ceil(left / 60000)} min ♥`);
  if (!NOTIFY_TOPICS[partnerOf(NAME)]) return toast("Notifications aren't set up yet.");
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
  const hint = !mine ? "" : `−${Goldies.RULES.PENALTY} in <b class="gb-count" data-penalty-at="${mine.nextPenaltyAt}">${fmtLeft(Goldies.awakeMs(Date.now(), mine.nextPenaltyAt))}</b>${Goldies.isAwake(Date.now()) ? "" : " · paused, you're asleep 💤"}`;
  const st = Goldies.streak(list, PEOPLE);
  goldieList = list;
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
    <p class="help">Below 0, Goldiee starts crying 😢, and every 15 minutes (outside sleep time) the other one gets a ping about it. Each call is +${R.CALL} for every ${R.CALL_BLOCK_MIN} minutes together. The middle number counts the days in a row you <em>both</em> posted.</p>
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
new MutationObserver(syncScrollLock).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden"] });

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
