const toastEl = document.getElementById("toast");
let toastTimer;

function showToast(message) {
  toastEl.hidden = false;
  toastEl.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 1800);
}

const ALL_SYMBOLS = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "USDCHF",
  "AUDUSD",
  "USDCAD",
  "NZDUSD",
  "EURGBP",
  "EURJPY",
  "GBPJPY",
  "XAUUSD",
  "XAGUSD",
  "BTCUSD",
  "ETHUSD",
  "NAS100",
  "US30",
];

/** @type {Map<string, Set<string>>} */
const eaSymbols = new Map([["zeta-scalper", new Set(["XAUUSD", "EURUSD"])]]);
const draftEaSymbols = new Set();

const pairsSheet = document.getElementById("pairs-sheet");
const selectedList = document.getElementById("selected-symbols");
const availableList = document.getElementById("available-symbols");
const selectedEmpty = document.getElementById("selected-empty");
const pairsCount = document.getElementById("pairs-count");
const eaSymbolPicker = document.getElementById("ea-symbol-picker");
const eaSymbolSelected = document.getElementById("ea-symbol-selected");

function getAppSymbols() {
  const union = new Set();
  eaSymbols.forEach((set) => {
    set.forEach((symbol) => union.add(symbol));
  });
  return union;
}

function syncPairsFromEas() {
  renderPairs();
}

function renderPairs() {
  if (!selectedList || !availableList) return;
  selectedList.innerHTML = "";
  availableList.innerHTML = "";

  const appSymbols = getAppSymbols();
  const selectedItems = ALL_SYMBOLS.filter((s) => appSymbols.has(s));
  const availableItems = ALL_SYMBOLS.filter((s) => !appSymbols.has(s));

  pairsCount.textContent = `${selectedItems.length} on app`;
  selectedEmpty.hidden = selectedItems.length > 0;
  selectedEmpty.textContent = "No symbols yet — choose them in Manage EA";

  selectedItems.forEach((symbol) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "symbol-chip is-selected";
    btn.dataset.symbol = symbol;
    btn.innerHTML = `<span>${symbol}</span><span class="chip-x" aria-hidden="true">×</span>`;
    btn.title = "Remove from EA and app";
    btn.addEventListener("click", () => {
      removeSymbolFromAllEas(symbol);
      showToast(`${symbol} removed from app`);
    });
    selectedList.appendChild(btn);
  });

  availableItems.forEach((symbol) => {
    const chip = document.createElement("span");
    chip.className = "symbol-chip is-available";
    chip.innerHTML = `<span>${symbol}</span>`;
    chip.title = "Add this symbol from Manage EA";
    availableList.appendChild(chip);
  });
}

function removeSymbolFromAllEas(symbol) {
  eaSymbols.forEach((set, eaId) => {
    if (!set.has(symbol)) return;
    set.delete(symbol);
    refreshEaItemSymbols(eaId);
  });
  syncPairsFromEas();
}

function refreshEaItemSymbols(eaId) {
  const item = document.querySelector(`.ea-item[data-ea-id="${eaId}"]`);
  if (!item) return;
  const wrap = item.querySelector(".ea-item-symbols");
  if (!wrap) return;
  const set = eaSymbols.get(eaId) || new Set();
  wrap.dataset.eaSymbols = [...set].join(",");
  wrap.innerHTML = "";
  [...set].forEach((symbol) => {
    const chip = document.createElement("span");
    chip.className = "ea-sym-chip";
    chip.innerHTML = `<span>${symbol}</span>`;
    const del = document.createElement("button");
    del.type = "button";
    del.setAttribute("aria-label", `Remove ${symbol}`);
    del.textContent = "×";
    del.addEventListener("click", (event) => {
      event.stopPropagation();
      set.delete(symbol);
      eaSymbols.set(eaId, set);
      refreshEaItemSymbols(eaId);
      syncPairsFromEas();
      showToast(`${symbol} removed from app`);
    });
    chip.appendChild(del);
    wrap.appendChild(chip);
  });
}

function renderDraftSymbolPicker() {
  if (!eaSymbolPicker || !eaSymbolSelected) return;
  eaSymbolPicker.innerHTML = "";
  eaSymbolSelected.innerHTML = "";

  ALL_SYMBOLS.forEach((symbol) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `ea-pick-chip${draftEaSymbols.has(symbol) ? " is-on" : ""}`;
    btn.textContent = symbol;
    btn.addEventListener("click", () => {
      if (draftEaSymbols.has(symbol)) draftEaSymbols.delete(symbol);
      else draftEaSymbols.add(symbol);
      renderDraftSymbolPicker();
    });
    eaSymbolPicker.appendChild(btn);
  });

  if (draftEaSymbols.size === 0) {
    eaSymbolSelected.innerHTML = `<span class="ea-hint">No symbols chosen yet</span>`;
    return;
  }

  [...draftEaSymbols].forEach((symbol) => {
    const chip = document.createElement("span");
    chip.className = "ea-sym-chip";
    chip.innerHTML = `<span>${symbol}</span>`;
    eaSymbolSelected.appendChild(chip);
  });
}

function openPairs() {
  renderPairs();
  pairsSheet.hidden = false;
}

function closePairs() {
  pairsSheet.hidden = true;
}

document.querySelectorAll("[data-close-pairs]").forEach((el) => {
  el.addEventListener("click", closePairs);
});

renderDraftSymbolPicker();
syncPairsFromEas();

function showView(name) {
  document.querySelectorAll(".view").forEach((view) => {
    const active = view.dataset.view === name;
    view.hidden = !active;
    view.classList.toggle("is-active", active);
  });

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.tab === name);
  });
}

const stopBtn = document.querySelector(".stop-btn");
if (stopBtn) {
  stopBtn.addEventListener("click", () => {
    const running = stopBtn.classList.toggle("is-running");
    stopBtn.setAttribute("aria-pressed", running ? "true" : "false");
    stopBtn.querySelector(".stop-label").textContent = running ? "STOP" : "START";
    showToast(running ? "ZETA SCALPER AI started" : "Bot stopped");
  });
}

document.querySelectorAll(".glass-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "pairs") {
      openPairs();
      return;
    }
    if (action === "remove") {
      showToast("Bot removed");
    }
  });
});

document.querySelectorAll("[data-action='add-bot']").forEach((button) => {
  button.addEventListener("click", () => {
    openAdmin("manage-ea");
  });
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const name = tab.dataset.tab;
    showView(name);
    if (name === "scanner") {
      closePairs();
    }
  });
});

const uploadBtn = document.getElementById("upload-chart");
const chartFile = document.getElementById("chart-file");
if (uploadBtn && chartFile) {
  uploadBtn.addEventListener("click", () => chartFile.click());
  chartFile.addEventListener("change", () => {
    const file = chartFile.files && chartFile.files[0];
    if (file) {
      showToast(`Scanning ${file.name}`);
    }
  });
}

const recentToggle = document.getElementById("recent-toggle");
const recentList = document.getElementById("recent-list");
if (recentToggle && recentList) {
  recentToggle.addEventListener("click", () => {
    const open = recentList.hidden;
    recentList.hidden = !open;
    recentToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

document.querySelector(".scanner-settings")?.addEventListener("click", () => {
  showToast("Scanner settings");
});

document.getElementById("username").textContent = "";

/* —— Admin Portal —— */
const adminPortal = document.getElementById("admin-portal");
const adminDrawer = document.getElementById("admin-drawer");
const adminDrawerBackdrop = document.getElementById("admin-drawer-backdrop");
const phoneEl = document.querySelector(".phone");

function openDrawer() {
  if (!adminDrawer || !adminDrawerBackdrop) return;
  adminDrawer.classList.add("is-open");
  adminDrawer.setAttribute("aria-hidden", "false");
  adminDrawerBackdrop.hidden = false;
}

function closeDrawer() {
  if (!adminDrawer || !adminDrawerBackdrop) return;
  adminDrawer.classList.remove("is-open");
  adminDrawer.setAttribute("aria-hidden", "true");
  adminDrawerBackdrop.hidden = true;
}

function showAdminPage(name) {
  document.querySelectorAll("[data-admin-page]").forEach((page) => {
    const active = page.dataset.adminPage === name;
    page.hidden = !active;
    page.classList.toggle("is-active", active);
  });

  document.querySelectorAll("[data-admin-nav]").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.adminNav === name);
  });

  closeDrawer();
}

function openAdmin(page = "dashboard") {
  if (!adminPortal) return;
  closePairs();
  adminPortal.hidden = false;
  phoneEl?.classList.add("is-admin-open");
  showAdminPage(page);
}

function closeAdmin() {
  if (!adminPortal) return;
  closeDrawer();
  adminPortal.hidden = true;
  phoneEl?.classList.remove("is-admin-open");
}

const hotspotClicks = new WeakMap();

document.querySelectorAll(".gizmo-hotspot").forEach((el) => {
  el.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    const now = Date.now();
    const state = hotspotClicks.get(el) || { count: 0, first: now };

    if (now - state.first > 600) {
      state.count = 1;
      state.first = now;
    } else {
      state.count += 1;
    }

    hotspotClicks.set(el, state);

    if (state.count >= 3) {
      hotspotClicks.set(el, { count: 0, first: 0 });
      openAdmin();
    }
  });
});

document.getElementById("admin-menu-btn")?.addEventListener("click", openDrawer);
document.getElementById("admin-close-btn")?.addEventListener("click", closeAdmin);
document.getElementById("admin-drawer-close")?.addEventListener("click", closeDrawer);
adminDrawerBackdrop?.addEventListener("click", closeDrawer);

document.querySelectorAll("[data-admin-nav]").forEach((item) => {
  item.addEventListener("click", () => {
    showAdminPage(item.dataset.adminNav);
  });
});

document.getElementById("admin-theme-toggle")?.addEventListener("click", () => {
  showToast("Theme toggle coming soon");
});

document.getElementById("admin-logout")?.addEventListener("click", () => {
  closeAdmin();
  showToast("Logged out");
});

document.querySelectorAll("[data-admin-toast]").forEach((btn) => {
  btn.addEventListener("click", () => {
    showToast(btn.dataset.adminToast);
  });
});

document.querySelectorAll(".admin-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    chip.parentElement?.querySelectorAll(".admin-chip").forEach((c) => {
      c.classList.remove("is-active");
    });
    chip.classList.add("is-active");
  });
});

const strategyLabels = {
  scalper: "Scalper",
  trend: "Trend Follower",
  grid: "Grid",
  news: "News Trader",
};

const eaList = document.getElementById("ea-list");
const eaCount = document.getElementById("ea-count");
const robotList = document.querySelector(".robots");
const eaPhotoInput = document.getElementById("ea-photo");
const eaPhotoPreview = document.getElementById("ea-photo-preview");
const eaPhotoBtn = document.getElementById("ea-photo-btn");
let eaPhotoDataUrl = "";

eaPhotoBtn?.addEventListener("click", () => eaPhotoInput?.click());

eaPhotoInput?.addEventListener("change", () => {
  const file = eaPhotoInput.files && eaPhotoInput.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("Please upload an image");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    eaPhotoDataUrl = String(reader.result || "");
    if (eaPhotoPreview) eaPhotoPreview.src = eaPhotoDataUrl;
    showToast("Picture ready");
  };
  reader.readAsDataURL(file);
});

function addEaToHome(name, photoUrl) {
  if (!robotList) return;
  const existing = Array.from(robotList.querySelectorAll(".robot-row")).find((row) => {
    const label = row.querySelector("span");
    return label && label.textContent.trim() === name;
  });
  if (existing) {
    const img = existing.querySelector("img");
    if (img && photoUrl) img.src = photoUrl;
    return;
  }

  const addBtn = robotList.querySelector("[data-action='add-bot']");
  const row = document.createElement("button");
  row.type = "button";
  row.className = "robot-row";
  row.innerHTML = `
    <img src="./assets/avatar.png" alt="" width="36" height="36" />
    <span></span>
    <span class="check" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="m6.5 12.5 3.5 3.5 7.5-8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </span>
  `;
  const img = row.querySelector("img");
  if (img && photoUrl) img.src = photoUrl;
  row.querySelector("span").textContent = name;
  row.addEventListener("click", () => {
    robotList.querySelectorAll(".robot-row").forEach((r) => r.classList.remove("is-active"));
    if (!row.classList.contains("robot-add")) {
      row.classList.add("is-active");
      const heroAvatar = document.querySelector(".hero .avatar, .avatar-wrap .avatar");
      const brand = document.querySelector(".hero .brand, .brand");
      if (heroAvatar && img) heroAvatar.src = img.src;
      if (brand) brand.textContent = name;
    }
  });
  if (addBtn) {
    robotList.insertBefore(row, addBtn);
  } else {
    robotList.appendChild(row);
  }
}

document.getElementById("ea-create-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.name.value.trim();
  const strategy = form.strategy.value;
  const risk = form.risk.value;
  const timeframe = form.timeframe.value;
  const photoUrl = eaPhotoDataUrl || "./assets/avatar.png";
  const symbols = [...draftEaSymbols];

  if (!name) {
    showToast("Enter a robot name");
    return;
  }
  if (symbols.length === 0) {
    showToast("Choose at least one symbol");
    return;
  }

  const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
  eaSymbols.set(id, new Set(symbols));

  const item = document.createElement("div");
  item.className = "ea-item";
  item.dataset.eaId = id;
  item.innerHTML = `
    <img src="./assets/avatar.png" alt="" width="40" height="40" />
    <div class="ea-meta">
      <strong></strong>
      <span></span>
      <div class="ea-item-symbols" data-ea-symbols=""></div>
    </div>
    <div class="ea-item-actions">
      <span class="admin-badge is-approved">Live</span>
      <button class="ea-delete-btn" type="button" data-delete-ea aria-label="Delete EA">Delete</button>
    </div>
  `;
  const itemImg = item.querySelector("img");
  if (itemImg) itemImg.src = photoUrl;
  item.querySelector("strong").textContent = name;
  item.querySelector(".ea-meta > span").textContent = `${strategyLabels[strategy] || strategy} · ${timeframe} · Risk ${risk}%`;
  item.querySelector("[data-delete-ea]").addEventListener("click", () => deleteEa(id, name));
  eaList?.prepend(item);
  refreshEaItemSymbols(id);

  if (eaCount) {
    eaCount.textContent = String(eaList.querySelectorAll(".ea-item").length);
  }

  addEaToHome(name, photoUrl);
  syncPairsFromEas();

  const heroAvatar = document.querySelector(".hero .avatar, .avatar-wrap .avatar");
  const brand = document.querySelector(".hero .brand, .brand");
  if (heroAvatar) heroAvatar.src = photoUrl;
  if (brand) brand.textContent = name;
  document.querySelectorAll(".robot-row").forEach((r) => r.classList.remove("is-active"));
  const homeRows = robotList?.querySelectorAll(".robot-row:not(.robot-add)");
  const last = homeRows && homeRows[homeRows.length - 1];
  last?.classList.add("is-active");

  form.reset();
  form.risk.value = "1";
  form.timeframe.value = "M5";
  eaPhotoDataUrl = "";
  draftEaSymbols.clear();
  renderDraftSymbolPicker();
  if (eaPhotoPreview) eaPhotoPreview.src = "./assets/avatar.png";
  if (eaPhotoInput) eaPhotoInput.value = "";
  showToast(`${name} symbols added to app`);
  closeAdmin();
  showView("home");
});

function deleteEa(eaId, name) {
  eaSymbols.delete(eaId);
  document.querySelector(`.ea-item[data-ea-id="${eaId}"]`)?.remove();
  if (eaCount && eaList) {
    eaCount.textContent = String(eaList.querySelectorAll(".ea-item").length);
  }
  // Remove robot from home list if present
  robotList?.querySelectorAll(".robot-row").forEach((row) => {
    const label = row.querySelector("span");
    if (label && label.textContent.trim() === name && !row.classList.contains("robot-add")) {
      row.remove();
    }
  });
  syncPairsFromEas();
  showToast(`${name || "EA"} deleted from app`);
}

document.querySelectorAll("[data-delete-ea]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const eaId = btn.getAttribute("data-delete-ea");
    const item = btn.closest(".ea-item");
    const name = item?.querySelector("strong")?.textContent?.trim() || "EA";
    if (eaId) deleteEa(eaId, name);
  });
});

// Initialize default EA symbol chips with delete controls
refreshEaItemSymbols("zeta-scalper");
