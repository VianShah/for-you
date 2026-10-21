/* One page, opened: replies (text, a voice note or a picture), download / share,
   and archive / recycle bin. Replies are kept inside the page (entry.replies), so
   they never stretch the wall; the wall only shows 💬 when there are replies you
   haven't opened yet.
   Uses the helpers and state from core.js and diary.js. */
let openId = null;
const reply = { photo: null, video: null, voice: null, voiceMime: "", duration: 0 };
const fileCache = new Map(); // path → Promise<File>, ready before the share sheet needs it
const kindOf = e => e.prompt ? "answer" : e.type === "note" ? "note" : e.type === "photo" ? "picture" : e.type === "video" ? "video" : "voice note";
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const when = at => new Date(at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
const nowIso = () => new Date().toISOString();

/* ---------- opening and drawing a page ---------- */
function openPost(id) {
  const e = entries.find(x => x.id === id); if (!e) return;
  if (isLocked(e)) return startAnswer(e.prompt);
  openId = id;
  const hadUnread = unreadReplies(e);
  markRead(id); // its 💬 goes away once you've seen the replies
  renderPost();
  openSheet("#postBack");
  if (hadUnread) render();
}
function closePost() {
  openId = null;
  stopReplyRecording();
  resetReply();
  if (playingBtn?.closest("#postBack")) { player.pause(); stopPlaying(); }
}

function renderPost() {
  const e = entries.find(x => x.id === openId);
  if (!e) { $("#postBack").hidden = true; return closePost(); }
  $("#postTitle").textContent = e.status === "binned" ? "In the bin" : e.status === "archived" ? "In the archive" : `${e.author}'s ${kindOf(e)}`;
  $("#postCard").innerHTML = cardHtml(e, true);

  const a = [];
  if (e.media) {
    a.push(`<button type="button" class="ghost" data-act="download">⬇ download</button>`);
    if (navigator.share) a.push(`<button type="button" class="ghost" data-act="share">↗ share</button>`);
    if (!fileCache.has(e.media)) fileCache.set(e.media, fileFor(e.media, fileName(e, e.media)));
  }
  if (e.type === "note") a.push(`<button type="button" class="ghost" data-act="copy">📋 copy text</button>`);
  // Spend goldies to put a picture on the love page's photo strip.
  if (KEY && NAME && e.type === "photo" && !e.status) {
    const until = e.pin && new Date(Date.parse(e.pin.at) + Goldies.RULES.PIN_DAYS * 864e5).toLocaleString("en-GB", { weekday: "short", hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
    a.push(Goldies.pinLive(e.pin) ? `<button type="button" class="ghost pinned" data-act="unpin">🏠 on the home screen till ${until} · remove</button>`
                 : `<button type="button" class="ghost" data-act="pin">🏠 ${e.pin ? "back on" : "add to"} home for ${Goldies.RULES.PIN_DAYS} days · ${Goldies.RULES.PIN_COST} 🪙</button>`);
  }
  // Pin any page to the top of the wall for a day (the shop's 📌).
  if (KEY && NAME && !e.status) {
    const top = pinnedToTop(entries).find(p => p.page === e.id);
    a.push(top ? `<span class="ghost pinned">📌 pinned to the top by ${esc(top.by)}</span>` : `<button type="button" class="ghost" data-act="pintop">📌 pin to the top for a day · ${SHOP.PINTOP.price} 🪙</button>`);
  }
  if (KEY) {
    if (!e.status) a.push(`<button type="button" class="ghost" data-act="archive">🗂 archive</button>`, `<button type="button" class="ghost" data-act="bin">🗑 remove</button>`);
    if (e.status === "archived") a.push(`<button type="button" class="ghost" data-act="wall">↩ back to the wall</button>`, `<button type="button" class="ghost" data-act="bin">🗑 move to bin</button>`);
    if (e.status === "binned") a.push(`<button type="button" class="ghost" data-act="wall">↩ restore</button>`, `<button type="button" class="ghost danger" data-act="forever">✕ delete forever</button>`);
  }
  $("#postActions").innerHTML = a.join("");

  const rs = e.replies || [];
  $("#repliesLabel").textContent = rs.length ? `${rs.length} ${rs.length === 1 ? "reply" : "replies"}` : "no replies yet";
  $("#replies").innerHTML = rs.map(replyHtml).join("");
  $("#replyForm").hidden = !KEY || e.status === "binned";
  hydrateMedia($("#postBack"));
}

function replyHtml(r) {
  const mine = r.by === NAME;
  let media = "";
  if (r.kind === "photo") media = `<img class="reply-img" ${imgSrcAttrs(r.media)} data-path="${esc(r.media)}" alt="a picture reply">`;
  if (r.kind === "video") media = `<div class="vbox reply-vbox ${r.shape === "wide" ? "wide" : "tall"}">${videoHtml(r.media, "", r.thumb)}</div>`;
  if (r.kind === "voice") media = `<div class="reply-voice"><button type="button" class="play" data-rplay="${esc(r.media)}" aria-label="Play">▶</button><div class="bar"><i></i></div><span class="dur">${fmtDur(r.duration)}</span></div>`;
  const remove = mine && KEY ? ` · <button type="button" class="link-btn" data-rdel="${esc(r.id)}">remove</button>` : "";
  const heart = r.hearts?.length ? `<span class="reply-heart" title="❤️ from ${esc(r.hearts.join(" & "))}">❤️</span>` : "";
  return `<div class="reply ${mine ? "mine" : "theirs"}${isFresh(r.at, r.by) ? " fresh" : ""}" data-rid="${esc(r.id)}">${heart}${media}${r.text ? `<p>${esc(r.text)}</p>` : ""}<small>${esc(r.by)} · ${when(r.at)}${remove}</small></div>`;
}

/* ---------- download & share ---------- */
function fileName(e, path) {
  const ext = path.replace(/\.enc$/, "").split(".").pop();
  return `${(e.author || "us").replace(/[^a-z0-9&]+/gi, "-")}-${new Date(e.at).toISOString().slice(0, 10)}.${ext}`;
}
async function fileFor(path, name) {
  const blob = await (await fetch(await playableUrl(path))).blob(); // decrypted when the vault is on
  return new File([blob], name, { type: Vault.mimeOf(path) });
}
async function downloadFile(path, name) {
  try {
    const f = await (fileCache.get(path) || fileFor(path, name));
    const u = URL.createObjectURL(f);
    const a = Object.assign(document.createElement("a"), { href: u, download: f.name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 10000);
    toast("Downloading ⬇");
  } catch { toast("Couldn't download this one."); }
}
// On iPhone the share sheet has "Save Image", which puts it straight into Photos.
async function shareFile(path, name) {
  try {
    const f = await (fileCache.get(path) || fileFor(path, name));
    if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f] });
    else downloadFile(path, name);
  } catch (err) { if (err.name !== "AbortError") toast("Couldn't share this one."); }
}

/* ---------- archive, recycle bin, delete forever ---------- */
async function moveTo(e, status, message) {
  entries = await updateIndex(list => list.map(x => {
    if (x.id !== e.id) return x;
    const { status: _s, archivedAt: _a, binnedAt: _b, ...rest } = x;
    if (status === "archived") return { ...rest, status, archivedAt: nowIso() };
    if (status === "binned") return { ...rest, status, binnedAt: nowIso() };
    return rest; // back on the wall
  }), message);
  render();
}
function mediaOf(e) {
  return [{ path: e.media, sha: e.mediaSha }, ...(e.replies || []).map(r => ({ path: r.media, sha: r.mediaSha }))].filter(m => m.path);
}
function deleteMediaOf(e) {
  mediaOf(e).forEach(async m => {
    const sha = m.sha || await shaOf(m.path);
    if (sha) deleteFile(m.path, sha, "Delete a file for good").catch(() => {});
  });
}
async function deleteForever(e) {
  entries = await updateIndex(list => list.filter(x => x.id !== e.id), `Delete a page for good`);
  deleteMediaOf(e);
  render();
}
// Pages in the bin for 100 days are deleted for good, the next time either phone opens the diary.
async function emptyOldBin() {
  if (!KEY) return;
  const expired = entries.filter(e => e.status === "binned" && binDaysLeft(e) === 0);
  if (!expired.length) return;
  const ids = new Set(expired.map(e => e.id));
  try {
    entries = await updateIndex(list => list.filter(x => !ids.has(x.id)), `Empty the bin (${BIN_DAYS} days)`);
    expired.forEach(deleteMediaOf);
    render();
  } catch {}
}

/* ---------- everything you can tap inside an open page ---------- */
$("#postBack").addEventListener("click", async ev => {
  const e = entries.find(x => x.id === openId); if (!e) return;
  const bubble = ev.target.closest(".reply"), onCard = ev.target.closest(".post-card .card");
  const tapKey = bubble ? "r:" + bubble.dataset.rid : onCard ? "p:" + e.id : null;
  if (tapKey && !ev.target.closest("button, a, audio")) {
    if (isDoubleTap(tapKey)) { clearTimeout(tapTimer); return toggleHeart(e.id, bubble?.dataset.rid, ev.clientX, ev.clientY); }
    const img = ev.target.closest(".post-card img, .reply-img");
    if (img) { clearTimeout(tapTimer); tapTimer = setTimeout(() => openLightbox(img.src, img.dataset.path || e.media, fileName(e, img.dataset.path || e.media)), DOUBLE_TAP_MS); }
    return;
  }
  const play = ev.target.closest("[data-play]");
  if (play) return togglePlay(play, e.media);
  const rplay = ev.target.closest("[data-rplay]");
  if (rplay) return togglePlay(rplay, rplay.dataset.rplay);

  const rdel = ev.target.closest("[data-rdel]");
  if (rdel) {
    if (!confirm("Remove this reply?")) return;
    const r = (e.replies || []).find(x => x.id === rdel.dataset.rdel);
    try {
      entries = await updateIndex(list => list.map(x => x.id === e.id ? { ...x, replies: (x.replies || []).filter(y => y.id !== r.id) } : x), "Remove a reply");
      if (r?.media) deleteMediaOf({ replies: [r] });
      render(); renderPost();
    } catch (err) { toast(err.message); }
    return;
  }

  const act = ev.target.closest("[data-act]")?.dataset.act;
  if (!act) return;
  try {
    if (act === "download") return downloadFile(e.media, fileName(e, e.media));
    if (act === "share") return shareFile(e.media, fileName(e, e.media));
    if (act === "copy") { await navigator.clipboard.writeText([e.title, e.text].filter(Boolean).join("\n\n")); return toast("Copied 📋"); }
    if (act === "pin") {
      const have = myPoints(entries), cost = Goldies.RULES.PIN_COST;
      if (have < cost) return toast(`You need ${cost} goldies for this. You have ${have} 🪙`);
      if (!confirm(`Spend ${cost} goldies to put this picture on the love page for ${Goldies.RULES.PIN_DAYS} days?`)) return;
      const img = $("#postCard img");
      const wide = !!(img && img.naturalWidth > img.naturalHeight);
      // An expired pin moves to the history (it was paid for), and the new one starts its own 3 days.
      entries = await updateIndex(list => list.map(x => x.id === e.id ? { ...x, pin: { by: NAME, at: nowIso(), wide }, pinHistory: x.pin ? [...(x.pinHistory || []), x.pin] : x.pinHistory } : x), `${NAME} pinned a picture to the home screen`);
      notifyPartner(`${NAME} pinned a picture to the home screen 🏠`, `It's in the photo strip on the love page for ${Goldies.RULES.PIN_DAYS} days.`);
      render(); renderPost();
      return toast(`On the home screen 🏠  −${cost} 🪙`);
    }
    if (act === "pintop") {
      const cost = SHOP.PINTOP.price, have = myPoints(entries);
      if (have < cost) return toast(`You need ${cost} goldies for this. You have ${have} 🪙`);
      if (!confirm(`Spend ${cost} goldies to keep this page at the top of the diary for ${SHOP.PINTOP.hours} hours?`)) return;
      const buy = { id: newId(), type: "buy", item: "pintop", page: e.id, by: NAME, at: nowIso(), cost, hours: SHOP.PINTOP.hours };
      entries = await updateIndex(list => [buy, ...list], `${NAME} pinned a page to the top`);
      notifyPartner(`📌 ${NAME} pinned a page to the top`, "Open the diary to see it.");
      render(); renderPost();
      return toast(`📌 At the top for a day · −${cost} 🪙`);
    }
    if (act === "unpin") {
      if (!confirm("Take this picture off the love page? The goldies aren't given back.")) return;
      entries = await updateIndex(list => list.map(x => { if (x.id !== e.id) return x; const { pin, ...rest } = x; return { ...rest, pinHistory: [...(x.pinHistory || []), pin] }; }), "Unpin a picture");
      render(); return renderPost();
    }
    if (act === "archive") { await moveTo(e, "archived", "Archive a page"); toast("Moved to the archive 🗂"); return closeSheet($("#postBack")); }
    if (act === "bin") {
      if (!confirm(`Move this to the bin? It stays there for ${BIN_DAYS} days, then it's deleted for good.`)) return;
      await moveTo(e, "binned", "Move a page to the bin"); toast("Moved to the bin 🗑"); return closeSheet($("#postBack"));
    }
    if (act === "wall") { await moveTo(e, null, "Put a page back on the wall"); toast("Back on the wall ♥"); return renderPost(); }
    if (act === "forever") {
      if (!confirm("Delete this page forever? This can't be undone.")) return;
      await deleteForever(e); toast("Deleted for good"); return closeSheet($("#postBack"));
    }
  } catch (err) { toast(err.message); }
});

/* ---------- double-tap ❤️ (pages and replies) ---------- */
const DOUBLE_TAP_MS = 300;
let tapTimer = null, lastTap = { key: null, t: 0 };
function isDoubleTap(key) {
  const now = Date.now(), dbl = lastTap.key === key && now - lastTap.t < DOUBLE_TAP_MS;
  lastTap = dbl ? { key: null, t: 0 } : { key, t: now };
  return dbl;
}
// On the wall a single tap opens the page, but waits a moment in case it's a double tap.
function tapCard(card, ev) {
  const id = card.dataset.id;
  if (isDoubleTap("c:" + id)) { clearTimeout(tapTimer); return toggleHeart(id, null, ev.clientX, ev.clientY); }
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => openPost(id), DOUBLE_TAP_MS);
}
async function toggleHeart(eid, rid, x, y) {
  if (!canWrite()) return;
  const e = entries.find(z => z.id === eid); if (!e) return;
  const target = rid ? (e.replies || []).find(r => r.id === rid) : e;
  if (!target) return;
  const adding = !(target.hearts || []).includes(NAME);
  if (adding) { burst(x, y, 12); if (navigator.vibrate) navigator.vibrate(15); }
  const flip = arr => (arr || []).includes(NAME) ? arr.filter(n => n !== NAME) : [...(arr || []), NAME];
  try {
    entries = await updateIndex(list => list.map(z => z.id !== eid ? z
      : rid ? { ...z, replies: (z.replies || []).map(r => r.id === rid ? { ...r, hearts: flip(r.hearts) } : r) }
      : { ...z, hearts: flip(z.hearts) }), adding ? `${NAME} ❤️ a ${rid ? "reply" : "page"}` : `${NAME} took back a ❤️`);
    const owner = rid ? target.by : (target.by || target.author);
    if (adding && owner !== NAME) notifyPartner(`${NAME} ❤️ your ${rid ? "reply" : kindOf(e)}`, "Open the diary to see it.");
    render(); if (openId) renderPost();
  } catch (err) { toast(err.message); }
}

/* ---------- lightbox, with download ---------- */
let lbFile = null;
function openLightbox(src, path, name) {
  const lb = $("#lightbox");
  $("img", lb).src = src;
  lbFile = { path, name };
  if (path && !fileCache.has(path)) fileCache.set(path, fileFor(path, name));
  $("#lbShare").hidden = !navigator.share;
  lb.hidden = false;
}
$("#lightbox").addEventListener("click", ev => {
  if (ev.target.closest("#lbDownload")) return lbFile && downloadFile(lbFile.path, lbFile.name);
  if (ev.target.closest("#lbShare")) return lbFile && shareFile(lbFile.path, lbFile.name);
  $("#lightbox").hidden = true;
});

/* ---------- writing a reply ---------- */
const replyText = $("#replyText");
replyText.addEventListener("input", () => { replyText.style.height = "auto"; replyText.style.height = Math.min(replyText.scrollHeight, 140) + "px"; });
replyText.addEventListener("keydown", ev => {
  if (ev.key === "Enter" && !ev.shiftKey && matchMedia("(pointer: fine)").matches) { ev.preventDefault(); $("#replyForm").requestSubmit(); }
});

function showAttach() {
  const box = $("#replyAttach");
  if (reply.photo) box.innerHTML = `<img src="${URL.createObjectURL(reply.photo)}" alt=""><span>picture</span><button type="button" class="link-btn" data-flip>↔ flip</button><button type="button" class="link-btn" data-clear>✕</button>`;
  else if (reply.video) box.innerHTML = `<video src="${URL.createObjectURL(reply.video)}" muted playsinline controls></video><span>video</span><button type="button" class="link-btn" data-clear>✕</button>`;
  else if (reply.voice) box.innerHTML = `<audio controls src="${URL.createObjectURL(reply.voice)}"></audio><button type="button" class="link-btn" data-clear>✕</button>`;
  box.hidden = !(reply.photo || reply.video || reply.voice);
}
function resetReply() {
  Object.assign(reply, { photo: null, photoFile: null, mirror: false, video: null, vthumb: null, vshape: "", voice: null, voiceMime: "", duration: 0 });
  $("#replyPhoto").value = "";
  $("#replyAttach").hidden = true; $("#replyAttach").innerHTML = "";
  setStatus($("#replyStatus"), "");
}
$("#replyAttach").addEventListener("click", async ev => {
  if (ev.target.closest("[data-clear]")) return resetReply();
  if (ev.target.closest("[data-flip]") && reply.photoFile) {
    reply.mirror = !reply.mirror;
    reply.photo = await shrinkImage(reply.photoFile, 1280, reply.mirror);
    showAttach();
  }
});

$("#replyPhoto").addEventListener("change", async ev => {
  const file = ev.target.files[0]; if (!file) return;
  stopReplyRecording();
  if (isVideoFile(file)) {
    if (videoTooBig(file)) { ev.target.value = ""; return; }
    Object.assign(reply, { voice: null, photo: null, photoFile: null, video: file });
    showAttach();
    const info = await videoInfo(file);
    if (reply.video === file) Object.assign(reply, { vthumb: info.thumb, vshape: info.wide ? "wide" : "tall" });
    return;
  }
  try { reply.video = null; reply.voice = null; reply.photoFile = file; reply.mirror = false; reply.photo = await shrinkImage(file, 1280); showAttach(); }
  catch { toast("Couldn't open that picture. Try a JPG or PNG."); }
});

let rRecorder = null, rTimer = null, rStart = 0;
$("#replyRec").addEventListener("click", async () => {
  const btn = $("#replyRec");
  if (rRecorder && rRecorder.state === "recording") return stopReplyRecording();
  const mime = pickMime();
  if (mime === null) return toast("This browser can't record audio.");
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { return toast("Microphone permission is needed to record."); }
  const chunks = [];
  rRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  rRecorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  rRecorder.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    clearInterval(rTimer);
    btn.classList.remove("recording"); btn.textContent = "🎙";
    if (!chunks.length) return;
    reply.photo = null; reply.video = null;
    reply.voiceMime = (rRecorder.mimeType || mime || "audio/webm").split(";")[0];
    reply.voice = new Blob(chunks, { type: reply.voiceMime });
    reply.duration = (Date.now() - rStart) / 1000;
    showAttach();
  };
  rRecorder.start();
  rStart = Date.now();
  btn.classList.add("recording");
  rTimer = setInterval(() => {
    const s = (Date.now() - rStart) / 1000;
    btn.textContent = "■ " + fmtDur(s);
    if (s >= MAX_VOICE_SECONDS) stopReplyRecording();
  }, 250);
});
function stopReplyRecording() {
  clearInterval(rTimer);
  if (rRecorder && rRecorder.state === "recording") rRecorder.stop();
}

$("#replyForm").addEventListener("submit", async ev => {
  ev.preventDefault();
  const e = entries.find(x => x.id === openId); if (!e) return;
  const text = replyText.value.trim();
  if (!text && !reply.photo && !reply.video && !reply.voice) return;
  if (!canWrite()) return;
  const st = $("#replyStatus"), btn = $("#replySend");
  btn.disabled = true;
  try {
    const r = { id: newId(), by: NAME, at: nowIso() };
    if (text) r.text = text;
    const blob = reply.photo || reply.video || reply.voice;
    if (blob) {
      r.kind = reply.photo ? "photo" : reply.video ? "video" : "voice";
      const ext = reply.photo ? "jpg" : reply.video ? videoExt(reply.video) : ({ "audio/mp4": "m4a", "audio/ogg": "ogg" }[reply.voiceMime] || "webm");
      setStatus(st, reply.video ? "Sending the video… (big ones take a minute)" : "Sending…");
      const packed = await packMedia(`${MEDIA_DIR}${e.id}-r${r.id}.${ext}`, blob); // encrypted when the vault is on
      const res = await putFile(packed.path, packed.b64, `A reply from ${NAME}`);
      r.media = packed.path; r.mediaSha = res.content.sha;
      if (reply.voice) r.duration = Math.round(reply.duration);
      if (reply.video) {
        r.shape = reply.vshape || "tall";
        if (reply.vthumb) { const t = await packMedia(`${MEDIA_DIR}${e.id}-r${r.id}-thumb.jpg`, reply.vthumb); await putFile(t.path, t.b64, `Video thumbnail from ${NAME}`); r.thumb = t.path; }
      }
    }
    const before = myPoints(entries);
    entries = await updateIndex(list => list.map(x => x.id === e.id ? { ...x, replies: [...(x.replies || []), r] } : x), `A reply from ${NAME}`);
    pointsToast(before, entries);
    window.goldiee?.cry(Goldies.score(entries, NAME).crying);
    const theirs = (e.by || e.author) !== NAME;
    notifyPartner(`${NAME} replied to ${theirs ? "your" : "a"} ${kindOf(e)} 💬`, "Open the diary to see it.");
    replyText.value = ""; replyText.style.height = "";
    resetReply();
    render(); renderPost();
    const sheet = $(".post-sheet"); sheet.scrollTop = sheet.scrollHeight; // show the reply just sent
  } catch (err) { setStatus(st, err.message, true); }
  finally { btn.disabled = false; }
});
