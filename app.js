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
    showToast("Add New Trading Bot");
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
