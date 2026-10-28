/* ==========================================================
   PARKED: not loaded by any page right now. To bring it back, add
   <script src="booth.js"></script> and the #booth section to games.html,
   call renderBooth() in games.js, and charge BOOTH_COST in goldies.js.

   Photobooth 📸
   One of you opens a booth (costs goldies) and picks a backdrop. Each
   of you takes 4 shots on your own phone, whenever suits you. The phone
   cuts you out of your room (MediaPipe's selfie segmenter, running on
   the phone itself, so the picture never leaves it), and once you both
   have your 4, the booth prints two strips with you side by side.
   Saved in entries.json as
     { type: "booth", by, at, bg, shots: { Vian: [4 paths], Jovena: [4 paths] }, cancelled }
   The cutouts are uploaded like any other picture (encrypted when the
   vault is on); the strips are drawn from them on the phone.
   ========================================================== */
const BOOTH_SHOTS = 4;
const SHOT_W = 480, SHOT_H = 640;
const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MP_MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

/* ---------- backdrops, drawn rather than downloaded ---------- */
const BOOTH_BGS = {
  cafe:   "cosy café ☕",
  beach:  "beach sunset 🌅",
  lights: "fairy lights ✨",
  stars:  "starry night 🌙",
  blush:  "blush hearts 💗",
};
function drawBackdrop(ctx, id, w, h, seed) {
  const r = i => rand(seed + id, i);
  const grad = (stops, x0 = 0, y0 = 0, x1 = 0, y1 = h) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
  const dot = (x, y, rad, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill(); };
  ctx.save();
  if (id === "cafe") {
    ctx.fillStyle = grad([[0, "#6b4330"], [.62, "#8a5a3c"], [.62, "#4a2c1f"], [1, "#3a2117"]]); ctx.fillRect(0, 0, w, h);
    // a window with a warm glow, a shelf of cups, hanging bulbs
    ctx.fillStyle = grad([[0, "#ffd9a0"], [1, "#f4a96a"]], 0, h * .1, 0, h * .45); ctx.fillRect(w * .62, h * .1, w * .3, h * .36);
    ctx.strokeStyle = "#4a2c1f"; ctx.lineWidth = 8; ctx.strokeRect(w * .62, h * .1, w * .3, h * .36);
    ctx.beginPath(); ctx.moveTo(w * .77, h * .1); ctx.lineTo(w * .77, h * .46); ctx.moveTo(w * .62, h * .28); ctx.lineTo(w * .92, h * .28); ctx.stroke();
    ctx.fillStyle = "#3a2117"; ctx.fillRect(w * .05, h * .4, w * .45, 8);
    for (let i = 0; i < 6; i++) { const x = w * .08 + i * w * .07; ctx.fillStyle = ["#f3d9d4", "#fffaf3", "#d97b86"][i % 3]; ctx.fillRect(x, h * .4 - 26, 26, 26); ctx.fillRect(x + 24, h * .4 - 20, 6, 12); }
    for (let i = 0; i < 7; i++) { const x = w * (.06 + i * .15); ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h * .14 + r(i) * 30); ctx.stroke();
      const g = ctx.createRadialGradient(x, h * .16 + r(i) * 30, 2, x, h * .16 + r(i) * 30, 40); g.addColorStop(0, "rgba(255,226,160,.95)"); g.addColorStop(1, "rgba(255,200,120,0)"); ctx.fillStyle = g; ctx.fillRect(x - 40, h * .16 + r(i) * 30 - 40, 80, 80); }
  } else if (id === "beach") {
    ctx.fillStyle = grad([[0, "#f6b48f"], [.35, "#f7c9a3"], [.55, "#fbe3c8"]]); ctx.fillRect(0, 0, w, h * .58);
    dot(w * .5, h * .5, h * .16, "rgba(255,240,200,.95)");
    ctx.fillStyle = grad([[0, "#5fa3b8"], [1, "#2f6f86"]], 0, h * .52, 0, h * .76); ctx.fillRect(0, h * .52, w, h * .24);
    ctx.fillStyle = "rgba(255,255,255,.5)"; for (let i = 0; i < 14; i++) ctx.fillRect(r(i) * w, h * (.55 + r(i + 50) * .18), 20 + r(i + 9) * 40, 2);
    ctx.fillStyle = grad([[0, "#f1d9b5"], [1, "#e2c091"]], 0, h * .74, 0, h); ctx.fillRect(0, h * .74, w, h * .26);
  } else if (id === "lights") {
    ctx.fillStyle = grad([[0, "#2a1420"], [1, "#4a1f33"]]); ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) dot(r(i) * w, r(i + 100) * h, 6 + r(i + 200) * 22, `rgba(255,${190 + r(i + 300) * 50 | 0},${140 + r(i + 400) * 60 | 0},${.08 + r(i + 500) * .14})`);
    for (const row of [.12, .3]) {
      ctx.strokeStyle = "rgba(60,40,30,.8)"; ctx.lineWidth = 2; ctx.beginPath();
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * row + Math.sin(x / w * Math.PI) * 40);
      ctx.stroke();
      for (let x = 20; x < w; x += 46) { const y = h * row + Math.sin(x / w * Math.PI) * 40 + 8;
        const g = ctx.createRadialGradient(x, y, 1, x, y, 18); g.addColorStop(0, "rgba(255,236,170,1)"); g.addColorStop(1, "rgba(255,210,120,0)"); ctx.fillStyle = g; ctx.fillRect(x - 18, y - 18, 36, 36); }
    }
  } else if (id === "stars") {
    ctx.fillStyle = grad([[0, "#0c1030"], [.7, "#2a2350"], [1, "#4b3266"]]); ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 120; i++) dot(r(i) * w, r(i + 1000) * h * .8, .6 + r(i + 2000) * 1.8, `rgba(255,255,255,${.4 + r(i + 3000) * .6})`);
    dot(w * .8, h * .2, 34, "#fdf3d0"); dot(w * .8 + 14, h * .2 - 8, 30, "#0f1334");
    ctx.fillStyle = "#151030"; ctx.beginPath(); ctx.moveTo(0, h); for (let x = 0; x <= w; x += 20) ctx.lineTo(x, h * .86 - Math.sin(x / 70) * 14 - r(x) * 10); ctx.lineTo(w, h); ctx.fill();
  } else {
    ctx.fillStyle = grad([[0, "#fbe3e1"], [1, "#f1bfc4"]]); ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(217,123,134,.25)";
    for (let i = 0; i < 22; i++) { const s = 10 + r(i) * 24, x = r(i + 40) * w, y = r(i + 80) * h;
      ctx.save(); ctx.translate(x, y); ctx.rotate((r(i + 120) - .5) * .8); ctx.scale(s / 24, s / 24); ctx.translate(-12, -12); ctx.fill(new Path2D(HEART)); ctx.restore(); }
  }
  ctx.restore();
}

/* ---------- cutting you out of your room ---------- */
let segmenterP = null;
function getSegmenter() {
  return segmenterP ||= (async () => {
    const v = await import(`${MP}/vision_bundle.mjs`);
    const files = await v.FilesetResolver.forVisionTasks(`${MP}/wasm`);
    return v.ImageSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetPath: MP_MODEL }, runningMode: "IMAGE", outputConfidenceMasks: true, outputCategoryMask: false,
    });
  })().catch(e => { segmenterP = null; throw e; });
}
// Person-ness of every pixel, 0…1. Falls back to a soft oval if the segmenter can't load.
async function personMask(shot) {
  const W = shot.width, H = shot.height, a = new Float32Array(W * H);
  try {
    const seg = await getSegmenter();
    const res = seg.segment(shot);
    const m = res.confidenceMasks[res.confidenceMasks.length - 1];
    const d = m.getAsFloat32Array(), mw = m.width, mh = m.height;
    // Smoothly scaled up from the mask's own size, so edges don't look blocky.
    for (let y = 0; y < H; y++) {
      const fy = Math.max(0, (y + .5) * mh / H - .5), y0 = Math.min(mh - 1, fy | 0), y1 = Math.min(mh - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < W; x++) {
        const fx = Math.max(0, (x + .5) * mw / W - .5), x0 = Math.min(mw - 1, fx | 0), x1 = Math.min(mw - 1, x0 + 1), tx = fx - x0;
        const top = d[y0 * mw + x0] * (1 - tx) + d[y0 * mw + x1] * tx, bot = d[y1 * mw + x0] * (1 - tx) + d[y1 * mw + x1] * tx;
        a[y * W + x] = top * (1 - ty) + bot * ty;
      }
    }
    res.confidenceMasks.forEach(x => x.close());
    // Some model versions mark the background instead: the middle of a selfie should be a person.
    const avg = (x0, x1, y0, y1) => { let s = 0, n = 0; for (let y = y0; y < y1; y += 4) for (let x = x0; x < x1; x += 4) { s += a[y * W + x]; n++; } return s / n; };
    if (avg(W * .35 | 0, W * .65 | 0, H * .3 | 0, H * .7 | 0) < avg(0, W * .1 | 0, 0, H * .3 | 0)) for (let i = 0; i < a.length; i++) a[i] = 1 - a[i];
    return { a, real: true };
  } catch (err) {
    console.warn("cutout fallback", err);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x - W / 2) / (W * .42), dy = (y - H * .55) / (H * .5);
      a[y * W + x] = Math.max(0, Math.min(1, (1 - Math.hypot(dx, dy)) * 6));
    }
    return { a, real: false };
  }
}
async function cutOut(shot) {
  const { a, real } = await personMask(shot);
  const c = document.createElement("canvas"); c.width = shot.width; c.height = shot.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(shot, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const smooth = t => { t = Math.max(0, Math.min(1, (t - .3) / .4)); return t * t * (3 - 2 * t); };
  // Fade out towards the sides and top of the shot, so nobody ends in a hard straight line.
  const W = c.width, H = c.height, edge = (d, n) => Math.min(1, d / n);
  for (let i = 0; i < a.length; i++) {
    const x = i % W, y = i / W | 0;
    img.data[i * 4 + 3] = 255 * smooth(a[i]) * edge(Math.min(x, W - 1 - x), W * .08) * edge(y, H * .05);
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: c, real };
}

/* ---------- a frame and a strip ---------- */
const FRAME_W = 600, FRAME_H = 450, STRIP_M = 24, STRIP_FOOT = 100;
// pics: [left cutout, right cutout] (images or canvases); either can be missing.
function drawFrame(ctx, bg, seed, pics) {
  drawBackdrop(ctx, bg, FRAME_W, FRAME_H, seed);
  const h = FRAME_H * .95, w = h * SHOT_W / SHOT_H;
  const spots = pics.length === 1 ? [.5] : [.3, .7];
  pics.forEach((p, i) => p && ctx.drawImage(p, FRAME_W * spots[i] - w / 2, FRAME_H - h, w, h));
}
const boothImgs = new Map();
const boothImg = path => { if (!boothImgs.has(path)) boothImgs.set(path, loadImg(path).catch(e => { boothImgs.delete(path); throw e; })); return boothImgs.get(path); };
async function drawStrip(e, left) {
  const right = partnerOf(left);
  const c = document.createElement("canvas");
  c.width = FRAME_W + STRIP_M * 2; c.height = STRIP_M + BOOTH_SHOTS * (FRAME_H + STRIP_M) + STRIP_FOOT;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fffaf3"; ctx.fillRect(0, 0, c.width, c.height);
  const [L, R] = await Promise.all([left, right].map(p => Promise.all(e.shots[p].map(boothImg))));
  const f = document.createElement("canvas"); f.width = FRAME_W; f.height = FRAME_H;
  for (let i = 0; i < BOOTH_SHOTS; i++) {
    drawFrame(f.getContext("2d"), e.bg, e.id + i, [L[i], R[i]]);
    ctx.drawImage(f, STRIP_M, STRIP_M + i * (FRAME_H + STRIP_M));
  }
  await Promise.all([document.fonts.load('52px "Pinyon Script"'), document.fonts.load('18px "Jost"')]).catch(() => {});
  const y = c.height - STRIP_FOOT + 10;
  ctx.textAlign = "center"; ctx.fillStyle = "#6e2337";
  ctx.font = '52px "Pinyon Script", cursive'; ctx.fillText(`${left} & ${right}`, c.width / 2, y + 44);
  ctx.font = '300 18px "Jost", sans-serif'; ctx.fillStyle = "#9a7a7f";
  ctx.fillText(new Date(e.at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }).toLowerCase() + " · for you", c.width / 2, y + 76);
  return c;
}
const stripUrls = new Map();
async function stripUrl(e, left) {
  const k = e.id + left;
  if (!stripUrls.has(k)) stripUrls.set(k, drawStrip(e, left).then(c => new Promise(res => c.toBlob(b => res(URL.createObjectURL(b)), "image/jpeg", .9))));
  return stripUrls.get(k);
}

/* ---------- the list ---------- */
const boothList = () => allPages.filter(e => e.type === "booth" && !e.cancelled).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
const boothHas = (e, p) => (e.shots?.[p] || []).length === BOOTH_SHOTS;
const boothReady = e => PEOPLE.every(p => boothHas(e, p));
let boothDraft = null; // { bg } while choosing a backdrop
function boothCard(e) {
  const who = PEOPLE.map(p => `<span class="${boothHas(e, p) ? "done" : ""}">${boothHas(e, p) ? "✓" : "…"} ${esc(p)}</span>`).join("");
  const mine = NAME && !boothHas(e, NAME);
  const nobody = PEOPLE.every(p => !(e.shots?.[p] || []).length);
  return `<div class="booth-card"><small>${esc(BOOTH_BGS[e.bg] || "")} · opened by ${e.by === NAME ? "you" : esc(e.by)}</small>
    <div class="who-answered">${who}</div>
    <div class="game-actions">${mine && KEY ? `<button class="save" data-booth-shoot="${esc(e.id)}">take my ${BOOTH_SHOTS} 📸</button>` : `<p class="hint">Waiting for ${esc(partnerOf(NAME))} to take theirs. Then it prints!</p>`}
    ${nobody && e.by === NAME ? `<button class="ghost quiet-btn" data-booth-cancel="${esc(e.id)}">close it (goldies back)</button>` : ""}</div></div>`;
}
function renderBooth() {
  if (!$("#booth")) return;
  const list = boothList(), open = list.filter(e => !boothReady(e)), done = list.filter(boothReady);
  $("#boothOpen").innerHTML = open.map(boothCard).join("");
  const cost = Goldies.RULES.BOOTH_COST;
  const start = $("#boothStart");
  if (!KEY || !NAME) start.innerHTML = `<p class="hint">Set this phone up in the diary to play.</p>`;
  else if (!boothDraft) start.innerHTML = `<div class="game-actions"><button class="save" id="boothNew">open a photobooth · ${cost} 🪙</button></div>`;
  else start.innerHTML = `<div class="race-setup"><div class="label">pick a backdrop</div>
    <div class="booth-bgs">${Object.entries(BOOTH_BGS).map(([id, label]) => `<button type="button" class="${boothDraft.bg === id ? "on" : ""}" data-booth-bg="${id}"><canvas width="${FRAME_W}" height="${FRAME_H}" data-bg-preview="${id}"></canvas><span>${esc(label)}</span></button>`).join("")}</div>
    <p class="hint">Costs ${cost} goldies, paid by you. You each take ${BOOTH_SHOTS} shots on your own phone, then it prints a strip for each of you.</p>
    <div class="game-actions"><button class="save" id="boothOpenBtn">open it & take my ${BOOTH_SHOTS} 📸</button><button class="ghost quiet-btn" id="boothCancelDraft">cancel</button></div></div>`;
  $$("[data-bg-preview]", start).forEach(c => drawBackdrop(c.getContext("2d"), c.dataset.bgPreview, FRAME_W, FRAME_H, "preview"));
  $("#boothDone").innerHTML = done.length ? `<div class="booth-strips">${done.slice(0, 12).map(e => `<button type="button" class="booth-thumb" data-booth-view="${esc(e.id)}"><img src="${BLANK}" alt="photobooth strip" data-strip="${esc(e.id)}"></button>`).join("")}</div>` : "";
  $$("[data-strip]").forEach(async img => {
    const e = allPages.find(x => x.id === img.dataset.strip);
    try { img.src = await stripUrl(e, NAME || PEOPLE[0]); } catch { img.alt = "couldn't print this one"; }
  });
  // A booth that finished since this phone last looked prints right here.
  const seen = store.get("booth-printed").split(",");
  const fresh = NAME && done.find(e => !seen.includes(e.id));
  if (fresh && !$(".booth-print")) printBooth(fresh);
}

/* ---------- printing ---------- */
async function printBooth(e, replay = false) {
  if (!replay) store.set("booth-printed", [e.id, ...store.get("booth-printed").split(",").filter(Boolean)].slice(0, 50).join(","));
  const back = document.createElement("div");
  back.className = "sheet-back booth-print";
  back.innerHTML = `<div class="printer"><div class="printer-top"><span class="printer-light"></span>photobooth</div><div class="printer-slot"></div>
    <div class="printer-out"><p class="hint printing">printing…</p></div></div>
    <div class="game-actions booth-print-actions" hidden></div>`;
  document.body.appendChild(back);
  const order = NAME ? [NAME, partnerOf(NAME)] : PEOPLE;
  let urls;
  try { urls = await Promise.all(order.map(p => stripUrl(e, p))); } catch { back.remove(); return toast("Couldn't print this one."); }
  $(".printer-out", back).innerHTML = urls.map((u, i) => `<img class="strip" style="animation-delay:${.3 + i * 1.6}s" src="${u}" alt="strip">`).join("");
  $(".printer", back).classList.add("whirr");
  const acts = $(".booth-print-actions", back);
  acts.innerHTML = order.map((p, i) => `<a class="save" download="photobooth-${p.toLowerCase()}-${e.id}.jpg" href="${urls[i]}">⬇ ${p === NAME ? "my" : `${esc(p)}'s`} strip</a>`).join("") + `<button class="ghost" data-booth-close>close</button>`;
  setTimeout(() => { acts.hidden = false; $(".printer", back)?.classList.remove("whirr"); const r = back.getBoundingClientRect(); burst(r.width / 2, r.height / 3, 20); }, reduceMotion ? 0 : 3600);
  back.addEventListener("click", ev => { if (ev.target === back || ev.target.closest("[data-booth-close]")) back.remove(); });
}

/* ---------- taking the shots ---------- */
async function shootBooth(e) {
  const back = document.createElement("div");
  back.className = "sheet-back booth-cam";
  back.innerHTML = `<div class="sheet booth-sheet"><div class="sheet-head"><h2>Say cheese</h2><button type="button" class="icon-btn close" data-cam-close>✕</button></div>
    <div class="cam-stage"><video playsinline muted autoplay></video><div class="cam-count"></div><div class="cam-flash"></div></div>
    <div class="cam-thumbs">${Array.from({ length: BOOTH_SHOTS }, () => `<i></i>`).join("")}</div>
    <p class="hint cam-msg">${BOOTH_SHOTS} shots, 3 seconds apart. Strike a different pose each time ✨</p>
    <div class="game-actions cam-actions"><button class="save" data-cam-go>start 📸</button></div></div>`;
  document.body.appendChild(back);
  getSegmenter().catch(() => {}); // start loading while you get ready
  let stream;
  const stop = () => { stream?.getTracks().forEach(t => t.stop()); back.remove(); };
  back.addEventListener("click", ev => { if (ev.target.closest("[data-cam-close]")) stop(); });
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 1280 } }, audio: false });
  } catch { stop(); return toast("The camera didn't open. Allow camera access and try again."); }
  const video = $("video", back);
  video.srcObject = stream;
  await video.play().catch(() => {});
  const msg = $(".cam-msg", back), acts = $(".cam-actions", back);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // One mirrored, 3:4 frame from the camera, like a mirror.
  const grab = () => {
    const c = document.createElement("canvas"); c.width = SHOT_W; c.height = SHOT_H;
    const vw = video.videoWidth, vh = video.videoHeight, scale = Math.max(SHOT_W / vw, SHOT_H / vh);
    const ctx = c.getContext("2d");
    ctx.translate(SHOT_W, 0); ctx.scale(-1, 1);
    ctx.drawImage(video, (SHOT_W - vw * scale) / 2, (SHOT_H - vh * scale) / 2, vw * scale, vh * scale);
    return c;
  };
  let shots = [];
  const run = async () => {
    shots = [];
    acts.innerHTML = "";
    $$(".cam-thumbs i", back).forEach(i => { i.innerHTML = ""; });
    $(".cam-stage", back).classList.remove("preview");
    const count = $(".cam-count", back), flash = $(".cam-flash", back);
    for (let i = 0; i < BOOTH_SHOTS; i++) {
      msg.textContent = `shot ${i + 1} of ${BOOTH_SHOTS}`;
      for (const n of [3, 2, 1]) { count.textContent = n; count.classList.remove("pop"); void count.offsetWidth; count.classList.add("pop"); await wait(1000); }
      count.textContent = "";
      const shot = grab(); shots.push(shot);
      flash.classList.remove("go"); void flash.offsetWidth; flash.classList.add("go");
      $$(".cam-thumbs i", back)[i].appendChild(shot.cloneNode()).getContext("2d").drawImage(shot, 0, 0);
      await wait(500);
    }
    msg.textContent = "cutting you out of your room… ✂️";
    const cuts = [];
    let real = true;
    for (const s of shots) { const r = await cutOut(s); cuts.push(r.canvas); real &&= r.real; }
    // Show what the booth will use: you on the backdrop.
    stream.getTracks().forEach(t => t.enabled = false);
    $(".cam-stage", back).classList.add("preview");
    const pv = document.createElement("canvas"); pv.width = FRAME_W; pv.height = FRAME_H; pv.className = "cam-preview";
    $(".cam-stage", back).querySelector(".cam-preview")?.remove();
    $(".cam-stage", back).appendChild(pv);
    let k = 0;
    const show = () => drawFrame(pv.getContext("2d"), e.bg, e.id + k, [cuts[k]]);
    show();
    $$(".cam-thumbs i", back).forEach((el, i) => { el.onclick = () => { k = i; show(); }; });
    msg.textContent = real ? "Here you are. Tap the little ones to see each shot." : "Couldn't cut out the background on this phone, so you'll be in a soft frame instead.";
    acts.innerHTML = `<button class="save" data-cam-use>use these 💌</button><button class="ghost" data-cam-again>retake ↻</button>`;
    return cuts;
  };
  let cuts = null;
  back.addEventListener("click", async ev => {
    if (ev.target.closest("[data-cam-go]")) { cuts = await run(); }
    if (ev.target.closest("[data-cam-again]")) { stream.getTracks().forEach(t => t.enabled = true); cuts = await run(); }
    const use = ev.target.closest("[data-cam-use]");
    if (use && cuts) {
      use.disabled = true;
      try {
        const paths = [];
        for (let i = 0; i < cuts.length; i++) {
          msg.textContent = `sending shot ${i + 1} of ${cuts.length}…`;
          const blob = await new Promise(r => cuts[i].toBlob(r, "image/png"));
          const packed = await packMedia(`${MEDIA_DIR}${e.id}-${NAME.toLowerCase()}-${i + 1}.png`, blob);
          await putFile(packed.path, packed.b64, `Photobooth shot from ${NAME}`).catch(err => { if (err.status !== 422) throw err; }); // 422: already there from an earlier try
          paths.push(packed.path);
        }
        msg.textContent = "into the booth…";
        const ok = await gameSave(list => list.map(x => x.id === e.id && !boothHas(x, NAME) ? { ...x, shots: { ...x.shots, [NAME]: paths } } : x), `${NAME} took their photobooth shots`, renderBooth);
        if (!ok) { use.disabled = false; return; }
        stop();
        const now = allPages.find(x => x.id === e.id);
        if (!boothReady(now)) { notifyPartner(`📸 ${NAME} is in the photobooth`, "Your turn: take your 4 in the mini games"); toast(`Done! Now ${partnerOf(NAME)} takes theirs 📸`); }
        else notifyPartner("📸 Your photobooth strips are printed!", "Come and see them in the mini games");
      } catch (err) { msg.textContent = err.message; use.disabled = false; }
    }
  });
}

document.addEventListener("click", async ev => {
  const t = ev.target;
  if (t.closest("#boothNew")) {
    if (myPoints(allPages) < Goldies.RULES.BOOTH_COST) return toast(`You need ${Goldies.RULES.BOOTH_COST} goldies to open the booth.`);
    boothDraft = { bg: "lights" }; return renderBooth();
  }
  if (t.closest("#boothCancelDraft")) { boothDraft = null; return renderBooth(); }
  const bg = t.closest("[data-booth-bg]");
  if (bg) { boothDraft.bg = bg.dataset.boothBg; $$("[data-booth-bg]").forEach(b => b.classList.toggle("on", b === bg)); return; }
  if (t.closest("#boothOpenBtn")) {
    if (myPoints(allPages) < Goldies.RULES.BOOTH_COST) return toast(`You need ${Goldies.RULES.BOOTH_COST} goldies to open the booth.`);
    t.closest("button").disabled = true;
    const booth = { id: gameId(), type: "booth", by: NAME, at: new Date().toISOString(), bg: boothDraft.bg, shots: {} };
    if (await gameSave(list => [booth, ...list], `${NAME} opened a photobooth`, () => { boothDraft = null; renderBooth(); })) {
      toast(`−${Goldies.RULES.BOOTH_COST} goldies · the booth is open 📸`);
      shootBooth(booth);
    } else t.closest("button").disabled = false;
    return;
  }
  const shoot = t.closest("[data-booth-shoot]");
  if (shoot) return shootBooth(allPages.find(x => x.id === shoot.dataset.boothShoot));
  const cancel = t.closest("[data-booth-cancel]");
  if (cancel) {
    if (!confirm("Close this booth? Your goldies come back.")) return;
    cancel.disabled = true;
    await gameSave(list => list.map(x => x.id === cancel.dataset.boothCancel && !PEOPLE.some(p => (x.shots?.[p] || []).length) ? { ...x, cancelled: { by: NAME, at: new Date().toISOString() } } : x), `${NAME} closed a photobooth`, renderBooth);
    return;
  }
  const view = t.closest("[data-booth-view]");
  if (view) printBooth(allPages.find(x => x.id === view.dataset.boothView), true);
});
