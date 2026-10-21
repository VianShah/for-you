/* The shop page: love coupons, Goldiee's wardrobe, today's backdrop, and the extras. */
let allPages = [];
const buyId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const nowIso = () => new Date().toISOString();
const shortDay = at => new Date(at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();

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

/* ---------- love coupons ---------- */
function renderCoupons() {
  const other = NAME ? partnerOf(NAME) : PEOPLE[1];
  $("#couponIntro").textContent = `Made for long distance: buy one for ${other}, and they make it happen from wherever they are. When you tap "got it ❤️", they earn ${SHOP.COUPON_REWARD} goldies for doing it.`;
  const all = buys(allPages, "coupon").sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const forMe = all.filter(e => e.for === NAME && !e.thanked);
  const fromMe = all.filter(e => e.by === NAME && !e.thanked);
  const card = (e, mine) => {
    const c = SHOP.coupons[e.coupon] || { emoji: "💌", name: "a love coupon" };
    const status = e.done ? `done ${shortDay(e.done.at)}` : `bought ${shortDay(e.at)}`;
    const act = mine
      ? (e.done ? `<button class="save" data-coupon-thanks="${esc(e.id)}">got it ❤️ (+${e.reward || SHOP.COUPON_REWARD} for ${esc(e.for)})</button>` : `<p class="hint">Waiting for ${esc(e.for)} to make it happen.</p>`)
      : (e.done ? `<p class="hint">Done ✓ Waiting for ${esc(e.by)} to say "got it".</p>` : `<button class="save" data-coupon-done="${esc(e.id)}">I've done it ✓</button>`);
    return `<div class="coupon-card${mine ? "" : " for-me"}"><div class="coupon-emoji">${c.emoji}</div><div><small>${mine ? `for ${esc(e.for)}` : `from ${esc(e.by)}`} · ${status}</small>
      <b>${esc(c.name)}</b>${e.note ? `<p class="coupon-note">“${esc(e.note)}”</p>` : ""}<div class="game-actions">${act}</div></div></div>`;
  };
  $("#couponTodo").innerHTML =
    (forMe.length ? `<div class="label">for you to make happen</div>${forMe.map(e => card(e, false)).join("")}` : "") +
    (fromMe.length ? `<div class="label">you sent</div>${fromMe.map(e => card(e, true)).join("")}` : "");
  $("#couponShop").innerHTML = `<div class="label">send ${esc(other)} a coupon</div><div class="shop-grid coupons">${Object.entries(SHOP.coupons).map(([id, c]) =>
    `<button type="button" class="shop-item" data-coupon="${id}"><span class="si-emoji">${c.emoji}</span><b>${esc(c.name)}</b><small>${esc(c.hint)}</small><span class="si-price">${c.price} 🪙</span></button>`).join("")}</div>`;
}

/* ---------- Goldiee's wardrobe ---------- */
let trying = null; // the look shown on the big Goldiee (before buying)
function renderWardrobe() {
  const owned = ownedOutfits(allPages), wearing = currentOutfit(allPages), month = new Date().getMonth() + 1;
  const show = trying ?? wearing;
  $("#wardrobeStage").innerHTML = `${goldiee.look(show)}<p class="hint">${show ? `${SHOP.outfits[show].emoji} ${esc(SHOP.outfits[show].name)}${show === wearing ? " · wearing it now" : trying ? " · just trying it on" : ""}` : "her everyday bow"}</p>`;
  const tile = (id, o) => {
    const has = owned.has(id), on = wearing === id;
    const action = on ? `<span class="si-price on">wearing ✓</span>` : has ? `<span class="si-price">put it on</span>` : `<span class="si-price">${o.price} 🪙</span>`;
    return `<button type="button" class="shop-item${on ? " on" : ""}${o.season?.includes(month) ? " season" : ""}" data-outfit="${id}">
      ${o.season?.includes(month) ? `<span class="si-badge">in season ✨</span>` : ""}<span class="si-look">${goldiee.look(id)}</span><b>${esc(o.name)}</b>${action}</button>`;
  };
  // In-season looks first.
  const order = Object.entries(SHOP.outfits).sort(([, a], [, b]) => !!b.season?.includes(month) - !!a.season?.includes(month));
  $("#outfits").innerHTML = order.map(([id, o]) => tile(id, o)).join("") +
    (wearing ? `<button type="button" class="shop-item" data-outfit=""><span class="si-emoji">🎀</span><b>Just her bow</b><span class="si-price">take it off</span></button>` : "");
}

/* ---------- today's backdrop ---------- */
function renderThemes() {
  const today = todaysTheme(allPages);
  const by = today && buys(allPages, "theme").find(e => e.theme === today)?.by;
  $("#themeNow").textContent = today ? `Today it's ${SHOP.themes[today].emoji} ${SHOP.themes[today].name}${by ? `, thanks to ${by}` : ""}. It goes back to normal at midnight.` : "Today's backdrop is the usual one.";
  $("#themes").innerHTML = Object.entries(SHOP.themes).map(([id, t]) =>
    `<button type="button" class="shop-item${today === id ? " on" : ""}" data-theme-buy="${id}"><span class="si-swatch" data-swatch="${id}"></span><b>${t.emoji} ${esc(t.name)}</b><span class="si-price${today === id ? " on" : ""}">${today === id ? "on today ✓" : `${t.price} 🪙`}</span></button>`).join("");
}

/* ---------- extras ---------- */
function renderExtras() {
  const waiting = NAME ? allPages.filter(e => !e.status && e.prompt && !e.together && e.author !== NAME && !answeredBy(allPages, NAME, e.prompt.id) && !peeked(allPages, NAME, e.prompt.id)) : [];
  $("#extrasList").innerHTML = `
    <div class="extra"><span class="si-emoji">👀</span><div><b>Peek at an answer · ${SHOP.PEEK} 🪙</b><p class="hint">See ${esc(NAME ? partnerOf(NAME) : "their")}'s answer to a question without answering it first. Tap “peek” on a blurred answer in the diary.</p>
      ${waiting.length ? `<a class="ghost" href="./">${waiting.length} blurred ${waiting.length === 1 ? "answer" : "answers"} waiting →</a>` : `<p class="hint">Nothing blurred right now.</p>`}</div></div>
    <div class="extra"><span class="si-emoji">🏠</span><div><b>Pin a picture to the love page · ${Goldies.RULES.PIN_COST} 🪙</b><p class="hint">It joins the photo strip on the first page for ${Goldies.RULES.PIN_DAYS} days. Open a picture in the diary and tap “add to home”.</p></div></div>`;
}

function renderShop() { renderCoupons(); renderWardrobe(); renderThemes(); renderExtras(); }

document.addEventListener("click", async ev => {
  const t = ev.target;
  const coupon = t.closest("[data-coupon]");
  if (coupon) {
    const id = coupon.dataset.coupon, c = SHOP.coupons[id], other = partnerOf(NAME);
    if (!canBuy(c.price)) return;
    const note = prompt(`${c.emoji} ${c.name} for ${other}, ${c.price} goldies.\nAdd a little note? (optional)`, "");
    if (note === null) return;
    coupon.disabled = true;
    if (await buy("coupon", c.price, { coupon: id, for: other, note: note.trim().slice(0, 140), reward: SHOP.COUPON_REWARD }, `${NAME} sent a love coupon`)) {
      notifyPartner(`💌 ${NAME} sent you a love coupon`, `${c.emoji} ${c.name}. Make it happen, then tap "I've done it" in the shop`);
    }
    coupon.disabled = false;
    return;
  }
  const done = t.closest("[data-coupon-done]");
  if (done) {
    done.disabled = true;
    const id = done.dataset.couponDone;
    if (await shopSave(list => list.map(x => x.id === id && !x.done ? { ...x, done: { at: nowIso() } } : x), `${NAME} made a love coupon happen`)) {
      const e = allPages.find(x => x.id === id);
      notifyPartner(`💌 ${NAME} made your coupon happen`, `${SHOP.coupons[e.coupon]?.name || "Your coupon"}. Tap "got it ❤️" in the shop`);
      toast(`Lovely. Now ${e.by} says "got it" ❤️`);
    }
    return;
  }
  const thanks = t.closest("[data-coupon-thanks]");
  if (thanks) {
    thanks.disabled = true;
    const id = thanks.dataset.couponThanks;
    if (await shopSave(list => list.map(x => x.id === id && !x.thanked ? { ...x, thanked: { at: nowIso() } } : x), `${NAME} said got it to a love coupon`)) {
      const e = allPages.find(x => x.id === id);
      notifyPartner(`❤️ ${NAME} loved it`, `+${e.reward || SHOP.COUPON_REWARD} goldies for making it happen`);
      const r = thanks.getBoundingClientRect(); burst(r.left + r.width / 2, r.top, 18);
    }
    return;
  }

  const outfit = t.closest("[data-outfit]");
  if (outfit) {
    const id = outfit.dataset.outfit, o = SHOP.outfits[id];
    if (!KEY || !NAME) return toast("Set this phone up in the diary first 🔑");
    if (id && !ownedOutfits(allPages).has(id)) {
      // First tap tries it on; tapping again (while she's wearing it) buys it.
      if (trying !== id) { trying = id; renderWardrobe(); return $("#wardrobeStage").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" }); }
      if (!canBuy(o.price) || !confirm(`Buy ${o.emoji} ${o.name} for Goldiee? ${o.price} goldies, and it's yours to keep.`)) return;
      trying = null;
      if (await buy("outfit", o.price, { outfit: id }, `${NAME} bought Goldiee an outfit`)) {
        goldiee.wear(id);
        notifyPartner(`🐶 Goldiee has a new look`, `${NAME} dressed her up: ${o.emoji} ${o.name}`);
      }
      return;
    }
    trying = null;
    if (currentOutfit(allPages) === id) return renderWardrobe();
    if (await shopSave(list => [{ id: buyId(), type: "wear", outfit: id, by: NAME, at: nowIso() }, ...list], `${NAME} changed Goldiee's look`)) {
      goldiee.wear(id);
      toast(id ? `Goldiee's wearing ${o.emoji} ${o.name}` : "Back to her everyday bow 🎀");
    }
    return;
  }

  const theme = t.closest("[data-theme-buy]");
  if (theme) {
    const id = theme.dataset.themeBuy, th = SHOP.themes[id];
    if (todaysTheme(allPages) === id) return;
    if (!canBuy(th.price) || !confirm(`${th.emoji} ${th.name} for the rest of today, on both phones? ${th.price} goldies.`)) return;
    if (await buy("theme", th.price, { theme: id }, `${NAME} changed today's backdrop`)) {
      notifyPartner(`🎨 The diary looks different today`, `${NAME} picked ${th.emoji} ${th.name}`);
    }
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
  if (location.hash) $(location.hash)?.scrollIntoView();
  const mine = NAME && openCoupons(allPages, NAME).filter(e => !e.done);
  if (mine?.length) setTimeout(() => goldiee.say(`${mine[0].by} sent you a love coupon 💌 make it happen?`, () => $("#coupons").scrollIntoView({ behavior: "smooth" }), "show me →"), 1500);
})();
