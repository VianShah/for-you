/* Mini games: built from questions.js and the pages already in the diary. */
let entries = [];
let allPages = []; // every page, for goldie points (archived ones still count)
const answerLink = q => `./?q=${encodeURIComponent(q.id)}`;
const catTag = cat => { const c = CATEGORIES[cat]; return c ? `${c.emoji} ${esc(c.label)}` : ""; };
const bothAnswered = qid => PEOPLE.every(p => answeredBy(entries, p, qid));

/* ---------- today's question ---------- */
function renderToday() {
  const q = todaysQuestion(new Date(), allPages);
  $("#todayCard").innerHTML = `<small>${catTag(q.cat)}</small><p>${esc(q.q)}</p>`;
  $("#todayWho").innerHTML = PEOPLE.map(p =>
    `<span class="${answeredBy(entries, p, q.id) ? "done" : ""}">${answeredBy(entries, p, q.id) ? "✓" : "…"} ${esc(p)}</span>`).join("");
  const mine = NAME && answeredBy(entries, NAME, q.id);
  const other = NAME && partnerOf(NAME);
  $("#todayActions").innerHTML = mine
    ? (bothAnswered(q.id)
        ? `<a class="save" href="./">read both answers in the diary →</a>`
        : `<p class="hint">You've answered ✓ Waiting for ${esc(other)}. Their answer will show up in the diary.</p>`)
    : `<a class="save" href="${answerLink(q)}">answer it ✍️</a><button class="ghost" data-talk>ask out loud instead 💬</button>`;
  // Not feeling it? Retire it for both of you; tomorrow's lineup stays the same.
  if (!mine && KEY && NAME) $("#todayActions").insertAdjacentHTML("beforeend", `<button class="ghost quiet-btn" data-retire="${esc(q.id)}" data-where="today">🚫 not for us</button>`);
}

/* ---------- "not for us": retires a question for both of you ---------- */
async function retireQuestion(qid) {
  if (!confirm("Retire this question for both of you? A new one takes its place.")) return false;
  try {
    const skip = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type: "skip", qid, by: NAME, at: new Date().toISOString() };
    allPages = await updateIndex(list => [skip, ...list], `${NAME} retired a question`);
    entries = allPages.filter(e => !e.status && ["note", "photo", "voice"].includes(e.type));
    toast("Gone. Here's another one ✨");
    return true;
  } catch (err) { toast(err.message); return false; }
}
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-retire]"); if (!b) return;
  b.disabled = true;
  const done = await retireQuestion(b.dataset.retire);
  b.disabled = false;
  if (!done) return;
  if (b.dataset.where === "today") renderToday(); else $("#jar").click();
  renderProgress();
});

/* ---------- question jar ---------- */
let cat = "any";
let current = null;
$("#cats").innerHTML = `<button class="chip on" data-c="any">✨ anything</button>` +
  Object.entries(CATEGORIES).map(([id, c]) => `<button class="chip" data-c="${id}">${c.emoji} ${esc(c.label)}</button>`).join("");
$("#cats").addEventListener("click", e => {
  const b = e.target.closest(".chip"); if (!b) return;
  cat = b.dataset.c;
  $$("#cats .chip").forEach(x => x.classList.toggle("on", x === b));
});

function pullQuestion() {
  const seen = store.get("jar-seen").split(",").filter(Boolean);
  let pool = liveQuestions(allPages).filter(q => cat === "any" || q.cat === cat); // "anything" mixes every topic
  // Prefer questions this phone hasn't answered and hasn't pulled lately.
  const fresh = pool.filter(q => !(NAME && answeredBy(entries, NAME, q.id)) && !seen.includes(q.id));
  if (fresh.length) pool = fresh;
  const q = pool[Math.random() * pool.length | 0];
  store.set("jar-seen", [q.id, ...seen].slice(0, 30).join(","));
  return q;
}
$("#jar").addEventListener("click", () => {
  const jar = $("#jar");
  jar.classList.remove("shake"); void jar.offsetWidth; jar.classList.add("shake");
  current = pullQuestion();
  const card = $("#jarCard");
  card.hidden = false;
  card.classList.remove("flip"); void card.offsetWidth; card.classList.add("flip");
  card.innerHTML = `<small>${catTag(current.cat)}</small><p>${esc(current.q)}</p>`;
  const who = PEOPLE.filter(p => answeredBy(entries, p, current.id));
  $("#jarActions").hidden = false;
  $("#jarActions").innerHTML =
    `${who.length ? `<p class="hint">Already answered by ${who.map(esc).join(" & ")}</p>` : ""}
     <a class="save" href="${answerLink(current)}">answer in the diary ✍️</a>
     <button class="ghost" data-talk>ask out loud 💬</button>
     <button class="ghost" id="againBtn">another one ↻</button>
     ${KEY && NAME ? `<button class="ghost quiet-btn" data-retire="${esc(current.id)}" data-where="jar">🚫 not for us</button>` : ""}`;
  const r = card.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + 20, 10);
});
document.addEventListener("click", e => {
  if (e.target.closest("#againBtn")) $("#jar").click();
  if (e.target.closest("[data-talk]")) toast("Phones down, ask each other ♥ Write it in the diary later if it was a good one.");
});

/* ---------- memory lane (quiz from the diary) ---------- */
const dayLabel = d => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const snippet = (s, n = 150) => (s.length > n ? s.slice(0, n).trim() + "…" : s);
const soloAuthor = e => !e.together && PEOPLE.includes(e.author);

function buildQuiz() {
  const notes = entries.filter(e => e.type === "note" && e.text);
  const photos = entries.filter(e => e.type === "photo" && e.media);
  const days = [...new Set(entries.map(e => dayLabel(e.at)))];
  const pool = [];

  for (const e of entries) {
    // Who wrote this?
    if (soloAuthor(e) && (e.text || e.title)) {
      pool.push({ id: e.id + "w", ask: "Who wrote this?", show: `<blockquote>${esc(snippet(e.text || e.title))}</blockquote>`,
        options: PEOPLE, answer: e.author });
    }
    // Finish the line
    const words = (e.type === "note" && e.text || "").split(/\s+/);
    if (words.length >= 6) {
      const tail = w => w.slice(-3).join(" ");
      const others = shuffle(notes.filter(n => n.id !== e.id).map(n => n.text.split(/\s+/)).filter(w => w.length >= 3).map(tail))
        .filter(t => t !== tail(words));
      const uniq = [...new Set(others)].slice(0, 2);
      if (uniq.length === 2) pool.push({ id: e.id + "f", ask: "Finish the line",
        show: `<blockquote>${esc(words.slice(-12, -3).join(" "))} <span class="blank">______</span></blockquote>`,
        options: shuffle([tail(words), ...uniq]), answer: tail(words) });
    }
    // Which day was this?
    if (days.length >= 3) {
      const right = dayLabel(e.at);
      const show = e.type === "photo" ? `<img class="quiz-img" ${imgSrcAttrs(e.media)} alt="">`
        : `<blockquote>${esc(snippet(e.text || e.title || e.caption || "a voice note", 110))}</blockquote>`;
      pool.push({ id: e.id + "d", ask: "When was this added?", show,
        options: shuffle([right, ...shuffle(days.filter(d => d !== right)).slice(0, 2)]), answer: right });
    }
    // Which picture goes with this caption?
    if (e.type === "photo" && e.caption && photos.length >= 3) {
      const opts = shuffle([e, ...shuffle(photos.filter(p => p.id !== e.id)).slice(0, 2)]);
      pool.push({ id: e.id + "p", ask: "Which picture is this caption from?", show: `<blockquote>${esc(e.caption)}</blockquote>`,
        options: opts.map(p => p.id), answer: e.id, pics: true });
    }
  }
  // One question per page at most, five per round.
  const used = new Set();
  return shuffle(pool).filter(q => { const k = q.id.slice(0, -1); if (used.has(k)) return false; used.add(k); return true; }).slice(0, 5);
}

let quiz = [], qi = 0, score = 0;
function renderMemoryIntro() {
  const best = store.get("memory-best");
  const ready = buildQuiz().length >= 3;
  $("#memory").innerHTML = ready
    ? `<div class="memory-intro"><p>5 quick questions from your own pages.${best ? ` Best so far: <b>${esc(best)}/5</b>` : ""}</p><button class="save" id="startQuiz">start a round ▶</button></div>`
    : `<p class="hint">Memory lane opens once the diary has a few more pages. Write about 4–5 and come back ♥</p>`;
}
function renderQuizStep() {
  const q = quiz[qi];
  const opts = q.options.map(o => {
    if (q.pics) { const p = entries.find(x => x.id === o); return `<button class="opt pic" data-o="${esc(o)}"><img ${imgSrcAttrs(p.media)} alt=""></button>`; }
    return `<button class="opt" data-o="${esc(o)}">${esc(o)}</button>`;
  }).join("");
  $("#memory").innerHTML = `<div class="quiz">
    <div class="quiz-top"><span>question ${qi + 1} of ${quiz.length}</span><span>score ${score}</span></div>
    <h3>${esc(q.ask)}</h3>${q.show}<div class="opts${q.pics ? " pics" : ""}">${opts}</div></div>`;
  hydrateMedia($("#memory"));
}
document.addEventListener("click", e => {
  if (e.target.closest("#startQuiz")) { quiz = buildQuiz(); qi = 0; score = 0; return renderQuizStep(); }
  const opt = e.target.closest(".opt");
  if (opt && !opt.closest(".answered")) {
    const q = quiz[qi], right = opt.dataset.o === q.answer;
    opt.closest(".opts").classList.add("answered");
    $$(".opt", opt.parentElement).forEach(b => b.classList.toggle("right", b.dataset.o === q.answer));
    if (!right) opt.classList.add("wrong");
    if (right) { score++; const r = opt.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, 12); }
    setTimeout(() => {
      qi++;
      if (qi < quiz.length) return renderQuizStep();
      const best = Math.max(score, Number(store.get("memory-best")) || 0);
      store.set("memory-best", String(best));
      const line = score === quiz.length ? "Perfect. You really were paying attention ♥" : score >= quiz.length - 2 ? "So close. You know us well." : "Time to reread the diary together 😄";
      $("#memory").innerHTML = `<div class="memory-intro"><div class="big-score">${score}/${quiz.length}</div><p>${line}</p>
        <button class="save" id="startQuiz">play again ↻</button> <a class="ghost" href="./">write about a memory →</a></div>`;
    }, right ? 900 : 1500);
  }
});

/* ---------- Goldiee: only for something to do, and she takes you there ---------- */
function goldieeNudge() {
  const g = window.goldiee; if (!g) return;
  if (!KEY || !NAME) return g.say("this phone isn't set up to write yet 🔑", "./", "set it up →");
  if (goldieeCry(allPages, "./")) return;
  const waiting = entries.find(e => e.prompt && !e.together && e.author !== NAME && !answeredBy(entries, NAME, e.prompt.id));
  if (waiting) return g.say(`${waiting.author} answered a question. Answer it too to see theirs 💭`, answerLink(waiting.prompt), "answer it →");
  const seen = Number(store.get("diary-seen-" + NAME)) || 0;
  const fresh = entries.filter(e => new Date(e.at).getTime() > seen && (e.by || e.author) !== NAME).length;
  if (fresh) return g.say(`${fresh} new ${fresh === 1 ? "page" : "pages"} from ${partnerOf(NAME)} in the diary 💌`, "./", "show me →");
  const tq = todaysQuestion(new Date(), allPages);
  if (!answeredBy(entries, NAME, tq.id)) return g.say("today's question is waiting for you ☀️", answerLink(tq), "answer it →");
}

/* ---------- progress ---------- */
function renderProgress() {
  $("#progress").innerHTML = Object.entries(CATEGORIES).map(([id, c]) => {
    const qs = liveQuestions(allPages).filter(q => q.cat === id); // retired ones don't count
    const n = qs.filter(q => bothAnswered(q.id)).length;
    return `<div class="prog"><span>${c.emoji} ${esc(c.label)}</span><div class="prog-bar"><i style="width:${n / qs.length * 100}%"></i></div><b>${n}/${qs.length}</b></div>`;
  }).join("");
}

(async () => {
  // Same lock as the diary: nothing loads until the secret word is typed on this device.
  if (await initVault() === "locked") {
    await applyVaultKey(await Vault.lockScreen(VAULT, { title: "Mini games", hint: "Type our secret word to play." }));
  }
  try { allPages = (await loadIndex()).entries; } catch {}
  entries = allPages.filter(e => !e.status && ["note", "photo", "voice"].includes(e.type)); // archived & binned pages (and calls) stay out of the games
  renderGoldieBar(allPages);
  setInterval(() => renderGoldieBar(allPages), 60000);
  renderToday();
  setTimeout(goldieeNudge, 1500);
  renderMemoryIntro();
  renderProgress();
})();
