const API_BASE = "/api/paypal";

async function apiFetch(path, { method = "GET", body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message =
      (data && (data.error || data.message)) ||
      (typeof data === "string" ? data : `PayPal request failed (${response.status})`);
    throw new Error(message);
  }
  return data;
}

export async function fetchPaypalConfig() {
  return apiFetch("/config");
}

export async function createPaypalOrder(email) {
  return apiFetch("/create-order", {
    method: "POST",
    body: { email },
  });
}

export async function capturePaypalOrder(orderId, email) {
  return apiFetch("/capture-order", {
    method: "POST",
    body: { orderId, email },
  });
}

let paypalSdkPromise = null;

export function loadPaypalSdk(clientId) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("PayPal only runs in the browser"));
  }
  if (window.paypal) return Promise.resolve(window.paypal);
  if (paypalSdkPromise) return paypalSdkPromise;

  paypalSdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-apexea-paypal]");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.paypal));
      existing.addEventListener("error", () => reject(new Error("PayPal SDK failed to load")));
      return;
    }
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
      clientId
    )}&currency=USD&intent=capture&components=buttons`;
    script.async = true;
    script.dataset.apexeaPaypal = "1";
    script.onload = () => {
      if (!window.paypal) {
        reject(new Error("PayPal SDK missing after load"));
        return;
      }
      resolve(window.paypal);
    };
    script.onerror = () => reject(new Error("PayPal SDK failed to load"));
    document.head.appendChild(script);
  });

  return paypalSdkPromise;
}
