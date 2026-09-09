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

document.querySelectorAll(".control").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "start") {
      button.classList.toggle("is-running");
      const running = button.classList.contains("is-running");
      button.querySelector(".control-label").textContent = running
        ? "STOP"
        : "START";
      showToast(running ? "ZETA SCALPER AI started" : "Bot stopped");
      return;
    }
    if (action === "remove") {
      showToast("Bot removed from session");
      return;
    }
    if (action === "quotes") {
      showToast("Opening live quotes");
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
