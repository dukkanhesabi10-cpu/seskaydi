(async () => {
  const enabledToggle = document.getElementById("enabledToggle");
  const blockedCountEl = document.getElementById("blockedCount");
  const currentHostEl = document.getElementById("currentHost");
  const whitelistBtn = document.getElementById("whitelistBtn");
  const totalBlockedEl = document.getElementById("totalBlocked");
  const optionsLink = document.getElementById("optionsLink");

  optionsLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = "";
  try {
    host = tab && tab.url ? new URL(tab.url).hostname : "";
  } catch {
    host = "";
  }
  currentHostEl.textContent = host || "(bu sayfada değil)";

  const { totalBlocked = 0 } = await chrome.storage.local.get({ totalBlocked: 0 });
  totalBlockedEl.textContent = `toplam: ${totalBlocked}`;

  const status = await chrome.runtime.sendMessage({ type: "get-status", tabId: tab?.id, host });
  enabledToggle.checked = !!status.enabled;
  blockedCountEl.textContent = status.blockedOnPage || 0;
  updateWhitelistBtn(status.whitelisted);

  function updateWhitelistBtn(whitelisted) {
    whitelistBtn.textContent = whitelisted
      ? "Bu sitede tekrar etkinleştir"
      : "Bu sitede devre dışı bırak";
    whitelistBtn.disabled = !host;
  }

  enabledToggle.addEventListener("change", () => {
    chrome.runtime.sendMessage({ type: "toggle-enabled", value: enabledToggle.checked });
  });

  whitelistBtn.addEventListener("click", async () => {
    if (!host) return;
    const res = await chrome.runtime.sendMessage({ type: "toggle-site-whitelist", host });
    const nowWhitelisted = res.whitelist.includes(host);
    updateWhitelistBtn(nowWhitelisted);
  });
})();
