/**
 * Service worker — push notifications only.
 *
 * It deliberately does not cache anything. A challenge where every screen
 * depends on today's date and a stored score is exactly the kind of app an
 * offline cache serves stale, and a participant seeing yesterday's total is
 * worse than one seeing a network error.
 */

self.addEventListener("install", () => {
  // Take over straight away rather than waiting for every tab to close, so a
  // participant who has just allowed notifications is subscribed on this
  // visit rather than the next one.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "BCJ Healthy Living";
  const options = {
    body: data.body || "You have not filled in today yet.",
    icon: "/icon.png",
    badge: "/icon.png",
    // One tag, so a second reminder replaces the first rather than stacking
    // up a column of identical notifications.
    tag: "bcj-daily-reminder",
    renotify: true,
    data: { url: data.url || "/app" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/app";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Focus the app if it is already open rather than opening a second
        // tab of the same screen.
        for (const client of clients) {
          if (client.url.includes("/app") && "focus" in client) {
            client.navigate(target);
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});
