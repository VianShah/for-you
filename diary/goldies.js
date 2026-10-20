/* ==========================================================
   Goldie points 🪙, worked out from the diary itself, so both phones
   (and the reminder robot) always agree. Nothing is stored except the pages.
     earn:  note / text reply +5, voice +5, over 200 characters +10,
            picture +15  (pages written "together" count for both)
     lose:  −5 for every 3.5 hours without posting or replying
     sleep: 1 am – 8:30 am (India time) nothing counts: nothing lost,
            nothing earned, no crying pings
     spend: 100 to pin one of your pictures to the love page
   Works in the browser (window.Goldies) and in Node (globalThis.Goldies).
   ========================================================== */
(() => {
  const RULES = {
    START: "2026-10-20T22:00:00+05:30", // points count from here, so nobody starts in the negative
    TZ_OFFSET_MIN: 330,                 // India time (UTC+5:30, no daylight saving)
    SLEEP_FROM: 60, SLEEP_TO: 510,      // sleep time 1:00 am – 8:30 am (minutes after midnight): nothing counts
    GAP_MIN: 210, PENALTY: 5,           // −5 for every 3.5 awake hours without a post or reply
    TEXT: 5, VOICE: 5, LONG: 10, LONG_CHARS: 200, PHOTO: 15,
    CALL: 5, CALL_BLOCK_MIN: 15,        // +5 for every 15 minutes on a call together
    PIN_COST: 100,
    WELCOME: 50,                        // a starting gift, so one quiet morning doesn't make Goldiee cry
    CRY_BELOW: 0,                       // Goldiee cries when a score drops below this
  };
  const START = Date.parse(RULES.START);
  const MIN = 60000, DAY = 1440;

  // How many awake minutes (outside sleep time) lie between two moments (both in ms).
  function awakeMinutes(a, b) {
    if (b <= a) return 0;
    const off = RULES.TZ_OFFSET_MIN;
    let t = Math.floor(a / MIN) + off, end = Math.floor(b / MIN) + off; // local minutes
    let total = end - t;
    while (t < end) { // take out every sleep window that overlaps
      const dayStart = t - (((t % DAY) + DAY) % DAY);
      const lo = Math.max(t, dayStart + RULES.SLEEP_FROM), hi = Math.min(end, dayStart + RULES.SLEEP_TO);
      if (hi > lo) total -= hi - lo;
      t = dayStart + DAY;
    }
    return total;
  }
  const isAwake = ms => { const m = ((Math.floor(ms / MIN) + RULES.TZ_OFFSET_MIN) % DAY + DAY) % DAY; return !(m >= RULES.SLEEP_FROM && m < RULES.SLEEP_TO); };
  const localDay = ms => Math.floor((ms / MIN + RULES.TZ_OFFSET_MIN) / DAY);

  function textPoints(text) { return (text || "").trim().length > RULES.LONG_CHARS ? RULES.LONG : RULES.TEXT; }
  const credits = (e, name) => e.together ? true : (e.by || e.author) === name;
  const PAGE_TYPES = ["note", "photo", "voice"];

  // Every moment that earned someone points, oldest first.
  function events(entries, name) {
    const out = [{ at: START, pts: RULES.WELCOME, why: "a welcome gift from Goldiee", gift: true }];
    for (const e of entries || []) {
      const at = Date.parse(e.at);
      // A call counts for both of you; any call (even a short one) resets the 2.5-hour clock.
      if (e.type === "call") {
        if (at >= START && (e.by === name || e.with === name)) {
          const mins = Math.round((e.duration || 0) / 60);
          out.push({ at: at + (e.duration || 0) * 1000, pts: Math.floor(mins / RULES.CALL_BLOCK_MIN) * RULES.CALL, why: `a ${mins} min ${e.kind === "audio" ? "call" : "FaceTime"}` });
        }
        continue;
      }
      if (!PAGE_TYPES.includes(e.type)) continue;
      if (at >= START && credits(e, name)) {
        const pts = e.type === "photo" ? RULES.PHOTO : e.type === "voice" ? RULES.VOICE : textPoints(e.text);
        const why = e.type === "photo" ? "a picture" : e.type === "voice" ? "a voice note" : pts === RULES.LONG ? "opening your heart" : e.prompt ? "an answer" : "a note";
        out.push({ at, pts, why });
      }
      for (const r of e.replies || []) {
        const rat = Date.parse(r.at);
        if (rat < START || r.by !== name) continue;
        const pts = r.kind === "photo" ? RULES.PHOTO : r.kind === "voice" ? RULES.VOICE : textPoints(r.text);
        out.push({ at: rat, pts, why: r.kind === "photo" ? "a picture reply" : r.kind === "voice" ? "a voice reply" : "a reply" });
      }
    }
    // Sleep time doesn't count: things posted then still reset the clock, but earn nothing.
    for (const x of out) if (!x.gift && !isAwake(x.at)) { x.pts = 0; x.why += " (sleep time)"; }
    return out.sort((a, b) => a.at - b.at);
  }

  function score(entries, name, now = Date.now()) {
    const ev = events(entries, name);
    const earned = ev.reduce((s, x) => s + x.pts, 0);
    // −5 for each full 2.5 awake hours between activities; any activity resets the clock.
    let lost = 0, last = START, penalties = [];
    for (const t of [...ev.map(x => x.at), now]) {
      const blocks = Math.floor(awakeMinutes(last, Math.min(t, now)) / RULES.GAP_MIN);
      if (blocks > 0) { lost += blocks * RULES.PENALTY; penalties.push({ at: Math.min(t, now), pts: -blocks * RULES.PENALTY, why: `${blocks * RULES.GAP_MIN / 60} quiet hours` }); }
      last = Math.max(last, t);
    }
    // Every pin ever made costs its goldies, even if the picture was taken off the home screen later.
    const spent = (entries || []).flatMap(e => [e.pin, ...(e.pinHistory || [])]).filter(p => p && p.by === name).length * RULES.PIN_COST;
    const sinceLast = awakeMinutes(last, now) % RULES.GAP_MIN;
    return {
      name, earned, lost, spent,
      points: earned - lost - spent,
      crying: earned - lost - spent < RULES.CRY_BELOW,
      nextPenaltyIn: RULES.GAP_MIN - sinceLast, // awake minutes until the next −5
      lastActive: ev.filter(x => !x.gift).pop()?.at ?? null,
      history: [...ev, ...penalties].sort((a, b) => b.at - a.at),
    };
  }

  // Days in a row (India time) on which both of you posted or replied.
  function streak(entries, people, now = Date.now()) {
    const days = people.map(p => new Set(events(entries, p).filter(x => !x.gift).map(x => localDay(x.at))));
    const both = d => days.every(s => s.has(d));
    let d = localDay(now);
    if (!both(d)) d -= 1; // today still counts until midnight
    let n = 0;
    while (both(d)) { n++; d--; }
    return n;
  }

  globalThis.Goldies = { RULES, awakeMinutes, isAwake, events, score, streak, textPoints };
})();
