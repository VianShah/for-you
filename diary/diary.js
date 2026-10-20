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

const isFresh = (at, by) => !!(NAME && at && new Date(at).getTime() > lastSeen && by !== NAME);
const BIN_DAYS = 100;
const binDaysLeft = e => Math.max(0, Math.ceil(BIN_DAYS - (Date.now() - new Date(e.binnedAt).getTime()) / 864e5));

function cardHtml(e) {
  const r = (rand(e.id, "r") * 6 - 3).toFixed(2);
  // Replies live inside the post (tap it to see them); the wall only shows a small count.
  const replies = e.replies || [];
  const freshReply = replies.some(x => isFresh(x.at, x.by));
  const del = replies.length ? `<span class="reply-badge${freshReply ? " fresh" : ""}">💬 ${replies.length}</span>` : "";
  const binNote = e.status === "binned" ? `<div class="bin-note">🗑 deletes forever in ${binDaysLeft(e)} days</div>` : "";
  const isNew = isFresh(e.at, e.by || e.author) ? `<span class="new-ribbon">new</span>` : "";
  const locked = isLocked(e);
  const lock = locked ? `<button class="unlock" data-q="${esc(e.prompt.id)}">🔒 answer it too to see ${esc(e.author)}'s answer</button>` : "";
  const cls = locked ? " locked" : "";
  const common = `data-id="${esc(e.id)}" style="--r:${r}deg"`;
  const hearts = e.hearts?.length ? `<span class="heart-badge" title="❤️ from ${esc(e.hearts.join(" & "))}">❤️${e.hearts.length > 1 ? " 2" : ""}</span>` : "";
  const top = `${del}${hearts}${isNew}${stickersHtml(e)}${promptHtml(e)}`;
  if (e.type === "note") {
    const paper = ["lined", "sticky", "pink", "kraft", "letter"].includes(e.paper) ? e.paper : "lined";
    return `<article class="card note ${paper}${cls}" ${common}>${paper === "sticky" || paper === "pink" ? "" : tapeHtml(e)}${top}
      <div class="body">${e.title ? `<h3>${esc(e.title)}</h3>` : ""}<p>${esc(e.text)}</p>${guessHtml(e)}</div>${lock}${binNote}${signHtml(e)}</article>`;
  }
  if (e.type === "photo") {
    const frame = ["polaroid", "tape", "film", "heart", "stamp"].includes(e.frame) ? e.frame : "polaroid";
    const fcls = frame === "tape" ? "tape-frame" : frame;
    return `<article class="card photo ${fcls}${cls}" ${common}>${frame === "tape" ? tapeHtml(e, 2) : ""}${top}
      <div class="body"><div class="wrap"><img ${imgSrcAttrs(e.media)} alt="${esc(e.caption || "a picture of us")}" loading="lazy"></div>
      ${e.caption ? `<div class="cap">${esc(e.caption)}</div>` : ""}${guessHtml(e)}</div>${lock}${binNote}${signHtml(e)}</article>`;
  }
  if (e.type === "voice") {
    return `<article class="card voice${cls}" ${common}>${top}
      <div class="body"><div class="label-strip">${esc(e.title || "a little voice note")}</div>
      <div class="reels"><span class="spool"></span><button class="play" data-play="${esc(e.id)}" aria-label="Play">▶</button>
        <div class="bar"><i></i></div><span class="dur">${fmtDur(e.duration)}</span><span class="spool"></span></div>${guessHtml(e)}</div>
      ${lock}${binNote}${signHtml(e)}</article>`;
  }
  return "";
}

// The wall shows everything that isn't archived or in the recycle bin.
const onWall = e => !e.status && ["note", "photo", "voice"].includes(e.type); // calls etc. live in their own widget
function render() {
  const wall = entries.filter(onWall);
  const binned = entries.filter(e => e.status === "binned").length;
  $("#binChip").textContent = binned ? `🗑 bin (${binned})` : "🗑 bin";
  const list = entries.filter(e =>
      filter === "archive" ? e.status === "archived"
    : filter === "bin" ? e.status === "binned"
    : onWall(e) && (filter === "all" || (filter === "answers" ? e.prompt : e.type === filter)))
    .sort((a, b) => new Date(b.at) - new Date(a.at));
  $("#sub").textContent = wall.length
    ? `${wall.length} ${wall.length === 1 ? "page" : "pages"} of us so far`
    : "notes, pictures & voices, kept forever";
  if (!list.length) {
    const msg = filter === "archive" ? ["The archive is empty", "pages you archive rest here, off the wall"]
      : filter === "bin" ? ["The bin is empty", `removed pages wait here for ${BIN_DAYS} days before they're gone for good`]
      : [wall.length ? "Nothing here yet" : "The first page is waiting", KEY ? "tap ＋ to stick something in, or try the mini games for a question" : "open your setup link to start writing"];
    book.innerHTML = `<div class="empty"><b>${msg[0]}</b>${msg[1]}</div>`;
    renderGoldieBar(entries);
  if (typeof renderCallWidget === "function") renderCallWidget();
    return;
  }
  const days = new Map();
  for (const e of list) {
    const d = new Date(e.at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (!days.has(d)) days.set(d, []);
    days.get(d).push(e);
  }
  renderGoldieBar(entries);
  if (typeof renderCallWidget === "function") renderCallWidget();
  book.innerHTML = [...days].map(([d, es]) =>
    `<section class="day"><div class="day-label">${esc(d)}</div><div class="grid">${es.map(cardHtml).join("")}</div></section>`
  ).join("");
  hydrateMedia(book);
}

async function refresh() {
  try {
    entries = (await loadIndex()).entries;
    lastSeen = Number(store.get("diary-seen-" + NAME)) || 0;
    render();
    emptyOldBin();
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
  if (goldieeCry(entries, () => { state.prompt = null; openComposer(); })) return;
  const waiting = entries.find(isLocked);
  if (waiting) return g.say(`${waiting.author} answered a question. Answer it too to see theirs 💭`, () => startAnswer(waiting.prompt), "answer it →");
  const replied = entries.find(e => onWall(e) && (e.replies || []).some(r => isFresh(r.at, r.by)));
  if (replied) return g.say(`${partnerOf(NAME)} replied to a page 💬`, () => openPost(replied.id), "read it →");
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

/* ---------- voice playback (cards on the wall, in an open post, and voice replies) ---------- */
const player = new Audio();
let playingBtn = null; // the ▶ button whose voice note is playing
player.addEventListener("timeupdate", () => {
  const bar = playingBtn?.closest(".card, .reply")?.querySelector(".bar i");
  if (bar && player.duration) bar.style.width = (player.currentTime / player.duration * 100) + "%";
});
player.addEventListener("ended", stopPlaying);
function stopPlaying() {
  if (playingBtn) {
    const holder = playingBtn.closest(".card, .reply");
    holder?.classList.remove("playing");
    playingBtn.textContent = "▶";
    const bar = holder?.querySelector(".bar i"); if (bar) bar.style.width = "0";
  }
  playingBtn = null;
}
async function togglePlay(btn, path) {
  if (playingBtn === btn) { player.pause(); return stopPlaying(); }
  player.pause(); stopPlaying();
  playingBtn = btn;
  try { player.src = await playableUrl(path); } catch { toast("Couldn't open this voice note."); return stopPlaying(); }
  player.play().catch(() => toast("This voice note can't play on this device."));
  btn.textContent = "❚❚";
  btn.closest(".card, .reply")?.classList.add("playing");
}

// On the wall: ▶ plays, 🔒 answers, and tapping anywhere else on a card opens it.
book.addEventListener("click", ev => {
  const unlock = ev.target.closest(".unlock");
  if (unlock) return startAnswer(questionById(unlock.dataset.q) || entries.find(x => x.prompt?.id === unlock.dataset.q)?.prompt);
  if (ev.target.closest(".card.locked")) return;
  const play = ev.target.closest("[data-play]");
  if (play) return togglePlay(play, entries.find(x => x.id === play.dataset.play)?.media);
  const card = ev.target.closest(".card");
  if (card) tapCard(card, ev); // one tap opens it, a double tap sends a ❤️
});

/* ---------- sheets ---------- */
function openSheet(id) { $(id).hidden = false; }
function closeSheet(back) {
  back.hidden = true;
  if (back.id === "composerBack") stopRecording();
  if (back.id === "postBack") closePost();
}
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
  const on = !!VAULT;
  $("#keyBlock").hidden = on || !!KEY;
  $("#pairBlock").hidden = on || !KEY;
  $("#vaultSetupBlock").hidden = on || !KEY;
  $("#vaultOnBlock").hidden = !on;
  $("#forgetBtn").hidden = !on && !KEY;
  syncNotifyBlock();
  $("#ftLabel").textContent = `${partnerOf(NAME || PEOPLE[0])}'s FaceTime`;
  $("#ftInput").value = store.get("facetime-to");
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
  store.set("facetime-to", $("#ftInput").value.trim()); // stays on this phone only
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
  if (VAULT) {
    if (!confirm("Lock this phone? You'll need the secret word to come back in.")) return;
    Vault.forget(VAULT);
    return location.reload();
  }
  if (!confirm("Lock this phone? It will need the setup link again to write.")) return;
  KEY = ""; store.set("diary-key", "");
  openSettings("This phone is locked. It can still read the diary.");
  render();
});

/* ---------- switching the vault on (one time, from a phone that has the GitHub key) ---------- */
const randomTag = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => (b % 36).toString(36)).join("");
async function shaOf(path) {
  const r = await fetch(API + path + "?ref=" + BRANCH, { headers: headers(), cache: "no-store" });
  return r.ok ? (await r.json()).sha : null;
}
async function switchOnVault(pass) {
  const st = $("#settingsStatus");
  const step = m => setStatus(st, m);
  step("Making the lock… (a few seconds)");
  const { key, vault } = await Vault.create(pass);
  // Fresh notification topics, kept inside the vault so strangers can't subscribe.
  const topics = Object.fromEntries(PEOPLE.map(p => [p, `for-you-${p.toLowerCase()}-${randomTag()}${randomTag()}`]));
  vault.secrets = await Vault.encryptText(key, JSON.stringify({ token: KEY, topics }));
  VAULT = vault; CRYPTO_KEY = key; // from here, packMedia/encodeIndex encrypt
  try {
    const ir = await fetch(API + INDEX + "?ref=" + BRANCH, { headers: headers(), cache: "no-store" });
    if (!ir.ok && ir.status !== 404) throw await ghError(ir);
    const ij = ir.ok ? await ir.json() : null;
    const list = ij ? await decodeIndex(JSON.parse(fromB64(ij.content))) : [];
    const toDelete = [];

    // 1. diary pictures and voice notes
    const withMedia = list.filter(e => e.media && !e.media.endsWith(".enc"));
    for (const [i, e] of withMedia.entries()) {
      step(`Encrypting diary file ${i + 1} of ${withMedia.length}…`);
      const fr = await fetch(rawUrl(e.media) + "?t=" + Date.now());
      if (!fr.ok) throw new Error("Couldn't read " + e.media);
      const packed = await packMedia(e.media, await fr.blob());
      const res = await putFile(packed.path, packed.b64, "Encrypt a diary file");
      toDelete.push({ path: e.media, sha: e.mediaSha });
      e.media = packed.path; e.mediaSha = res.content.sha;
    }
    // 2. the love-page photos
    const pr = await fetch(API + "photos?ref=" + BRANCH, { headers: headers(), cache: "no-store" });
    const photos = pr.ok ? (await pr.json()).filter(f => f.type === "file" && !f.name.endsWith(".enc") && /^(image|video)\//.test(Vault.mimeOf(f.name))) : [];
    for (const [i, f] of photos.entries()) {
      step(`Encrypting love-page photo ${i + 1} of ${photos.length}…`);
      const fr = await fetch(f.download_url);
      if (!fr.ok) throw new Error("Couldn't read " + f.path);
      const packed = await packMedia(f.path, await fr.blob());
      await putFile(packed.path, packed.b64, "Encrypt a love-page photo");
      toDelete.push({ path: f.path, sha: f.sha });
    }
    // 3. the lock itself, then the encrypted diary
    step("Locking the diary…");
    await putFile("diary/vault.json", toB64(JSON.stringify(vault, null, 2) + "\n"), "Switch on the vault");
    await putFile(INDEX, toB64(await encodeIndex(list)), "Encrypt the diary", ij?.sha);
    // 4. remove the unencrypted originals
    for (const [i, d] of toDelete.entries()) {
      step(`Removing unencrypted copies ${i + 1} of ${toDelete.length}…`);
      const sha = d.sha || await shaOf(d.path);
      if (sha) await deleteFile(d.path, sha, "Remove an unencrypted copy").catch(() => {});
    }
    await Vault.remember(vault, key);
    await applyVaultKey(key);
    entries = list;
  } catch (e) {
    VAULT = null; CRYPTO_KEY = null;
    throw e;
  }
}
$("#vaultOnBtn").addEventListener("click", async () => {
  const st = $("#settingsStatus");
  const a = $("#passInput").value, b = $("#passInput2").value;
  if (a.length < 8) return setStatus(st, "Make it at least 8 characters. A short sentence is best.", true);
  if (a !== b) return setStatus(st, "The two don't match.", true);
  if (!confirm("Encrypt everything now? Keep this tab open until it says done. Remember the secret word: it can't be recovered.")) return;
  const btn = $("#vaultOnBtn"); btn.disabled = true;
  try {
    await switchOnVault(a);
    $("#passInput").value = $("#passInput2").value = "";
    render();
    openSettings("Done. Everything is encrypted 🔐 On the other phone, open the diary and type the secret word.");
  } catch (err) {
    setStatus(st, "Stopped: " + err.message + " Nothing was lost, so you can try again.", true);
  } finally { btn.disabled = false; }
});
$("#replaceKeyBtn").addEventListener("click", async () => {
  const st = $("#settingsStatus");
  const key = $("#newKeyInput").value.trim();
  if (!key) return;
  setStatus(st, "Checking the new key…");
  try {
    const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/vnd.github+json" }, cache: "no-store" });
    if (!r.ok) throw new Error("That key didn't work.");
    KEY = key;
    const next = { ...VAULT, secrets: await Vault.encryptText(CRYPTO_KEY, JSON.stringify({ token: key, topics: NOTIFY_TOPICS })) };
    await putFile("diary/vault.json", toB64(JSON.stringify(next, null, 2) + "\n"), "Replace the GitHub key in the vault", await shaOf("diary/vault.json"));
    VAULT = next;
    $("#newKeyInput").value = "";
    setStatus(st, "New key saved inside the vault ✓");
  } catch (err) { setStatus(st, err.message, true); }
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
// mirror: flip left↔right (for front-camera selfies that come out reversed)
async function shrinkImage(file, max = 1600, mirror = false) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext("2d");
    if (mirror) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(res, "image/jpeg", 0.85));
  } finally { URL.revokeObjectURL(url); }
}
$("#photoInput").addEventListener("change", async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    state.photoFile = file; state.mirror = false;
    state.photo = await shrinkImage(file);
    $("#flipBtn").hidden = false;
    const prev = $("#photoPreview");
    prev.src = URL.createObjectURL(state.photo); prev.hidden = false;
    $("#dropText").hidden = true;
  } catch { toast("Couldn't open that picture. Try a JPG or PNG."); }
});

// ↔ flip the chosen picture before it's saved.
$("#flipBtn").addEventListener("click", async () => {
  if (!state.photoFile) return;
  state.mirror = !state.mirror;
  state.photo = await shrinkImage(state.photoFile, 1600, state.mirror);
  $("#photoPreview").src = URL.createObjectURL(state.photo);
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
  state.photoFile = null; state.mirror = false; $("#flipBtn").hidden = true;
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
      const packed = await packMedia(`${MEDIA_DIR}${id}.${ext}`, blob); // encrypted when the vault is on
      entry.media = packed.path;
      const res = await putFile(entry.media, packed.b64, `${state.type === "photo" ? "Picture" : "Voice note"} from ${NAME}`);
      entry.mediaSha = res.content.sha;
    }
    setStatus(st, "Sticking it in…");
    const before = myPoints(entries);
    entries = await updateIndex(list => [entry, ...list], `A new ${kind} from ${entry.author}`);
    pointsToast(before, entries);
    window.goldiee?.cry(Goldies.score(entries, NAME).crying);
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
(async () => {
  // Once the vault is on, nothing is shown until the secret word is typed on this device.
  if (await initVault() === "locked") {
    book.innerHTML = "";
    await applyVaultKey(await Vault.lockScreen(VAULT, { title: "Our little diary", hint: "Type our secret word to open it." }));
  }
  await refresh();
  if (justPaired && !VAULT) return openSettings(NAME ? `Unlocked ♥ Welcome back, ${NAME}.` : "Unlocked ♥ Now tap whose phone this is.");
  if (VAULT && !NAME) return openSettings("Welcome in ♥ Tap whose phone this is.");
  if (askedQ) startAnswer(questionById(askedQ));
  // Keep the countdown fresh, and let a sad Goldiee speak up again every 15 minutes.
  setInterval(() => renderGoldieBar(entries), 60000);
  setInterval(() => { if (!$$(".sheet-back").some(b => !b.hidden)) goldieeCry(entries, () => { state.prompt = null; openComposer(); }); }, 15 * 60000);
})();
