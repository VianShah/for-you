/* ==========================================================
   The shop 🛍: everything goldies can buy, and how a purchase shows up.
   A purchase is a page in entries.json:
     { type: "buy", item: "outfit" | "theme" | "peek" | "coupon", by, at, cost, … }
   goldies.js takes `cost` off the buyer, so prices can change here later
   without touching old purchases.
   ========================================================== */
const SHOP = {
  // Goldiee's wardrobe: bought once, then either of you can dress her in it any time.
  outfits: {
    diwali:    { name: "Diwali glow",     emoji: "🪔", price: 150, season: [10, 11], hat: false },
    halloween: { name: "Little witch",    emoji: "🎃", price: 150, season: [10],     hat: true },
    christmas: { name: "Santa pup",       emoji: "🎅", price: 150, season: [12],     hat: true },
    easter:    { name: "Easter bunny",    emoji: "🐣", price: 150, season: [3, 4],   hat: true },
    party:     { name: "Party hat",       emoji: "🥳", price: 100, hat: true },
    crown:     { name: "Royal crown",     emoji: "👑", price: 120, hat: true },
    flowers:   { name: "Flower crown",    emoji: "🌸", price: 120, hat: true },
    shades:    { name: "Cool shades",     emoji: "😎", price: 80,  hat: false },
  },
  // The diary's background for the rest of the day (India time), on both phones.
  themes: {
    diwali:  { name: "Diwali lights",  emoji: "🪔", price: 80 },
    hearts:  { name: "Full of hearts", emoji: "💗", price: 80 },
    sunset:  { name: "Golden hour",    emoji: "🌅", price: 80 },
    snow:    { name: "Snowfall",       emoji: "❄️", price: 80 },
    spooky:  { name: "Spooky night",   emoji: "🎃", price: 80 },
    garden:  { name: "Spring garden",  emoji: "🌸", price: 80 },
  },
  // See the other one's answer to a question without answering it first.
  PEEK: 50,
  // Love coupons for long distance: you buy one, the other one makes it happen from wherever
  // they are, and when you say "got it ❤️" they earn COUPON_REWARD goldies for doing it.
  coupons: {
    voice:    { name: "A voice note just for me",        emoji: "🎙️", price: 60,  hint: "sing, read me something, or just talk" },
    photo:    { name: "A photo of you, right now",       emoji: "📸", price: 40,  hint: "no filters, no retakes" },
    morning:  { name: "A good-morning call",             emoji: "🌅", price: 60,  hint: "the first voice I hear tomorrow" },
    sleep:    { name: "Stay on call till I fall asleep", emoji: "🌙", price: 100, hint: "even if I start snoring" },
    movie:    { name: "Watch party, I pick the movie",   emoji: "🍿", price: 80,  hint: "start it at the same time, call on" },
    playlist: { name: "Make me a playlist",              emoji: "🎶", price: 70,  hint: "songs that remind you of me" },
    food:     { name: "Surprise food delivery",          emoji: "🛵", price: 200, hint: "send my favourite to my door" },
    letter:   { name: "A real letter, in the post",      emoji: "✉️", price: 150, hint: "handwritten, stamped, the lot" },
    date:     { name: "A video date night you plan",     emoji: "🕯️", price: 120, hint: "dress up, candles, a plan" },
    parcel:   { name: "A surprise parcel",               emoji: "🎁", price: 300, hint: "anything, as long as it's a surprise" },
    visit:    { name: "Plan our next visit together",    emoji: "✈️", price: 100, hint: "dates, tickets, a countdown" },
  },
  COUPON_REWARD: 20,
};

const buys = (list, item) => (list || []).filter(e => e.type === "buy" && e.item === item && !e.cancelled);
const ownedOutfits = list => new Set(buys(list, "outfit").map(e => e.outfit));
// What Goldiee is wearing: the latest "wear" (a purchase counts as putting it on).
function currentOutfit(list) {
  const moves = (list || []).filter(e => (e.type === "buy" && e.item === "outfit") || e.type === "wear")
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const last = moves[0];
  return last ? (last.type === "wear" ? last.outfit || "" : last.outfit) : "";
}
// Today's diary background, if one of you bought it today (India time).
function todaysTheme(list, now = Date.now()) {
  const day = ms => Math.floor((ms / 60000 + 330) / 1440);
  const b = buys(list, "theme").filter(e => day(Date.parse(e.at)) === day(now)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  return b ? b.theme : "";
}
const peeked = (list, name, qid) => buys(list, "peek").some(e => e.by === name && e.qid === qid);
const openCoupons = (list, forName) => buys(list, "coupon").filter(e => e.for === forName && !e.thanked);

/* ---------- Goldiee's outfits, drawn on her 100×100 picture ---------- */
const OUTFIT_SVG = {
  diwali: `<g class="o-diwali">
    <path d="M22 76q28 14 56 0" fill="none" stroke="#3f8f3a" stroke-width="1.4"/>
    ${[22, 29, 36, 43, 50, 57, 64, 71, 78].map((x, i) => `<circle cx="${x}" cy="${76 + Math.sin((x - 22) / 56 * Math.PI) * 7}" r="3.6" fill="${i % 2 ? "#ffd23f" : "#ff8f1c"}"/>`).join("")}
    <path d="M4 90q9 7 18 0z" fill="#b4542a"/><path d="M5 90h16" stroke="#8a3a1c" stroke-width="1.4"/>
    <path class="o-flame" d="M13 89c-3-3-2-7 0-10 2 3 3 7 0 10z" fill="#ffb21f"/><path d="M13 88c-1.2-1.4-.8-3.4 0-4.6.8 1.2 1.2 3.2 0 4.6z" fill="#fff1a8"/></g>`,
  halloween: `<g class="o-halloween">
    <ellipse cx="50" cy="22" rx="33" ry="5.5" fill="#2b1a2e"/>
    <path d="M34 21c4-10 7-24 20-36 0 12 6 26 12 36z" fill="#2b1a2e"/>
    <path d="M35.5 17.5h29l1.6 4h-32.2z" fill="#8a4fd1"/><rect x="47" y="16.4" width="6" height="5.6" rx="1" fill="none" stroke="#ffd23f" stroke-width="1.3"/>
    <ellipse cx="86" cy="88" rx="10" ry="8" fill="#ff8a1c"/><ellipse cx="86" cy="88" rx="4" ry="8" fill="#f07a10"/>
    <path d="M86 80c0-3 1-4 3-5" stroke="#3f6e2a" stroke-width="2" fill="none" stroke-linecap="round"/></g>`,
  christmas: `<g class="o-christmas">
    <path d="M25 27q6-20 30-23 20-1 30 14l-6 6q-10-11-26-8-14 3-21 13z" fill="#d1283a"/>
    <path d="M23 28q27-12 56-2" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none"/>
    <circle cx="86" cy="19" r="6" fill="#fff"/>
    <path d="M26 74q24 12 48 0l2 7q-26 12-52 0z" fill="#2f7d4f"/><path d="M62 78l5 14h-7z" fill="#2f7d4f"/></g>`,
  easter: `<g class="o-easter">
    <ellipse cx="39" cy="4" rx="6" ry="17" transform="rotate(-12 39 4)" fill="#fff" stroke="#f1d5da" stroke-width="1"/>
    <ellipse cx="39" cy="5" rx="2.8" ry="12" transform="rotate(-12 39 5)" fill="#f7b8c4"/>
    <ellipse cx="61" cy="4" rx="6" ry="17" transform="rotate(12 61 4)" fill="#fff" stroke="#f1d5da" stroke-width="1"/>
    <ellipse cx="61" cy="5" rx="2.8" ry="12" transform="rotate(12 61 5)" fill="#f7b8c4"/>
    <ellipse cx="86" cy="86" rx="8" ry="10" fill="#bfe3f7"/><path d="M78.5 84q7.5 4 15 0M78.6 89q7.4 4 14.8 0" stroke="#f39aa6" stroke-width="2" fill="none"/></g>`,
  party: `<g class="o-party">
    <path d="M38 22l14-30 14 30z" fill="#8fd0ff"/><path d="M41 15l22 1M45 7l14 .5M48 0l8 .3" stroke="#f39aa6" stroke-width="3"/>
    <circle cx="52" cy="-9" r="4" fill="#ffd23f"/>
    ${[[18, 8, "#f39aa6"], [84, 12, "#ffd23f"], [12, 30, "#8fd0ff"], [90, 34, "#b38be8"], [24, -2, "#ffd23f"]].map(([x, y, c]) => `<rect x="${x}" y="${y}" width="3.5" height="3.5" rx=".6" fill="${c}" transform="rotate(25 ${x} ${y})"/>`).join("")}</g>`,
  crown: `<g class="o-crown">
    <path d="M32 22l-2-16 10 8 10-12 10 12 10-8-2 16z" fill="#f4c542" stroke="#c9952a" stroke-width="1.2" stroke-linejoin="round"/>
    <circle cx="50" cy="15" r="2.6" fill="#d1283a"/><circle cx="39" cy="17" r="1.8" fill="#3a7bd5"/><circle cx="61" cy="17" r="1.8" fill="#3a7bd5"/></g>`,
  flowers: `<g class="o-flowers">
    <path d="M24 26q26-18 52 0" fill="none" stroke="#5a9a4a" stroke-width="2"/>
    ${[[25, 25, "#f39aa6"], [33, 19, "#fff"], [42, 15.5, "#ffd23f"], [50, 14.5, "#f39aa6"], [58, 15.5, "#fff"], [67, 19, "#ffd23f"], [75, 25, "#f39aa6"]]
      .map(([x, y, c]) => `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map(a => `<ellipse cx="0" cy="-3" rx="2.2" ry="3.2" fill="${c}" transform="rotate(${a})"/>`).join("")}<circle r="1.6" fill="#e4a24b"/></g>`).join("")}</g>`,
  shades: `<g class="o-shades">
    <rect x="30" y="39.5" width="17" height="11" rx="5" fill="#1d1416"/><rect x="53" y="39.5" width="17" height="11" rx="5" fill="#1d1416"/>
    <path d="M47 43.5q3-2 6 0" stroke="#1d1416" stroke-width="2.2" fill="none"/><path d="M30 43l-6-3M70 43l6-3" stroke="#1d1416" stroke-width="2"/>
    <path d="M33 42l5 0M56 42l5 0" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".7"/></g>`,
};
