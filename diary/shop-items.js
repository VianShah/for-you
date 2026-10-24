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
  PHOTO_THEME: 150, // …or one of your own pictures as the backdrop
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
  // Dares (saved as item "coupon", from when they were love coupons): you buy one for the
  // other person, they do it from wherever they are, and when you tap "got it" they earn
  // COUPON_REWARD goldies for being brave.
  coupons: {
    voice:    { name: "Send me a voice note, just for me",  emoji: "🎙️", price: 60,  hint: "sing, read me something, or just talk" },
    photo:    { name: "A photo of you, right now",          emoji: "📸", price: 40,  hint: "no filters, no retakes, no fixing your hair" },
    morning:  { name: "Wake me up with a good-morning call", emoji: "🌅", price: 60,  hint: "the first voice I hear tomorrow" },
    sleep:    { name: "Stay on call till I fall asleep",    emoji: "🌙", price: 100, hint: "even if I start snoring" },
    playlist: { name: "Make me a playlist",                 emoji: "🎶", price: 70,  hint: "songs that remind you of me" },
    movie:    { name: "I pick the movie, you watch it",     emoji: "🍿", price: 80,  hint: "no complaints, no skipping" },
    song:     { name: "Sing our song on a voice note",      emoji: "🎤", price: 70,  hint: "the whole thing, off-key is fine" },
    silly:    { name: "Your silliest face, on camera",      emoji: "🤪", price: 30,  hint: "worse than that. sillier." },
    three:    { name: "Three things you love about me",     emoji: "💞", price: 50,  hint: "out loud, on a voice note" },
    outfit:   { name: "Wear what I pick on our next call",  emoji: "👗", price: 80,  hint: "I choose, you wear it, no backing out" },
    truth:    { name: "Answer one question, honestly",      emoji: "🙊", price: 60,  hint: "I ask in the note, you answer, no dodging" },
  },
  COUPON_REWARD: 20,
  DARE_HOURS: 48, // not done in time? the dared one loses twice the dare's price
  // Little extras.
  GIFTS: [50, 100],                 // send the other one some goldies
  SHIELD: { price: 120, hours: 12 },  // no −50s for you for 12 hours (exams, travel, a busy day)
  PINTOP: { price: 60, hours: 24 },   // one page sits at the top of the diary wall for a day
  SURPRISE: 30,                     // hearts burst and your note pops up the next time they open the diary
  SUPERPING: 20,                    // a loud, can't-miss notification with your own words
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
// Today's backdrop purchase itself (for a photo backdrop, its picture is in .photo).
function todaysThemeBuy(list, now = Date.now()) {
  const day = ms => Math.floor((ms / 60000 + 330) / 1440);
  return buys(list, "theme").filter(e => day(Date.parse(e.at)) === day(now)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] || null;
}
const activeShield = (list, name, now = Date.now()) => buys(list, "shield").find(e => e.by === name && now - Date.parse(e.at) < (e.hours || 12) * 3600000) || null;
// Pages pinned to the top of the wall right now, newest pin first.
const pinnedToTop = (list, now = Date.now()) => buys(list, "pintop").filter(e => now - Date.parse(e.at) < (e.hours || 24) * 3600000)
  .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
const surprisesFor = (list, name) => buys(list, "surprise").filter(e => e.for === name);

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

/* ---------- flowers 💐: build a bouquet, stem by stem ---------- */
SHOP.FLOWERS = {
  rose:      { name: "Rose",      price: 50, color: "#d1283a" },
  lily:      { name: "Lily",      price: 70, color: "#fff7f2" },
  tulip:     { name: "Tulip",     price: 40, color: "#f2789a" },
  sunflower: { name: "Sunflower", price: 60, color: "#ffc93c" },
  daisy:     { name: "Daisy",     price: 20, color: "#ffffff" },
  orchid:    { name: "Orchid",    price: 90, color: "#b46ad8" },
  lotus:     { name: "Lotus",     price: 80, color: "#f5a3c0" },
  marigold:  { name: "Marigold",  price: 25, color: "#ff9a1f" },
};
SHOP.WRAPS = { kraft: ["#d9b38c", "#c49a6c"], blush: ["#f7cfd6", "#eeb3be"], ivory: ["#fbf3e6", "#eadcc5"], midnight: ["#3a2a4a", "#2a1d38"] };
SHOP.MAX_STEMS = 24;
const flowerCount = f => Object.values(f || {}).reduce((s, n) => s + n, 0);
const flowerCost = f => Object.entries(f || {}).reduce((s, [id, n]) => s + (SHOP.FLOWERS[id]?.price || 0) * n, 0);

// One flower head, centred on 0,0, about 30 across.
function flowerHead(id) {
  const ring = (n, rx, ry, dist, fill, extra = "") => Array.from({ length: n }, (_, i) =>
    `<ellipse cx="0" cy="${-dist}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra} transform="rotate(${i * 360 / n})"/>`).join("");
  switch (id) {
    case "rose": return `<circle r="13" fill="#b51d30"/><circle r="10" fill="#d1283a"/><path d="M-6 -2a6 6 0 1 1 8 6M-3 -1a3 3 0 1 1 4 3" stroke="#8e1424" stroke-width="1.6" fill="none"/>`;
    case "lily": return `${ring(6, 4.5, 13, 9, "#fff7f2", 'stroke="#f2c6d0" stroke-width="1"')}${ring(6, 1, 7, 7, "#f39aa6")}<circle r="3" fill="#ffd23f"/>`;
    case "tulip": return `<path d="M-11 -2c0-9 4-14 11-14s11 5 11 14c0 9-5 13-11 13s-11-4-11-13z" fill="#f2789a"/><path d="M-11 -6l6 6 5-11 5 11 6-6" fill="#e05a80"/>`;
    case "sunflower": return `${ring(14, 3.6, 8, 11, "#ffc93c")}<circle r="8" fill="#6b3d1f"/><circle r="5" fill="#4a2a14"/>`;
    case "daisy": return `${ring(12, 2.8, 8, 8, "#ffffff", 'stroke="#eee" stroke-width=".6"')}<circle r="4.5" fill="#ffc93c"/>`;
    case "orchid": return `${ring(5, 6, 10, 7, "#c98be6")}<path d="M-4 1q4 9 8 0q-4 4-8 0z" fill="#8a3fb3"/><circle r="2.4" fill="#fff1a8"/>`;
    case "lotus": return `<path d="M0 6c-14-2-16-12-13-16 6 2 10 8 13 16zM0 6c14-2 16-12 13-16-6 2-10 8-13 16z" fill="#f08bb0"/><path d="M0 6c-7-6-7-15 0-20 7 5 7 14 0 20z" fill="#f5a3c0"/><path d="M0 6c-9 0-15-4-17-8M0 6c9 0 15-4 17-8" stroke="#e57aa3" stroke-width="1.4" fill="none"/>`;
    case "marigold": return `<circle r="12" fill="#f07a10"/>${ring(10, 4, 5, 8, "#ff9a1f")}<circle r="6" fill="#ffb53f"/><circle r="3" fill="#f07a10"/>`;
  }
  return "";
}
// The whole bouquet: heads in a natural cluster, stems, and a paper cone with a ribbon.
function bouquetSvg(flowers, wrap = "kraft") {
  const heads = Object.entries(flowers || {}).flatMap(([id, n]) => Array(n).fill(id));
  // Mix them up the same way every time, so the same bouquet always looks the same.
  heads.splice(0, heads.length, ...heads.map((id, i) => ({ id, k: hash(id + i) })).sort((a, b) => a.k - b.k).map(x => x.id));
  const n = heads.length, R = 18 + Math.sqrt(n) * 13;
  const pos = heads.map((id, i) => {
    const r = n === 1 ? 0 : R * Math.sqrt((i + .5) / n), a = i * 2.39996;
    return { id, x: 100 + r * Math.cos(a), y: 92 + r * Math.sin(a) * .7, s: n > 12 ? .85 : 1 };
  });
  const [w1, w2] = SHOP.WRAPS[wrap] || SHOP.WRAPS.kraft;
  const stems = pos.map(p => `<path d="M${p.x.toFixed(1)} ${p.y.toFixed(1)} Q${((p.x + 100) / 2).toFixed(1)} ${(p.y + 60).toFixed(1)} 100 196" stroke="#5a9a4a" stroke-width="2" fill="none"/>`).join("");
  const leaves = n ? `<path d="M100 150q-34-6-40-34q26 6 40 34zM100 150q34-6 40-34q-26 6-40 34z" fill="#6aa84f"/>` : "";
  const flowersSvg = pos.sort((a, b) => a.y - b.y).map(p => `<g transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${p.s})">${flowerHead(p.id)}</g>`).join("");
  return `<svg class="bouquet" viewBox="0 0 200 240" aria-hidden="true">${stems}${leaves}
    <path d="M46 128 L100 234 L154 128 Q100 146 46 128z" fill="${w1}"/><path d="M46 128 L100 234 L84 136z" fill="${w2}" opacity=".7"/>
    ${flowersSvg}
    <path d="M100 196c-12-10-24-8-22 0s14 4 22 0zm0 0c12-10 24-8 22 0s-14 4-22 0z" fill="#d97b86"/><path d="M98 198l-8 18M102 198l8 18" stroke="#d97b86" stroke-width="3" stroke-linecap="round"/><circle cx="100" cy="197" r="4" fill="#c4566a"/></svg>`;
}
const flowersFor = (list, name) => buys(list, "flowers").filter(e => e.for === name).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
