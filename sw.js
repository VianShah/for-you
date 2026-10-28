// The diary's service worker: only for notifications (nothing is cached, so the site never goes stale).
// A push shows a notification; tapping it opens the diary app (or brings it to the front) on the right page.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Our diary 💌", {
    body: d.body || "",
    icon: "icon-192.png",
    badge: "icon-192.png",
    tag: d.tag || undefined,
    data: { url: d.url || "diary/" },
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "diary/", self.registration.scope).href;
  e.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const win = open.find(c => c.url.startsWith(self.registration.scope));
    if (win) {
      await win.focus();
      if (win.url !== url && "navigate" in win) { try { await win.navigate(url); } catch {} }
      return;
    }
    await self.clients.openWindow(url);
  })());
});
