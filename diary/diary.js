/* The diary page. Shared helpers live in core.js, questions in questions.js. */
const STICKERS = ["❤️", "💋", "🧸", "🦛", "☕", "🍫", "🌸", "✨", "🌙", "🫶", "🥹", "😘", "🎀", "💌", "📸", "🌊", "🌷", "⭐", "🍓", "🐻"];
const TAPE_COLORS = ["#f3b6bd", "#f7d58b", "#b9d8c2", "#b8c9ee", "#e6c3f0"];
const MAX_VOICE_SECONDS = 300;

/* ---------- rendering ---------- */
let entries = [];
let filter = "all";
let lastSeen = 0; // pages from the other person newer than this get a "new" ribbon
const book = $("#book");

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
  const t = new Date(e.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
  const spent = e.spent ? ` · ${fmtSpent(e.spent)} here` : "";
  return `<div class="sign"><b>— ${esc(e.author || "us")}</b><span>${t}${spent}</span></div>`;
}
function fmtSpent(s) {
  if (s < 60) return "under a minute";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
function fmtDur(s) { s = Math.round(s || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }

function promptHtml(e) {
  if (!e.prompt) return "";
  const c = CATEGORIES[e.prompt.cat];
  return `<div class="q"><small>${c ? `${c.emoji} ${esc(c.label)}` : "a question"}</small>${esc(e.prompt.q)}</div>`;
}
function guessHtml(e) {
  if (!e.guess || e.together) return "";
  return `<div class="guess"><small>${esc(e.author)}'s guess for ${esc(partnerOf(e.author))}</small>${esc(e.guess)}</div>`;
}
// Answers to a question stay blurred until you've answered it too.
function isLocked(e) {
  return !!(NAME && e.prompt && !e.together && e.author !== NAME && !answeredBy(entries, NAME, e.prompt.id));
}

function cardHtml(e) {
  const r = (rand(e.id, "r") * 6 - 3).toFixed(2);
  const del = KEY ? `<button class="del" data-del="${esc(e.id)}" aria-label="Remove this page">✕</button>` : "";
  const isNew = NAME && e.at && new Date(e.at).getTime() > lastSeen && (e.by || e.author) !== NAME ? `<span class="new-ribbon">new</span>` : "";
  const locked = isLocked(e);
  const lock = locked ? `<button class="unlock" data-q="${esc(e.prompt.id)}">🔒 answer it too to see ${esc(e.author)}'s answer</button>` : "";
  const cls = locked ? " locked" : "";
  const common = `data-id="${esc(e.id)}" style="--r:${r}deg"`;
  const top = `${del}${isNew}${stickersHtml(e)}${promptHtml(e)}`;
  if (e.type === "note") {
    const paper = ["lined", "sticky", "pink", "kraft", "letter"].includes(e.paper) ? e.paper : "lined";
    return `<article class="card note ${paper}${cls}" ${common}>${paper === "sticky" || paper === "pink" ? "" : tapeHtml(e)}${top}
      <div class="body">${e.title ? `<h3>${esc(e.title)}</h3>` : ""}<p>${esc(e.text)}</p>${guessHtml(e)}</div>${lock}${signHtml(e)}</article>`;
  }
  if (e.type === "photo") {
    const frame = ["polaroid", "tape", "film", "heart", "stamp"].includes(e.frame) ? e.frame : "polaroid";
    const fcls = frame === "tape" ? "tape-frame" : frame;
    return `<article class="card photo ${fcls}${cls}" ${common}>${frame === "tape" ? tapeHtml(e, 2) : ""}${top}
      <div class="body"><div class="wrap"><img src="${esc(mediaUrl(e.media))}" alt="${esc(e.caption || "a picture of us")}" loading="lazy"></div>
      ${e.caption ? `<div class="cap">${esc(e.caption)}</div>` : ""}${guessHtml(e)}</div>${lock}${signHtml(e)}</article>`;
  }
  if (e.type === "voice") {
    return `<article class="card voice${cls}" ${common}>${top}
      <div class="body"><div class="label-strip">${esc(e.title || "a little voice note")}</div>
      <div class="reels"><span class="spool"></span><button class="play" data-play="${esc(e.id)}" aria-label="Play">▶</button>
        <div class="bar"><i></i></div><span class="dur">${fmtDur(e.duration)}</span><span class="spool"></span></div>${guessHtml(e)}</div>
      ${lock}${signHtml(e)}</article>`;
  }
  return "";
}

function render() {
  const list = entries.filter(e => filter === "all" || (filter === "answers" ? e.prompt : e.type === filter))
    .sort((a, b) => new Date(b.at) - new Date(a.at));
  $("#sub").textContent = entries.length
    ? `${entries.length} ${entries.length === 1 ? "page" : "pages"} of us so far`
    : "notes, pictures & voices, kept forever";
  if (!list.length) {
    book.innerHTML = `<div class="empty"><b>${entries.length ? "Nothing here yet" : "The first page is waiting"}</b>${KEY ? "tap ＋ to stick something in, or try the mini games for a question" : "open your setup link to start writing"}</div>`;
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
    lastSeen = Number(store.get("diary-seen-" + NAME)) || 0;
    render();
    setTimeout(goldieeNudge, 1500);
    // Remember this visit a moment later, so the ribbons show this time but not next time.
    if (NAME) setTimeout(() => store.set("diary-seen-" + NAME, String(Date.now())), 1500);
  } catch (e) {
    book.innerHTML = `<p class="empty">Couldn't open the diary right now.<br><small>${esc(e.message)}</small></p>`;
  }
}

// Goldiee only shows up with the most important thing to do, and takes you to it.
function goldieeNudge() {
  const g = window.goldiee; if (!g || $$(".sheet-back").some(b => !b.hidden)) return;
  if (!KEY) return g.say("this phone isn't unlocked yet. I'll show you how 🔑", () => openSettings(`To write, open the setup link sent to you. Ask ${PEOPLE[0]} for it ♥`), "unlock →");
  if (!NAME) return g.say("whose phone is this? tell me so I sign your pages 🐾", () => openSettings("First, tap whose phone this is."), "choose →");
  const waiting = entries.find(isLocked);
  if (waiting) return g.say(`${waiting.author} answered a question. Answer it too to see theirs 💭`, () => startAnswer(waiting.prompt), "answer it →");
  const fresh = $$(".new-ribbon");
  if (fresh.length) return g.say(`${fresh.length} new ${fresh.length === 1 ? "page" : "pages"} from ${partnerOf(NAME)} 💌`,
    () => fresh[0].closest(".card").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" }), "show me →");
  const tq = todaysQuestion();
  if (!answeredBy(entries, NAME, tq.id)) return g.say("today's question is waiting for you ☀️", () => startAnswer(tq), "answer it →");
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
  const unlock = ev.target.closest(".unlock");
  if (unlock) return startAnswer(questionById(unlock.dataset.q) || entries.find(x => x.prompt?.id === unlock.dataset.q)?.prompt);
  if (ev.target.closest(".card.locked")) return;

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
const whoChoices = $("#whoChoices");
let pickedWho = NAME;
whoChoices.innerHTML = PEOPLE.map(p => `<button type="button" class="choice" data-v="${esc(p)}">${esc(p)}</button>`).join("");
whoChoices.addEventListener("click", e => {
  const c = e.target.closest(".choice"); if (!c) return;
  pickedWho = c.dataset.v;
  $$(".choice", whoChoices).forEach(x => x.classList.toggle("on", x === c));
  syncNotifyBlock();
});
function syncNotifyBlock() {
  const topic = NOTIFY_TOPICS[pickedWho];
  $("#notifyBlock").hidden = !topic;
  if (topic) $("#notifyTopic").textContent = topic;
}

function openSettings(msg = "", err = false) {
  pickedWho = NAME;
  $$(".choice", whoChoices).forEach(x => x.classList.toggle("on", x.dataset.v === NAME));
  $("#keyInput").value = "";
  $("#keyBlock").hidden = !!KEY;
  $("#pairBlock").hidden = !KEY;
  $("#forgetBtn").hidden = !KEY;
  syncNotifyBlock();
  setStatus($("#settingsStatus"), msg, err);
  openSheet("#settingsBack");
}
$("#settingsBtn").addEventListener("click", () => openSettings());
$("#settings").addEventListener("submit", async e => {
  e.preventDefault();
  const st = $("#settingsStatus");
  if (!pickedWho) return setStatus(st, "Tap whose phone this is.", true);
  const key = $("#keyInput").value.trim();
  if (!KEY && !key) return setStatus(st, "Open your setup link, or paste the diary key.", true);
  if (key) {
    setStatus(st, "Checking the key…");
    try {
      const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/vnd.github+json" }, cache: "no-store" });
      if (!r.ok) throw new Error("That key didn't work.");
    } catch (err) { return setStatus(st, err.message, true); }
    KEY = key; store.set("diary-key", key);
  }
  NAME = pickedWho; store.set("diary-name", NAME);
  setStatus(st, `All set, ${NAME} ♥`);
  syncFromLabel();
  render();
  setTimeout(() => { closeSheet($("#settingsBack")); if (pendingPrompt) startAnswer(pendingPrompt); }, 800);
});
$("#copyLinkBtn").addEventListener("click", async () => {
  const link = `${location.origin}${location.pathname}#pair=${encodeURIComponent(KEY)}`;
  try { await navigator.clipboard.writeText(link); setStatus($("#settingsStatus"), "Copied. Send it to the other phone (it's the key, so only to them)."); }
  catch { prompt("Copy this setup link:", link); }
});
$("#copyTopicBtn").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("#notifyTopic").textContent); toast("Copied. Paste it into the ntfy app"); }
  catch { prompt("Copy this:", $("#notifyTopic").textContent); }
});
$("#forgetBtn").addEventListener("click", () => {
  if (!confirm("Lock this phone? It will need the setup link again to write.")) return;
  KEY = ""; store.set("diary-key", "");
  openSettings("This phone is locked. It can still read the diary.");
  render();
});

/* ---------- composer ---------- */
const composer = $("#composer");
const state = { type: "note", from: "me", paper: "lined", frame: "polaroid", stickers: [], photo: null, voice: null, voiceMime: "", duration: 0, prompt: null };
let openedAt = 0; // when this page was started, for "x min here"
let pendingPrompt = null;

function syncFromLabel() { $("#fromMe").textContent = NAME ? `just me (${NAME})` : "me"; }
syncFromLabel();

function canWrite() {
  if (!KEY) { openSettings(`To write, open the setup link sent to you. Ask ${PEOPLE[0]} for it ♥`); return false; }
  if (!NAME) { openSettings("First, tap whose phone this is."); return false; }
  return true;
}
function openComposer() {
  setStatus($("#status"), "");
  if (!openedAt) openedAt = Date.now();
  const p = state.prompt;
  $("#promptBanner").hidden = !p;
  $("#guessBlock").hidden = !p;
  $("#titleField").hidden = !!p;
  if (p) {
    const c = CATEGORIES[p.cat];
    $("#promptBanner").innerHTML = `<small>${c ? `${c.emoji} ${esc(c.label)}` : "a question"}</small>${esc(p.q)}<button type="button" class="link-btn" id="dropPrompt">write something else</button>`;
    $("#guessLabel").textContent = `and what do you think ${partnerOf(NAME)} would say? (optional)`;
    $("#dropPrompt").onclick = () => { state.prompt = null; openComposer(); };
  }
  openSheet("#composerBack");
}
// Opens the composer to answer a question (from the mini games or a locked card).
function startAnswer(p) {
  if (!p) return;
  pendingPrompt = p;
  if (!canWrite()) return;
  pendingPrompt = null;
  state.prompt = { id: p.id, cat: p.cat, q: p.q };
  openComposer();
}

$("#fab").addEventListener("click", () => {
  if (!canWrite()) return;
  state.prompt = null;
  openComposer();
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
  Object.assign(state, { stickers: [], photo: null, voice: null, voiceMime: "", duration: 0, prompt: null });
  $$("#stickerPicker button").forEach(b => b.classList.remove("on"));
  $("#photoPreview").hidden = true; $("#dropText").hidden = false; $("#photoInput").value = "";
  recPreview.hidden = true; recTime.textContent = "tap to record";
}

composer.addEventListener("submit", async e => {
  e.preventDefault();
  const st = $("#status"), btn = $("#saveBtn");
  const f = composer.elements;
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const together = state.from === "together";
  const entry = {
    id, type: state.type,
    author: together ? PEOPLE.join(" & ") : NAME,
    by: NAME,                                                         // whose phone wrote it
    together,
    at: new Date().toISOString(),                                     // date + time, stamped automatically
    spent: Math.round((Date.now() - (openedAt || Date.now())) / 1000), // how long was spent on this page
    stickers: [...state.stickers],
  };
  if (state.prompt) {
    entry.prompt = state.prompt;
    if (!together && f.guess.value.trim()) entry.guess = f.guess.value.trim();
  }

  if (state.type === "note") {
    if (!f.text.value.trim()) return setStatus(st, "Write something first ♥", true);
    Object.assign(entry, { title: state.prompt ? "" : f.title.value.trim(), text: f.text.value.trim(), paper: state.paper });
  } else if (state.type === "photo") {
    if (!state.photo) return setStatus(st, "Choose a picture first.", true);
    Object.assign(entry, { caption: f.caption.value.trim(), frame: state.frame });
  } else {
    if (!state.voice) return setStatus(st, "Record something first.", true);
    Object.assign(entry, { title: f.voiceTitle.value.trim(), duration: Math.round(state.duration) });
  }

  const kind = entry.prompt ? "answer" : state.type === "note" ? "note" : state.type === "photo" ? "picture" : "voice note";
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
    entries = await updateIndex(list => [entry, ...list], `A new ${kind} from ${entry.author}`);
    notifyPartner(
      entry.prompt ? `${entry.author} answered a question 💭` : `${entry.author} added a new ${kind} 💌`,
      entry.prompt ? `"${entry.prompt.q}" Answer it too to see theirs.` : "Open the diary to see it."
    );
    render();
    resetComposer();
    openedAt = 0;
    closeSheet($("#composerBack"));
    const r = $(`.card[data-id="${id}"]`)?.getBoundingClientRect();
    burst(r ? r.left + r.width / 2 : innerWidth / 2, r ? r.top + 40 : innerHeight / 2, 24);
    toast("Stuck in the diary ♥");
    // If this answer just unlocked the other person's, Goldiee takes you to it.
    const theirs = entry.prompt && entries.find(x => x.id !== id && x.prompt?.id === entry.prompt.id && x.author !== NAME);
    if (theirs) setTimeout(() => window.goldiee?.say(`${theirs.author}'s answer is unlocked 🔓`,
      () => $(`.card[data-id="${CSS.escape(theirs.id)}"]`)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" }), "read it →"), 1200);
  } catch (err) {
    setStatus(st, err.message, true);
  } finally {
    btn.disabled = false;
  }
});

/* ---------- start ---------- */
const askedQ = new URLSearchParams(location.search).get("q");
if (askedQ) history.replaceState(null, "", location.pathname);
refresh().then(() => {
  if (justPaired) return openSettings(NAME ? `Unlocked ♥ Welcome back, ${NAME}.` : "Unlocked ♥ Now tap whose phone this is.");
  if (askedQ) startAnswer(questionById(askedQ));
});
