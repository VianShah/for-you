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
  return !!(NAME && e.prompt && !e.together && e.author !== NAME && !answeredBy(entries, NAME, e.prompt.id) && !peeked(entries, NAME, e.prompt.id));
}

// The shop's 👀: see their answer now, without answering first.
async function peekAnswer(qid, btn) {
  if (!canWrite()) return;
  const cost = SHOP.PEEK, have = myPoints(entries);
  if (have < cost) return toast(`A peek is ${cost} goldies. You have ${have} 🪙`);
  if (!confirm(`Spend ${cost} goldies to see ${partnerOf(NAME)}'s answer without answering first?`)) return;
  btn.disabled = true;
  try {
    const buy = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type: "buy", item: "peek", qid, by: NAME, at: new Date().toISOString(), cost };
    entries = await updateIndex(list => [buy, ...list], `${NAME} peeked at an answer`);
    renderGoldieBar(entries);
    render();
    toast(`👀 −${cost} goldies`);
  } catch (err) { toast(err.message); btn.disabled = false; }
}

// When this phone last opened each page, so 💬 only shows for replies you haven't seen yet.
// Replies from before this was added count as read.
const readMap = () => { try { return JSON.parse(store.get("post-read") || "{}"); } catch { return {}; } };
const READ_FROM = Number(store.get("post-read-from")) || (store.set("post-read-from", String(Date.now())), Date.now());
function markRead(id) {
  const m = readMap(); m[id] = Date.now();
  const keep = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 300); // only the latest few hundred pages
  store.set("post-read", JSON.stringify(Object.fromEntries(keep)));
}
const unreadReplies = e => !NAME ? 0 : (e.replies || []).filter(r => r.by !== NAME && Date.parse(r.at) > Math.max(readMap()[e.id] || 0, READ_FROM)).length;
const isFresh = (at, by) => !!(NAME && at && new Date(at).getTime() > lastSeen && by !== NAME);
const BIN_DAYS = 100;
const binDaysLeft = e => Math.max(0, Math.ceil(BIN_DAYS - (Date.now() - new Date(e.binnedAt).getTime()) / 864e5));

// Several pictures on one page: swipe through them (on the wall too), with arrows, dots and a count.
function galleryHtml(paths, caption) {
  const n = paths.length;
  return `<div class="gallery" data-gallery><div class="gal-track">${paths.map((m, i) => `<figure><img ${imgSrcAttrs(m)} data-path="${esc(m)}" alt="${esc(caption || "a picture of us")} (${i + 1} of ${n})"${i ? ' loading="lazy"' : ""}></figure>`).join("")}</div>
    <button type="button" class="gal-arrow prev" data-gal="-1" aria-label="previous picture" hidden>‹</button><button type="button" class="gal-arrow next" data-gal="1" aria-label="next picture">›</button>
    <span class="gal-count">1 / ${n}</span><div class="gal-dots">${paths.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div></div>`;
}
// Arrows scroll one picture; they never open the page underneath.
document.addEventListener("click", e => {
  const a = e.target.closest("[data-gal]"); if (!a) return;
  e.stopPropagation(); e.preventDefault();
  const track = a.closest(".gallery").querySelector(".gal-track");
  track.scrollBy({ left: Number(a.dataset.gal) * track.clientWidth, behavior: reduceMotion ? "auto" : "smooth" });
}, true);
// Keep the dots, the count and the arrows in step with the swiping.
document.addEventListener("scroll", e => {
  const track = e.target.classList?.contains("gal-track") && e.target; if (!track) return;
  const g = track.closest(".gallery"), n = track.children.length, i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
  g.querySelector(".gal-count").textContent = `${i + 1} / ${n}`;
  g.querySelectorAll(".gal-dots i").forEach((d, k) => d.classList.toggle("on", k === i));
  g.querySelector(".prev").hidden = i === 0;
  g.querySelector(".next").hidden = i >= n - 1;
  g.classList.add("swiped");
}, true);

// full: the opened page (plays the video); on the wall a video is just a tile until you open it.
function cardHtml(e, full = false) {
  const r = (rand(e.id, "r") * 6 - 3).toFixed(2);
  // Replies live inside the post (tap it to see them); the wall only shows how many are new.
  const unread = unreadReplies(e);
  const del = unread ? `<span class="reply-badge fresh" title="${unread} new ${unread === 1 ? "reply" : "replies"}">💬 ${unread}</span>` : "";
  const binNote = e.status === "binned" ? `<div class="bin-note">🗑 deletes forever in ${binDaysLeft(e)} days</div>` : "";
  const isNew = isFresh(e.at, e.by || e.author) ? `<span class="new-ribbon">new</span>` : "";
  const locked = isLocked(e);
  const lock = locked ? `<div class="unlock-row"><button class="unlock" data-q="${esc(e.prompt.id)}">🔒 answer it too to see ${esc(e.author)}'s answer</button>${KEY ? `<button class="unlock peek" data-peek="${esc(e.prompt.id)}">👀 or peek for ${SHOP.PEEK} 🪙</button>` : ""}</div>` : "";
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
      <div class="body"><div class="wrap">${e.more?.length && !e.previewSrc
        ? galleryHtml([e.media, ...e.more], e.caption)
        : `<img ${e.previewSrc ? `src="${e.previewSrc}"` : imgSrcAttrs(e.media)} alt="${esc(e.caption || "a picture of us")}" loading="lazy">${e.more?.length ? `<span class="photo-count-badge">📷 ${e.more.length + 1}</span>` : ""}`}</div>
      ${e.caption ? `<div class="cap">${esc(e.caption)}</div>` : ""}${guessHtml(e)}</div>${lock}${binNote}${signHtml(e)}</article>`;
  }
  if (e.type === "video") {
    const frame = ["polaroid", "tape", "film", "heart", "stamp"].includes(e.frame) ? e.frame : "polaroid";
    const fcls = frame === "tape" ? "tape-frame" : frame;
    // Framed the way it was filmed (or the way it was chosen): landscape or portrait.
    const shape = e.shape === "wide" ? "wide" : "tall";
    const thumb = e.previewThumb ? `<img src="${e.previewThumb}" alt="">` : e.thumb ? `<img ${imgSrcAttrs(e.thumb)} alt="">` : "";
    const vid = full && !e.previewThumb ? `<div class="vbox ${shape}">${videoHtml(e.media, "", e.thumb)}</div>`
      : `<div class="vid-tile ${shape}" aria-label="a video">${thumb}<span class="vid-play">▶</span></div>`;
    return `<article class="card photo video ${shape} ${fcls}${cls}" ${common}>${frame === "tape" ? tapeHtml(e, 2) : ""}${top}
      <div class="body"><div class="wrap">${vid}</div>
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
const onWall = e => !e.status && ["note", "photo", "video", "voice"].includes(e.type); // calls etc. live in their own widget
function render() {
  const wall = entries.filter(onWall);
  const binned = entries.filter(e => e.status === "binned").length;
  $("#binChip").textContent = binned ? `🗑 bin (${binned})` : "🗑 bin";
  const list = entries.filter(e =>
      filter === "archive" ? e.status === "archived"
    : filter === "bin" ? e.status === "binned"
    : onWall(e) && (filter === "all" || (filter === "answers" ? e.prompt : filter === "photo" ? ["photo", "video"].includes(e.type) : e.type === filter)))
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
  // Pinned to the top from the shop: on the everything view, it sits above the days for 24 hours.
  const pins = filter === "all" ? pinnedToTop(entries).map(p => ({ p, e: entries.find(x => x.id === p.page && onWall(x)) })).filter(x => x.e) : [];
  const pinned = pins.length ? `<section class="day pinned-day"><div class="day-label">📌 pinned to the top</div><div class="grid">${pins.map(({ p, e }) => cardHtml(e).replace('<article class="card', `<article title="pinned by ${esc(p.by)}" class="card pinned-card`)).join("")}</div></section>` : "";
  book.innerHTML = pinned + [...days].map(([d, es]) =>
    `<section class="day"><div class="day-label">${esc(d)}</div><div class="grid">${es.map(cardHtml).join("")}</div></section>`
  ).join("");
  hydrateMedia(book);
  showSurprise();
}

// A surprise bought in the shop: hearts and their note, the first time this phone opens the diary after.
function showSurprise() {
  if (!NAME || $(".surprise-pop")) return;
  const seen = store.get("surprises-seen").split(",");
  // Surprises and flowers both pop up once, the first time this phone opens the diary after.
  const s = [...surprisesFor(entries, NAME), ...flowersFor(entries, NAME)].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).find(e => !seen.includes(e.id));
  if (!s) return;
  store.set("surprises-seen", [s.id, ...seen.filter(Boolean)].slice(0, 100).join(","));
  if (s.item === "flowers") return flowerReveal(s);
  const back = document.createElement("div");
  back.className = "sheet-back surprise-pop";
  back.innerHTML = `<div class="sheet small surprise-card"><div class="surprise-look">${window.goldiee?.look ? goldiee.look(currentOutfit(entries)) : "🐶"}</div>
    <small>a surprise from ${esc(s.by)}</small><p>${esc(s.note || "Just thinking of you ♥")}</p><button class="save" data-close>aww ♥</button></div>`;
  back.addEventListener("click", ev => { if (ev.target === back || ev.target.closest("[data-close]")) back.remove(); });
  document.body.appendChild(back);
  for (let i = 0; i < 4; i++) setTimeout(() => burst(innerWidth * (.2 + Math.random() * .6), innerHeight * (.25 + Math.random() * .4), 18), i * 350);
}

// Coming in from a notification: open the newest thing from the other one (a new page,
// or a page with a new reply) with the reply box ready. Each thing only opens itself once.
let cameBackAt = Date.now();
document.addEventListener("visibilitychange", () => { if (!document.hidden) cameBackAt = Date.now(); });
function openNewest() {
  if (!NAME || $$(".sheet-back, .lightbox").some(el => !el.hidden && el.isConnected)) return false;
  const mark = Number(store.get("auto-opened-" + NAME)) || 0;
  store.set("auto-opened-" + NAME, String(Date.now()));
  if (!mark) return false; // first time on this phone: nothing to jump to yet
  const theirs = (at, by) => at && Date.parse(at) > mark && by && by !== NAME;
  let best = null;
  for (const e of entries.filter(onWall)) {
    if (!e.together && theirs(e.at, e.by || e.author) && (!best || Date.parse(e.at) > best.at)) best = { id: e.id, at: Date.parse(e.at) };
    for (const r of e.replies || []) if (theirs(r.at, r.by) && (!best || Date.parse(r.at) > best.at)) best = { id: e.id, at: Date.parse(r.at) };
  }
  const e = best && entries.find(x => x.id === best.id);
  if (!e || isLocked(e)) return false;
  openPost(e.id);
  setTimeout(() => { const sh = $(".post-sheet"); if (sh) sh.scrollTop = sh.scrollHeight; $("#replyText")?.focus({ preventScroll: true }); }, 350);
  return true;
}

let autoRefreshOn = false;
async function refresh() {
  try {
    entries = (await loadIndex()).entries;
    lastSeen = Number(store.get("diary-seen-" + NAME)) || 0;
    render();
    emptyOldBin();
    if (!openNewest()) setTimeout(goldieeNudge, 1500);
    if (!autoRefreshOn) {
      autoRefreshOn = true;
      startAutoRefresh(list => {
        entries = list;
        render();
        if (openId && !$("#postBack").hidden) renderPost();
        else if (Date.now() - cameBackAt < 15000) openNewest(); // just came back (e.g. after a notification)
      }, entries);
    }
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
  // A "who knows whom" round in the mini games waiting on this phone.
  const kw = entries.find(e => e.type === "kwho" && !e.dropped && !e.verdict &&
    (e.about === NAME ? !e.answer || e.guess : !e.guess));
  if (kw) return g.say("your turn in who knows whom 🎯", "games.html#kwho", "play →");
  // A dare waiting on you, with its clock running.
  const dare = buys(entries, "coupon").find(e => e.for === NAME && !e.done && Goldies.dareDue(e) && Date.now() < Goldies.dareDue(e));
  if (dare) return g.say(`${dare.by} dared you 😈 ${Math.max(1, Math.floor((Goldies.dareDue(dare) - Date.now()) / 36e5))}h left, or lose ${2 * dare.cost} goldies`, "shop.html#coupons", "show me →");
  const race = entries.find(e => e.type === "race" && !e.cancelled && (e.accepted ? (e.by === NAME || e.with === NAME) && !e.times?.[NAME] : e.with === NAME));
  if (race) return g.say(race.accepted ? "your puzzle race is waiting 🧩" : `${race.by} challenged you to a puzzle race 🧩`, "games.html#race", "play →");
  const replied = entries.find(e => onWall(e) && unreadReplies(e));
  if (replied) return g.say(`${partnerOf(NAME)} replied to a page 💬`, () => openPost(replied.id), "read it →");
  const fresh = $$(".new-ribbon");
  if (fresh.length) return g.say(`${fresh.length} new ${fresh.length === 1 ? "page" : "pages"} from ${partnerOf(NAME)} 💌`,
    () => fresh[0].closest(".card").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" }), "show me →");
  const tq = todaysQuestion(new Date(), entries);
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
  const peek = ev.target.closest("[data-peek]");
  if (peek) return peekAnswer(peek.dataset.peek, peek);
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
  $("#ftInput").value = store.get("facetime-to") || PHONES[partnerOf(NAME || PEOPLE[0])] || "";
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
  setTimeout(updatePreview);
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
  updatePreview();
  if (state.type !== "voice") stopRecording();
}));

$$(".choices", composer).forEach(group => group.addEventListener("click", e => {
  const c = e.target.closest(".choice"); if (!c) return;
  $$(".choice", group).forEach(x => x.classList.toggle("on", x === c));
  state[group.dataset.choice] = c.dataset.v;
  updatePreview();
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
  updatePreview();
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
// Landscape or portrait: picked for you from the video, and you can switch it.
function setVideoShape(shape) {
  state.vshape = shape;
  $$("#vshapeBlock .choice").forEach(c => c.classList.toggle("on", c.dataset.v === shape));
}
/* pictures: from the camera (several in one go) or from your photos, then tick which to send */
const MAX_PHOTOS = 10; // pictures on one page
state.picks = []; // { src: the original, blob: shrunk for upload, url, on: will be sent }
function syncPicks() {
  const on = state.picks.filter(p => p.on);
  state.photos = on.map(p => p.blob);
  state.photo = state.photos[0] || null;
  const tray = $("#photoTray");
  tray.hidden = !state.picks.length;
  tray.innerHTML = state.picks.map((p, i) => `<button type="button" class="tray-pic${p.on ? " on" : ""}" data-pick="${i}" aria-label="picture ${i + 1}${p.on ? ", will be sent" : ", left out"}"><img src="${p.url}" alt=""><span class="tray-tick">${p.on ? on.indexOf(p) + 1 : ""}</span></button>`).join("");
  $("#trayHint").hidden = !state.picks.length;
  $("#trayHint").textContent = state.picks.length > 1 ? `${on.length} of ${state.picks.length} will be sent · tap a picture to leave it out or put it back` : "tap the picture to leave it out";
  $("#flipBtn").hidden = !on.length;
  updatePreview();
}
async function addPics(srcs) {
  if (state.video) { state.video = null; state.vthumb = null; $("#videoPreview").hidden = true; $("#vshapeBlock").hidden = true; }
  for (const src of srcs) {
    if (state.picks.length >= 30) { toast("That's plenty for one page 📷"); break; }
    try {
      const blob = await shrinkImage(src, 1600, state.mirror);
      state.picks.push({ src, blob, url: URL.createObjectURL(blob), on: state.picks.filter(p => p.on).length < MAX_PHOTOS });
    } catch { toast("Couldn't open one of those pictures."); }
  }
  syncPicks();
}
$("#photoTray").addEventListener("click", e => {
  const b = e.target.closest("[data-pick]"); if (!b) return;
  const p = state.picks[Number(b.dataset.pick)];
  if (!p.on && state.picks.filter(x => x.on).length >= MAX_PHOTOS) return toast(`Up to ${MAX_PHOTOS} pictures on one page`);
  p.on = !p.on;
  syncPicks();
});
$("#photoInput").addEventListener("change", async e => {
  const files = [...e.target.files]; e.target.value = ""; if (!files.length) return;
  // A video goes up as it is (no shrinking); it becomes a "video" page, on its own.
  if (files.length === 1 && isVideoFile(files[0])) {
    const file = files[0];
    if (videoTooBig(file)) return;
    state.picks = []; syncPicks();
    state.video = file; state.photo = null;
    $("#flipBtn").hidden = true;
    const v = $("#videoPreview"); v.src = URL.createObjectURL(file); v.hidden = false;
    const info = await videoInfo(file);
    state.vthumb = info.thumb;
    setVideoShape(info.wide ? "wide" : "tall");
    $("#vshapeBlock").hidden = false;
    return updatePreview();
  }
  const pics = files.filter(f => !isVideoFile(f));
  if (pics.length < files.length) toast("Videos go on a page of their own, so just the pictures this time.");
  addPics(pics);
});

// The diary's own camera: keep tapping the shutter, every shot lands in the tray.
let camFacing = "environment";
$("#camBtn").addEventListener("click", openCamera);
async function openCamera() {
  const back = document.createElement("div");
  back.className = "sheet-back multicam";
  back.innerHTML = `<div class="mc-stage"><video playsinline muted autoplay></video><div class="mc-flash"></div>
      <button type="button" class="mc-close" data-close aria-label="Done">✕</button></div>
    <div class="mc-strip"></div>
    <div class="mc-bar"><button type="button" class="mc-flip" aria-label="Switch camera">🔄</button>
      <button type="button" class="mc-shutter" aria-label="Take a picture"><i></i></button>
      <button type="button" class="mc-done" data-close>done</button></div>`;
  document.body.appendChild(back);
  const video = $("video", back), shots = [];
  let stream = null;
  const stop = () => stream?.getTracks().forEach(t => t.stop());
  async function start() {
    stop();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: camFacing, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false });
      video.srcObject = stream; video.classList.toggle("mirror", camFacing === "user");
      await video.play().catch(() => {});
    } catch { back.remove(); toast("The camera didn't open. Allow camera access, or use “your photos”."); }
  }
  const strip = () => {
    $(".mc-strip", back).innerHTML = shots.map(s => `<img src="${s.url}" alt="">`).join("");
    $(".mc-done", back).textContent = shots.length ? `done · ${shots.length} 📷` : "done";
    $(".mc-strip", back).scrollLeft = 1e6;
  };
  back.addEventListener("click", async ev => {
    if (ev.target.closest(".mc-shutter")) {
      if (!video.videoWidth) return;
      const c = document.createElement("canvas"); c.width = video.videoWidth; c.height = video.videoHeight;
      const ctx = c.getContext("2d");
      if (camFacing === "user") { ctx.translate(c.width, 0); ctx.scale(-1, 1); } // like the preview, the way you see yourself
      ctx.drawImage(video, 0, 0);
      const blob = await new Promise(r => c.toBlob(r, "image/jpeg", .9));
      shots.push({ blob, url: URL.createObjectURL(blob) });
      const f = $(".mc-flash", back); f.classList.remove("go"); void f.offsetWidth; f.classList.add("go");
      return strip();
    }
    if (ev.target.closest(".mc-flip")) { camFacing = camFacing === "user" ? "environment" : "user"; return start(); }
    if (ev.target.closest("[data-close]")) {
      stop(); back.remove();
      if (shots.length) addPics(shots.map(s => s.blob));
    }
  });
  start(); strip();
}

// ↔ flip the chosen pictures before they're saved (front-camera selfies come out reversed).
$("#flipBtn").addEventListener("click", async () => {
  if (!state.picks.length) return;
  state.mirror = !state.mirror;
  for (const p of state.picks) { p.blob = await shrinkImage(p.src, 1600, state.mirror); URL.revokeObjectURL(p.url); p.url = URL.createObjectURL(p.blob); }
  syncPicks();
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
    updatePreview();
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

/* ---------- live preview: the card exactly as it will look ---------- */
let previewPhotoUrl = "";
function updatePreview() {
  const box = $("#livePreview"); if (!box) return;
  const f = composer.elements;
  const together = state.from === "together";
  const draft = {
    id: "preview", type: state.type, author: together ? PEOPLE.join(" & ") : (NAME || PEOPLE[0]), by: NAME, together,
    at: new Date().toISOString(), stickers: [...state.stickers], prompt: state.prompt || undefined,
    guess: state.prompt && !together ? f.guess.value.trim() : "",
  };
  if (state.type === "note") Object.assign(draft, { paper: state.paper, title: state.prompt ? "" : f.title.value.trim(), text: f.text.value.trim() || "Dear you…" });
  if (state.type === "photo" && state.video) {
    if (previewPhotoUrl) URL.revokeObjectURL(previewPhotoUrl);
    previewPhotoUrl = URL.createObjectURL(state.video);
    if (state.vthumb && !state.vthumbUrl) state.vthumbUrl = URL.createObjectURL(state.vthumb);
    Object.assign(draft, { type: "video", frame: state.frame, caption: f.caption.value.trim(), media: "preview.mp4", shape: state.vshape,
      previewThumb: state.vthumbUrl || "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#3a2026"/></svg>') });
  } else if (state.type === "photo") {
    if (state.photo) { if (previewPhotoUrl) URL.revokeObjectURL(previewPhotoUrl); previewPhotoUrl = URL.createObjectURL(state.photo); }
    Object.assign(draft, { frame: state.frame, caption: f.caption.value.trim(), media: "preview.jpg", more: (state.photos || []).slice(1).map(() => "preview.jpg"),
      previewSrc: state.photo ? previewPhotoUrl : "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#f3d9d4"/></svg>') });
  }
  if (state.type === "voice") Object.assign(draft, { title: f.voiceTitle.value.trim(), duration: Math.round(state.duration) });
  box.innerHTML = cardHtml(draft);
}
composer.addEventListener("input", updatePreview);

function resetComposer() {
  composer.reset();
  Object.assign(state, { stickers: [], photo: null, video: null, voice: null, voiceMime: "", duration: 0, prompt: null });
  $$("#stickerPicker button").forEach(b => b.classList.remove("on"));
  $("#photoInput").value = "";
  $("#videoPreview").hidden = true; $("#videoPreview").removeAttribute("src"); $("#vshapeBlock").hidden = true;
  if (state.vthumbUrl) URL.revokeObjectURL(state.vthumbUrl);
  Object.assign(state, { vthumb: null, vthumbUrl: "", vshape: "tall" });
  state.picks.forEach(p => URL.revokeObjectURL(p.url));
  Object.assign(state, { picks: [], photos: null, mirror: false }); $("#photoTray").hidden = true; $("#trayHint").hidden = true; $("#flipBtn").hidden = true;
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
    if (!state.photo && !state.video) return setStatus(st, "Choose a picture or a video first.", true);
    if (state.video) Object.assign(entry, { type: "video", shape: state.vshape || "tall" });
    Object.assign(entry, { caption: f.caption.value.trim(), frame: state.frame });
  } else {
    if (!state.voice) return setStatus(st, "Record something first.", true);
    Object.assign(entry, { title: f.voiceTitle.value.trim(), duration: Math.round(state.duration) });
  }

  const isVid = entry.type === "video";
  const kind = entry.prompt ? "answer" : state.type === "note" ? "note" : isVid ? "video" : state.type === "photo" ? "picture" : "voice note";
  btn.disabled = true;
  try {
    const blob = isVid ? state.video : state.type === "photo" ? state.photo : state.type === "voice" ? state.voice : null;
    if (blob) {
      setStatus(st, isVid ? "Uploading the video… (big ones take a minute)" : state.type === "photo" ? "Uploading the picture…" : "Uploading the voice note…");
      const ext = isVid ? videoExt(state.video) : state.type === "photo" ? "jpg" : ({ "audio/mp4": "m4a", "audio/ogg": "ogg" }[state.voiceMime] || "webm");
      const packed = await packMedia(`${MEDIA_DIR}${id}.${ext}`, blob); // encrypted when the vault is on
      entry.media = packed.path;
      const res = await putFile(entry.media, packed.b64, `${isVid ? "Video" : state.type === "photo" ? "Picture" : "Voice note"} from ${NAME}`);
      entry.mediaSha = res.content.sha;
      // More than one picture: the rest go up next to the first, and the page shows them all.
      if (!isVid && state.type === "photo" && state.photos?.length > 1) {
        entry.more = [];
        for (const [i, blob] of state.photos.slice(1).entries()) {
          setStatus(st, `Uploading picture ${i + 2} of ${state.photos.length}…`);
          const m = await packMedia(`${MEDIA_DIR}${id}-${i + 2}.jpg`, blob);
          await putFile(m.path, m.b64, `Picture from ${NAME}`);
          entry.more.push(m.path);
        }
      }
      if (isVid && state.vthumb) { // the thumbnail the wall shows
        const t = await packMedia(`${MEDIA_DIR}${id}-thumb.jpg`, state.vthumb);
        await putFile(t.path, t.b64, `Video thumbnail from ${NAME}`);
        entry.thumb = t.path;
      }
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
