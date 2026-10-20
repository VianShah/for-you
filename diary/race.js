/* ==========================================================
   Puzzle race 🧩
   One of you picks a picture from the diary and a bet; the other
   accepts (or not). You each solve the exact same scrambled picture
   on your own phone, whenever suits you, and whoever is faster takes
   the bet from the other. Tap a piece, then tap where it goes.
   Saved in entries.json as
     { type: "race", by, with, at, photo, bet, accepted, cancelled,
       times: { Vian: { start, ms, moves } | { start, gaveUp } } }
   goldies.js turns finished races into goldies.
   ========================================================== */
const RACE_GRID = 4;
const raceList = () => allPages.filter(e => e.type === "race" && !e.cancelled);
const racePhotos = () => entries.filter(e => e.type === "photo" && e.media && !e.media.startsWith("preview"));
const fmtRace = ms => ms == null ? "–" : `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${Math.floor(ms / 100) % 10}`;
const raceOpp = e => e.by === NAME ? e.with : e.by;
const raceDone = (e, p) => { const t = e.times?.[p]; return !!t && (t.ms != null || !!t.gaveUp); };
const betLabel = b => b ? `${b} 🪙` : "just for fun";

// The same scramble on both phones, worked out from the race id.
function raceScramble(id) {
  const n = RACE_GRID * RACE_GRID, a = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand(id, i) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  if (a.every((v, i) => v === i)) [a[0], a[1]] = [a[1], a[0]];
  return a; // a[slot] = the piece sitting in that slot
}

/* ---------- the list ---------- */
let raceDraft = null; // { photo, bet } while setting up a challenge
function raceCard(e) {
  const opp = raceOpp(e), meDone = raceDone(e, NAME), oppDone = raceDone(e, opp);
  const head = `<div class="race-head"><img ${imgSrcAttrs(e.photo)} alt=""><div><small>${e.by === NAME ? `you challenged ${esc(opp)}` : `${esc(e.by)} challenged you`}</small>
    <b>${esc(betLabel(e.bet))}</b></div></div>`;
  let body;
  if (!e.accepted) {
    body = e.by === NAME
      ? `<p class="hint">Waiting for ${esc(opp)} to accept.</p><div class="game-actions"><button class="ghost quiet-btn" data-race-cancel="${esc(e.id)}">call it off</button></div>`
      : `<div class="game-actions"><button class="save" data-race-accept="${esc(e.id)}">accept ${e.bet ? `the ${e.bet} 🪙 bet` : "the race"} 🧩</button><button class="ghost quiet-btn" data-race-cancel="${esc(e.id)}">not now</button></div>`;
  } else if (meDone && oppDone) {
    const r = Goldies.races(allPages).find(x => x.id === e.id);
    const t = p => e.times[p].gaveUp ? "gave up" : fmtRace(e.times[p].ms);
    const line = !r ? "A tie! Nobody pays 🤝" : r.winner === NAME ? `You won${e.bet ? ` ${e.bet} 🪙` : ""} 🏆` : `${esc(opp)} won${e.bet ? ` ${e.bet} 🪙` : ""} 🏆`;
    body = `<div class="race-times">${PEOPLE.map(p => `<span class="${r?.winner === p ? "win" : ""}">${esc(p)} <b>${t(p)}</b></span>`).join("")}</div><p class="race-result">${line}</p>`;
  } else if (meDone) {
    body = `<p class="hint">You're done${e.times[NAME].gaveUp ? " (gave up)" : ` in ${fmtRace(e.times[NAME].ms)}`}. Waiting for ${esc(opp)}; times show once you've both finished.</p>`;
  } else {
    body = `${oppDone ? `<p class="hint">${esc(opp)} has finished. Your turn!</p>` : ""}<div class="game-actions"><button class="save" data-race-play="${esc(e.id)}">${e.times?.[NAME]?.start ? "carry on ▶" : "start the puzzle ▶"}</button></div>
      <p class="hint">The clock starts when you tap and keeps running even if you close the page.</p>`;
  }
  return `<div class="race-card${meDone && oppDone ? " done" : ""}">${head}${body}</div>`;
}

function renderRace() {
  if (!$("#race")) return;
  const list = raceList().sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const live = list.filter(e => !(raceDone(e, e.by) && raceDone(e, e.with)));
  const past = list.filter(e => raceDone(e, e.by) && raceDone(e, e.with));
  $("#raceOpen").innerHTML = live.map(raceCard).join("");
  $("#racePast").innerHTML = past.length ? `<details class="kw-past"><summary>past races (${past.length})</summary>${past.slice(0, 15).map(raceCard).join("")}</details>` : "";
  const start = $("#raceStart");
  if (!KEY || !NAME) start.innerHTML = `<p class="hint">Set this phone up in the diary to play.</p>`;
  else if (!racePhotos().length) start.innerHTML = `<p class="hint">Add a picture to the diary first, then race on it ♥</p>`;
  else if (!raceDraft) start.innerHTML = `<div class="game-actions"><button class="save" id="raceNew">challenge ${esc(partnerOf(NAME))} 🧩</button></div>`;
  else {
    const opp = partnerOf(NAME), mine = myPoints(allPages), theirs = Goldies.score(allPages, opp).points;
    start.innerHTML = `<div class="race-setup"><div class="label">pick a picture</div>
      <div class="race-pics">${racePhotos().map(p => `<button type="button" class="${p.media === raceDraft.photo ? "on" : ""}" data-race-pic="${esc(p.media)}"><img ${imgSrcAttrs(p.media)} alt=""></button>`).join("")}</div>
      <div class="label">play for</div><div class="choices">${Goldies.RULES.RACE_BETS.map(b => {
        const ok = !b || (mine >= b && theirs >= b);
        return `<button type="button" class="choice${raceDraft.bet === b ? " on" : ""}" data-race-bet="${b}" ${ok ? "" : "disabled title=\"not enough goldies on both sides\""}>${esc(betLabel(b))}</button>`;
      }).join("")}</div>
      <p class="hint">Winner takes the bet from the other. Nobody can bet goldies they don't have.</p>
      <div class="game-actions"><button class="save" id="raceSend" ${raceDraft.photo ? "" : "disabled"}>send the challenge 💌</button><button class="ghost quiet-btn" id="raceCancelDraft">cancel</button></div></div>`;
  }
  hydrateMedia($("#race"));
}

/* ---------- playing ---------- */
let racePlay = null; // { e, board, pick, moves, start, timer, el }
async function openRace(e) {
  const back = document.createElement("div");
  back.className = "sheet-back race-play";
  back.innerHTML = `<div class="sheet race-sheet"><div class="race-bar"><span class="race-clock">0:00.0</span><span class="race-moves">0 moves</span>
    <button type="button" class="ghost quiet-btn" data-race-giveup>give up</button><button type="button" class="icon-btn close" data-race-close aria-label="Close">✕</button></div>
    <div class="race-board loading">getting the picture…</div><p class="hint">Tap a piece, then tap where it goes. ✕ closes it, but the clock keeps running.</p></div>`;
  document.body.appendChild(back);
  let img;
  try { img = await loadImg(e.photo); } catch { back.remove(); return toast("Couldn't open the picture."); }
  // Square crop, drawn once; every piece is a window onto it.
  const c = document.createElement("canvas"), side = Math.min(img.naturalWidth, img.naturalHeight), S = 720;
  c.width = c.height = S;
  c.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, S, S);
  const url = c.toDataURL("image/jpeg", .88);
  // Starting the clock is saved, so closing the page doesn't reset it.
  let start = e.times?.[NAME]?.start;
  if (!start) {
    start = new Date().toISOString();
    const ok = await gameSave(list => list.map(x => x.id === e.id && !x.times?.[NAME] ? { ...x, times: { ...x.times, [NAME]: { start } } } : x), `${NAME} started a puzzle race`, renderRace);
    if (!ok) return back.remove();
    start = allPages.find(x => x.id === e.id)?.times?.[NAME]?.start || start;
  }
  const saved = JSON.parse(store.get("race-" + e.id) || "null");
  racePlay = { e, el: back, url, start: Date.parse(start), pick: null, board: saved?.board || raceScramble(e.id), moves: saved?.moves || 0 };
  drawBoard();
  racePlay.timer = setInterval(tick, 100);
  tick();
}
function tick() {
  if (!racePlay) return;
  $(".race-clock", racePlay.el).textContent = fmtRace(Date.now() - racePlay.start);
}
function drawBoard() {
  const { board, url, pick, moves, el } = racePlay, n = RACE_GRID;
  const b = $(".race-board", el);
  b.classList.remove("loading");
  b.style.setProperty("--n", n);
  b.innerHTML = board.map((piece, slot) => {
    const x = piece % n, y = Math.floor(piece / n), fixed = piece === slot;
    return `<button type="button" class="piece${fixed ? " fixed" : ""}${pick === slot ? " picked" : ""}" data-slot="${slot}"
      style="background-image:url(${url});background-size:${n * 100}% ${n * 100}%;background-position:${x / (n - 1) * 100}% ${y / (n - 1) * 100}%"></button>`;
  }).join("");
  $(".race-moves", el).textContent = `${moves} move${moves === 1 ? "" : "s"}`;
}
function closeRace() {
  if (!racePlay) return;
  clearInterval(racePlay.timer);
  racePlay.el.remove();
  racePlay = null;
}
async function finishRace(result) {
  const { e, start } = racePlay;
  clearInterval(racePlay.timer);
  const t = result === "gaveUp" ? { start: new Date(start).toISOString(), gaveUp: new Date().toISOString() }
    : { start: new Date(start).toISOString(), ms: Date.now() - start, moves: racePlay.moves };
  const ok = await gameSave(list => list.map(x => x.id === e.id && !raceDone(x, NAME) ? { ...x, times: { ...x.times, [NAME]: t } } : x),
    `${NAME} ${result === "gaveUp" ? "gave up on" : "finished"} a puzzle race`, renderRace);
  if (!ok) { racePlay.timer = setInterval(tick, 100); return; }
  store.set("race-" + e.id, "");
  const now = allPages.find(x => x.id === e.id), opp = raceOpp(e);
  const r = Goldies.races(allPages).find(x => x.id === e.id);
  let msg;
  if (!raceDone(now, opp)) {
    msg = result === "gaveUp" ? "Gave up. Let's see how they do." : `Solved in ${fmtRace(t.ms)}! Now we wait for ${opp}.`;
    notifyPartner(`🧩 ${NAME} finished the puzzle race`, "Your turn. Beat their time in the mini games");
  } else {
    msg = !r ? "A tie! Nobody pays 🤝" : r.winner === NAME ? `You won${e.bet ? ` ${e.bet} goldies` : ""} 🏆` : `${opp} was faster this time 💛`;
    notifyPartner(`🧩 The puzzle race is over`, !r ? "It's a tie!" : r.winner === NAME ? `${NAME} won${e.bet ? ` ${e.bet} goldies` : ""}` : "You won! 🏆");
  }
  const sheet = $(".race-sheet", racePlay.el);
  sheet.insertAdjacentHTML("beforeend", `<div class="race-win"><p>${esc(msg)}</p><button class="save" data-race-close>close</button></div>`);
  if (result !== "gaveUp") { const rr = sheet.getBoundingClientRect(); burst(rr.left + rr.width / 2, rr.top + rr.height / 2, 22); }
}

document.addEventListener("click", async ev => {
  const t = ev.target;
  if (t.closest("#raceNew")) { raceDraft = { photo: null, bet: 0 }; return renderRace(); }
  if (t.closest("#raceCancelDraft")) { raceDraft = null; return renderRace(); }
  const pic = t.closest("[data-race-pic]");
  if (pic) { raceDraft.photo = pic.dataset.racePic; return renderRace(); }
  const bet = t.closest("[data-race-bet]");
  if (bet && !bet.disabled) { raceDraft.bet = Number(bet.dataset.raceBet); return renderRace(); }

  if (t.closest("#raceSend")) {
    const opp = partnerOf(NAME), b = raceDraft.bet;
    if (b && (myPoints(allPages) < b || Goldies.score(allPages, opp).points < b)) return toast("Not enough goldies for that bet.");
    t.closest("button").disabled = true;
    const race = { id: gameId(), type: "race", by: NAME, with: opp, at: new Date().toISOString(), photo: raceDraft.photo, bet: b, times: {} };
    if (await gameSave(list => [race, ...list], `${NAME} challenged ${opp} to a puzzle race`, () => { raceDraft = null; renderRace(); })) {
      notifyPartner(`🧩 ${NAME} challenges you to a puzzle race`, b ? `${b} goldies on the line. Accept it in the mini games` : "Just for fun. Accept it in the mini games");
      toast(`Challenge sent to ${opp} 💌`);
    } else t.closest("button").disabled = false;
    return;
  }
  const acc = t.closest("[data-race-accept]");
  if (acc) {
    const e = allPages.find(x => x.id === acc.dataset.raceAccept);
    if (e.bet && myPoints(allPages) < e.bet) return toast(`You need ${e.bet} goldies to accept this one.`);
    acc.disabled = true;
    if (await gameSave(list => list.map(x => x.id === e.id && !x.accepted && !x.cancelled ? { ...x, accepted: new Date().toISOString() } : x), `${NAME} accepted a puzzle race`, renderRace)) {
      notifyPartner(`🧩 ${NAME} accepted your puzzle race`, "Game on. Solve it in the mini games");
      toast("Game on! Start whenever you're ready 🧩");
    }
    return;
  }
  const cancel = t.closest("[data-race-cancel]");
  if (cancel) {
    cancel.disabled = true;
    await gameSave(list => list.map(x => x.id === cancel.dataset.raceCancel && !x.accepted ? { ...x, cancelled: { by: NAME, at: new Date().toISOString() } } : x), `${NAME} called off a puzzle race`, renderRace);
    return;
  }
  const play = t.closest("[data-race-play]");
  if (play) return openRace(allPages.find(x => x.id === play.dataset.racePlay));

  if (!racePlay) return;
  if (t.closest("[data-race-close]")) return closeRace();
  if (t.closest("[data-race-giveup]")) {
    if (racePlay.el.querySelector(".race-win") || !confirm(`Give up? ${racePlay.e.bet ? `${raceOpp(racePlay.e)} wins the ${racePlay.e.bet} goldies` : `${raceOpp(racePlay.e)} wins`} if they finish.`)) return;
    return finishRace("gaveUp");
  }
  const piece = t.closest(".piece");
  if (piece && !piece.classList.contains("fixed") && !racePlay.el.querySelector(".race-win")) {
    const slot = Number(piece.dataset.slot), P = racePlay;
    if (P.pick === null) P.pick = slot;
    else if (P.pick === slot) P.pick = null;
    else {
      [P.board[P.pick], P.board[slot]] = [P.board[slot], P.board[P.pick]];
      P.pick = null; P.moves++;
      store.set("race-" + P.e.id, JSON.stringify({ board: P.board, moves: P.moves }));
    }
    drawBoard();
    if (P.board.every((v, i) => v === i)) finishRace("solved");
  }
});
