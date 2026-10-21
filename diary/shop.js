/* The shop page: Goldiee's wardrobe, dares, today's backdrop, and the little extras. */
let allPages = [];
const buyId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const nowIso = () => new Date().toISOString();
const shortDay = at => new Date(at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
const clock = ms => new Date(ms).toLocaleString("en-GB", { weekday: "short", hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
const other = () => NAME ? partnerOf(NAME) : PEOPLE[1];

async function shopSave(change, message) {
  try {
    allPages = await updateIndex(change, message);
    renderGoldieBar(allPages);
    renderShop();
    return true;
  } catch (err) { toast(err.message); return false; }
}
function canBuy(price) {
  if (!KEY || !NAME) { toast("Set this phone up in the diary first 🔑"); return false; }
  const have = myPoints(allPages);
  if (have < price) { toast(`That's ${price} goldies. You have ${have} 🪙`); return false; }
  return true;
}
async function buy(item, price, details, message) {
  if (!canBuy(price)) return false;
  const e = { id: buyId(), type: "buy", item, by: NAME, at: nowIso(), cost: price, ...details };
  const ok = await shopSave(list => [e, ...list], message);
  if (ok) toast(`−${price} goldies 🪙`);
  return ok;
}

/* ---------- Goldiee's wardrobe ---------- */
let trying = null; // the look shown on the big Goldiee before buying
const SAYS = {
  idle: ["Dress me up? 🥺", "I've been very good today", "Ooh, what are we wearing?"],
  trying: ["Ooh! Do I look cute?", "Is this me? I think it's me.", "Buy it buy it buy it 🐾"],
  wearing: ["I love it, thank you! 💛", "Look at me go!", "Best dressed pup in the whole diary"],
};
const pick = arr => arr[Math.floor(Date.now() / 7000) % arr.length];
function renderWardrobe() {
  const owned = ownedOutfits(allPages), wearing = currentOutfit(allPages), month = new Date().getMonth() + 1;
  const show = trying ?? wearing, o = SHOP.outfits[show];
  const mood = trying && trying !== wearing ? "trying" : show ? "wearing" : "idle";
  const buyBtn = trying && !owned.has(trying) ? `<button class="save" data-outfit-buy="${trying}">buy ${o.emoji} ${esc(o.name)} · ${o.price} 🪙</button><button class="ghost" data-outfit-cancel>take it off</button>`
    : trying && owned.has(trying) && trying !== wearing ? `<button class="save" data-outfit-wear="${trying}">put it on her</button>` : "";
  $("#wardrobeStage").innerHTML = `<div class="stage-light"></div>
    <div class="stage-bubble">${esc(pick(SAYS[mood]))}</div>
    <div class="stage-pup">${goldiee.look(show)}</div>
    <div class="stage-name">Goldiee</div>
    <p class="hint">${show ? `${o.emoji} ${esc(o.name)}${show === wearing ? " · wearing it now" : " · just trying it on"}` : "in her everyday bow 🎀"}</p>
    ${buyBtn ? `<div class="game-actions">${buyBtn}</div>` : ""}`;
  const tile = (id, o) => {
    const has = owned.has(id), on = wearing === id, inSeason = o.season?.includes(month);
    const tag = on ? `<span class="si-price on">wearing ✓</span>` : has ? `<span class="si-price">yours · put on</span>` : `<span class="si-price">${o.price} 🪙</span>`;
    return `<button type="button" class="shop-item${on ? " on" : ""}${trying === id ? " trying" : ""}" data-outfit="${id}">
      ${inSeason ? `<span class="si-badge">in season ✨</span>` : ""}<span class="si-look">${goldiee.look(id)}</span><b>${esc(o.name)}</b>${tag}</button>`;
  };
  const order = Object.entries(SHOP.outfits).sort(([, a], [, b]) => !!b.season?.includes(month) - !!a.season?.includes(month));
  $("#outfits").innerHTML = order.map(([id, o]) => tile(id, o)).join("") +
    (wearing ? `<button type="button" class="shop-item" data-outfit=""><span class="si-emoji">🎀</span><b>Just her bow</b><span class="si-price">take it off</span></button>` : "");
}

/* ---------- dares ---------- */
function renderCoupons() {
  $("#couponIntro").textContent = `Buy a dare for ${other()}. They do it from wherever they are, and when you tap "got it", they earn ${SHOP.COUPON_REWARD} goldies for being brave.`;
  const all = buys(allPages, "coupon").sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const forMe = all.filter(e => e.for === NAME && !e.thanked);
  const fromMe = all.filter(e => e.by === NAME && !e.thanked);
  const card = (e, mine) => {
    const c = SHOP.coupons[e.coupon] || { emoji: "😈", name: "a dare" };
    const status = e.done ? `done ${shortDay(e.done.at)}` : `dared ${shortDay(e.at)}`;
    const act = mine
      ? (e.done ? `<button class="save" data-coupon-thanks="${esc(e.id)}">got it ❤️ (+${e.reward || SHOP.COUPON_REWARD} for ${esc(e.for)})</button>` : `<p class="hint">Waiting for ${esc(e.for)} to do it.</p>`)
      : (e.done ? `<p class="hint">Done ✓ Waiting for ${esc(e.by)} to say "got it".</p>` : `<button class="save" data-coupon-done="${esc(e.id)}">dare done ✓</button>`);
    return `<div class="coupon-card${mine ? "" : " for-me"}"><div class="coupon-emoji">${c.emoji}</div><div><small>${mine ? `you dared ${esc(e.for)}` : `${esc(e.by)} dares you`} · ${status}</small>
      <b>${esc(c.name)}</b>${e.note ? `<p class="coupon-note">“${esc(e.note)}”</p>` : ""}<div class="game-actions">${act}</div></div></div>`;
  };
  $("#couponTodo").innerHTML =
    (forMe.length ? `<div class="label">your dares to do</div>${forMe.map(e => card(e, false)).join("")}` : "") +
    (fromMe.length ? `<div class="label">dares you sent</div>${fromMe.map(e => card(e, true)).join("")}` : "");
  $("#couponShop").innerHTML = `<div class="label">dare ${esc(other())} to…</div><div class="shop-grid coupons">${Object.entries(SHOP.coupons).map(([id, c]) =>
    `<button type="button" class="shop-item" data-coupon="${id}"><span class="si-emoji">${c.emoji}</span><b>${esc(c.name)}</b><small>${esc(c.hint)}</small><span class="si-price">${c.price} 🪙</span></button>`).join("")}</div>`;
}

/* ---------- today's backdrop ---------- */
function renderThemes() {
  const t = todaysThemeBuy(allPages), today = t?.theme || "";
  const name = today === "photo" ? "📷 one of your pictures" : today ? `${SHOP.themes[today].emoji} ${SHOP.themes[today].name}` : "";
  $("#themeNow").textContent = today ? `Today it's ${name}, thanks to ${t.by}. It goes back to normal at midnight.` : "Today's backdrop is the usual one.";
  $("#themes").innerHTML = `<button type="button" class="shop-item photo-theme${today === "photo" ? " on" : ""}" data-theme-photo><span class="si-swatch photo" ${today === "photo" ? `style="background-image:var(--day-photo)"` : ""}>📷</span><b>Your own picture</b><span class="si-price${today === "photo" ? " on" : ""}">${today === "photo" ? "on today ✓" : `${SHOP.PHOTO_THEME} 🪙`}</span></button>` +
    Object.entries(SHOP.themes).map(([id, th]) =>
      `<button type="button" class="shop-item${today === id ? " on" : ""}" data-theme-buy="${id}"><span class="si-swatch" data-swatch="${id}"></span><b>${th.emoji} ${esc(th.name)}</b><span class="si-price${today === id ? " on" : ""}">${today === id ? "on today ✓" : `${th.price} 🪙`}</span></button>`).join("");
}
// Shrinks a picture from the phone before it's uploaded as a backdrop.
async function shrinkForBackdrop(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const scale = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(r, "image/jpeg", .85));
  } finally { URL.revokeObjectURL(url); }
}
function openPhotoBackdrop() {
  if (!canBuy(SHOP.PHOTO_THEME)) return;
  const photos = allPages.filter(e => e.type === "photo" && e.media && !e.status);
  const back = document.createElement("div");
  back.className = "sheet-back";
  back.innerHTML = `<div class="sheet small"><div class="sheet-head"><h2>Pick a backdrop</h2><button type="button" class="icon-btn close" data-close>✕</button></div>
    <p class="help">It fills the diary's background on both phones until midnight, softly faded so the pages stay easy to read. ${SHOP.PHOTO_THEME} goldies.</p>
    <label class="ghost upload-btn">📷 choose a new picture<input type="file" accept="image/*" hidden data-bd-file></label>
    ${photos.length ? `<div class="label">or one from the diary</div><div class="race-pics">${photos.map(p => `<button type="button" data-bd-pic="${esc(p.media)}"><img ${imgSrcAttrs(p.media)} alt=""></button>`).join("")}</div>` : ""}
    <p class="hint" data-bd-status></p></div>`;
  document.body.appendChild(back);
  hydrateMedia(back);
  const status = $("[data-bd-status]", back);
  const done = async photo => {
    status.textContent = "Putting it up…";
    if (await buy("theme", SHOP.PHOTO_THEME, { theme: "photo", photo }, `${NAME} made a picture today's backdrop`)) {
      notifyPartner("🎨 The diary looks different today", `${NAME} made one of your pictures the backdrop`);
      back.remove();
    } else status.textContent = "";
  };
  back.addEventListener("click", ev => {
    if (ev.target === back || ev.target.closest("[data-close]")) return back.remove();
    const pic = ev.target.closest("[data-bd-pic]");
    if (pic) done(pic.dataset.bdPic);
  });
  $("[data-bd-file]", back).addEventListener("change", async ev => {
    const file = ev.target.files[0]; if (!file) return;
    try {
      status.textContent = "Uploading the picture…";
      const packed = await packMedia(`${MEDIA_DIR}${buyId()}-backdrop.jpg`, await shrinkForBackdrop(file));
      await putFile(packed.path, packed.b64, `Backdrop picture from ${NAME}`);
      await done(packed.path);
    } catch (err) { status.textContent = err.message; }
  });
}

/* ---------- little extras ---------- */
function renderExtras() {
  const waiting = NAME ? allPages.filter(e => !e.status && e.prompt && !e.together && e.author !== NAME && !answeredBy(allPages, NAME, e.prompt.id) && !peeked(allPages, NAME, e.prompt.id)) : [];
  const shield = NAME && activeShield(allPages, NAME);
  const row = (emoji, title, text, actions = "") => `<div class="extra"><span class="si-emoji">${emoji}</span><div><b>${title}</b><p class="hint">${text}</p>${actions ? `<div class="game-actions">${actions}</div>` : ""}</div></div>`;
  $("#extrasList").innerHTML = [
    row("🎁", "Gift some goldies", `Send ${esc(other())} goldies from yours, to cheer them up or just because.`,
      SHOP.GIFTS.map(n => `<button class="ghost" data-gift="${n}">gift ${n} 🪙</button>`).join("")),
    row("🎉", `A surprise popup · ${SHOP.SURPRISE} 🪙`, `Hearts burst and your note pops up, with Goldiee, the next time ${esc(other())} opens the diary.`,
      `<button class="ghost" data-surprise>write the surprise</button>`),
    row("📣", `A super ping · ${SHOP.SUPERPING} 🪙`, `A loud, can't-miss notification on ${esc(other())}'s phone, in your own words.`,
      `<button class="ghost" data-superping>send one</button>`),
    row("🛡", `Quiet-day shield · ${SHOP.SHIELD.price} 🪙`, shield ? `You're shielded till ${clock(Date.parse(shield.at) + shield.hours * 3600000)}: no −${Goldies.RULES.PENALTY}s until then.`
      : `No −${Goldies.RULES.PENALTY}s for you for the next ${SHOP.SHIELD.hours} hours. For exams, travel, or a busy day.`, shield ? "" : `<button class="ghost" data-shield>switch it on</button>`),
    row("👀", `Peek at an answer · ${SHOP.PEEK} 🪙`, `See ${esc(other())}'s answer without answering first. Tap “peek” on a blurred answer in the diary.`,
      waiting.length ? `<a class="ghost" href="./">${waiting.length} blurred ${waiting.length === 1 ? "answer" : "answers"} waiting →</a>` : ""),
    row("📌", `Pin a page to the top · ${SHOP.PINTOP.price} 🪙`, `Keeps one page above everything else on the diary wall for ${SHOP.PINTOP.hours} hours. Open the page in the diary and tap “pin to the top”.`),
    row("🏠", `Pin a picture to the love page · ${Goldies.RULES.PIN_COST} 🪙`, `It joins the photo strip on the first page for ${Goldies.RULES.PIN_DAYS} days. Open a picture in the diary and tap “add to home”.`),
  ].join("");
}

function renderShop() { renderWardrobe(); renderCoupons(); renderThemes(); renderExtras(); }

document.addEventListener("click", async ev => {
  const t = ev.target;
  // --- wardrobe
  const outfit = t.closest("[data-outfit]");
  if (outfit) {
    const id = outfit.dataset.outfit;
    if (!id) { trying = null; if (currentOutfit(allPages) && await shopSave(list => [{ id: buyId(), type: "wear", outfit: "", by: NAME, at: nowIso() }, ...list], `${NAME} changed Goldiee's look`)) { goldiee.wear(""); toast("Back to her everyday bow 🎀"); } return; }
    if (ownedOutfits(allPages).has(id) && currentOutfit(allPages) !== id) {
      trying = null;
      if (await shopSave(list => [{ id: buyId(), type: "wear", outfit: id, by: NAME, at: nowIso() }, ...list], `${NAME} changed Goldiee's look`)) goldiee.wear(id);
    } else { trying = id; renderWardrobe(); }
    return $("#wardrobeStage").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  }
  if (t.closest("[data-outfit-cancel]")) { trying = null; return renderWardrobe(); }
  const ob = t.closest("[data-outfit-buy]");
  if (ob) {
    const id = ob.dataset.outfitBuy, o = SHOP.outfits[id];
    if (!canBuy(o.price) || !confirm(`Buy ${o.emoji} ${o.name} for Goldiee? ${o.price} goldies, and it's yours to keep.`)) return;
    ob.disabled = true; trying = null;
    if (await buy("outfit", o.price, { outfit: id }, `${NAME} bought Goldiee an outfit`)) {
      goldiee.wear(id);
      const r = $(".stage-pup").getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, 22);
      notifyPartner(`🐶 Goldiee has a new look`, `${NAME} dressed her up: ${o.emoji} ${o.name}`);
    }
    return;
  }
  const ow = t.closest("[data-outfit-wear]");
  if (ow) { trying = null; if (await shopSave(list => [{ id: buyId(), type: "wear", outfit: ow.dataset.outfitWear, by: NAME, at: nowIso() }, ...list], `${NAME} changed Goldiee's look`)) goldiee.wear(ow.dataset.outfitWear); return; }

  // --- dares
  const coupon = t.closest("[data-coupon]");
  if (coupon) {
    const id = coupon.dataset.coupon, c = SHOP.coupons[id];
    if (!canBuy(c.price)) return;
    const note = prompt(`${c.emoji} Dare ${other()}: ${c.name} (${c.price} goldies).\nAdd a note? (optional${id === "truth" ? ", write your question here" : ""})`, "");
    if (note === null) return;
    coupon.disabled = true;
    if (await buy("coupon", c.price, { coupon: id, for: other(), note: note.trim().slice(0, 140), reward: SHOP.COUPON_REWARD }, `${NAME} sent a dare`)) {
      notifyPartner(`😈 ${NAME} dares you`, `${c.emoji} ${c.name}. Do it, then tap "dare done" in the shop`, "shop.html#coupons");
    }
    coupon.disabled = false;
    return;
  }
  const done = t.closest("[data-coupon-done]");
  if (done) {
    done.disabled = true;
    const id = done.dataset.couponDone;
    if (await shopSave(list => list.map(x => x.id === id && !x.done ? { ...x, done: { at: nowIso() } } : x), `${NAME} did a dare`)) {
      const e = allPages.find(x => x.id === id);
      notifyPartner(`😈 ${NAME} did your dare`, `${SHOP.coupons[e.coupon]?.name || "Your dare"}. Tap "got it ❤️" in the shop`, "shop.html#coupons");
      toast(`Brave! Now ${e.by} says "got it" ❤️`);
    }
    return;
  }
  const thanks = t.closest("[data-coupon-thanks]");
  if (thanks) {
    thanks.disabled = true;
    const id = thanks.dataset.couponThanks;
    if (await shopSave(list => list.map(x => x.id === id && !x.thanked ? { ...x, thanked: { at: nowIso() } } : x), `${NAME} said got it to a dare`)) {
      const e = allPages.find(x => x.id === id);
      notifyPartner(`❤️ ${NAME} loved it`, `+${e.reward || SHOP.COUPON_REWARD} goldies for doing the dare`, "shop.html#coupons");
      const r = thanks.getBoundingClientRect(); burst(r.left + r.width / 2, r.top, 18);
    }
    return;
  }

  // --- backdrop
  if (t.closest("[data-theme-photo]")) { if (todaysTheme(allPages) !== "photo") openPhotoBackdrop(); return; }
  const theme = t.closest("[data-theme-buy]");
  if (theme) {
    const id = theme.dataset.themeBuy, th = SHOP.themes[id];
    if (todaysTheme(allPages) === id) return;
    if (!canBuy(th.price) || !confirm(`${th.emoji} ${th.name} for the rest of today, on both phones? ${th.price} goldies.`)) return;
    if (await buy("theme", th.price, { theme: id }, `${NAME} changed today's backdrop`)) notifyPartner(`🎨 The diary looks different today`, `${NAME} picked ${th.emoji} ${th.name}`, "./");
    return;
  }

  // --- extras
  const gift = t.closest("[data-gift]");
  if (gift) {
    const n = Number(gift.dataset.gift);
    if (!canBuy(n) || !confirm(`Gift ${other()} ${n} of your goldies?`)) return;
    if (await buy("gift", n, { for: other(), amount: n }, `${NAME} gifted ${n} goldies`)) notifyPartner(`🎁 ${NAME} gifted you ${n} goldies`, "Just because ♥", "shop.html");
    return;
  }
  if (t.closest("[data-surprise]")) {
    if (!canBuy(SHOP.SURPRISE)) return;
    const note = prompt(`What should the surprise say? It pops up with hearts the next time ${other()} opens the diary.`, "");
    if (!note || !note.trim()) return;
    if (await buy("surprise", SHOP.SURPRISE, { for: other(), note: note.trim().slice(0, 200) }, `${NAME} left a surprise`)) toast(`Hidden 🤫 It pops up when ${other()} opens the diary`);
    return;
  }
  if (t.closest("[data-superping]")) {
    if (!canBuy(SHOP.SUPERPING)) return;
    const note = prompt(`Your super ping to ${other()}: (it arrives loud)`, "");
    if (!note || !note.trim()) return;
    if (await buy("superping", SHOP.SUPERPING, { for: other(), note: note.trim().slice(0, 140) }, `${NAME} sent a super ping`)) {
      const to = NOTIFY_TOPICS[other()];
      if (to && !LOCAL) fetch("https://ntfy.sh/", { method: "POST", body: JSON.stringify({ topic: to, title: `📣 ${NAME}`, message: note.trim(), priority: 5, tags: ["rotating_light", "love_letter"], click: new URL("./", location.href).href }) }).catch(() => {});
      toast(`📣 Sent to ${other()}`);
    }
    return;
  }
  if (t.closest("[data-shield]")) {
    if (activeShield(allPages, NAME)) return;
    if (!canBuy(SHOP.SHIELD.price) || !confirm(`Switch on a quiet-day shield? No −${Goldies.RULES.PENALTY}s for you for ${SHOP.SHIELD.hours} hours. ${SHOP.SHIELD.price} goldies.`)) return;
    if (await buy("shield", SHOP.SHIELD.price, { hours: SHOP.SHIELD.hours }, `${NAME} switched on a quiet-day shield`)) toast("🛡 Shielded. Rest easy.");
  }
});

(async () => {
  if (await initVault() === "locked") {
    await applyVaultKey(await Vault.lockScreen(VAULT, { title: "Our shop", hint: "Type our secret word to come in." }));
  }
  try { allPages = (await loadIndex()).entries; } catch {}
  renderGoldieBar(allPages);
  setInterval(() => renderGoldieBar(allPages), 60000);
  renderShop();
  startAutoRefresh(list => { allPages = list; renderGoldieBar(allPages); renderShop(); }, allPages);
  if (location.hash) $(location.hash)?.scrollIntoView();
  const mine = NAME && openCoupons(allPages, NAME).filter(e => !e.done);
  if (mine?.length) setTimeout(() => goldiee.say(`${mine[0].by} dared you 😈 brave enough?`, () => $("#coupons").scrollIntoView({ behavior: "smooth" }), "show me →"), 1500);
})();
