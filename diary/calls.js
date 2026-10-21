/* 📞 Calls widget: FaceTime (video or audio) straight from the diary, and the
   time you spend on calls, saved automatically. Apple doesn't let websites read
   call history, so a call is timed from tapping the button here until you come
   back to the diary. Calls under 30 seconds (didn't connect) aren't saved.
   The numbers live encrypted in the vault (PHONES); a number typed in ⚙ settings
   on a phone takes over on that phone only. */
const CALL_MIN_SECONDS = 30;
const CALL_FORGET_HOURS = 5;        // came back much later? then we can't know how long it was
const isCall = e => e.type === "call";

function fmtCallTime(secs) {
  const m = Math.round((secs || 0) / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

function renderCallWidget() {
  const el = $("#callWidget"); if (!el) return;
  if (!NAME) { el.hidden = true; return; }
  const calls = entries.filter(isCall);
  const week = calls.filter(c => Date.now() - Date.parse(c.at) < 7 * 864e5).reduce((s, c) => s + (c.duration || 0), 0);
  const all = calls.reduce((s, c) => s + (c.duration || 0), 0);
  const icon = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const VIDEO = "M3.5 7.5A1.5 1.5 0 0 1 5 6h8.5A1.5 1.5 0 0 1 15 7.5v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5zM15 10.5l5.5-3v9l-5.5-3";
  const PHONE = "M6.6 3.5h2.6l1.4 3.8-1.9 1.2a11 11 0 0 0 6.8 6.8l1.2-1.9 3.8 1.4v2.6a1.6 1.6 0 0 1-1.7 1.6A16.5 16.5 0 0 1 5 5.2a1.6 1.6 0 0 1 1.6-1.7z";
  el.innerHTML = `<button type="button" class="cw-stats" data-calls><span class="cw-num">${fmtCallTime(week)}</span><span class="cw-lbl">on calls this week · ${fmtCallTime(all)} in all</span></button>
    <div class="cw-btns"><button type="button" class="cw-btn" data-call="video" aria-label="FaceTime ${esc(partnerOf(NAME))}" title="FaceTime ${esc(partnerOf(NAME))}">${icon(VIDEO)}</button><button type="button" class="cw-btn" data-call="audio" aria-label="FaceTime audio" title="FaceTime audio">${icon(PHONE)}</button></div>`;
  el.hidden = false;
}

function startCall(kind) {
  const to = (store.get("facetime-to") || PHONES[partnerOf(NAME)] || "").replace(/\s+/g, "");
  if (!to) return openSettings(`Add ${partnerOf(NAME)}'s FaceTime number or Apple ID email first, then tap Save ♥`);
  if (!canWrite()) return;
  store.set("call-pending", JSON.stringify({ kind, start: Date.now() }));
  location.href = `${kind === "audio" ? "facetime-audio" : "facetime"}://${to}`;
}

// Runs whenever you come back to the diary; saves the call without asking.
let savingCall = false;
async function finishCall() {
  const raw = store.get("call-pending");
  if (!raw || savingCall || document.visibilityState !== "visible") return;
  let p; try { p = JSON.parse(raw); } catch { return store.set("call-pending", ""); }
  const secs = Math.round((Date.now() - p.start) / 1000);
  if (!p.away && secs < 120) return; // FaceTime hasn't opened yet (still on its "Call?" prompt)
  store.set("call-pending", "");
  if (secs < CALL_MIN_SECONDS || secs > CALL_FORGET_HOURS * 3600) return; // cancelled / didn't connect, or forgotten
  savingCall = true;
  try {
    const call = { id: newId(), type: "call", kind: p.kind, by: NAME, with: partnerOf(NAME), author: NAME, at: new Date(p.start).toISOString(), duration: secs };
    const before = myPoints(entries);
    entries = await updateIndex(list => [call, ...list], `A ${fmtCallTime(secs)} ${p.kind === "audio" ? "call" : "FaceTime"}`);
    toast(`📞 ${fmtCallTime(secs)} together, saved`);
    pointsToast(before, entries);
    render();
  } catch (err) {
    store.set("call-pending", raw); // try again next time
    toast("Couldn't save the call time yet: " + err.message);
  } finally { savingCall = false; }
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
    <p class="help">Calls started from the diary are timed automatically, from tapping the button until you come back here. Every 15 minutes together is +5 goldies for both of you.</p>
    <ul class="history">${calls.slice(0, 25).map(c => `<li><b>${fmtCallTime(c.duration)}</b> ${c.kind === "audio" ? "📞" : "🎥"} ${esc(c.by)} called <small>${when(c.at)}</small></li>`).join("") || "<li>no calls yet, so tap 🎥 to start one ♥</li>"}</ul></div>`;
  back.addEventListener("click", e => { if (e.target === back || e.target.closest("[data-close]")) back.remove(); });
  document.body.appendChild(back);
}

$("#callWidget").addEventListener("click", e => {
  const b = e.target.closest("[data-call]");
  if (b) return startCall(b.dataset.call);
  if (e.target.closest("[data-calls]")) openCallList();
});
