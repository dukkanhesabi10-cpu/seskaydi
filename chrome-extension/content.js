// ISOLATED world - document_start.
// 1) rules/domains.txt listesini MAIN world'e (content_page_hook.js) koprular.
// 2) MAIN world'den gelen "engellendi" bildirimlerini background'a iletir.
// 3) Tam ekran clickjacking/popunder overlaylerini ve bilinen reklam
//    domainlerine ait iframe/script'leri DOM'dan temizler.

const CHANNEL = "__adblk_channel_v1";
let adDomains = [];

fetch(chrome.runtime.getURL("rules/domains.txt"))
  .then((r) => r.text())
  .then((text) => {
    adDomains = text.split("\n").map((l) => l.trim()).filter(Boolean);
    window.postMessage({ channel: CHANNEL, kind: "sync-domains", domains: adDomains }, "*");
    removeAdEmbeds(document, adDomains);
  })
  .catch(() => {});

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.channel !== CHANNEL || data.kind !== "blocked") return;
  chrome.runtime.sendMessage({ type: "blocked-in-page", reason: data.reason, url: data.url }).catch(() => {});
});

function hostnameOf(url) {
  try {
    return new URL(url, location.href).hostname;
  } catch {
    return "";
  }
}

function isKnownAdHost(host, domains) {
  if (!host) return false;
  return domains.some((d) => host === d || host.endsWith("." + d));
}

function reportRemoved(reason) {
  chrome.runtime.sendMessage({ type: "blocked-in-page", reason }).catch(() => {});
}

function removeAdEmbeds(root, domains) {
  if (!domains || !domains.length) return;
  const nodes = root.querySelectorAll("iframe[src], script[src], img[src]");
  nodes.forEach((node) => {
    const host = hostnameOf(node.src);
    if (!isKnownAdHost(host, domains)) return;

    // Kucuk reklam sarmalayici kapsayicisini bulmak icin birkac ust seviyeye bak.
    let victim = node;
    let parent = node.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
      const rect = parent.getBoundingClientRect();
      if (rect.width > 0 && rect.width < 900 && rect.height < 900) {
        victim = parent;
        parent = parent.parentElement;
      } else {
        break;
      }
    }
    victim.remove();
    reportRemoved("ad-embed-removed");
  });
}

function isExtremeOverlay(el) {
  if (!(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  if (style.position !== "fixed" && style.position !== "absolute") return false;

  const z = parseInt(style.zIndex, 10);
  if (!Number.isFinite(z) || z < 999999) return false;

  const rect = el.getBoundingClientRect();
  const coversViewport =
    rect.width >= window.innerWidth * 0.95 &&
    rect.height >= window.innerHeight * 0.95;
  if (!coversViewport) return false;

  if (style.pointerEvents === "none") return false;

  return true;
}

function scanForOverlays(root) {
  const candidates = root.querySelectorAll("div, section, aside");
  for (const el of candidates) {
    if (isExtremeOverlay(el)) {
      el.remove();
      reportRemoved("clickjack-overlay-removed");
    }
  }
}

function scanExisting() {
  const run = () => {
    removeAdEmbeds(document, adDomains);
    scanForOverlays(document);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
  // Bazi reklamlar/overlaylar sayfa yuklendikten sonra gecikmeli enjekte edilir.
  [200, 500, 1500, 3000].forEach((ms) => setTimeout(run, ms));
}
scanExisting();

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    mutation.addedNodes.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (adDomains.length) removeAdEmbeds(node.parentNode ? node : document, adDomains);
      if (node.matches && node.matches("div, section, aside") && isExtremeOverlay(node)) {
        node.remove();
        reportRemoved("clickjack-overlay-removed");
      }
    });
  }
});

function startObserving() {
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

if (document.documentElement) {
  startObserving();
} else {
  new MutationObserver((_, obs) => {
    if (document.documentElement) {
      startObserving();
      obs.disconnect();
    }
  }).observe(document, { childList: true });
}
