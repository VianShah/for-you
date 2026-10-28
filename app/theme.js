/* Light / dark theme. Follows the phone's setting until someone taps a
   [data-theme-toggle] button; that choice is then remembered on this device.
   Loaded in <head> so the page never flashes the wrong colours. */
(() => {
  const KEY = "for-you-theme";
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const saved = () => { try { return localStorage.getItem(KEY) || "auto"; } catch { return "auto"; } };
  function apply() {
    const mode = saved();
    const dark = mode === "dark" || (mode === "auto" && mq.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.querySelectorAll("[data-theme-toggle]").forEach(b => {
      b.textContent = dark ? "☀️" : "🌙";
      b.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      b.title = b.getAttribute("aria-label");
    });
  }
  apply();
  mq.addEventListener ? mq.addEventListener("change", apply) : mq.addListener(apply);
  document.addEventListener("DOMContentLoaded", apply);
  document.addEventListener("click", e => {
    if (!e.target.closest("[data-theme-toggle]")) return;
    const dark = document.documentElement.dataset.theme === "dark";
    try { localStorage.setItem(KEY, dark ? "light" : "dark"); } catch {}
    apply();
  });
})();
