/* ==========================================================
   Who knows whom 🎯
   A question about one of you. The one it's about writes the real
   answer, the other one guesses, and then the one it's about judges
   the guess: 🎯 spot on / 👍 close / 🙈 way off.
   Each round is saved in entries.json as
     { type: "kwho", qid, about, by, at, answer, guess, verdict, dropped }
   and goldies.js turns judged rounds into points.
   Keep every id unique and never reuse an old one.
   ========================================================== */
// {p} = "Jovena's" / "your", {o} = the other one ("you" / "Vian").
const KW_TEXT = [
  "{p} go-to comfort food",
  "{p} dream holiday destination",
  "{p} biggest pet peeve",
  "{p} favourite way to spend a lazy Sunday",
  "{p} hidden talent",
  "{p} usual coffee or chai order",
  "{p} comfort movie, the one to watch a hundred times",
  "{p} biggest fear",
  "{p} favourite childhood memory",
  "{p} dream job if money didn't matter",
  "{p} guilty-pleasure snack",
  "{p} favourite season, and why",
  "{p} most-used emoji",
  "{p} love language",
  "{p} first impression of {o}",
  "{p} favourite thing about {o}",
  "{p} idea of a perfect date",
  "{p} most embarrassing moment (a shareable one)",
  "{p} celebrity crush",
  "{p} biggest dream for the next five years",
  "{p} favourite smell",
  "{p} worst habit",
  "{p} favourite dessert",
  "{p} go-to karaoke song",
  "{p} favourite colour",
  "{p} first thing after waking up",
  "{p} way of cheering up after a bad day",
  "{p} favourite show right now",
  "{p} spirit animal",
  "{p} favourite memory of the two of you",
  "{p} most treasured possession",
  "{p} weirdest secretly-loved food combo",
  "{p} favourite word to say",
  "{p} superpower of choice",
  "{p} favourite nickname for {o}",
  "{p} favourite festival",
  "{p} dream pet",
  "{p} most irrational fear",
  "{p} favourite thing to order in",
  "{p} go-to excuse for running late",
  "{p} favourite flower",
  "{p} most-played song of all time",
  "{p} dream car",
  "{p} verdict: morning person or night owl?",
  "{p} pick: mountains or beach?",
  "{p} pick: call or text?",
  "{p} pick: sweet or savoury?",
  "{p} one thing to save in a fire",
  "{p} favourite subject at school",
  "{p} least favourite subject at school",
  "{p} favourite cartoon growing up",
  "{p} most-used app",
  "{p} proudest achievement so far",
  "{p} favourite compliment ever received",
  "{p} ideal birthday",
  "{p} proudest quality",
  "{p} one wish for the two of you",
  "{p} biggest turn-off",
  "{p} signature dance move",
  "{p} happy place",
];
const KW_QUESTIONS = KW_TEXT.map((t, i) => ({ id: `kw-${i + 1}`, t }));
const KW_VERDICTS = {
  spot:  { emoji: "🎯", label: "spot on" },
  close: { emoji: "👍", label: "close" },
  off:   { emoji: "🙈", label: "way off" },
};

const kwRounds = () => allPages.filter(e => e.type === "kwho");
const kwOpen = () => kwRounds().filter(e => !e.dropped && !e.verdict);
const kwGuesser = e => partnerOf(e.about);
// The question as the person looking at it should read it.
function kwText(qid, about) {
  const q = KW_QUESTIONS.find(x => x.id === qid); if (!q) return "a question";
  const mine = about === NAME;
  const s = q.t.replace("{p}", mine ? "your" : `${about}'s`).replace("{o}", mine ? partnerOf(about) : "you");
  return s[0].toUpperCase() + s.slice(1);
}
// What a round needs from me next: "answer", "guess", "judge" or "".
function kwMyTurn(e) {
  if (!NAME || e.dropped || e.verdict) return "";
  if (e.about === NAME) return !e.answer ? "answer" : e.guess ? "judge" : "";
  return !e.guess ? "guess" : "";
}
const kwWaitingOnMe = () => kwOpen().filter(kwMyTurn);

/* ---------- score ---------- */
function renderKwScore() {
  const line = p => {
    const done = kwRounds().filter(e => e.verdict && !e.dropped && kwGuesser(e) === p);
    const n = v => done.filter(e => e.verdict.v === v).length;
    return `<div class="kw-side${p === NAME ? " me" : ""}"><span>${esc(p)} knows ${esc(partnerOf(p))}</span>
      <b>🎯 ${n("spot")} · 👍 ${n("close")} · 🙈 ${n("off")}</b></div>`;
  };
  $("#kwScore").innerHTML = PEOPLE.map(line).join("");
}

/* ---------- cards ---------- */
const kwBubble = (who, part, label) => part ? `<div class="kw-bubble"><small>${esc(label || who)}</small><p>${esc(part.text)}</p></div>` : "";
function kwCard(e) {
  const turn = kwMyTurn(e), guesser = kwGuesser(e);
  const head = `<small>${e.about === NAME ? "about you" : `about ${esc(e.about)}`}</small><p class="kw-q">${esc(kwText(e.qid, e.about))}</p>`;
  let body = "";
  if (e.verdict) {
    const v = KW_VERDICTS[e.verdict.v];
    body = `${kwBubble(e.about, e.answer, `${e.about}'s answer`)}${kwBubble(guesser, e.guess, `${guesser}'s guess`)}<p class="kw-verdict">${v.emoji} ${esc(v.label)}</p>`;
  } else if (turn === "judge") {
    body = `${kwBubble(NAME, e.answer, "your answer")}${kwBubble(guesser, e.guess, `${guesser}'s guess`)}
      <p class="hint">How close did ${esc(guesser)} get?</p>
      <div class="game-actions kw-judge">${Object.entries(KW_VERDICTS).map(([k, v]) => `<button class="ghost" data-kw-judge="${k}" data-id="${esc(e.id)}">${v.emoji} ${esc(v.label)}</button>`).join("")}</div>`;
  } else if (turn) {
    const ph = turn === "answer" ? "the real answer…" : `your best guess about ${e.about}…`;
    body = `<textarea class="field hand" rows="2" maxlength="300" placeholder="${esc(ph)}" data-kw-text="${esc(e.id)}"></textarea>
      <div class="game-actions"><button class="save" data-kw-send="${esc(e.id)}">${turn === "answer" ? "save my answer ✍️" : "lock in my guess 🎯"}</button>
      <button class="ghost quiet-btn" data-kw-drop="${esc(e.id)}">skip this one</button></div>`;
  } else {
    const wait = !e.answer || !e.guess
      ? `Waiting for ${esc(!e.answer ? e.about : guesser)} to ${!e.answer ? "answer" : "guess"}. You'll see both once it's in.`
      : `Waiting for ${esc(e.about)} to judge your guess.`;
    body = `<p class="hint">${wait}</p>`;
  }
  return `<div class="kw-card${e.verdict ? " done" : ""}">${head}${body}</div>`;
}

let kwDraft = null; // { about, qid } while starting a new round
function kwPick(about) {
  const used = new Set(kwRounds().filter(e => e.about === about).map(e => e.qid));
  const pool = KW_QUESTIONS.filter(q => !used.has(q.id) && q.id !== kwDraft?.qid);
  return pool.length ? pool[Math.random() * pool.length | 0].id : null;
}
function renderKwho() {
  if (!$("#kwho")) return;
  renderKwScore();
  const canWrite = KEY && NAME;
  const open = kwOpen().sort((a, b) => !!kwMyTurn(b) - !!kwMyTurn(a) || Date.parse(b.at) - Date.parse(a.at));
  $("#kwOpen").innerHTML = open.map(kwCard).join("");
  if (!canWrite) {
    $("#kwStart").innerHTML = `<p class="hint">Set this phone up in the diary to play.</p>`;
  } else if (kwDraft) {
    const mine = kwDraft.about === NAME;
    $("#kwStart").innerHTML = `<div class="kw-card new"><small>${mine ? "about you · you answer, then they guess" : `about ${esc(kwDraft.about)} · you guess, then they answer`}</small>
      <p class="kw-q">${esc(kwText(kwDraft.qid, kwDraft.about))}</p>
      <textarea class="field hand" rows="2" maxlength="300" id="kwNewText" placeholder="${mine ? "the real answer…" : `your best guess about ${esc(kwDraft.about)}…`}"></textarea>
      <div class="game-actions"><button class="save" id="kwNewSend">${mine ? "save & send it over 💌" : "lock in my guess 🎯"}</button>
      <button class="ghost" id="kwNewAgain">another question ↻</button><button class="ghost quiet-btn" id="kwNewCancel">cancel</button></div></div>`;
  } else {
    const btn = (about, label) => kwPick(about)
      ? `<button class="save" data-kw-new="${esc(about)}">${label}</button>`
      : `<span class="hint">every question about ${about === NAME ? "you" : esc(about)} is done 🎉</span>`;
    $("#kwStart").innerHTML = `${btn(partnerOf(NAME), `a question about ${esc(partnerOf(NAME))} 🎯`)}${btn(NAME, "a question about me 🙋")}`;
  }
  const done = kwRounds().filter(e => e.verdict && !e.dropped).sort((a, b) => Date.parse(b.verdict.at) - Date.parse(a.verdict.at));
  $("#kwDone").innerHTML = done.length
    ? `<details class="kw-past"><summary>past rounds (${done.length})</summary>${done.slice(0, 20).map(kwCard).join("")}</details>` : "";
}

/* ---------- saving ---------- */
async function kwSave(change, message, ok) {
  const saved = await gameSave(change, message, renderKwho);
  if (saved && ok) ok();
  return saved;
}
const kwPart = text => ({ text, by: NAME, at: new Date().toISOString() });
const kwDoneToast = before => { const d = Goldies.score(allPages, NAME).points - before; if (d > 0) setTimeout(() => toast(`+${d} goldies 🪙`), 600); };

document.addEventListener("click", async e => {
  const t = e.target;
  const startFor = t.closest("[data-kw-new]");
  if (startFor) { kwDraft = { about: startFor.dataset.kwNew, qid: null }; kwDraft.qid = kwPick(kwDraft.about); renderKwho(); return $("#kwNewText")?.focus(); }
  if (t.closest("#kwNewAgain")) { const q = kwPick(kwDraft.about); if (q) kwDraft.qid = q; else toast("That was the last one ♥"); return renderKwho(); }
  if (t.closest("#kwNewCancel")) { kwDraft = null; return renderKwho(); }

  if (t.closest("#kwNewSend")) {
    const text = $("#kwNewText").value.trim(); if (!text) return toast("Write something first ✍️");
    const b = t.closest("button"); b.disabled = true;
    const mine = kwDraft.about === NAME;
    const round = { id: gameId(), type: "kwho", qid: kwDraft.qid, about: kwDraft.about, by: NAME, at: new Date().toISOString(), [mine ? "answer" : "guess"]: kwPart(text) };
    const saved = await kwSave(list => [round, ...list], `${NAME} started a who-knows-whom round`, () => {
      notifyPartner(`🎯 ${NAME} wants to know who knows whom`, mine ? `Guess ${NAME}'s answer in the mini games` : `${NAME} guessed something about you. Answer it in the mini games`);
      toast(mine ? `Sent. Now ${partnerOf(NAME)} guesses 🎯` : `Locked in. Now ${partnerOf(NAME)} answers 🔒`);
    });
    if (saved) { kwDraft = null; renderKwho(); } else b.disabled = false;
    return;
  }

  const send = t.closest("[data-kw-send]");
  if (send) {
    const id = send.dataset.kwSend, box = $(`[data-kw-text="${CSS.escape(id)}"]`);
    const text = box.value.trim(); if (!text) return toast("Write something first ✍️");
    const round = allPages.find(x => x.id === id), part = kwMyTurn(round); // "answer" or "guess"
    send.disabled = true;
    await kwSave(list => list.map(x => x.id === id && !x[part] && !x.dropped ? { ...x, [part]: kwPart(text) } : x),
      `${NAME} ${part === "answer" ? "answered" : "guessed"} in who knows whom`, () => {
        const now = allPages.find(x => x.id === id);
        if (now?.[part]?.by !== NAME) return toast("Someone got there first. Have a look ↓");
        notifyPartner(`🎯 ${NAME} ${part === "answer" ? "answered" : "guessed"}`, part === "answer" ? "Judge your guess in the mini games" : "Judge the guess in the mini games");
        toast(part === "answer" ? `Saved. Now judge ${partnerOf(NAME)}'s guess ↓` : `Locked in. ${partnerOf(NAME)} judges it now 🤞`);
      });
    send.disabled = false;
    return;
  }

  const judge = t.closest("[data-kw-judge]");
  if (judge) {
    const id = judge.dataset.id, v = judge.dataset.kwJudge;
    const before = Goldies.score(allPages, NAME).points;
    $$(`[data-id="${CSS.escape(id)}"]`).forEach(b => b.disabled = true);
    const r = judge.getBoundingClientRect();
    await kwSave(list => list.map(x => x.id === id && !x.verdict && !x.dropped ? { ...x, verdict: { v, by: NAME, at: new Date().toISOString() } } : x),
      `${NAME} judged a who-knows-whom guess`, () => {
        if (v !== "off") burst(r.left + r.width / 2, r.top + r.height / 2, v === "spot" ? 18 : 10);
        notifyPartner(`🎯 ${KW_VERDICTS[v].emoji} ${KW_VERDICTS[v].label}!`, `${NAME} judged your guess. See it in the mini games`);
        kwDoneToast(before);
      });
    return;
  }

  const drop = t.closest("[data-kw-drop]");
  if (drop) {
    if (!confirm("Skip this question? It won't come back.")) return;
    const id = drop.dataset.kwDrop;
    drop.disabled = true;
    await kwSave(list => list.map(x => x.id === id && !x.verdict ? { ...x, dropped: { by: NAME, at: new Date().toISOString() } } : x),
      `${NAME} skipped a who-knows-whom question`);
  }
});
