/* The "us" page: how you feel today, letters, the bucket list and the monthly recap.
   Everything is saved in the same encrypted page list as the diary (entries.json):
     { type: "mood",   by, day, mood, note }
     { type: "letter", by, to, topic: { id, title }, text }       (opening one is a "buy" with item "letter")
     { type: "bucket", by, cat, title, note, done: { by, at, note } }  */
let allPages = [];
const usId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const nowIso = () => new Date().toISOString();
const other = () => NAME ? partnerOf(NAME) : PEOPLE[1];
const dayShort = at => new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const RL = () => Goldies.RULES;
const smooth = el => el?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });

function needSetup() {
  if (typeof DEMO !== "undefined" && DEMO) { openGate(); return true; } // the sample diary: start your own first
  if (!KEY || !NAME) { toast("Set this phone up in the diary first 🔑"); return true; }
  return false;
}
async function usSave(change, message) {
  try {
    allPages = await updateIndex(change, message);
    renderGoldieBar(allPages);
    renderAll();
    return true;
  } catch (err) { toast(friendlyError(err)); return false; }
}

/* ======================= how are you today ======================= */
let moodPick = null;
const moodOf = (name, day) => allPages.find(e => e.type === "mood" && e.by === name && e.day === day);
function renderMood() {
  const today = dayKey(), mine = NAME && moodOf(NAME, today), theirs = moodOf(other(), today);
  const sel = moodPick || mine?.mood || "";
  $("#moodPick").innerHTML = MOODS.map(m => `<button type="button" class="mood${sel === m.id ? " on" : ""}" data-mood="${m.id}"><span>${m.emoji}</span><small>${m.label}</small></button>`).join("");
  const note = $("#moodNote");
  if (document.activeElement !== note && !note.dataset.dirty) note.value = mine?.note || "";
  const same = mine && mine.mood === sel && (mine.note || "") === note.value.trim();
  $("#moodSave").disabled = !sel || !!same;
  $("#moodSave").textContent = mine ? (same ? "saved for today ✓" : "update how I feel") : "that's how I feel ♥";
  const tm = theirs && moodById(theirs.mood);
  $("#moodTheirs").innerHTML = tm
    ? `<div class="mood-card"><span class="mood-big">${tm.emoji}</span><div><b>${esc(other())} is feeling ${esc(tm.label)}</b>${theirs.note ? `<p>“${esc(theirs.note)}”</p>` : ""}</div></div>`
    : `<p class="hint">${esc(other())} hasn't checked in today yet.</p>`;
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d; });
  $("#moodWeek").innerHTML = days.map(d => {
    const k = dayKey(d), a = NAME && moodOf(NAME, k), b = moodOf(other(), k);
    return `<div class="d${k === today ? " today" : ""}"><span>${d.toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 2)}</span><i>${a ? moodById(a.mood)?.emoji || "" : ""}</i><i>${b ? moodById(b.mood)?.emoji || "" : ""}</i></div>`;
  }).join("") + `<p class="hint mood-legend">top: you · bottom: ${esc(other())}</p>`;
}
$("#moodPick").addEventListener("click", e => {
  const b = e.target.closest("[data-mood]"); if (!b) return;
  moodPick = b.dataset.mood; renderMood();
});
$("#moodNote").addEventListener("input", e => { e.target.dataset.dirty = "1"; renderMood(); });
$("#moodSave").addEventListener("click", async () => {
  if (needSetup()) return;
  const today = dayKey(), mine = moodOf(NAME, today), mood = moodPick || mine?.mood, note = $("#moodNote").value.trim().slice(0, 80);
  if (!mood) return;
  const entry = { id: mine?.id || usId(), type: "mood", by: NAME, day: today, at: nowIso(), mood, note };
  const saved = await usSave(list => list.some(e => e.id === entry.id) ? list.map(e => e.id === entry.id ? entry : e) : [entry, ...list], `${NAME} checked in`);
  if (!saved) return;
  moodPick = null; delete $("#moodNote").dataset.dirty; renderMood();
  toast(`Saved ♥ ${other()} can see how you feel`);
  if (LOW_MOODS.includes(mood) && mine?.mood !== mood) notifyPartner(`💛 ${NAME} is having a heavy day`, "A little message could mean a lot.", "us.html#mood");
});

/* ======================= letters ======================= */
const lettersAll = () => allPages.filter(e => e.type === "letter" && !e.status);
const letterOpened = (e, name) => allPages.some(b => b.type === "buy" && b.item === "letter" && b.letter === e.id && b.by === name && !b.cancelled);
let draft = null, draftText = ""; // { topic, rerolls }
const MAX_REROLLS = 3;
function pickTopic(avoid) {
  const used = new Set(lettersAll().filter(e => e.by === NAME).map(e => e.topic?.id));
  let pool = LETTER_TOPICS.filter(t => !used.has(t.id) && t.id !== avoid);
  if (!pool.length) pool = LETTER_TOPICS.filter(t => t.id !== avoid);
  return pool[Math.random() * pool.length | 0];
}
// Would a letter on this topic, written now, earn goldies? (a topic once, one reward a day)
function earnsNow(topic) {
  const probe = { id: "probe", type: "letter", by: NAME, at: nowIso(), topic: { id: topic.id }, text: "x".repeat(RL().LETTER_MIN_CHARS) };
  return Goldies.letterRewards([...allPages, probe], NAME).has("probe");
}
function renderLetterWrite() {
  $("#letterReward").textContent = RL().LETTER; $("#letterCost").textContent = RL().LETTER_COST;
  const box = $("#letterWrite");
  if (!NAME || !KEY) { box.innerHTML = `<p class="hint">Set this phone up in the diary to write letters.</p>`; return; }
  if (!draft) {
    box.innerHTML = `<div class="game-actions"><button class="save" id="letterNew">write ${esc(other())} a letter ✍️ (+${RL().LETTER} 🪙)</button></div>`;
    return;
  }
  const t = draft.topic;
  box.innerHTML = `<div class="letter-draft"><small>the diary picked this one for you</small><p class="letter-topic">${esc(t.title)}</p><p class="hint">${esc(t.hint)}</p>
    <textarea class="field hand" id="letterText" rows="9" maxlength="3000" placeholder="Dear ${esc(other())},">${esc(draftText)}</textarea>
    <p class="hint" id="letterCount"></p>
    <div class="game-actions"><button class="save" id="letterSend">send 💌</button>
    <button class="ghost" id="letterAgain"${draft.rerolls >= MAX_REROLLS ? " disabled" : ""}>another topic ↻</button><button class="ghost quiet-btn" id="letterCancel">cancel</button></div></div>`;
  updateLetterCount();
}
function updateLetterCount() {
  if (!draft) return;
  const n = $("#letterText").value.trim().length, min = RL().LETTER_MIN_CHARS, earns = earnsNow(draft.topic);
  $("#letterCount").textContent = n < min ? `${n} of ${min} characters: write a real letter to send it`
    : earns ? `✓ long enough: sending earns you +${RL().LETTER} 🪙` : "✓ long enough. You've already earned from a letter today (or on this topic), so this one is just for love ♥";
  $("#letterSend").disabled = n < min;
}
document.addEventListener("input", e => { if (e.target.id === "letterText") { draftText = e.target.value; updateLetterCount(); } });

const letterDate = e => new Date(e.at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
function shelf(box, sum, list, items, label, card) {
  $(box).hidden = !items.length;
  $(sum).textContent = label(items.length);
  $(list).innerHTML = items.map(card).join("");
}
function renderLetters() {
  renderLetterWrite();
  const toMe = lettersAll().filter(e => e.to === NAME).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const waiting = toMe.filter(e => !letterOpened(e, NAME)), opened = toMe.filter(e => letterOpened(e, NAME));
  $("#inboxLabel").hidden = !waiting.length;
  $("#letterInbox").innerHTML = waiting.map(e => `<div class="letter-card locked" data-letter="${esc(e.id)}"><div class="letter-seal">💌</div><small>from ${esc(e.by)} · ${dayShort(e.at)}</small>
    <p class="letter-topic">${esc(e.topic?.title || "A letter")}</p><button class="save" data-open-letter="${esc(e.id)}">open it · ${RL().LETTER_COST} 🪙</button></div>`).join("");
  shelf("#shelfMine", "#shelfMineSum", "#shelfMineList", opened, n => `letters I've kept (${n})`, e => `<div class="letter-card" data-letter="${esc(e.id)}">
    <small>from ${esc(e.by)} · ${dayShort(e.at)}</small><p class="letter-topic">${esc(e.topic?.title || "A letter")}</p>
    <div class="game-actions"><button class="save" data-read-letter="${esc(e.id)}">read it</button><button class="ghost" data-save-letter="${esc(e.id)}">⬇ save as a picture</button></div></div>`);
  const sent = lettersAll().filter(e => e.by === NAME).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  shelf("#shelfSent", "#shelfSentSum", "#shelfSentList", sent, n => `letters I wrote (${n})`, e => `<div class="letter-card" data-letter="${esc(e.id)}">
    <small>to ${esc(e.to)} · ${dayShort(e.at)} · ${letterOpened(e, e.to) ? "opened ✓" : "not opened yet"}</small><p class="letter-topic">${esc(e.topic?.title || "A letter")}</p>
    <div class="game-actions"><button class="ghost" data-read-letter="${esc(e.id)}">read it again</button></div></div>`);
}

function readLetter(e) {
  const back = document.createElement("div");
  back.className = "sheet-back letter-read";
  back.innerHTML = `<div class="sheet letter-sheet"><div class="sheet-head"><h2></h2><button type="button" class="icon-btn close" data-close>✕</button></div>
    <small class="letter-from"></small><p class="letter-text"></p><p class="letter-sign"></p>
    <div class="game-actions"><button class="save" data-save>⬇ save as a picture</button><button class="ghost" data-close>close</button></div></div>`;
  $("h2", back).textContent = e.topic?.title || "A letter";
  $(".letter-from", back).textContent = `${e.by} to ${e.to} · ${letterDate(e)}`;
  $(".letter-text", back).textContent = e.text || "";
  $(".letter-sign", back).textContent = `— ${e.by}`;
  back.addEventListener("click", async ev => {
    if (ev.target === back || ev.target.closest("[data-close]")) return back.remove();
    if (ev.target.closest("[data-save]")) saveLetterPicture(e);
  });
  document.body.appendChild(back);
}

// The letter drawn on a paper-coloured picture, to keep in Photos.
async function letterBlob(e) {
  await Promise.all([document.fonts.load('52px Caveat'), document.fonts.load('70px "Pinyon Script"')]).catch(() => {});
  const W = 1080, M = 96, LH = 68, bodyFont = '52px Caveat, "Segoe Print", cursive', titleFont = '72px "Pinyon Script", cursive';
  const c = document.createElement("canvas"), x = c.getContext("2d");
  const wrap = (text, font, width) => {
    x.font = font; const out = [];
    for (const para of String(text).split("\n")) {
      let line = "";
      for (const w of para.split(/\s+/)) { const t = line ? line + " " + w : w; if (x.measureText(t).width > width && line) { out.push(line); line = w; } else line = t; }
      out.push(line);
    }
    return out;
  };
  const title = wrap(e.topic?.title || "A letter", titleFont, W - 2 * M), lines = wrap(e.text || "", bodyFont, W - 2 * M);
  const H = M + 70 + title.length * 88 + 30 + lines.length * LH + 40 + 130;
  c.width = W; c.height = H;
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#fffaf3"); g.addColorStop(1, "#f6e6dc");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = "rgba(110,35,55,.25)"; x.lineWidth = 3; x.strokeRect(36, 36, W - 72, H - 72);
  x.textBaseline = "alphabetic"; x.fillStyle = "#d97b86"; x.font = '28px "Jost", system-ui, sans-serif';
  x.fillText(`A LETTER FROM ${String(e.by).toUpperCase()}`, M, M + 20);
  x.fillStyle = "#6e2337"; x.font = titleFont;
  title.forEach((l, i) => x.fillText(l, M, M + 90 + i * 88));
  let y = M + 90 + title.length * 88 + 20;
  x.fillStyle = "#3a2026"; x.font = bodyFont;
  lines.forEach(l => { x.fillText(l, M, y); y += LH; });
  x.fillStyle = "#6e2337"; x.font = '60px Caveat, "Segoe Print", cursive';
  x.fillText(`— ${e.by}`, W - M - x.measureText(`— ${e.by}`).width, y + 50);
  x.fillStyle = "#9a7a7f"; x.font = '26px "Jost", system-ui, sans-serif';
  x.fillText(`${letterDate(e)} · Us ♥`, M, H - M + 6);
  return new Promise(r => c.toBlob(r, "image/png"));
}
async function saveLetterPicture(e) {
  try {
    const blob = await letterBlob(e);
    const file = new File([blob], `letter-${e.topic?.id || "us"}.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: e.topic?.title || "A letter" }); return; } catch (err) { if (err.name === "AbortError") return; } }
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: file.name });
    document.body.appendChild(a); a.click(); a.remove();
  } catch { toast("Couldn't make the picture. Try again."); }
}

/* ======================= bucket list ======================= */
let bkFilter = "all", bkCatSel = "movie";
const bucketItems = () => allPages.filter(e => e.type === "bucket" && !e.status);
function bkItem(e) {
  const c = bucketCat(e.cat), id = esc(e.id);
  return `<div class="bk-item${e.done ? " done" : ""}"><button type="button" class="bk-tick" data-bk-tick="${id}" aria-label="${e.done ? "Not done yet" : "Done!"}">${e.done ? "✓" : ""}</button>
    <div class="bk-main"><b>${esc(e.title)}</b><small>${c.emoji} ${esc(c.label)} · ${esc(e.by)} added · ${dayShort(e.at)}${e.done ? ` · done ${dayShort(e.done.at)}` : ""}</small>
    ${e.note ? `<p>${esc(e.note)}</p>` : ""}${e.done?.note ? `<p class="bk-memory">“${esc(e.done.note)}”</p>` : ""}</div>
    <button type="button" class="bk-x" data-bk-del="${id}" aria-label="Remove">✕</button></div>`;
}
function renderBucket() {
  const all = bucketItems(), done = all.filter(e => e.done), open = all.filter(e => !e.done);
  $("#bkProgress").innerHTML = all.length
    ? `<div class="bk-prog"><b>${done.length} of ${all.length} done</b><div class="prog-bar"><i style="width:${done.length / all.length * 100}%"></i></div></div>`
    : `<p class="hint">Nothing on the list yet. Add the first thing you two want to do ✨</p>`;
  $("#bkFilter").innerHTML = `<button type="button" class="chip${bkFilter === "all" ? " on" : ""}" data-bk-f="all">everything (${open.length})</button>` +
    BUCKET_CATS.map(c => `<button type="button" class="chip${bkFilter === c.id ? " on" : ""}" data-bk-f="${c.id}">${c.emoji} ${esc(c.label)} (${open.filter(e => (bucketCat(e.cat)).id === c.id).length})</button>`).join("");
  $("#bkCat").innerHTML = BUCKET_CATS.map(c => `<button type="button" class="chip${bkCatSel === c.id ? " on" : ""}" data-bk-c="${c.id}">${c.emoji} ${esc(c.label)}</button>`).join("");
  const show = e => bkFilter === "all" || bucketCat(e.cat).id === bkFilter;
  const mine = open.filter(show).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  $("#bkList").innerHTML = mine.length ? mine.map(bkItem).join("") : (all.length ? `<p class="hint">Nothing waiting in this one ♥</p>` : "");
  const dn = done.filter(show).sort((a, b) => Date.parse(b.done.at) - Date.parse(a.done.at));
  $("#bkDoneBox").hidden = !dn.length;
  $("#bkDoneSum").textContent = `done together (${dn.length}) 🎉`;
  $("#bkDone").innerHTML = dn.map(bkItem).join("");
}
$("#bkFilter").addEventListener("click", e => { const b = e.target.closest("[data-bk-f]"); if (b) { bkFilter = b.dataset.bkF; renderBucket(); } });
$("#bkCat").addEventListener("click", e => { const b = e.target.closest("[data-bk-c]"); if (b) { bkCatSel = b.dataset.bkC; renderBucket(); } });
$("#bkAdd").addEventListener("submit", async e => {
  e.preventDefault();
  if (needSetup()) return;
  const title = $("#bkTitle").value.trim(), note = $("#bkNote").value.trim();
  if (!title) return;
  const item = { id: usId(), type: "bucket", by: NAME, at: nowIso(), cat: bkCatSel, title, note };
  const btn = $("button[type=submit]", e.target); btn.disabled = true;
  const saved = await usSave(list => list.some(x => x.id === item.id) ? list : [item, ...list], `${NAME} added to the bucket list`);
  btn.disabled = false;
  if (!saved) return;
  $("#bkTitle").value = $("#bkNote").value = "";
  toast(`Added ${bucketCat(item.cat).emoji}`);
  notifyPartner(`📝 ${NAME} added to your bucket list`, `${bucketCat(item.cat).emoji} ${title}`, "us.html#bucket");
});
$("#bucket").addEventListener("click", async e => {
  const tick = e.target.closest("[data-bk-tick]"), del = e.target.closest("[data-bk-del]");
  if (tick) {
    if (needSetup()) return;
    const it = bucketItems().find(x => x.id === tick.dataset.bkTick); if (!it) return;
    let done = null;
    if (!it.done) {
      const memory = prompt(`Done! 🎉 Want to keep a little memory of “${it.title}”? (optional)`, "");
      if (memory === null) return;
      done = { by: NAME, at: nowIso(), note: memory.trim().slice(0, 120) };
    } else if (!confirm("Put it back on the list?")) return;
    const saved = await usSave(list => list.map(x => x.id === it.id ? (done ? { ...x, done } : (({ done: _d, ...rest }) => rest)(x)) : x), `${NAME} ${done ? "ticked off" : "reopened"} a bucket list item`);
    if (saved && done) { toast("Ticked off 🎉"); notifyPartner(`🎉 ${NAME} ticked off “${it.title}”`, "From your bucket list ♥", "us.html#bucket"); }
  }
  if (del) {
    if (needSetup()) return;
    const it = bucketItems().find(x => x.id === del.dataset.bkDel); if (!it) return;
    if (!confirm(`Remove “${it.title}” from the list?`)) return;
    await usSave(list => list.filter(x => x.id !== it.id), `${NAME} removed a bucket list item`);
  }
});

/* ======================= monthly recap ======================= */
let recapKey = null;
const monthKey = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
const monthName = k => { const [y, m] = k.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" }); };
const monthWord = k => { const [y, m] = k.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long" }); };
function recapMonths() {
  const first = allPages.reduce((m, e) => Math.min(m, Date.parse(e.at) || m), Date.now());
  const out = [], d = new Date(first), end = new Date();
  d.setDate(1); d.setHours(0, 0, 0, 0);
  while (d <= end) { out.push(monthKey(d)); d.setMonth(d.getMonth() + 1); }
  return out;
}
const wordCount = s => String(s || "").split(/\s+/).filter(Boolean).length;
function recapStats(key) {
  const [y, m] = key.split("-").map(Number), s = new Date(y, m - 1, 1).getTime(), en = new Date(y, m, 1).getTime();
  const inM = at => { const t = Date.parse(at); return t >= s && t < en; };
  const list = allPages.filter(e => e.status !== "binned");
  const pages = list.filter(e => ["note", "photo", "video", "voice"].includes(e.type) && inM(e.at));
  const by = e => e.by || e.author;
  const replies = list.flatMap(e => (e.replies || []).filter(r => inM(r.at)));
  const calls = list.filter(e => e.type === "call" && inM(e.at));
  const days = new Date(y, m, 0).getDate();
  const wroteOn = Object.fromEntries(PEOPLE.map(p => [p, new Set()]));
  for (const e of pages) for (const p of PEOPLE) if (e.together || by(e) === p) wroteOn[p].add(dayKey(new Date(e.at)));
  for (const r of replies) wroteOn[r.by]?.add(dayKey(new Date(r.at)));
  let best = 0, run = 0, both = 0;
  for (let d = 1; d <= days; d++) {
    const k = dayKey(new Date(y, m - 1, d));
    if (PEOPLE.every(p => wroteOn[p].has(k))) { both++; run++; best = Math.max(best, run); } else run = 0;
  }
  const tally = (arr) => Object.entries(arr.reduce((o, k) => (o[k] = (o[k] || 0) + 1, o), {})).sort((a, b) => b[1] - a[1]);
  const perDay = tally(pages.map(e => dayKey(new Date(e.at))));
  const races = Goldies.races(allPages).filter(r => r.at >= s && r.at < en);
  const per = Object.fromEntries(PEOPLE.map(p => {
    const moods = list.filter(e => e.type === "mood" && e.by === p && (e.day || "").startsWith(key));
    return [p, {
      pages: pages.filter(e => e.together || by(e) === p).length,
      replies: replies.filter(r => r.by === p).length,
      earned: Goldies.events(allPages, p).filter(x => x.at >= s && x.at < en && x.pts > 0 && !x.gift).reduce((n, x) => n + x.pts, 0),
      moodDays: moods.length, topMood: tally(moods.map(e => e.mood))[0]?.[0],
      letters: list.filter(e => e.type === "letter" && e.by === p && inM(e.at)).length,
      raceWins: races.filter(r => r.winner === p).length,
    }];
  }));
  const photos = pages.filter(e => e.type === "photo" && e.media).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).flatMap(e => [e.media, ...(e.more || [])]);
  return {
    pages: pages.length, together: pages.filter(e => e.together).length,
    notes: pages.filter(e => e.type === "note").length, pictures: pages.filter(e => e.type === "photo").length,
    voices: pages.filter(e => e.type === "voice").length, videos: pages.filter(e => e.type === "video").length,
    replies: replies.length, hearts: pages.reduce((n, e) => n + (e.hearts || []).length, 0),
    words: pages.filter(e => e.type === "note").reduce((n, e) => n + wordCount(e.text), 0) + replies.reduce((n, r) => n + wordCount(r.text), 0),
    answers: pages.filter(e => e.prompt).length,
    callMins: Math.round(calls.reduce((n, e) => n + (e.duration || 0), 0) / 60), calls: calls.length,
    stickers: tally(pages.flatMap(e => e.stickers || [])).slice(0, 3).map(x => x[0]),
    busiest: perDay[0], bothDays: both, bestRun: best, days,
    kwSpot: list.filter(e => e.type === "kwho" && e.verdict?.v === "spot" && !e.dropped && inM(e.verdict.at)).length,
    races: races.length,
    bucketDone: list.filter(e => e.type === "bucket" && e.done && inM(e.done.at)).map(e => e.title),
    lettersWritten: list.filter(e => e.type === "letter" && inM(e.at)).length,
    lettersOpened: list.filter(e => e.type === "buy" && e.item === "letter" && !e.cancelled && inM(e.at)).length,
    per, photos: photos.slice(0, 9),
  };
}
const statBox = (n, one, many) => `<div class="stat"><b>${n}</b><span>${n === 1 && many ? one : (many || one)}</span></div>`;
function renderRecap() {
  const months = recapMonths(), now = monthKey(new Date());
  if (!recapKey || !months.includes(recapKey)) {
    const d = new Date(), prev = monthKey(new Date(d.getFullYear(), d.getMonth() - 1, 1));
    recapKey = d.getDate() <= 5 && months.includes(prev) ? prev : now;
  }
  const i = months.indexOf(recapKey);
  $("#recapName").textContent = monthName(recapKey) + (recapKey === now ? " · so far" : "");
  $("#recapPrev").disabled = i <= 0; $("#recapNext").disabled = i >= months.length - 1;
  const st = recapStats(recapKey);
  if (!st.pages && !st.replies && !st.calls && !st.bucketDone.length && !st.lettersWritten) {
    $("#recapBody").innerHTML = `<p class="hint">Nothing here yet. Write something together ♥</p>`; return;
  }
  const person = p => {
    const x = st.per[p], md = x.topMood && moodById(x.topMood);
    return `<div class="recap-person${p === NAME ? " me" : ""}"><b>${esc(p)}</b><span>${x.pages} ${x.pages === 1 ? "page" : "pages"} · ${x.replies} ${x.replies === 1 ? "reply" : "replies"}</span><span>🪙 ${x.earned} earned</span>
      ${x.moodDays ? `<span>${md ? md.emoji : ""} checked in ${x.moodDays} day${x.moodDays === 1 ? "" : "s"}</span>` : ""}${x.letters ? `<span>💌 ${x.letters} letter${x.letters === 1 ? "" : "s"} written</span>` : ""}</div>`;
  };
  $("#recapBody").innerHTML = `<div class="recap-card"><p class="recap-title">Our ${esc(monthWord(recapKey))}</p>
    ${st.photos.length ? `<div class="recap-collage c${Math.min(st.photos.length, 9)}">${st.photos.map(p => `<img ${imgSrcAttrs(p)} alt="">`).join("")}</div>` : ""}
    <div class="stats">${statBox(st.pages, "page written", "pages written")}${statBox(st.words, "word to each other", "words to each other")}${statBox(st.replies, "reply", "replies")}${statBox(st.hearts, "heart ❤️", "hearts ❤️")}
      ${st.pictures ? statBox(st.pictures, "picture", "pictures") : ""}${st.voices ? statBox(st.voices, "voice note", "voice notes") : ""}${st.videos ? statBox(st.videos, "video", "videos") : ""}
      ${st.calls ? statBox(st.callMins >= 60 ? `${Math.floor(st.callMins / 60)}h ${st.callMins % 60}m` : `${st.callMins}m`, `on ${st.calls} call${st.calls === 1 ? "" : "s"}`) : ""}
      ${st.answers ? statBox(st.answers, "question answered", "questions answered") : ""}${st.lettersWritten ? statBox(st.lettersWritten, "letter 💌", "letters 💌") : ""}</div>
    <div class="recap-people">${PEOPLE.map(person).join("")}</div>
    <ul class="recap-lines">
      <li>📆 You both wrote on <b>${st.bothDays}</b> of ${st.days} days${st.bestRun > 1 ? `, <b>${st.bestRun}</b> in a row at best` : ""}.</li>
      ${st.busiest ? `<li>✨ Busiest day: <b>${new Date(st.busiest[0] + "T12:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</b> with ${st.busiest[1]} ${st.busiest[1] === 1 ? "page" : "pages"}.</li>` : ""}
      ${st.stickers.length ? `<li>${st.stickers.join(" ")} Your most-used stickers.</li>` : ""}
      ${st.kwSpot ? `<li>🎯 ${st.kwSpot} spot-on guess${st.kwSpot === 1 ? "" : "es"} in who knows whom.</li>` : ""}
      ${st.races ? `<li>🧩 ${st.races} puzzle race${st.races === 1 ? "" : "s"}: ${PEOPLE.map(p => `${esc(p)} won ${st.per[p].raceWins}`).join(", ")}.</li>` : ""}
      ${st.bucketDone.length ? `<li>🪣 Ticked off: ${st.bucketDone.slice(0, 5).map(esc).join(", ")}${st.bucketDone.length > 5 ? ` and ${st.bucketDone.length - 5} more` : ""}.</li>` : ""}
    </ul></div>`;
  hydrateMedia($("#recapBody"));
  if (recapKey !== now) store.set("recap-seen", recapKey);
}
$("#recapPrev").addEventListener("click", () => { const m = recapMonths(); recapKey = m[Math.max(0, m.indexOf(recapKey) - 1)]; renderRecap(); });
$("#recapNext").addEventListener("click", () => { const m = recapMonths(); recapKey = m[Math.min(m.length - 1, m.indexOf(recapKey) + 1)]; renderRecap(); });

/* ======================= letters: clicks ======================= */
document.addEventListener("click", async e => {
  const t = e.target;
  if (t.closest("#letterNew")) {
    if (needSetup()) return;
    draft = { topic: pickTopic(), rerolls: 0 }; draftText = ""; renderLetterWrite(); return $("#letterText").focus();
  }
  if (t.closest("#letterAgain")) { draftText = $("#letterText").value; draft.topic = pickTopic(draft.topic.id); draft.rerolls++; return renderLetterWrite(); }
  if (t.closest("#letterCancel")) {
    if ($("#letterText").value.trim() && !confirm("Throw this letter away?")) return;
    draft = null; draftText = ""; return renderLetterWrite();
  }
  if (t.closest("#letterSend")) {
    const text = $("#letterText").value.trim();
    if (text.length < RL().LETTER_MIN_CHARS) return;
    const b = t.closest("button"); b.disabled = true;
    const letter = { id: usId(), type: "letter", by: NAME, to: other(), at: nowIso(), topic: { id: draft.topic.id, title: draft.topic.title }, text };
    const before = myPoints(allPages);
    const saved = await usSave(list => list.some(x => x.id === letter.id) ? list : [letter, ...list], `A letter from ${NAME}`);
    if (!saved) { b.disabled = false; return; }
    const d = myPoints(allPages) - before;
    draft = null; draftText = ""; renderLetterWrite();
    toast(d > 0 ? `Sent 💌 +${d} goldies 🪙` : "Sent 💌");
    return notifyPartner(`💌 ${NAME} wrote you a letter`, `${letter.topic.title}. Open it in our corner.`, "us.html#letters");
  }
  const open = t.closest("[data-open-letter]");
  if (open) {
    if (needSetup()) return;
    const l = lettersAll().find(x => x.id === open.dataset.openLetter); if (!l) return;
    const cost = RL().LETTER_COST, have = myPoints(allPages);
    if (have < cost) return toast(`Opening a letter costs ${cost} goldies. You have ${have} 🪙. Write one to earn some ✍️`);
    if (!confirm(`Open “${l.topic?.title || "this letter"}” from ${l.by} for ${cost} goldies? Then it's yours to keep.`)) return;
    open.disabled = true;
    const buy = { id: usId(), type: "buy", item: "letter", letter: l.id, by: NAME, at: nowIso(), cost };
    const saved = await usSave(list => list.some(x => x.type === "buy" && x.item === "letter" && x.letter === l.id && x.by === NAME) ? list : [buy, ...list], `${NAME} opened a letter`);
    if (!saved) { open.disabled = false; return; }
    toast(`−${cost} goldies 🪙`);
    notifyPartner(`💌 ${NAME} opened your letter`, l.topic?.title || "", "us.html#letters");
    return readLetter(l);
  }
  const read = t.closest("[data-read-letter]");
  if (read) { const l = lettersAll().find(x => x.id === read.dataset.readLetter); if (l && (l.by === NAME || letterOpened(l, NAME))) readLetter(l); return; }
  const save = t.closest("[data-save-letter]");
  if (save) { const l = lettersAll().find(x => x.id === save.dataset.saveLetter); if (l && (l.by === NAME || letterOpened(l, NAME))) saveLetterPicture(l); }
});

/* ======================= start ======================= */
function renderAll() { renderMood(); renderLetters(); renderBucket(); renderRecap(); }
function nudge() {
  const g = window.goldiee; if (!g || $$(".sheet-back").some(b => !b.hidden)) return;
  if (!KEY || !NAME) return g.say("this phone isn't set up to write yet 🔑", "./", "set it up →");
  if (goldieeCry(allPages, "./")) return;
  if (!moodOf(NAME, dayKey())) return g.say("how are you feeling today? 🌤", () => smooth($("#mood")), "tell me →");
  const us = usWaiting(allPages);
  if (us) return g.say(us.msg, () => { us.seen?.(); smooth($(us.page.split("#")[1] ? "#" + us.page.split("#")[1] : "#mood")); }, us.label);
}
(async () => {
  if (await initVault() === "locked") {
    await applyVaultKey(await Vault.lockScreen(VAULT, { title: "Our corner", hint: "Type our secret word to come in." }));
  }
  try { allPages = (await loadIndex()).entries; } catch {}
  renderGoldieBar(allPages);
  setInterval(() => renderGoldieBar(allPages), 60000);
  renderAll();
  startAutoRefresh(list => { allPages = list; renderGoldieBar(allPages); renderAll(); }, allPages);
  if (location.hash) setTimeout(() => $(location.hash)?.scrollIntoView(), 300);
  setTimeout(nudge, 1800);
})();
