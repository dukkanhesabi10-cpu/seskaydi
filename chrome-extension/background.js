// Reklam Popup Engelleyici - background service worker
// Katman 1 (rules/ads.json, declarativeNetRequest) ag seviyesinde reklam
// alan adlarini engeller. Bu dosya katman 2'dir: yeni acilan sekme/pencereleri
// (window.open, target=_blank, popunder) sezgisel kurallarla yakalayip kapatir.

const DEFAULT_SETTINGS = {
  enabled: true,
  aggressiveMode: true,
  whitelist: [],      // kullanicinin tamamen guvendigi hostname'ler
  customDomains: []   // kullanicinin elle ekledigi engellenecek domainler
};

// Meşru login / odeme akislarinda gercek popup pencere acan siteler.
// Bunlarin acinci pencereleri asla kapatilmaz.
const SAFE_POPUP_HOSTS = [
  "accounts.google.com", "appleid.apple.com", "login.microsoftonline.com",
  "login.live.com", "www.paypal.com", "paypal.com", "checkout.stripe.com",
  "js.stripe.com", "connect.stripe.com", "www.facebook.com", "facebook.com",
  "github.com", "api.github.com", "discord.com", "slack.com",
  "auth0.com", "okta.com", "login.yahoo.com", "signin.aws.amazon.com",
  "steamcommunity.com", "www.dropbox.com"
];

const TAB_STATS = new Map();      // tabId -> engellenen sayaci (bu sayfa icin)
const OPENER_BURST = new Map();   // openerTabId -> { count, firstTs }
const BURST_WINDOW_MS = 4000;

let settings = { ...DEFAULT_SETTINGS };

function loadSettings() {
  return chrome.storage.local.get(DEFAULT_SETTINGS).then((stored) => {
    settings = { ...DEFAULT_SETTINGS, ...stored };
    return settings;
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(DEFAULT_SETTINGS).then((stored) => {
    chrome.storage.local.set({ ...DEFAULT_SETTINGS, ...stored });
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (key in settings) settings[key] = newValue;
  }
  applyCustomDomainRules();
});

loadSettings();

function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function isSameSite(hostA, hostB) {
  if (!hostA || !hostB) return false;
  const partsA = hostA.split(".").slice(-2).join(".");
  const partsB = hostB.split(".").slice(-2).join(".");
  return partsA === partsB;
}

function isWhitelisted(host) {
  return settings.whitelist.some((w) => host === w || host.endsWith("." + w));
}

function isSafePopupHost(host) {
  return SAFE_POPUP_HOSTS.some((s) => host === s || host.endsWith("." + s));
}

function bumpBlockedCount(tabId, amount = 1) {
  if (tabId == null || tabId < 0) return;
  const current = (TAB_STATS.get(tabId) || 0) + amount;
  TAB_STATS.set(tabId, current);
  chrome.action.setBadgeBackgroundColor({ color: "#7c5cff" }).catch(() => {});
  chrome.action.setBadgeText({ tabId, text: current > 0 ? String(current) : "" }).catch(() => {});
  chrome.storage.local.get({ totalBlocked: 0 }).then(({ totalBlocked }) => {
    chrome.storage.local.set({ totalBlocked: totalBlocked + amount });
  });
}

chrome.tabs.onRemoved.addListener((tabId) => {
  TAB_STATS.delete(tabId);
  OPENER_BURST.delete(tabId);
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) {
    TAB_STATS.set(details.tabId, 0);
    chrome.action.setBadgeText({ tabId: details.tabId, text: "" }).catch(() => {});
  }
});

// declarativeNetRequest.onRuleMatchedDebug sadece "unpacked" (gelistirici
// modunda yuklenmis) eklentilerde calisir - bu eklenti tam olarak boyle
// kullanilmak uzere tasarlandi (Web Store'a yayinlanmiyor).
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    if (info.request && info.request.tabId >= 0) {
      bumpBlockedCount(info.request.tabId, 1);
    }
  });
}

async function shouldClosePopupTab(tab) {
  if (!settings.enabled) return false;
  if (tab.openerTabId == null) return false; // kullanici bilerek yeni sekme actiysa dokunma

  let openerHost = "";
  try {
    const openerTab = await chrome.tabs.get(tab.openerTabId);
    openerHost = hostnameOf(openerTab.url || openerTab.pendingUrl || "");
  } catch {
    // opener tab artik yok; devam et
  }

  if (openerHost && isWhitelisted(openerHost)) return false;

  const targetUrl = tab.url || tab.pendingUrl || "";
  const targetHost = hostnameOf(targetUrl);

  if (targetHost && isSafePopupHost(targetHost)) return false;
  if (targetHost && openerHost && isSameSite(targetHost, openerHost)) return false;

  const blockedDomains = new Set([...KNOWN_AD_DOMAINS, ...settings.customDomains]);
  if (targetHost && [...blockedDomains].some((d) => targetHost === d || targetHost.endsWith("." + d))) {
    return true;
  }

  if (!settings.aggressiveMode) return false;

  // "popup" tipi pencereler (toolbar/menubar olmayan kucuk pencereler)
  // klasik popunder/popup reklam tekniginin imzasidir.
  try {
    const win = await chrome.windows.get(tab.windowId);
    if (win.type === "popup") return true;
  } catch {
    // yoksay
  }

  // Ayni opener'dan kisa surede art arda yeni sekme acilmasi (popunder zinciri)
  const now = Date.now();
  const burst = OPENER_BURST.get(tab.openerTabId);
  if (!burst || now - burst.firstTs > BURST_WINDOW_MS) {
    OPENER_BURST.set(tab.openerTabId, { count: 1, firstTs: now });
    return false;
  }
  burst.count += 1;
  if (burst.count > 1) return true;
  return false;
}

chrome.tabs.onCreated.addListener(async (tab) => {
  try {
    const close = await shouldClosePopupTab(tab);
    if (close) {
      bumpBlockedCount(tab.openerTabId ?? tab.id, 1);
      await chrome.tabs.remove(tab.id);
    }
  } catch {
    // sekme zaten kapanmis olabilir, yoksay
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return;

  if (message.type === "blocked-in-page") {
    if (sender.tab) bumpBlockedCount(sender.tab.id, 1);
    return;
  }

  if (message.type === "get-status") {
    const tabId = message.tabId ?? sender.tab?.id;
    const host = message.host || "";
    Promise.resolve().then(async () => {
      await loadSettings();
      sendResponse({
        enabled: settings.enabled,
        aggressiveMode: settings.aggressiveMode,
        whitelisted: isWhitelisted(host),
        blockedOnPage: TAB_STATS.get(tabId) || 0,
        host
      });
    });
    return true;
  }

  if (message.type === "toggle-enabled") {
    chrome.storage.local.set({ enabled: message.value });
    return;
  }

  if (message.type === "toggle-site-whitelist") {
    chrome.storage.local.get({ whitelist: [] }).then(({ whitelist }) => {
      const host = message.host;
      const idx = whitelist.indexOf(host);
      if (idx >= 0) whitelist.splice(idx, 1);
      else whitelist.push(host);
      chrome.storage.local.set({ whitelist }).then(() => sendResponse({ whitelist }));
    });
    return true;
  }
});

function applyCustomDomainRules() {
  const rules = settings.customDomains.map((domain, i) => ({
    id: 20000 + i,
    priority: 1,
    action: { type: "block" },
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes: [
        "main_frame", "sub_frame", "stylesheet", "script", "image", "font",
        "object", "xmlhttprequest", "ping", "media", "websocket", "other"
      ]
    }
  }));

  chrome.declarativeNetRequest.getDynamicRules().then((existing) => {
    const removeRuleIds = existing.map((r) => r.id);
    chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: rules }).catch(() => {});
  });
}

// rules/ads.json ile ayni domain listesi; sekme/pencere kapatma
// sezgilerinde (network katmanindan bagimsiz) kullanilir.
const KNOWN_AD_DOMAINS = ["2mdn.net", "33across.com", "3snet.co", "a-ads.com", "ad-flow.com", "adblade.com", "adbull.com", "adcash.com", "adcolony.com", "adcombo.com", "adform.net", "adition.com", "aditup.com", "adk2.com", "adkernel.com", "admanmedia.com", "admaven.com", "adnium.com", "adnxs.com", "adprotect.info", "adroll.com", "adsafeprotected.com", "adsee.io", "adservme.com", "adskeeper.co.uk", "adsmove.com", "adspyglass.com", "adsrvr.org", "adsterra.com", "adsterratech.com", "adsyield.com", "adtechus.com", "adtelligent.com", "advertserve.com", "adxpansion.com", "adyoulike.com", "agkn.com", "applovin.com", "atdmt.com", "betrad.com", "bidswitch.net", "bidvertiser.com", "bluekai.com", "casalemedia.com", "chartboost.com", "clickadilla.com", "clickadu.com", "clickaine.com", "clickfuse.com", "clickosmedia.com", "clkmon.com", "cointraffic.io", "coinzilla.io", "connatix.com", "content-ad.net", "content.ad", "contextweb.com", "cpalead.com", "criteo.com", "criteo.net", "cxense.com", "demdex.net", "doubleclick.net", "doubleverify.com", "dtscout.com", "ero-advertising.com", "eroadvertising.com", "evadav.com", "exdynsrv.com", "exelator.com", "exoclick.com", "exponential.com", "flashtalking.com", "freewheel.tv", "galaksion.com", "google-analytics.com", "googleadservices.com", "googlesyndication.com", "googletagservices.com", "gumgum.com", "hilltop-ads.com", "hilltopads.net", "improvedigital.com", "indexexchange.com", "inmobi.com", "ironsrc.com", "juicyads.com", "kmtx.ru", "krxd.net", "loopme.com", "mathtag.com", "media.net", "mediatraffic.link", "megapu.sh", "mgid.com", "moatads.com", "monetizer101.com", "nativo.com", "notifyninja.com", "onclckds.com", "onclickads.net", "onclickmax.com", "onclicksuper.com", "onetag.com", "openx.net", "outbrain.com", "plugrush.com", "pop.ad", "popads.net", "popcash.net", "popin.cc", "popmyads.com", "poptm.com", "popunder.net", "propellerads.com", "propush.me", "pubmatic.com", "pushground.com", "pushnami.com", "quantserve.com", "reblclick.com", "revcontent.com", "revenuehits.com", "richads.com", "rlcdn.com", "rubiconproject.com", "scorecardresearch.com", "semasio.net", "serving-sys.com", "sharethrough.com", "smaato.com", "smartadserver.com", "smartclip.net", "smartyads.com", "sortable.com", "sovrn.com", "spotxchange.com", "springserve.com", "startapp.com", "taboola.com", "tapad.com", "teads.tv", "trafficfactory.biz", "trafficjunky.net", "trafficshop.com", "trafficstars.com", "triplelift.com", "undertone.com", "unityads.unity3d.com", "vidoomy.com", "vungle.com", "yavli.com", "yieldmo.com", "yllix.com", "zedo.com", "zeropark.com"];
