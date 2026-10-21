/* 📞 Calls widget: FaceTime (video or audio) straight from the diary, and the
   time you spend on calls, saved automatically. Apple doesn't let websites read
   call history, so a call is timed from tapping the button here until you come
   back to the diary and say you've hung up (it asks, since coming back mid-call is
   normal). Calls under 30 seconds (didn't connect) aren't saved.
   The numbers live encrypted in the vault (PHONES); a number typed in ⚙ settings
   on a phone takes over on that phone only. */
const CALL_MIN_SECONDS = 30;
const CALL_FORGET_HOURS = 8;        // came back much later? then we can't know how long it was
const isCall = e => e.type === "call";
let savingCall = false;

function fmtCallTime(secs) {
  const m = Math.round((secs || 0) / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

// Midnight today and Monday 00:00 this week, on this phone's clock.
function dayStart(t = Date.now()) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
function weekStart(t = Date.now()) { const d = new Date(dayStart(t)); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.getTime(); }
const fmtClock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const pendingCall = () => { try { return JSON.parse(store.get("call-pending") || "null"); } catch { return null; } };

function renderCallWidget() {
  const el = $("#callWidget"); if (!el) return;
  if (!NAME) { el.hidden = true; return; }
  const calls = entries.filter(isCall);
  const since = t => calls.filter(c => Date.parse(c.at) >= t).reduce((s, c) => s + (c.duration || 0), 0);
  const icon = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const VIDEO = "M3.5 7.5A1.5 1.5 0 0 1 5 6h8.5A1.5 1.5 0 0 1 15 7.5v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5zM15 10.5l5.5-3v9l-5.5-3";
  const BELL = "M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0";
  const PHONE = "M6.6 3.5h2.6l1.4 3.8-1.9 1.2a11 11 0 0 0 6.8 6.8l1.2-1.9 3.8 1.4v2.6a1.6 1.6 0 0 1-1.6 1.6A16.5 16.5 0 0 1 5 5.2a1.6 1.6 0 0 1 1.6-1.7z";
  const live = pendingCall();
  // On a call right now: a live clock and a button to say you've hung up.
  const stats = live
    ? `<button type="button" class="cw-stats live" data-call-end><span class="cw-num cw-live" data-call-since="${live.start}">${fmtClock(Date.now() - live.start)}</span><span class="cw-lbl">on a call with ${esc(partnerOf(NAME))} · tap when you hang up ✓</span></button>`
    : `<button type="button" class="cw-stats" data-calls><span class="cw-num">${fmtCallTime(since(dayStart()))}</span><span class="cw-lbl">on calls today · ${fmtCallTime(since(weekStart()))} this week</span></button>`;
  el.innerHTML = `${stats}
    <div class="cw-btns"><button type="button" class="cw-btn" data-call="video" aria-label="FaceTime ${esc(partnerOf(NAME))}" title="FaceTime ${esc(partnerOf(NAME))}">${icon(VIDEO)}</button><button type="button" class="cw-btn" data-call="audio" aria-label="FaceTime audio" title="FaceTime audio">${icon(PHONE)}</button><button type="button" class="cw-btn" data-ping aria-label="Ping ${esc(partnerOf(NAME))} to come and check" title="Ping ${esc(partnerOf(NAME))} to come and check">${icon(BELL)}</button></div>`;
  el.hidden = false;
}
setInterval(() => { const n = $("[data-call-since]"); if (n) n.textContent = fmtClock(Date.now() - Number(n.dataset.callSince)); }, 1000);

function startCall(kind) {
  const to = (store.get("facetime-to") || PHONES[partnerOf(NAME)] || "").replace(/\s+/g, "");
  if (!to) return openSettings(`Add ${partnerOf(NAME)}'s FaceTime number or Apple ID email first, then tap Save ♥`);
  if (!canWrite()) return;
  if (pendingCall()) return askAboutCall(); // finish the one that's running first
  store.set("call-pending", JSON.stringify({ kind, start: Date.now() }));
  renderCallWidget();
  location.href = `${kind === "audio" ? "facetime-audio" : "facetime"}://${to}`;
}

// Websites can't see when FaceTime hangs up, so coming back to the diary asks instead of
// guessing: opening the diary in the middle of a call no longer cuts its time short.
function askAboutCall() {
  const p = pendingCall(); if (!p || $(".call-ask")) return;
  const back = document.createElement("div");
  back.className = "sheet-back call-ask";
  back.innerHTML = `<div class="sheet small"><div class="sheet-head"><h2>Still talking?</h2></div>
    <p class="help">Your ${p.kind === "audio" ? "call" : "FaceTime"} with ${esc(partnerOf(NAME))} has been going for <b data-call-since="${p.start}">${fmtClock(Date.now() - p.start)}</b>.</p>
    <div class="game-actions"><button class="save" data-call-done>we've hung up ✓</button><button class="ghost" data-call-still>still talking 💬</button></div>
    <p class="help"><button type="button" class="link-btn" data-call-none>it didn't connect</button></p></div>`;
  back.addEventListener("click", ev => {
    if (ev.target.closest("[data-call-done]")) { back.remove(); saveCall(Date.now()); }
    if (ev.target.closest("[data-call-still]")) { back.remove(); renderCallWidget(); }
    if (ev.target.closest("[data-call-none]")) { back.remove(); store.set("call-pending", ""); renderCallWidget(); toast("Okay, not saved."); }
  });
  document.body.appendChild(back);
}

// Runs whenever you come back to the diary.
function finishCall() {
  const p = pendingCall();
  if (!p || savingCall || document.visibilityState !== "visible") return;
  const secs = (Date.now() - p.start) / 1000;
  if (!p.away && secs < 120) return; // FaceTime hasn't opened yet (still on its "Call?" prompt)
  if (secs > CALL_FORGET_HOURS * 3600) { store.set("call-pending", ""); renderCallWidget(); return toast("That call was too long ago to time, so it wasn't saved."); }
  renderCallWidget();
  askAboutCall();
}

async function saveCall(end) {
  const p = pendingCall(); if (!p || savingCall) return;
  const secs = Math.round((end - p.start) / 1000);
  store.set("call-pending", "");
  if (secs < CALL_MIN_SECONDS) { renderCallWidget(); return toast("Under 30 seconds, so it wasn't saved."); }
  savingCall = true;
  try {
    const call = { id: newId(), type: "call", kind: p.kind, by: NAME, with: partnerOf(NAME), author: NAME, at: new Date(p.start).toISOString(), duration: secs };
    const before = myPoints(entries);
    entries = await updateIndex(list => [call, ...list], `A ${fmtCallTime(secs)} ${p.kind === "audio" ? "call" : "FaceTime"}`);
    toast(`📞 ${fmtCallTime(secs)} together, saved`);
    pointsToast(before, entries);
    render();
  } catch (err) {
    store.set("call-pending", JSON.stringify(p)); // try again
    toast("Couldn't save the call time yet: " + err.message);
  } finally { savingCall = false; renderCallWidget(); }
}
// Leaving the page (FaceTime's prompt or the call itself) marks the call as started.
function markAway() {
  const raw = store.get("call-pending"); if (!raw) return;
  try { const p = JSON.parse(raw); if (!p.away) store.set("call-pending", JSON.stringify({ ...p, away: true })); } catch {}
}
addEventListener("blur", markAway);
addEventListener("pagehide", markAway);
addEventListener("visibilitychange", () => document.visibilityState === "hidden" && markAway());
addEventListener("visibilitychange", finishCall);
addEventListener("focus", finishCall);
addEventListener("pageshow", finishCall);

function openCallList() {
  const calls = entries.filter(isCall).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const when = at => new Date(at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
  const back = document.createElement("div");
  back.className = "sheet-back";
  back.innerHTML = `<div class="sheet small goldie-rules"><div class="sheet-head"><h2>Our calls</h2><button type="button" class="icon-btn close" data-close>✕</button></div>
    <p class="help">Calls started from the diary are timed from tapping the button until you tell the diary you've hung up. Calls made straight from the FaceTime app aren't counted. Every 15 minutes together is +5 goldies for both of you.</p>
    <ul class="history">${calls.slice(0, 25).map(c => `<li><b>${fmtCallTime(c.duration)}</b> ${c.kind === "audio" ? "📞" : "🎥"} ${esc(c.by)} called <small>${when(c.at)}</small></li>`).join("") || "<li>no calls yet, so tap 🎥 to start one ♥</li>"}</ul></div>`;
  back.addEventListener("click", e => { if (e.target === back || e.target.closest("[data-close]")) back.remove(); });
  document.body.appendChild(back);
}

$("#callWidget").addEventListener("click", e => {
  const b = e.target.closest("[data-call]");
  if (b) return startCall(b.dataset.call);
  if (e.target.closest("[data-call-end]")) return askAboutCall();
  if (e.target.closest("[data-calls]")) openCallList();
});
