(async () => {
  const aggressiveToggle = document.getElementById("aggressiveToggle");
  const totalBlockedStat = document.getElementById("totalBlockedStat");
  const resetStatsBtn = document.getElementById("resetStatsBtn");
  const whitelistList = document.getElementById("whitelistList");
  const whitelistEmpty = document.getElementById("whitelistEmpty");
  const customDomainsEl = document.getElementById("customDomains");
  const saveDomainsBtn = document.getElementById("saveDomainsBtn");

  async function render() {
    const { aggressiveMode = true, totalBlocked = 0, whitelist = [], customDomains = [] } =
      await chrome.storage.local.get({
        aggressiveMode: true, totalBlocked: 0, whitelist: [], customDomains: []
      });

    aggressiveToggle.checked = aggressiveMode;
    totalBlockedStat.textContent = totalBlocked;
    customDomainsEl.value = customDomains.join("\n");

    whitelistList.innerHTML = "";
    whitelistEmpty.style.display = whitelist.length ? "none" : "block";
    whitelist.forEach((host) => {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = host;
      const btn = document.createElement("button");
      btn.textContent = "Kaldır";
      btn.addEventListener("click", async () => {
        const cur = await chrome.storage.local.get({ whitelist: [] });
        const updated = cur.whitelist.filter((h) => h !== host);
        await chrome.storage.local.set({ whitelist: updated });
        render();
      });
      li.append(span, btn);
      whitelistList.appendChild(li);
    });
  }

  aggressiveToggle.addEventListener("change", () => {
    chrome.storage.local.set({ aggressiveMode: aggressiveToggle.checked });
  });

  resetStatsBtn.addEventListener("click", async () => {
    await chrome.storage.local.set({ totalBlocked: 0 });
    render();
  });

  saveDomainsBtn.addEventListener("click", async () => {
    const domains = customDomainsEl.value
      .split("\n")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
    await chrome.storage.local.set({ customDomains: domains });
    saveDomainsBtn.textContent = "Kaydedildi ✓";
    setTimeout(() => (saveDomainsBtn.textContent = "Kaydet"), 1200);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") render();
  });

  render();
})();
