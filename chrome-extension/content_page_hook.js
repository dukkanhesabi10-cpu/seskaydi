// MAIN world - document_start.
// Sayfa kendi <script> etiketlerini calistirmadan once burasi calisir, boylece
// window.open'in ORIJINAL referansini reklam scriptleri ele gecirmeden once
// biz "korumali" bir surumle degistiriyoruz.
(() => {
  if (window.__adblkHookInstalled) return;
  window.__adblkHookInstalled = true;

  const CHANNEL = "__adblk_channel_v1";
  const originalOpen = window.open.bind(window);

  // OAuth / odeme gibi gercek popup akislarina sahip guvenilir siteler.
  // Bunlar icin gesture kontrolu bile atlanir.
  const SAFE_POPUP_HOSTS = [
    "accounts.google.com", "appleid.apple.com", "login.microsoftonline.com",
    "login.live.com", "www.paypal.com", "paypal.com", "checkout.stripe.com",
    "js.stripe.com", "connect.stripe.com", "www.facebook.com", "facebook.com",
    "github.com", "discord.com", "slack.com", "auth0.com", "okta.com",
    "login.yahoo.com", "signin.aws.amazon.com", "steamcommunity.com",
    "www.dropbox.com"
  ];

  let adDomains = [];       // content.js tarafindan senkronize edilir
  let lastGesture = null;   // { time, consumed }
  const GESTURE_TTL_MS = 1200;

  const GESTURE_EVENTS = ["pointerdown", "mousedown", "keydown", "touchstart", "click"];
  for (const type of GESTURE_EVENTS) {
    window.addEventListener(type, (event) => {
      if (!event.isTrusted) return;
      lastGesture = { time: Date.now(), consumed: false };
    }, { capture: true, passive: true });
  }

  function hostnameOf(url) {
    try {
      return new URL(url, location.href).hostname;
    } catch {
      return "";
    }
  }

  function isSafeHost(host) {
    return SAFE_POPUP_HOSTS.some((s) => host === s || host.endsWith("." + s));
  }

  function isKnownAdHost(host) {
    if (!host) return false;
    return adDomains.some((d) => host === d || host.endsWith("." + d));
  }

  function report(reason, url) {
    window.postMessage({ channel: CHANNEL, kind: "blocked", reason, url }, "*");
  }

  function guardedOpen(url, target, features) {
    const resolvedUrl = url ? String(url) : "about:blank";
    const host = hostnameOf(resolvedUrl);

    if (isSafeHost(host)) {
      return originalOpen(url, target, features);
    }

    if (isKnownAdHost(host)) {
      report("blocklist", resolvedUrl);
      return null;
    }

    const now = Date.now();
    const withinGesture = lastGesture && (now - lastGesture.time) < GESTURE_TTL_MS;

    if (!withinGesture) {
      report("no-user-gesture", resolvedUrl);
      return null;
    }

    if (lastGesture.consumed) {
      report("multiple-open-same-gesture", resolvedUrl);
      return null;
    }

    lastGesture.consumed = true;
    return originalOpen(url, target, features);
  }

  try {
    Object.defineProperty(window, "open", {
      value: guardedOpen,
      writable: false,
      configurable: false,
      enumerable: true
    });
  } catch {
    window.open = guardedOpen;
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.channel !== CHANNEL || data.kind !== "sync-domains") return;
    if (Array.isArray(data.domains)) adDomains = data.domains;
  });
})();
