/* ==========================================================
   Goldie points 🪙, worked out from the diary itself, so both phones
   (and the reminder robot) always agree. Nothing is stored except the pages.
     earn:  note / text reply +5, voice +5, over 200 characters +10,
            picture +15  (pages written "together" count for both)
     lose:  −50 for every 3.5 hours without posting or replying
     sleep: 1 am – 8:30 am (India time) nothing counts: nothing lost,
            nothing earned, no crying pings
     game:  who knows whom: +5 answering about yourself, +20 spot-on guess,
            +10 close guess (paid when the guess is judged)
     race:  a puzzle race bet goes from the loser to the winner
     shop:  anything bought in the shop (each purchase keeps its price as `cost`)
     spend: 100 to pin one of your pictures to the love page
   Works in the browser (window.Goldies) and in Node (globalThis.Goldies).
   ========================================================== */
(() => {
  const RULES = {
    START: "2026-10-20T22:00:00+05:30", // points count from here, so nobody starts in the negative
    TZ_OFFSET_MIN: 330,                 // India time (UTC+5:30, no daylight saving)
    SLEEP_FROM: 60, SLEEP_TO: 510,      // sleep time 1:00 am – 8:30 am (minutes after midnight): nothing counts
    GAP_MIN: 210, PENALTY: 50,          // −50 for every 3.5 awake hours without a post or reply
    TEXT: 5, VOICE: 5, LONG: 10, LONG_CHARS: 200, PHOTO: 15,
    CALL: 5, CALL_BLOCK_MIN: 15,        // +5 for every 15 minutes on a call together
    KW_ANSWER: 5, KW_SPOT: 20, KW_CLOSE: 10, // "who knows whom": answering about yourself / a spot-on / a close guess
    PIN_COST: 100, PIN_DAYS: 3,         // a pinned picture stays on the love page for 3 days
    RACE_BETS: [0, 50, 150],            // what a puzzle race can be played for (winner takes it from the loser)
    // Goldies added by hand (not earned in the diary): { name: [{ at, pts, why }] }.
    BONUS: { Vian: [{ at: "2026-10-24T15:47:00Z", pts: 1180, why: "a bonus 🎉" }] }, // set so Vian was back at 290 (25 Oct)
    CALLER: 70, CALLER_FROM: "2026-10-24T15:47:00Z", // whoever starts a call from the diary gets 70 extra (calls from here on)
    WELCOME: 50,                       // a starting gift, so one quiet morning doesn't make Goldiee cry
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
  // The same, to the millisecond (for the live countdown and the penalties).
  function awakeMs(a, b) {
    if (b <= a) return 0;
    const off = RULES.TZ_OFFSET_MIN * MIN, D = DAY * MIN;
    let t = a + off, total = b - a;
    const end = b + off;
    while (t < end) {
      const dayStart = t - ((t % D) + D) % D;
      const lo = Math.max(t, dayStart + RULES.SLEEP_FROM * MIN), hi = Math.min(end, dayStart + RULES.SLEEP_TO * MIN);
      if (hi > lo) total -= hi - lo;
      t = dayStart + D;
    }
    return total;
  }
  // The moment `ms` awake milliseconds after `from` (sleep time doesn't tick).
  function addAwake(from, ms) {
    const off = RULES.TZ_OFFSET_MIN * MIN, D = DAY * MIN;
    let t = from, left = ms;
    for (let guard = 0; left > 0 && guard < 400; guard++) {
      const local = t + off, dayStart = local - ((local % D) + D) % D, m = local - dayStart;
      if (m >= RULES.SLEEP_FROM * MIN && m < RULES.SLEEP_TO * MIN) { t = dayStart + RULES.SLEEP_TO * MIN - off; continue; }
      const sleepAt = (m < RULES.SLEEP_FROM * MIN ? dayStart : dayStart + D) + RULES.SLEEP_FROM * MIN - off;
      const step = Math.min(left, sleepAt - t);
      t += step; left -= step;
    }
    return t;
  }
  const isAwake = ms => { const m = ((Math.floor(ms / MIN) + RULES.TZ_OFFSET_MIN) % DAY + DAY) % DAY; return !(m >= RULES.SLEEP_FROM && m < RULES.SLEEP_TO); };
  const localDay = ms => Math.floor((ms / MIN + RULES.TZ_OFFSET_MIN) / DAY);

  function textPoints(text) { return (text || "").trim().length > RULES.LONG_CHARS ? RULES.LONG : RULES.TEXT; }
  const credits = (e, name) => e.together ? true : (e.by || e.author) === name;
  const PAGE_TYPES = ["note", "photo", "video", "voice"];

  // Every moment that earned someone points, oldest first.
  function events(entries, name, now = Date.now()) {
    const out = [{ at: START, pts: RULES.WELCOME, why: "a welcome gift from Goldiee", gift: true }];
    for (const b of RULES.BONUS[name] || []) out.push({ at: Date.parse(b.at), pts: b.pts, why: b.why, gift: true, noClock: true });
    for (const e of entries || []) {
      const at = Date.parse(e.at);
      // A call counts for both of you; any call (even a short one) resets the 2.5-hour clock.
      if (e.type === "call") {
        if (at >= START && (e.by === name || e.with === name)) {
          const mins = Math.round((e.duration || 0) / 60);
          out.push({ at: at + (e.duration || 0) * 1000, pts: Math.floor(mins / RULES.CALL_BLOCK_MIN) * RULES.CALL, why: `a ${mins} min ${e.kind === "audio" ? "call" : "FaceTime"}`, callStart: at });
          if (e.by === name && at >= Date.parse(RULES.CALLER_FROM))
            out.push({ at: at + (e.duration || 0) * 1000, pts: RULES.CALLER, why: "for starting the call 📞", callStart: at });
        }
        continue;
      }
      // A dare from the shop (saved as item "coupon"): whoever did it earns a reward once the buyer says "got it".
      if (e.type === "buy" && e.item === "coupon") {
        if (e.thanked && e.for === name && !e.cancelled && Date.parse(e.thanked.at) >= START)
          out.push({ at: Date.parse(e.thanked.at), pts: e.reward || 20, why: "a dare, done 😈", game: true });
        // A dare with a deadline that wasn't done in time costs the dared one twice its price.
        const due = dareDue(e);
        if (due && e.for === name && !e.cancelled && now >= due && !(e.done && Date.parse(e.done.at) <= due))
          out.push({ at: due, pts: -2 * (e.cost || 0), why: "a dare not done in time ⌛", game: true, fixed: true, noClock: true });
        continue;
      }
      // Goldies gifted in the shop land with the other one (not counted as them being active).
      if (e.type === "buy" && e.item === "gift") {
        if (e.for === name && !e.cancelled && at >= START) out.push({ at, pts: e.amount || 0, why: `a gift from ${e.by} 🎁`, gift: true, noClock: true });
        continue;
      }
      // "Who knows whom" pays out once the guess is judged (skipped rounds pay nothing).
      if (e.type === "kwho") {
        const v = e.verdict, at = v && Date.parse(v.at);
        if (!v || e.dropped || at < START) continue;
        if (e.about === name) out.push({ at, pts: RULES.KW_ANSWER, why: "answering about yourself 🎯", game: true });
        const pts = v.v === "spot" ? RULES.KW_SPOT : v.v === "close" ? RULES.KW_CLOSE : 0;
        if (e.guess?.by === name && pts) out.push({ at, pts, why: v.v === "spot" ? "a spot-on guess 🎯" : "a close guess 👍", game: true });
        continue;
      }
      if (!PAGE_TYPES.includes(e.type)) continue;
      if (at >= START && credits(e, name)) {
        const pts = e.type === "photo" || e.type === "video" ? RULES.PHOTO : e.type === "voice" ? RULES.VOICE : textPoints(e.text);
        const why = e.type === "photo" ? "a picture" : e.type === "video" ? "a video" : e.type === "voice" ? "a voice note" : pts === RULES.LONG ? "opening your heart" : e.prompt ? "an answer" : "a note";
        out.push({ at, pts, why });
      }
      for (const r of e.replies || []) {
        const rat = Date.parse(r.at);
        if (rat < START || r.by !== name) continue;
        const pts = r.kind === "photo" || r.kind === "video" ? RULES.PHOTO : r.kind === "voice" ? RULES.VOICE : textPoints(r.text);
        out.push({ at: rat, pts, why: r.kind === "photo" ? "a picture reply" : r.kind === "video" ? "a video reply" : r.kind === "voice" ? "a voice reply" : "a reply" });
      }
    }
    // Sleep time doesn't count: things posted then still reset the clock, but earn nothing.
    // A call that starts while you're awake counts in full, even if it runs on past 1 am.
    for (const x of out) if (!x.gift && !x.fixed && !isAwake(x.callStart ?? x.at)) { x.pts = 0; x.why += " (sleep time)"; }
    return out.sort((a, b) => a.at - b.at);
  }

  function score(entries, name, now = Date.now()) {
    const ev = events(entries, name, now);
    const earned = ev.reduce((s, x) => s + x.pts, 0);
    // −50 for each full 3.5 awake hours between activities; any activity resets the clock.
    // A quiet-day shield from the shop pauses the clock, like sleep time, while it lasts.
    const shields = (entries || []).filter(e => e.type === "buy" && e.item === "shield" && e.by === name && !e.cancelled)
      .map(e => ({ from: Date.parse(e.at), to: Date.parse(e.at) + (e.hours || 12) * 3600000 }));
    const quietMs = (a, b) => awakeMs(a, b) - shields.reduce((s, w) => s + awakeMs(Math.max(a, w.from), Math.min(b, w.to)), 0);
    let lost = 0, last = START, penalties = [];
    for (const t of [...ev.filter(x => !x.noClock).map(x => x.at), now]) {
      const blocks = Math.floor(quietMs(last, Math.min(t, now)) / (RULES.GAP_MIN * MIN));
      if (blocks > 0) { lost += blocks * RULES.PENALTY; penalties.push({ at: Math.min(t, now), pts: -blocks * RULES.PENALTY, why: `${blocks * RULES.GAP_MIN / 60} quiet hours` }); }
      if (t < now) last = Math.max(last, t); // "now" isn't activity: the clock runs from the last real post
    }
    // Every pin ever made costs its goldies, even if the picture was taken off the home screen later.
    const spent = (entries || []).flatMap(e => [e.pin, ...(e.pinHistory || [])]).filter(p => p && p.by === name).length * RULES.PIN_COST
      + (entries || []).filter(e => e.type === "buy" && e.by === name && !e.cancelled).reduce((s, e) => s + (e.cost || 0), 0); // the shop
    // Puzzle race bets move goldies straight from the loser to the winner (sleep time or not).
    const bets = races(entries).filter(r => r.bet && (r.winner === name || r.loser === name))
      .map(r => r.winner === name ? { at: r.at, pts: r.bet, why: "won a puzzle race 🧩" } : { at: r.at, pts: -r.bet, why: "lost a puzzle race 🧩" });
    const won = bets.reduce((s, x) => s + x.pts, 0);
    const sinceLast = quietMs(last, now) % (RULES.GAP_MIN * MIN);
    const shield = shields.find(w => now >= w.from && now < w.to);
    const points = earned - lost - spent + won;
    return {
      name, earned, lost, spent, won,
      points,
      crying: points < RULES.CRY_BELOW,
      nextPenaltyIn: (RULES.GAP_MIN * MIN - sinceLast) / MIN, // awake minutes until the next −50
      nextPenaltyAt: addAwake(shield ? shield.to : now, RULES.GAP_MIN * MIN - sinceLast), // the moment it lands (sleep time and shields pause it)
      shieldUntil: shield ? shield.to : null,
      lastActive: ev.filter(x => !x.gift && !x.noClock).pop()?.at ?? null,
      history: [...ev, ...penalties, ...bets, ...shopHistory(entries, name)].sort((a, b) => b.at - a.at),
    };
  }

  // When a dare has to be done by (dares bought with a time limit, `hours`), or null.
  const dareDue = e => e.hours ? Date.parse(e.at) + e.hours * 3600000 : null;

  // Shop purchases, for the "your last goldies" list.
  const SHOP_WHY = { outfit: "an outfit for Goldiee 🐶", theme: "a diary backdrop for the day 🎨", peek: "a peek at an answer 👀", coupon: "a dare 😈",
    gift: "goldies gifted 🎁", shield: "a quiet-day shield 🛡", pintop: "a page pinned to the top 📌", surprise: "a surprise popup 🎉", superping: "a super ping 📣", flowers: "flowers 💐" };
  const shopHistory = (entries, name) => (entries || []).filter(e => e.type === "buy" && e.by === name && !e.cancelled && e.cost)
    .map(e => ({ at: Date.parse(e.at), pts: -e.cost, why: SHOP_WHY[e.item] || "the shop" }));

  // Finished puzzle races: { id, at, bet, winner, loser } (a tie or a cancelled race has no winner).
  // Each player's time is saved as { start, ms } once solved, or { gaveUp } for giving up.
  function races(entries) {
    const out = [];
    for (const e of entries || []) {
      if (e.type !== "race" || !e.accepted || e.cancelled) continue;
      const a = e.times?.[e.by], b = e.times?.[e.with];
      const end = t => t && (t.gaveUp ? Date.parse(t.gaveUp) : t.ms != null ? Date.parse(t.start) + t.ms : null);
      if (!end(a) || !end(b)) continue;
      const score = t => t.gaveUp ? Infinity : t.ms;
      if (score(a) === score(b)) continue;
      const aWins = score(a) < score(b);
      out.push({ id: e.id, at: Math.max(end(a), end(b)), bet: e.bet || 0, winner: aWins ? e.by : e.with, loser: aWins ? e.with : e.by });
    }
    return out;
  }

  // Days in a row (India time) on which both of you posted or replied.
  function streak(entries, people, now = Date.now()) {
    const days = people.map(p => new Set(events(entries, p).filter(x => !x.gift && !x.game).map(x => localDay(x.at))));
    const both = d => days.every(s => s.has(d));
    let d = localDay(now);
    if (!both(d)) d -= 1; // today still counts until midnight
    let n = 0;
    while (both(d)) { n++; d--; }
    return n;
  }

  // Is a pin still on the love page? ({ at } from entry.pin)
  const pinLive = (pin, now = Date.now()) => !!pin && now - Date.parse(pin.at) < RULES.PIN_DAYS * DAY * MIN;
  globalThis.Goldies = { dareDue, pinLive, RULES, awakeMinutes, awakeMs, addAwake, isAwake, events, score, streak, textPoints, races };
})();
