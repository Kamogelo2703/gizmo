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

const selected = new Set(["EURUSD", "XAUUSD"]);
const pairsSheet = document.getElementById("pairs-sheet");
const selectedList = document.getElementById("selected-symbols");
const availableList = document.getElementById("available-symbols");
const selectedEmpty = document.getElementById("selected-empty");
const pairsCount = document.getElementById("pairs-count");

function renderPairs() {
  selectedList.innerHTML = "";
  availableList.innerHTML = "";

  const selectedItems = ALL_SYMBOLS.filter((s) => selected.has(s));
  const availableItems = ALL_SYMBOLS.filter((s) => !selected.has(s));

  pairsCount.textContent = `${selectedItems.length} selected`;
  selectedEmpty.hidden = selectedItems.length > 0;

  selectedItems.forEach((symbol) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "symbol-chip is-selected";
    btn.dataset.symbol = symbol;
    btn.innerHTML = `<span>${symbol}</span><span class="chip-x" aria-hidden="true">×</span>`;
    btn.addEventListener("click", () => {
      selected.delete(symbol);
      renderPairs();
      showToast(`${symbol} removed`);
    });
    selectedList.appendChild(btn);
  });

  availableItems.forEach((symbol) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "symbol-chip is-available";
    btn.dataset.symbol = symbol;
    btn.innerHTML = `<span>${symbol}</span><span aria-hidden="true">+</span>`;
    btn.addEventListener("click", () => {
      selected.add(symbol);
      renderPairs();
      showToast(`${symbol} selected`);
    });
    availableList.appendChild(btn);
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

function addEaToHome(name) {
  if (!robotList) return;
  const existing = Array.from(robotList.querySelectorAll(".robot-row span")).some(
    (span) => span.textContent.trim() === name
  );
  if (existing) return;

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
  row.querySelector("span").textContent = name;
  row.addEventListener("click", () => {
    robotList.querySelectorAll(".robot-row").forEach((r) => r.classList.remove("is-active"));
    if (!row.classList.contains("robot-add")) row.classList.add("is-active");
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
  const symbol = form.symbol.value;
  const risk = form.risk.value;
  const timeframe = form.timeframe.value;

  if (!name) {
    showToast("Enter a robot name");
    return;
  }

  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const item = document.createElement("div");
  item.className = "ea-item";
  item.dataset.eaId = id;
  item.innerHTML = `
    <img src="./assets/avatar.png" alt="" width="40" height="40" />
    <div class="ea-meta">
      <strong></strong>
      <span></span>
    </div>
    <span class="admin-badge is-approved">Live</span>
  `;
  item.querySelector("strong").textContent = name;
  item.querySelector(".ea-meta span").textContent = `${strategyLabels[strategy] || strategy} · ${symbol} · ${timeframe} · Risk ${risk}%`;
  eaList?.prepend(item);

  if (eaCount) {
    eaCount.textContent = String(eaList.querySelectorAll(".ea-item").length);
  }

  addEaToHome(name);
  form.reset();
  form.risk.value = "1";
  form.timeframe.value = "M5";
  showToast(`${name} created`);
});
