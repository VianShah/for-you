/* ==========================================================
   Our little diary
   Every page is saved straight into the GitHub repo:
     diary/entries.json  → list of all pages (text, styles, stickers)
     diary/media/…       → pictures and voice notes
   Writing needs the diary key (a fine-grained GitHub token that
   only has "Contents: read & write" on this one repo). It's kept
   in this browser only — never in the code.
   ========================================================== */
const OWNER = "VianShah";
const REPO = "for-you";
const BRANCH = "main";
const INDEX = "diary/entries.json";
const MEDIA_DIR = "diary/media/";
const STICKERS = ["❤️", "💋", "🧸", "🦛", "☕", "🍫", "🌸", "✨", "🌙", "🫶", "🥹", "😘", "🎀", "💌", "📸", "🌊", "🌷", "⭐", "🍓", "🐻"];
const TAPE_COLORS = ["#f3b6bd", "#f7d58b", "#b9d8c2", "#b8c9ee", "#e6c3f0"];
const MAX_VOICE_SECONDS = 300;

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
let NAME = store.get("diary-name");

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

async function loadIndex() {
  if (LOCAL) {
    const r = await fetch("entries.json?t=" + Date.now(), { cache: "no-store" });
    return { entries: r.ok ? await r.json() : [], sha: null };
  }
  try {
    const r = await fetch(API + INDEX + "?ref=" + BRANCH, { headers: headers(), cache: "no-store" });
    if (r.status === 404) return { entries: [], sha: null };
    if (!r.ok) throw await ghError(r);
    const j = await r.json();
    return { entries: JSON.parse(fromB64(j.content)), sha: j.sha };
  } catch (e) {
    // Rate-limited or offline API → fall back to the raw file (can lag a few minutes).
    const r = await fetch(`https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${INDEX}?t=${Date.now()}`);
    if (!r.ok) throw e;
    return { entries: await r.json(), sha: null };
  }
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
    if (r.ok) { const j = await r.json(); list = JSON.parse(fromB64(j.content)); sha = j.sha; }
    else if (r.status !== 404) throw await ghError(r);
    const next = change(list);
    try {
      await putFile(INDEX, toB64(JSON.stringify(next, null, 2) + "\n"), message, sha);
      return next;
    } catch (e) {
      if (e.status !== 409 && e.status !== 422) throw e;
    }
  }
  throw new Error("Couldn't save. Try again in a moment.");
}

function mediaUrl(path) {
  if (LOCAL) return path.replace(/^diary\//, "");
  return `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${path}`;
}

/* ---------- rendering ---------- */
let entries = [];
let filter = "all";
const book = $("#book");

function hash(str) { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function rand(seed, i) { return ((hash(seed + ":" + i) % 1000) / 1000); }

const STICKER_SPOTS = [
  { top: "-16px", left: "-12px" }, { top: "-18px", right: "-10px" },
  { bottom: "-14px", right: "-12px" }, { bottom: "-16px", left: "-10px" },
];
function stickersHtml(e) {
  return (e.stickers || []).slice(0, 4).map((s, i) => {
    const spot = STICKER_SPOTS[(hash(e.id) + i) % 4];
    const pos = Object.entries(spot).map(([k, v]) => `${k}:${v}`).join(";");
    const rot = Math.round(rand(e.id, "s" + i) * 50 - 25);
    return `<span class="sticker" style="${pos};transform:rotate(${rot}deg)">${esc(s)}</span>`;
  }).join("");
}
function tapeHtml(e, n = 1) {
  return Array.from({ length: n }, (_, i) => `<span class="tape" style="--tc:${TAPE_COLORS[(hash(e.id) + i) % TAPE_COLORS.length]}"></span>`).join("");
}
function signHtml(e) {
  const t = new Date(e.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
  return `<div class="sign"><b>— ${esc(e.author || "us")}</b><span>${t}</span></div>`;
}
function fmtDur(s) { s = Math.round(s || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }

function cardHtml(e) {
  const r = (rand(e.id, "r") * 6 - 3).toFixed(2);
  const del = KEY ? `<button class="del" data-del="${esc(e.id)}" aria-label="Remove this page">✕</button>` : "";
  const common = `data-id="${esc(e.id)}" style="--r:${r}deg"`;
  if (e.type === "note") {
    const paper = ["lined", "sticky", "pink", "kraft", "letter"].includes(e.paper) ? e.paper : "lined";
    return `<article class="card note ${paper}" ${common}>${del}${paper === "sticky" || paper === "pink" ? "" : tapeHtml(e)}${stickersHtml(e)}
      ${e.title ? `<h3>${esc(e.title)}</h3>` : ""}<p>${esc(e.text)}</p>${signHtml(e)}</article>`;
  }
  if (e.type === "photo") {
    const frame = ["polaroid", "tape", "film", "heart", "stamp"].includes(e.frame) ? e.frame : "polaroid";
    const cls = frame === "tape" ? "tape-frame" : frame;
    return `<article class="card photo ${cls}" ${common}>${del}${frame === "tape" ? tapeHtml(e, 2) : ""}${stickersHtml(e)}
      <div class="wrap"><img src="${esc(mediaUrl(e.media))}" alt="${esc(e.caption || "a picture of us")}" loading="lazy"></div>
      ${e.caption ? `<div class="cap">${esc(e.caption)}</div>` : ""}${signHtml(e)}</article>`;
  }
  if (e.type === "voice") {
    return `<article class="card voice" ${common}>${del}${stickersHtml(e)}
      <div class="label-strip">${esc(e.title || "a little voice note")}</div>
      <div class="reels"><span class="spool"></span><button class="play" data-play="${esc(e.id)}" aria-label="Play">▶</button>
        <div class="bar"><i></i></div><span class="dur">${fmtDur(e.duration)}</span><span class="spool"></span></div>
      ${signHtml(e)}</article>`;
  }
  return "";
}

function render() {
  const list = entries.filter(e => filter === "all" || e.type === filter)
    .sort((a, b) => new Date(b.at) - new Date(a.at));
  $("#sub").textContent = entries.length
    ? `${entries.length} ${entries.length === 1 ? "page" : "pages"} of us so far`
    : "notes, pictures & voices, kept forever";
  if (!list.length) {
    book.innerHTML = `<div class="empty"><b>${entries.length ? "Nothing here yet" : "The first page is waiting"}</b>${KEY ? "tap ＋ to stick something in" : "add your diary key in ⚙ to start writing"}</div>`;
    return;
  }
  const days = new Map();
  for (const e of list) {
    const d = new Date(e.at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (!days.has(d)) days.set(d, []);
    days.get(d).push(e);
  }
  book.innerHTML = [...days].map(([d, es]) =>
    `<section class="day"><div class="day-label">${esc(d)}</div><div class="grid">${es.map(cardHtml).join("")}</div></section>`
  ).join("");
}

async function refresh() {
  try {
    entries = (await loadIndex()).entries;
    render();
  } catch (e) {
    book.innerHTML = `<p class="empty">Couldn't open the diary right now.<br><small>${esc(e.message)}</small></p>`;
  }
}

/* ---------- filters ---------- */
$("#filters").addEventListener("click", e => {
  const b = e.target.closest(".chip"); if (!b) return;
  $$(".chip").forEach(c => c.classList.toggle("on", c === b));
  filter = b.dataset.f;
  render();
});

/* ---------- voice playback + lightbox + delete (delegated) ---------- */
const player = new Audio();
let playingId = null;
player.addEventListener("timeupdate", () => {
  const card = playingId && $(`.card[data-id="${CSS.escape(playingId)}"]`);
  if (card && player.duration) $(".bar i", card).style.width = (player.currentTime / player.duration * 100) + "%";
});
player.addEventListener("ended", stopPlaying);
function stopPlaying() {
  const card = playingId && $(`.card[data-id="${CSS.escape(playingId)}"]`);
  if (card) { card.classList.remove("playing"); $(".play", card).textContent = "▶"; $(".bar i", card).style.width = "0"; }
  playingId = null;
}

book.addEventListener("click", async ev => {
  const play = ev.target.closest("[data-play]");
  if (play) {
    const id = play.dataset.play;
    if (playingId === id) { player.pause(); stopPlaying(); return; }
    stopPlaying();
    const e = entries.find(x => x.id === id);
    player.src = mediaUrl(e.media);
    player.play().catch(() => toast("This voice note can't play on this device."));
    playingId = id;
    play.textContent = "❚❚";
    play.closest(".card").classList.add("playing");
    return;
  }
  const img = ev.target.closest(".photo img");
  if (img) { const lb = $("#lightbox"); $("img", lb).src = img.src; lb.hidden = false; return; }

  const del = ev.target.closest("[data-del]");
  if (del) {
    const e = entries.find(x => x.id === del.dataset.del);
    if (!e || !confirm("Take this page out of the diary?")) return;
    try {
      entries = await updateIndex(list => list.filter(x => x.id !== e.id), `Remove a page from ${e.author || "us"}`);
      render();
      if (e.media && e.mediaSha) deleteFile(e.media, e.mediaSha, "Remove media").catch(() => {});
      toast("Page removed");
    } catch (err) { toast(err.message); }
  }
});
$("#lightbox").addEventListener("click", () => { $("#lightbox").hidden = true; });

/* ---------- sheets ---------- */
function openSheet(id) { $(id).hidden = false; }
function closeSheet(back) { back.hidden = true; if (back.id === "composerBack") stopRecording(); }
$$(".sheet-back").forEach(back => {
  back.addEventListener("click", e => { if (e.target === back || e.target.closest("[data-close]")) closeSheet(back); });
});
addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  $$(".sheet-back").forEach(b => { if (!b.hidden) closeSheet(b); });
  $("#lightbox").hidden = true;
});

/* ---------- settings ---------- */
function openSettings(msg = "") {
  $("#nameInput").value = NAME;
  $("#keyInput").value = KEY;
  setStatus($("#settingsStatus"), msg, !!msg);
  openSheet("#settingsBack");
}
$("#settingsBtn").addEventListener("click", () => openSettings());
$("#settings").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("#nameInput").value.trim();
  const key = $("#keyInput").value.trim();
  const st = $("#settingsStatus");
  if (!name || !key) return setStatus(st, "Both your name and the key, please.", true);
  setStatus(st, "Checking the key…");
  try {
    const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/vnd.github+json" }, cache: "no-store" });
    if (!r.ok) throw new Error("That key didn't work.");
  } catch (err) { return setStatus(st, err.message, true); }
  KEY = key; NAME = name;
  store.set("diary-key", key); store.set("diary-name", name);
  setStatus(st, "Saved on this device ♥");
  render();
  setTimeout(() => closeSheet($("#settingsBack")), 700);
});
$("#forgetBtn").addEventListener("click", () => {
  KEY = ""; store.set("diary-key", "");
  $("#keyInput").value = "";
  setStatus($("#settingsStatus"), "Key removed from this device.");
  render();
});

/* ---------- composer ---------- */
const composer = $("#composer");
const state = { type: "note", paper: "lined", frame: "polaroid", stickers: [], photo: null, voice: null, voiceMime: "", duration: 0 };

$("#fab").addEventListener("click", () => {
  if (!KEY || !NAME) return openSettings("Add your name and the diary key first.");
  setStatus($("#status"), "");
  openSheet("#composerBack");
});

$$(".tab", composer).forEach(t => t.addEventListener("click", () => {
  state.type = t.dataset.type;
  $$(".tab", composer).forEach(x => x.classList.toggle("on", x === t));
  $$(".pane", composer).forEach(p => p.hidden = p.dataset.pane !== state.type);
  if (state.type !== "voice") stopRecording();
}));

$$(".choices", composer).forEach(group => group.addEventListener("click", e => {
  const c = e.target.closest(".choice"); if (!c) return;
  $$(".choice", group).forEach(x => x.classList.toggle("on", x === c));
  state[group.dataset.choice] = c.dataset.v;
}));

const picker = $("#stickerPicker");
picker.innerHTML = STICKERS.map(s => `<button type="button" data-s="${s}">${s}</button>`).join("");
picker.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const s = b.dataset.s, i = state.stickers.indexOf(s);
  if (i >= 0) state.stickers.splice(i, 1);
  else if (state.stickers.length < 4) state.stickers.push(s);
  else return toast("Four stickers max per page");
  b.classList.toggle("on", i < 0);
});

/* photo: shrink to max 1600px so the repo stays light */
$("#photoInput").addEventListener("change", async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    state.photo = await new Promise(res => c.toBlob(res, "image/jpeg", 0.85));
    const prev = $("#photoPreview");
    prev.src = URL.createObjectURL(state.photo); prev.hidden = false;
    $("#dropText").hidden = true;
  } catch { toast("Couldn't open that picture. Try a JPG or PNG."); }
});

/* voice recording */
let recorder = null, recTimer = null, recStart = 0;
const recBtn = $("#recBtn"), recTime = $("#recTime"), recPreview = $("#recPreview");
function pickMime() {
  if (!window.MediaRecorder) return null;
  return ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"].find(t => MediaRecorder.isTypeSupported(t)) || "";
}
recBtn.addEventListener("click", async () => {
  if (recorder && recorder.state === "recording") return stopRecording();
  const mime = pickMime();
  if (mime === null) return toast("This browser can't record audio.");
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { return toast("Microphone permission is needed to record."); }
  const chunks = [];
  recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    state.voiceMime = (recorder.mimeType || mime || "audio/webm").split(";")[0];
    state.voice = new Blob(chunks, { type: state.voiceMime });
    state.duration = (Date.now() - recStart) / 1000;
    recPreview.src = URL.createObjectURL(state.voice); recPreview.hidden = false;
    recTime.textContent = `${fmtDur(state.duration)} · tap to re-record`;
    recBtn.classList.remove("recording");
  };
  recorder.start();
  recStart = Date.now();
  recBtn.classList.add("recording");
  recPreview.hidden = true;
  recTimer = setInterval(() => {
    const s = (Date.now() - recStart) / 1000;
    recTime.textContent = `recording… ${fmtDur(s)}`;
    if (s >= MAX_VOICE_SECONDS) stopRecording();
  }, 250);
});
function stopRecording() {
  clearInterval(recTimer);
  if (recorder && recorder.state === "recording") recorder.stop();
}

function resetComposer() {
  composer.reset();
  Object.assign(state, { stickers: [], photo: null, voice: null, voiceMime: "", duration: 0 });
  $$("#stickerPicker button").forEach(b => b.classList.remove("on"));
  $("#photoPreview").hidden = true; $("#dropText").hidden = false; $("#photoInput").value = "";
  recPreview.hidden = true; recTime.textContent = "tap to record";
}

composer.addEventListener("submit", async e => {
  e.preventDefault();
  const st = $("#status"), btn = $("#saveBtn");
  const f = composer.elements;
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const entry = { id, type: state.type, author: NAME, at: new Date().toISOString(), stickers: [...state.stickers] };

  if (state.type === "note") {
    if (!f.text.value.trim()) return setStatus(st, "Write something first ♥", true);
    Object.assign(entry, { title: f.title.value.trim(), text: f.text.value.trim(), paper: state.paper });
  } else if (state.type === "photo") {
    if (!state.photo) return setStatus(st, "Choose a picture first.", true);
    Object.assign(entry, { caption: f.caption.value.trim(), frame: state.frame });
  } else {
    if (!state.voice) return setStatus(st, "Record something first.", true);
    Object.assign(entry, { title: f.voiceTitle.value.trim(), duration: Math.round(state.duration) });
  }

  btn.disabled = true;
  try {
    const blob = state.type === "photo" ? state.photo : state.type === "voice" ? state.voice : null;
    if (blob) {
      setStatus(st, state.type === "photo" ? "Uploading the picture…" : "Uploading the voice note…");
      const ext = state.type === "photo" ? "jpg" : ({ "audio/mp4": "m4a", "audio/ogg": "ogg" }[state.voiceMime] || "webm");
      entry.media = `${MEDIA_DIR}${id}.${ext}`;
      const res = await putFile(entry.media, await blobToB64(blob), `${state.type === "photo" ? "Picture" : "Voice note"} from ${NAME}`);
      entry.mediaSha = res.content.sha;
    }
    setStatus(st, "Sticking it in…");
    entries = await updateIndex(list => [entry, ...list], `A new ${state.type === "note" ? "note" : state.type === "photo" ? "picture" : "voice note"} from ${NAME}`);
    render();
    resetComposer();
    closeSheet($("#composerBack"));
    const r = $(`.card[data-id="${id}"]`)?.getBoundingClientRect();
    burst(r ? r.left + r.width / 2 : innerWidth / 2, r ? r.top + 40 : innerHeight / 2, 24);
    toast("Stuck in the diary ♥");
  } catch (err) {
    setStatus(st, err.message, true);
  } finally {
    btn.disabled = false;
  }
});

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

refresh();
