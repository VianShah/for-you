/* ==========================================================
   The sample diary 👀: what anyone sees before they have a code.
   A made-up couple, a few days of pages, read-only. Every time is
   relative to now, so it always looks like it's in use.
   Real diaries only ever load with their own code (see couple.js).
   ========================================================== */
const DEMO_PEOPLE = ["Aarav", "Meera"];
function demoSettings(now = Date.now()) {
  return {
    people: DEMO_PEOPLE, start: new Date(now - 7 * 864e5).toISOString(),
    rules: { SET_TO: { Aarav: { at: new Date(now - 6 * 3600e3).toISOString(), to: 310 }, Meera: { at: new Date(now - 6 * 3600e3).toISOString(), to: 285 } } },
  };
}
function demoEntries(now = Date.now()) {
  const ago = h => new Date(now - h * 3600e3).toISOString();
  const [A, M] = DEMO_PEOPLE;
  const q = id => { const x = questionById(id); return x && { id: x.id, cat: x.cat, q: x.q }; };
  return [
    { id: "demo-1", type: "note", author: M, by: M, at: ago(0.7), spent: 140, paper: "pink", stickers: ["🌸", "😘"], title: "lunch break thought",
      text: "You hummed that song all morning and now it's stuck in my head. Not complaining. Come home early?",
      hearts: [A], replies: [{ id: "r1", by: A, at: ago(0.5), text: "Leaving at 6 sharp. I'll bring the good samosas 🥟" }] },
    { id: "demo-2", type: "photo", author: `${A} & ${M}`, by: A, together: true, at: ago(3), spent: 60, frame: "polaroid", stickers: ["☕", "❤️"],
      caption: "our Sunday spot", media: "diary/demo/coffee.jpg", hearts: [M, A] },
    { id: "demo-3", type: "note", author: A, by: A, at: ago(5), spent: 210, paper: "lined", stickers: [], prompt: q("foryou-1"),
      text: "Honestly? The small stuff. When you save me the last bite without saying anything. When you text 'reached?' every single time. That's how I know.", guess: "she'll say the morning chai" },
    { id: "demo-4", type: "note", author: M, by: M, at: ago(4.5), spent: 180, paper: "sticky", stickers: ["🫶"], prompt: q("foryou-1"),
      text: "When you remember the tiny things I said weeks ago. And the morning chai, obviously ☕", guess: "he'll say food 😂", hearts: [A] },
    { id: "demo-5", type: "call", kind: "video", by: A, with: M, author: A, at: ago(26), duration: 47 * 60 },
    { id: "demo-6", type: "photo", author: M, by: M, at: ago(28), spent: 45, frame: "tape", stickers: ["🌙", "✨"],
      caption: "the sky from my balcony, wish you were here", media: "diary/demo/stars.jpg", hearts: [A],
      replies: [{ id: "r2", by: A, at: ago(27.5), text: "Next time we watch it together. Promise 🌙" }] },
    { id: "demo-7", type: "note", author: A, by: A, at: ago(50), spent: 320, paper: "letter", stickers: ["💌"], title: "for the bad days",
      text: "If you're reading this on a bad day: you're doing better than you think. I'm proud of you, I'm on your side, and I'm one call away. Always." },
    { id: "demo-8", type: "photo", author: `${A} & ${M}`, by: M, together: true, at: ago(74), spent: 90, frame: "heart", stickers: ["🌊"],
      caption: "the evening we didn't want to end", media: "diary/demo/sunset.jpg", hearts: [A, M] },
    { id: "demo-9", type: "note", author: M, by: M, at: ago(98), spent: 95, paper: "kraft", stickers: ["🍫"], title: "a tiny list",
      text: "Things that made me smile today:\n1. your voice note at 7am\n2. the dog outside the café\n3. you, again" },
  ];
}
