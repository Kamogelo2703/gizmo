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
const eaSymbols = new Map();
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

function normalizeSymbol(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._/-]/g, "");
}

function ensureCatalogSymbol(symbol) {
  if (!symbol) return;
  if (!ALL_SYMBOLS.includes(symbol)) {
    ALL_SYMBOLS.push(symbol);
  }
}

function addDraftSymbol(raw) {
  const symbol = normalizeSymbol(raw);
  if (!symbol) {
    showToast("Enter a symbol");
    return false;
  }
  ensureCatalogSymbol(symbol);
  draftEaSymbols.add(symbol);
  renderDraftSymbolPicker();
  return true;
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
    chip.innerHTML = `<span></span><button type="button" aria-label="Remove ${symbol}">×</button>`;
    chip.querySelector("span").textContent = symbol;
    chip.querySelector("button").addEventListener("click", () => {
      draftEaSymbols.delete(symbol);
      renderDraftSymbolPicker();
    });
    eaSymbolSelected.appendChild(chip);
  });
}

const eaCustomSymbolInput = document.getElementById("ea-custom-symbol");
const eaAddSymbolBtn = document.getElementById("ea-add-symbol-btn");

eaAddSymbolBtn?.addEventListener("click", () => {
  if (addDraftSymbol(eaCustomSymbolInput?.value)) {
    if (eaCustomSymbolInput) eaCustomSymbolInput.value = "";
    showToast("Symbol added");
  }
});

eaCustomSymbolInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (addDraftSymbol(eaCustomSymbolInput.value)) {
    eaCustomSymbolInput.value = "";
    showToast("Symbol added");
  }
});

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
    if (typeof v2Running !== "undefined") v2Running = running;
    if (typeof activeInterface !== "undefined" && activeInterface === "v2" && typeof renderV2Home === "function") {
      renderV2Home();
    }
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
      removeActiveBot();
    }
  });
});

document.querySelectorAll("[data-action='add-bot']").forEach((button) => {
  button.addEventListener("click", () => {
    openAdmin("manage-ea");
  });
});

document.querySelectorAll("[data-action='activate-license']").forEach((button) => {
  button.addEventListener("click", () => {
    openLicenseSheet();
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
  if (!hasActiveBot()) showAppLock();
}

const hotspotClicks = new WeakMap();

document.querySelectorAll(".apexea-hotspot").forEach((el) => {
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
  const photoUrl = eaPhotoDataUrl || "./assets/avatar.png";
  // Include any text still sitting in the custom symbol field
  if (eaCustomSymbolInput?.value.trim()) {
    addDraftSymbol(eaCustomSymbolInput.value);
    eaCustomSymbolInput.value = "";
  }
  const symbols = [...draftEaSymbols];

  if (!name) {
    showToast("Enter a robot name");
    return;
  }
  if (symbols.length === 0) {
    showToast("Add at least one symbol");
    return;
  }

  symbols.forEach(ensureCatalogSymbol);

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
  item.querySelector(".ea-meta > span").textContent = `${strategyLabels[strategy] || strategy} · ${symbols.length} symbols`;
  item.querySelector("[data-delete-ea]").addEventListener("click", () => deleteEa(id, name));
  eaList?.prepend(item);
  document.getElementById("ea-empty")?.remove();
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
  eaPhotoDataUrl = "";
  draftEaSymbols.clear();
  renderDraftSymbolPicker();
  if (eaPhotoPreview) eaPhotoPreview.src = "./assets/avatar.png";
  if (eaPhotoInput) eaPhotoInput.value = "";
  if (eaCustomSymbolInput) eaCustomSymbolInput.value = "";
  showToast(`${name} symbols added to app`);
  closeAdmin();
  showView("home");
});

function deleteEa(eaId, name) {
  eaSymbols.delete(eaId);
  document.querySelector(`.ea-item[data-ea-id="${eaId}"]`)?.remove();
  if (eaCount && eaList) {
    const remaining = eaList.querySelectorAll(".ea-item").length;
    eaCount.textContent = String(remaining);
    if (remaining === 0 && !document.getElementById("ea-empty")) {
      const empty = document.createElement("p");
      empty.className = "admin-empty";
      empty.id = "ea-empty";
      empty.textContent = "No EAs yet — create one above";
      eaList.appendChild(empty);
    }
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

/* —— Bot license system —— */
const botRegistry = new Map();

/** @type {Array<{key:string, botId:string, botName:string, used:boolean, createdAt:number}>} */
const licenseKeys = [];

const appLock = document.getElementById("app-lock");
const licenseForm = document.getElementById("license-form");
const licenseBotSelect = document.getElementById("license-bot");
const licenseResult = document.getElementById("license-result");
const licenseLatest = document.getElementById("license-latest");
const licenseList = document.getElementById("license-list");
const licenseEmpty = document.getElementById("license-empty");
const licenseCount = document.getElementById("license-count");
const licenseActivateForm = document.getElementById("license-activate-form");
const licenseKeyInput = document.getElementById("license-key-input");
const coverEmailForm = document.getElementById("cover-email-form");
const coverEmailInput = document.getElementById("cover-email-input");
const coverStep = document.getElementById("cover-step");
const pendingStep = document.getElementById("pending-step");
const licenseStep = document.getElementById("license-step");
const coverBackBtn = document.getElementById("cover-back-btn");
const pendingBackBtn = document.getElementById("pending-back-btn");
const checkApprovalBtn = document.getElementById("check-approval-btn");
const licenseStepSub = document.getElementById("license-step-sub");
const pendingStepSub = document.getElementById("pending-step-sub");
const pendingEmailLabel = document.getElementById("pending-email-label");
const activateList = document.getElementById("activate-list");
const approvedList = document.getElementById("approved-list");
const activatePendingCount = document.getElementById("activate-pending-count");
const activateApprovedCount = document.getElementById("activate-approved-count");
const heroEl = document.querySelector(".hero");
const heroAvatarEl = document.querySelector(".hero .avatar, .avatar-wrap .avatar");
const heroBrandEl = document.querySelector(".hero .brand, .brand");
const heroKickerEl = document.querySelector(".hero .kicker, .kicker");

/** @type {string} */
let coverEmail = "";

/** @type {Map<string, {email:string, status:'pending'|'approved', createdAt:number}>} */
const signups = new Map();

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getSignup(email = coverEmail) {
  const key = normalizeEmail(email);
  return key ? signups.get(key) || null : null;
}

function isSignupApproved(email = coverEmail) {
  return getSignup(email)?.status === "approved";
}

function syncAdminSignupStats() {
  const all = [...signups.values()];
  const pending = all.filter((s) => s.status === "pending").length;
  const approved = all.filter((s) => s.status === "approved").length;
  const total = all.length;
  const totalEl = document.getElementById("stat-total-mentors");
  const pendingEl = document.getElementById("stat-pending-mentors");
  const approvedEl = document.getElementById("stat-approved-mentors");
  if (totalEl) totalEl.textContent = String(total);
  if (pendingEl) pendingEl.textContent = String(pending);
  if (approvedEl) approvedEl.textContent = String(approved);
  if (activatePendingCount) activatePendingCount.textContent = String(pending);
  if (activateApprovedCount) activateApprovedCount.textContent = String(approved);
}

function renderActivateAccounts() {
  if (!activateList || !approvedList) {
    syncAdminSignupStats();
    return;
  }

  const pending = [...signups.values()]
    .filter((s) => s.status === "pending")
    .sort((a, b) => b.createdAt - a.createdAt);
  const approved = [...signups.values()]
    .filter((s) => s.status === "approved")
    .sort((a, b) => b.createdAt - a.createdAt);

  activateList.innerHTML = "";
  if (pending.length === 0) {
    activateList.innerHTML = `<p class="admin-empty" id="activate-empty">No pending accounts</p>`;
  } else {
    pending.forEach((signup) => {
      const row = document.createElement("div");
      row.className = "admin-table-row";
      row.innerHTML = `
        <span class="admin-name"></span>
        <span class="admin-badge is-pending">Pending</span>
        <button class="admin-btn admin-btn-solid admin-btn-sm" type="button">Approve</button>
      `;
      row.querySelector(".admin-name").textContent = signup.email;
      row.querySelector("button").addEventListener("click", () => {
        approveSignup(signup.email);
      });
      activateList.appendChild(row);
    });
  }

  approvedList.innerHTML = "";
  if (approved.length === 0) {
    approvedList.innerHTML = `<p class="admin-empty" id="approved-empty">No approved accounts yet</p>`;
  } else {
    approved.forEach((signup) => {
      const row = document.createElement("div");
      row.className = "admin-table-row";
      row.innerHTML = `
        <span class="admin-name"></span>
        <span class="admin-badge is-approved">Approved</span>
      `;
      row.querySelector(".admin-name").textContent = signup.email;
      approvedList.appendChild(row);
    });
  }

  syncAdminSignupStats();
}

function approveSignup(email) {
  const key = normalizeEmail(email);
  const signup = signups.get(key);
  if (!signup) {
    showToast("Signup not found");
    return;
  }
  signup.status = "approved";
  signups.set(key, signup);
  renderActivateAccounts();
  showToast(`${signup.email} approved`);

  // If this client is currently waiting on the lock screen, move them forward
  if (normalizeEmail(coverEmail) === key && appLock && !appLock.hidden) {
    openLicenseActivateStep(signup.email);
    showToast("Approved — enter your license key");
  }
}

function requestSignup(email) {
  const key = normalizeEmail(email);
  const existing = signups.get(key);
  if (existing) {
    coverEmail = existing.email;
    return existing;
  }
  const signup = {
    email: key,
    status: "pending",
    createdAt: Date.now(),
  };
  signups.set(key, signup);
  coverEmail = key;
  renderActivateAccounts();
  return signup;
}

function showLockStep(step) {
  const steps = {
    cover: coverStep,
    pending: pendingStep,
    license: licenseStep,
  };
  Object.entries(steps).forEach(([name, el]) => {
    if (!el) return;
    const on = name === step;
    el.hidden = !on;
    el.classList.toggle("is-active", on);
  });

  if (step === "cover") {
    setTimeout(() => coverEmailInput?.focus(), 40);
  } else if (step === "pending") {
    if (pendingEmailLabel) pendingEmailLabel.textContent = coverEmail || "—";
    if (pendingStepSub) {
      pendingStepSub.textContent = coverEmail
        ? `${coverEmail} is pending approval. A super admin must approve you in Activate Accounts.`
        : "Your signup is pending. You can enter a license key only after approval.";
    }
  } else if (step === "license") {
    setTimeout(() => licenseKeyInput?.focus(), 40);
  }
}

function openPendingStep(email) {
  if (email) coverEmail = normalizeEmail(email);
  showLockStep("pending");
}

function openLicenseActivateStep(email) {
  if (email) coverEmail = normalizeEmail(email);
  if (!isSignupApproved(coverEmail)) {
    openPendingStep(coverEmail);
    showToast("Waiting for super admin approval");
    return;
  }
  if (licenseStepSub) {
    licenseStepSub.textContent = coverEmail
      ? `Approved · ${coverEmail}. Enter your license key to unlock the app.`
      : "Enter your license key to unlock the app.";
  }
  showLockStep("license");
}

function resolveLockStep() {
  const signup = getSignup(coverEmail);
  if (!signup) {
    showLockStep("cover");
    if (coverEmailInput && coverEmail) coverEmailInput.value = coverEmail;
    return;
  }
  if (signup.status === "approved") {
    openLicenseActivateStep(signup.email);
    return;
  }
  openPendingStep(signup.email);
}

function showAppLock(options = {}) {
  const forceLicense = Boolean(options.license);
  if (appLock) appLock.hidden = false;
  phoneEl?.classList.add("is-locked");
  closePairs?.();
  if (licenseKeyInput) licenseKeyInput.value = "";

  if (forceLicense) {
    if (isSignupApproved(coverEmail)) {
      openLicenseActivateStep(coverEmail);
    } else if (getSignup(coverEmail)?.status === "pending") {
      openPendingStep(coverEmail);
      showToast("Account still pending approval");
    } else {
      showLockStep("cover");
      showToast("Request access with your email first");
    }
    return;
  }

  resolveLockStep();
}

function hideAppLock() {
  if (appLock) appLock.hidden = true;
  phoneEl?.classList.remove("is-locked");
}

function openLicenseSheet() {
  showAppLock({ license: true });
}

function closeLicenseSheet() {
  if (!hasActiveBot()) {
    showAppLock();
    return;
  }
  hideAppLock();
}

coverEmailForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const email = (coverEmailInput?.value || "").trim();
  if (!email || !coverEmailInput?.checkValidity()) {
    coverEmailInput?.reportValidity();
    showToast("Enter a valid email");
    return;
  }
  const signup = requestSignup(email);
  if (signup.status === "approved") {
    openLicenseActivateStep(signup.email);
    showToast("Already approved — enter your license key");
    return;
  }
  openPendingStep(signup.email);
  showToast("Signup submitted — waiting for approval");
});

coverBackBtn?.addEventListener("click", () => {
  if (getSignup(coverEmail)) {
    openPendingStep(coverEmail);
  } else {
    showLockStep("cover");
  }
});

pendingBackBtn?.addEventListener("click", () => {
  showLockStep("cover");
});

checkApprovalBtn?.addEventListener("click", () => {
  const signup = getSignup(coverEmail);
  if (!signup) {
    showLockStep("cover");
    showToast("Submit your email first");
    return;
  }
  if (signup.status === "approved") {
    openLicenseActivateStep(signup.email);
    showToast("Approved — enter your license key");
    return;
  }
  showToast("Still pending — wait for super admin");
});

// Keep activate accounts list in sync when opening that admin page
const _showAdminPage = showAdminPage;
showAdminPage = function (name) {
  _showAdminPage(name);
  if (name === "activate" || name === "dashboard") {
    renderActivateAccounts();
  }
};

renderActivateAccounts();

function refreshLicenseBotOptions() {
  if (!licenseBotSelect) return;
  const current = licenseBotSelect.value;
  licenseBotSelect.innerHTML = "";
  const bots = [...botRegistry.values()];
  if (bots.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.disabled = true;
    opt.selected = true;
    opt.textContent = "No bots yet";
    licenseBotSelect.appendChild(opt);
    return;
  }
  bots.forEach((bot) => {
    const opt = document.createElement("option");
    opt.value = bot.id;
    opt.textContent = `${bot.name}${bot.active ? "" : " (removed)"}`;
    licenseBotSelect.appendChild(opt);
  });
  if ([...botRegistry.keys()].includes(current)) {
    licenseBotSelect.value = current;
  }
}

function renderLicenseList() {
  if (!licenseList) return;
  licenseList.innerHTML = "";
  if (licenseCount) licenseCount.textContent = String(licenseKeys.length);
  if (licenseEmpty) licenseEmpty.hidden = licenseKeys.length > 0;

  if (licenseKeys.length === 0) {
    if (licenseEmpty) licenseList.appendChild(licenseEmpty);
    return;
  }

  [...licenseKeys]
    .reverse()
    .forEach((entry) => {
      const row = document.createElement("div");
      row.className = `license-row${entry.used ? " is-used" : ""}`;
      row.innerHTML = `
        <strong></strong>
        <span></span>
      `;
      row.querySelector("strong").textContent = entry.key;
      row.querySelector("span").textContent = `${entry.botName} · ${
        entry.used ? "Used" : "Available"
      }`;
      licenseList.appendChild(row);
    });
}

function hasActiveBot() {
  return [...botRegistry.values()].some((bot) => bot.active);
}

function randomLicenseKey() {
  const chunk = () =>
    Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(2, 6);
  return `APEX-${chunk()}-${chunk()}`;
}

function setHeroEmpty(empty) {
  heroEl?.classList.toggle("is-empty", empty);
  if (empty) {
    if (heroBrandEl) heroBrandEl.textContent = "No active bot";
    if (heroKickerEl) heroKickerEl.textContent = "Activate a bot with a license key";
    if (heroAvatarEl) heroAvatarEl.src = "./assets/avatar.png";
    showAppLock();
  } else {
    hideAppLock();
  }
}

function setActiveHero(bot) {
  heroEl?.classList.remove("is-empty");
  if (heroBrandEl) heroBrandEl.textContent = bot.name;
  if (heroKickerEl) heroKickerEl.textContent = "You are trading with";
  if (heroAvatarEl) heroAvatarEl.src = bot.photo || "./assets/avatar.png";
  hideAppLock();
}

function getActiveBotId() {
  const activeRow = robotList?.querySelector(".robot-row.is-active:not(.robot-add):not(.robot-activate)");
  return activeRow?.dataset.bot || null;
}

function removeActiveBot() {
  const botId = getActiveBotId();
  if (!botId) {
    showToast("No active bot to remove");
    return;
  }
  const bot = botRegistry.get(botId);
  if (!bot || !bot.active) {
    showToast("Bot already removed");
    return;
  }

  bot.active = false;
  botRegistry.set(botId, bot);

  robotList?.querySelectorAll(`.robot-row[data-bot="${botId}"]`).forEach((row) => row.remove());

  const next = robotList?.querySelector(".robot-row:not(.robot-add):not(.robot-activate)");
  if (next) {
    next.classList.add("is-active");
    const nextBot = botRegistry.get(next.dataset.bot);
    if (nextBot) setActiveHero(nextBot);
  } else {
    setHeroEmpty(true);
  }

  refreshLicenseBotOptions();
  showToast(`${bot.name} removed — license key required to restore`);
}

function restoreBotToApp(bot) {
  bot.active = true;
  botRegistry.set(bot.id, bot);
  addEaToHome(bot.name, bot.photo);
  // Ensure data-bot id is set on the row
  const row = [...(robotList?.querySelectorAll(".robot-row") || [])].find((r) => {
    const label = r.querySelector("span");
    return label && label.textContent.trim() === bot.name;
  });
  if (row) {
    row.dataset.bot = bot.id;
    robotList.querySelectorAll(".robot-row").forEach((r) => r.classList.remove("is-active"));
    row.classList.add("is-active");
  }
  setActiveHero(bot);
  refreshLicenseBotOptions();
}

// Patch addEaToHome to register bots
const _addEaToHome = addEaToHome;
addEaToHome = function (name, photoUrl) {
  let botId = [...botRegistry.values()].find((b) => b.name === name)?.id;
  if (!botId) {
    botId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || `bot-${Date.now()}`;
  }
  botRegistry.set(botId, {
    id: botId,
    name,
    photo: photoUrl || "./assets/avatar.png",
    active: true,
  });
  _addEaToHome(name, photoUrl);
  const row = [...(robotList?.querySelectorAll(".robot-row") || [])].find((r) => {
    const label = r.querySelector("span");
    return label && label.textContent.trim() === name;
  });
  if (row) row.dataset.bot = botId;
  refreshLicenseBotOptions();
};

licenseForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const botId = licenseBotSelect?.value;
  const bot = botRegistry.get(botId);
  if (!bot) {
    showToast("Select a bot");
    return;
  }
  const key = randomLicenseKey();
  licenseKeys.push({
    key,
    botId: bot.id,
    botName: bot.name,
    used: false,
    createdAt: Date.now(),
  });
  if (licenseLatest) licenseLatest.textContent = key;
  if (licenseResult) licenseResult.hidden = false;
  renderLicenseList();
  showToast("License key generated");
});

document.getElementById("license-copy")?.addEventListener("click", async () => {
  const key = licenseLatest?.textContent?.trim();
  if (!key) return;
  try {
    await navigator.clipboard.writeText(key);
    showToast("License key copied");
  } catch {
    showToast(key);
  }
});

licenseActivateForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!isSignupApproved(coverEmail)) {
    openPendingStep(coverEmail);
    showToast("Account must be approved first");
    return;
  }
  const key = (licenseKeyInput?.value || "").trim().toUpperCase();
  if (!key) {
    showToast("Enter a license key");
    return;
  }
  const entry = licenseKeys.find((item) => item.key === key);
  if (!entry) {
    showToast("Invalid license key");
    return;
  }
  if (entry.used) {
    showToast("License key already used");
    return;
  }
  const bot = botRegistry.get(entry.botId);
  if (!bot) {
    showToast("Bot not found for this key");
    return;
  }
  if (bot.active) {
    showToast("Bot is already active");
    entry.used = true;
    renderLicenseList();
    closeLicenseSheet();
    return;
  }

  entry.used = true;
  restoreBotToApp(bot);
  renderLicenseList();
  closeLicenseSheet();
  showToast(`${bot.name} activated`);
});

document.querySelectorAll("[data-close-license]").forEach((el) => {
  el.addEventListener("click", closeLicenseSheet);
});

refreshLicenseBotOptions();
renderLicenseList();

/* —— Dual interface (zeta / v2) —— */
let activeInterface = localStorage.getItem("activeInterface") === "v2" ? "v2" : "zeta";
let v2Running = true;
let v2SymTab = "allowed";
let editingSymbol = null;

/** @type {Map<string, {lotSize:number, action:string, platform:string, trades:number}>} */
const symbolMeta = new Map();

function getSymbolMeta(symbol) {
  if (!symbolMeta.has(symbol)) {
    symbolMeta.set(symbol, {
      lotSize: 0.01,
      action: "BOTH",
      platform: "MT5",
      trades: 1,
    });
  }
  return symbolMeta.get(symbol);
}

function getActiveBot() {
  const botId = getActiveBotId();
  if (botId && botRegistry.get(botId)?.active) return botRegistry.get(botId);
  return [...botRegistry.values()].find((bot) => bot.active) || null;
}

function getAccountName() {
  return (document.getElementById("username")?.textContent || "").trim();
}

function showV2View(name) {
  document.querySelectorAll(".v2-view").forEach((view) => {
    const active = view.dataset.v2View === name;
    view.hidden = !active;
    view.classList.toggle("is-active", active);
  });

  const tabTarget = name === "metatrader" ? "metatrader" : "home";
  document.querySelectorAll(".v2-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.v2Tab === tabTarget);
  });
}

function renderV2Home() {
  const bot = getActiveBot();
  const topName = document.getElementById("v2-top-bot-name");
  const botName = document.getElementById("v2-bot-name");
  const avatar = document.getElementById("v2-hero-avatar");
  const account = document.getElementById("v2-account");
  const list = document.getElementById("v2-robot-list");
  const tradeBtn = document.getElementById("v2-trade-btn");
  const tradeLabel = document.getElementById("v2-trade-label");

  const name = bot?.name || "No active bot";
  const photo = bot?.photo || "./assets/avatar.png";
  if (topName) topName.textContent = name;
  if (botName) botName.textContent = name;
  if (avatar) {
    avatar.src = photo;
    avatar.alt = name;
  }

  const accountName = getAccountName();
  if (account) {
    if (accountName) {
      account.hidden = false;
      account.textContent = accountName;
    } else {
      account.hidden = true;
      account.textContent = "";
    }
  }

  if (tradeBtn && tradeLabel) {
    tradeBtn.classList.toggle("is-running", v2Running);
    tradeLabel.textContent = v2Running ? "STOP" : "START";
    const icon = tradeBtn.querySelector(".v2-pill-icon");
    if (icon) {
      icon.innerHTML = v2Running
        ? `<svg viewBox="0 0 24 24" fill="none"><rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor" /></svg>`
        : `<svg viewBox="0 0 24 24" fill="none"><path d="M9 7.2v9.6l8.2-4.8L9 7.2Z" fill="currentColor" /></svg>`;
    }
  }

  if (!list) return;
  list.innerHTML = "";
  const activeBots = [...botRegistry.values()].filter((b) => b.active);
  if (activeBots.length === 0) {
    list.innerHTML = `<p class="v2-robot-empty">No connected robots</p>`;
    return;
  }

  activeBots.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `v2-robot-row${bot && bot.id === item.id ? " is-active" : ""}`;
    btn.dataset.bot = item.id;
    btn.innerHTML = `<img alt="" width="42" height="42" /><span></span>`;
    btn.querySelector("img").src = item.photo || "./assets/avatar.png";
    btn.querySelector("span").textContent = item.name;
    btn.addEventListener("click", () => {
      robotList?.querySelectorAll(".robot-row").forEach((r) => r.classList.remove("is-active"));
      const zetaRow = robotList?.querySelector(`.robot-row[data-bot="${item.id}"]`);
      zetaRow?.classList.add("is-active");
      setActiveHero(item);
      renderV2Home();
      showToast(`${item.name} selected`);
    });
    list.appendChild(btn);
  });
}

function renderV2Symbols() {
  const list = document.getElementById("v2-sym-list");
  const help = document.getElementById("v2-sym-help");
  const title = document.getElementById("v2-quotes-title");
  const bot = getActiveBot();
  if (title) title.textContent = bot?.name || "Quotes";

  document.querySelectorAll("[data-v2-sym-tab]").forEach((tab) => {
    const on = tab.dataset.v2SymTab === v2SymTab;
    tab.classList.toggle("is-active", on);
    tab.setAttribute("aria-selected", on ? "true" : "false");
  });

  if (help) {
    help.textContent =
      v2SymTab === "allowed"
        ? "These are Symbols you have selected for your EA to trade."
        : "All available symbols. Tap one to configure it for your EA.";
  }

  if (!list) return;
  list.innerHTML = "";

  const allowed = getAppSymbols();
  const symbols =
    v2SymTab === "allowed"
      ? ALL_SYMBOLS.filter((s) => allowed.has(s))
      : ALL_SYMBOLS;

  if (symbols.length === 0) {
    list.innerHTML = `<p class="v2-sym-empty">No symbols yet — choose them in Manage EA</p>`;
    return;
  }

  symbols.forEach((symbol) => {
    const meta = getSymbolMeta(symbol);
    const row = document.createElement("button");
    row.type = "button";
    row.className = "v2-sym-row";
    row.innerHTML = `
      <strong></strong>
      <span class="v2-sym-chevron" aria-hidden="true">›</span>
      <div class="v2-sym-meta">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;
    row.querySelector("strong").textContent = symbol;
    const metas = row.querySelectorAll(".v2-sym-meta span");
    metas[0].textContent = `Lot Size ${meta.lotSize}`;
    metas[1].textContent = `Action ${meta.action}`;
    metas[2].textContent = meta.platform;
    row.addEventListener("click", () => openV2SymbolEdit(symbol));
    list.appendChild(row);
  });
}

function openV2SymbolEdit(symbol) {
  editingSymbol = symbol;
  const meta = getSymbolMeta(symbol);
  const title = document.getElementById("v2-edit-symbol-title");
  if (title) title.textContent = symbol;
  const lot = document.getElementById("v2-lot-size");
  const action = document.getElementById("v2-action");
  const platform = document.getElementById("v2-platform");
  const trades = document.getElementById("v2-trades");
  if (lot) lot.value = String(meta.lotSize);
  if (action) action.value = meta.action;
  if (platform) platform.value = meta.platform;
  if (trades) trades.value = String(meta.trades);
  showV2View("symbol-edit");
}

function applyInterface(name, { animate = true } = {}) {
  const next = name === "v2" ? "v2" : "zeta";
  const current = phoneEl?.dataset.interface || "zeta";
  const fromEl = document.getElementById(`iface-${current}`);
  const toEl = document.getElementById(`iface-${next}`);
  if (!toEl) return;

  activeInterface = next;
  localStorage.setItem("activeInterface", next);
  phoneEl?.setAttribute("data-interface", next);

  const finish = () => {
    document.querySelectorAll(".iface-layer").forEach((layer) => {
      const on = layer.dataset.iface === next;
      layer.hidden = !on;
      layer.classList.toggle("is-active", on);
      layer.classList.remove("is-leaving", "is-entering");
    });
    if (next === "v2") {
      renderV2Home();
      showV2View("home");
    } else {
      showView("home");
    }
  };

  if (!animate || current === next || !fromEl) {
    finish();
    return;
  }

  fromEl.classList.add("is-leaving");
  toEl.hidden = false;
  toEl.classList.add("is-entering");
  requestAnimationFrame(() => {
    toEl.classList.remove("is-entering");
    toEl.classList.add("is-active");
  });
  window.setTimeout(finish, 280);
}

window.__switchIface = function () {
  applyInterface(activeInterface === "zeta" ? "v2" : "zeta");
};
document.querySelectorAll("[data-v2-action]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const action = btn.dataset.v2Action;
    if (action === "trade") {
      v2Running = !v2Running;
      // Keep zeta start/stop roughly in sync when present
      if (stopBtn) {
        stopBtn.classList.toggle("is-running", v2Running);
        stopBtn.setAttribute("aria-pressed", v2Running ? "true" : "false");
        const label = stopBtn.querySelector(".stop-label");
        if (label) label.textContent = v2Running ? "STOP" : "START";
      }
      renderV2Home();
      const bot = getActiveBot();
      showToast(v2Running ? `${bot?.name || "Bot"} started` : "Bot stopped");
      return;
    }
    if (action === "quotes") {
      v2SymTab = "allowed";
      renderV2Symbols();
      showV2View("quotes");
      return;
    }
    if (action === "remove") {
      removeActiveBot();
      renderV2Home();
    }
  });
});

document.querySelectorAll("[data-v2-tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    const name = tab.dataset.v2Tab;
    showV2View(name);
  });
});

document.querySelectorAll("[data-v2-back]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.v2Back || "home";
    if (target === "quotes") renderV2Symbols();
    if (target === "home") renderV2Home();
    showV2View(target);
  });
});

document.querySelectorAll("[data-v2-sym-tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    v2SymTab = tab.dataset.v2SymTab === "all" ? "all" : "allowed";
    renderV2Symbols();
  });
});

document.getElementById("v2-symbol-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!editingSymbol) return;
  const lotSize = Number(document.getElementById("v2-lot-size")?.value || 0.01);
  const action = document.getElementById("v2-action")?.value || "BOTH";
  const platform = document.getElementById("v2-platform")?.value || "MT5";
  const trades = Number(document.getElementById("v2-trades")?.value || 1);
  symbolMeta.set(editingSymbol, {
    lotSize: Number.isFinite(lotSize) && lotSize > 0 ? lotSize : 0.01,
    action,
    platform,
    trades: Number.isFinite(trades) && trades > 0 ? Math.floor(trades) : 1,
  });

  // Ensure symbol is allowed on at least one EA / app when editing from All Symbols
  if (![...getAppSymbols()].includes(editingSymbol)) {
    const firstEa = eaSymbols.keys().next().value;
    if (firstEa) {
      const set = eaSymbols.get(firstEa) || new Set();
      set.add(editingSymbol);
      eaSymbols.set(firstEa, set);
      refreshEaItemSymbols(firstEa);
      syncPairsFromEas();
    }
  }

  showToast(`${editingSymbol} saved`);
  renderV2Symbols();
  showV2View("quotes");
});

document.getElementById("v2-delete-symbol")?.addEventListener("click", () => {
  if (!editingSymbol) return;
  const symbol = editingSymbol;
  removeSymbolFromAllEas(symbol);
  symbolMeta.delete(symbol);
  editingSymbol = null;
  showToast(`${symbol} removed`);
  renderV2Symbols();
  showV2View("quotes");
});

const _setActiveHero = setActiveHero;
setActiveHero = function (bot) {
  _setActiveHero(bot);
  if (activeInterface === "v2") renderV2Home();
};

const _setHeroEmpty = setHeroEmpty;
setHeroEmpty = function (empty) {
  _setHeroEmpty(empty);
  if (activeInterface === "v2") renderV2Home();
};

const _syncPairsFromEas = syncPairsFromEas;
syncPairsFromEas = function () {
  _syncPairsFromEas();
  if (activeInterface === "v2") {
    const quotesOpen = document.getElementById("v2-view-quotes")?.classList.contains("is-active");
    if (quotesOpen) renderV2Symbols();
  }
};

const _addEaToHomeV2 = addEaToHome;
addEaToHome = function (name, photoUrl) {
  _addEaToHomeV2(name, photoUrl);
  if (activeInterface === "v2") renderV2Home();
};

applyInterface(activeInterface, { animate: false });

// Fresh in-memory start: no seeded bots/EAs/pending data
if (!hasActiveBot()) {
  setHeroEmpty(true);
}