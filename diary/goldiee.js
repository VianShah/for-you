/* Goldiee 🐶: a little golden pup who only peeks in when there's something
   to do, like a new page, a question waiting or an answer to unlock. Tapping her
   (or her bubble) takes you straight there.
   Pages call: goldiee.say("message", action), where action is a URL or a function. */
(() => {
  const css = `
  .goldiee { position: fixed; left: max(14px, env(safe-area-inset-left)); bottom: 0; z-index: 30; display: flex; align-items: flex-end; gap: 6px;
    transform: translateY(115%); transition: transform .7s cubic-bezier(.3,1.4,.5,1); pointer-events: none; }
  .goldiee.up { transform: translateY(18%); }
  .goldiee.up .goldiee-pup, .goldiee.up .goldiee-bubble { pointer-events: auto; }
  .goldiee-pup { width: 92px; height: 92px; padding: 0; border: none; background: none; filter: drop-shadow(0 6px 10px rgba(110,35,55,.25)); }
  .goldiee-pup svg { width: 100%; height: 100%; display: block; overflow: visible; }
  .goldiee.up .goldiee-pup { animation: g-hop 2.4s ease-in-out infinite 1s; }
  @keyframes g-hop { 0%, 70%, 100% { transform: translateY(0); } 80% { transform: translateY(-8px); } 90% { transform: translateY(0); } 95% { transform: translateY(-3px); } }
  .goldiee .ear-l { transform-origin: 30px 30px; animation: g-ear 3.2s ease-in-out infinite; }
  .goldiee .ear-r { transform-origin: 70px 30px; animation: g-ear 3.2s ease-in-out infinite .4s; }
  @keyframes g-ear { 0%, 80%, 100% { transform: rotate(0); } 88% { transform: rotate(-9deg); } 94% { transform: rotate(5deg); } }
  .goldiee .lids { transform-origin: 50px 46px; transform: scaleY(0); animation: g-blink 4.5s infinite; }
  @keyframes g-blink { 0%, 94%, 100% { transform: scaleY(0); } 96% { transform: scaleY(1); } }
  .goldiee .tongue { transform-origin: 50px 62px; animation: g-pant 1.1s ease-in-out infinite; }
  @keyframes g-pant { 50% { transform: scaleY(1.18); } }
  .goldiee-bubble { position: relative; margin-bottom: 52px; max-width: min(250px, calc(100vw - 130px)); background: #fffaf3; color: #3a2026; text-align: left;
    font-family: "Caveat", "Segoe Print", cursive; font-size: 21px; line-height: 1.15; padding: 10px 30px 10px 14px; border-radius: 16px 16px 16px 4px;
    box-shadow: 0 10px 24px -12px rgba(110,35,55,.45); border: 1px solid rgba(110,35,55,.12); opacity: 0; transform: scale(.8); transform-origin: 0 100%;
    transition: opacity .3s .35s, transform .3s .35s; }
  .goldiee.up .goldiee-bubble { opacity: 1; transform: none; }
  .goldiee-bubble b { color: #6e2337; font-weight: 600; display: block; font-size: 13px; font-family: "Jost", system-ui, sans-serif; letter-spacing: .08em; margin-bottom: 2px; }
  .goldiee-go { display: block; margin-top: 6px; font-family: "Jost", system-ui, sans-serif; font-size: 13px; color: #fff; background: #6e2337; border-radius: 999px; padding: 5px 12px; width: max-content; }
  .goldiee-x { position: absolute; top: 4px; right: 6px; border: none; background: none; color: #9a7a7f; font-size: 14px; padding: 4px; }
  @media (prefers-reduced-motion: reduce) { .goldiee, .goldiee * { animation: none !important; transition: none !important; } }
  @media print { .goldiee { display: none; } }`;

  // A golden-retriever pup peeking over the edge: floppy ears, fluffy cheeks, little tongue, pink bow.
  const svg = `<svg viewBox="0 0 100 100" aria-hidden="true">
    <ellipse cx="50" cy="96" rx="40" ry="16" fill="#e4a24b"/>
    <path class="ear-l" d="M28 24c-14-2-22 14-18 30 2 9 9 11 13 6 4-6 6-20 5-36z" fill="#c9832f"/>
    <path class="ear-r" d="M72 24c14-2 22 14 18 30-2 9-9 11-13 6-4-6-6-20-5-36z" fill="#c9832f"/>
    <ellipse cx="50" cy="46" rx="29" ry="27" fill="#f2b65c"/>
    <path d="M27 54c4 12 12 18 23 18s19-6 23-18c-6 6-14 8-23 8s-17-2-23-8z" fill="#f7cd85"/>
    <ellipse cx="50" cy="60" rx="13" ry="9.5" fill="#fbe2b4"/>
    <circle cx="39" cy="45" r="4.2" fill="#2b1a17"/><circle cx="61" cy="45" r="4.2" fill="#2b1a17"/>
    <circle cx="40.4" cy="43.6" r="1.4" fill="#fff"/><circle cx="62.4" cy="43.6" r="1.4" fill="#fff"/>
    <g class="lids" fill="#f2b65c"><ellipse cx="39" cy="45" rx="5" ry="5"/><ellipse cx="61" cy="45" rx="5" ry="5"/></g>
    <ellipse cx="50" cy="55.5" rx="4.6" ry="3.4" fill="#2b1a17"/>
    <path d="M50 58.5v2.5m0 0c-2 2.6-5 2.6-6.5 .8M50 61c2 2.6 5 2.6 6.5 .8" stroke="#2b1a17" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <path class="tongue" d="M46.6 62.6c0 5 1.6 7 3.4 7s3.4-2 3.4-7c-1.2 .9-5.6 .9-6.8 0z" fill="#ea7f8d"/>
    <ellipse cx="31" cy="54" rx="4.5" ry="2.8" fill="#f39aa6" opacity=".55"/><ellipse cx="69" cy="54" rx="4.5" ry="2.8" fill="#f39aa6" opacity=".55"/>
    <path d="M44 21c2-4 4-5 6-5s4 1 6 5c-2-1.5-4-2-6-2s-4 .5-6 2z" fill="#e4a24b"/>
    <circle cx="68" cy="22" r="5" fill="#d97b86"/><circle cx="76" cy="20" r="5" fill="#d97b86"/><circle cx="72" cy="22" r="2.6" fill="#6e2337"/>
  </svg>`;

  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
  const root = document.createElement("div");
  root.className = "goldiee";
  root.innerHTML = `<button class="goldiee-pup" aria-label="Go with Goldiee">${svg}</button>
    <div class="goldiee-bubble" role="status"><b>goldiee</b><span class="goldiee-text"></span><span class="goldiee-go"></span><button class="goldiee-x" aria-label="Not now">✕</button></div>`;
  document.body.appendChild(root);

  const text = root.querySelector(".goldiee-text");
  const go = root.querySelector(".goldiee-go");
  let action = null, hideTimer;

  // Goldiee never speaks without somewhere to take you.
  function say(msg, act, label = "take me there →", ms = 14000) {
    if (!msg || !act) return;
    action = act;
    text.textContent = msg;
    go.textContent = label;
    root.classList.add("up");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, ms);
  }
  function hide() { root.classList.remove("up"); action = null; }
  function run(e) {
    if (e.target.closest(".goldiee-x") || !action) return;
    const act = action;
    hide();
    if (typeof act === "function") act(); else location.href = act;
  }
  root.querySelector(".goldiee-pup").addEventListener("click", run);
  root.querySelector(".goldiee-bubble").addEventListener("click", run);
  root.querySelector(".goldiee-x").addEventListener("click", hide);

  window.goldiee = { say, hide };
})();
