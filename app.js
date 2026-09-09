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
    document
      .querySelectorAll(".tab")
      .forEach((item) => item.classList.remove("is-active"));
    tab.classList.add("is-active");
    const labels = {
      home: "Home",
      scanner: "Scanner",
      metatrader: "MetaTrader",
    };
    showToast(labels[tab.dataset.tab] || "Opened");
  });
});

document.getElementById("username").textContent = "";
