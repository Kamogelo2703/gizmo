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
      showToast("Opening pairs");
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

// Intentionally leave username empty per request.
document.getElementById("username").textContent = "";
