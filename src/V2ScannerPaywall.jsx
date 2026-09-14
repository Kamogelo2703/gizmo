import { useEffect, useRef, useState } from "react";
import {
  capturePaypalOrder,
  createPaypalOrder,
  fetchPaypalConfig,
  loadPaypalSdk,
} from "./paypalApi.js";
import { useApp } from "./store.jsx";

export default function V2ScannerPaywall({ onClose }) {
  const {
    coverEmail,
    setCoverEmail,
    unlockV2ScannerPremium,
    showToast,
    refreshSignups,
  } = useApp();

  const [email, setEmail] = useState(coverEmail || "");
  const [amount, setAmount] = useState("35.60");
  const [paying, setPaying] = useState(false);
  const [paypalReady, setPaypalReady] = useState(false);
  const [paypalError, setPaypalError] = useState("");
  const paypalButtonsRef = useRef(null);

  useEffect(() => {
    setEmail(coverEmail || "");
  }, [coverEmail]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPaypalError("");
      setPaypalReady(false);
      try {
        const config = await fetchPaypalConfig();
        if (cancelled) return;
        if (config?.amount) setAmount(String(config.amount));
        if (!config?.clientId) throw new Error("PayPal client id is missing");
        if (!config.ready) {
          throw new Error(
            "PayPal secret not set yet. Add PAYPAL_CLIENT_SECRET on Vercel, then retry."
          );
        }

        const buyer = String(coverEmail || email || "")
          .trim()
          .toLowerCase();
        if (!buyer || !buyer.includes("@")) {
          setPaypalError("Enter the account email used for ApexEA access first.");
          return;
        }

        const paypal = await loadPaypalSdk(config.clientId);
        if (cancelled || !paypalButtonsRef.current) return;
        paypalButtonsRef.current.innerHTML = "";

        paypal
          .Buttons({
            style: {
              layout: "vertical",
              color: "gold",
              shape: "rect",
              label: "pay",
            },
            createOrder: async () => {
              const order = await createPaypalOrder(buyer, "scanner");
              if (!order?.id) throw new Error("Could not start PayPal checkout");
              return order.id;
            },
            onApprove: async (data) => {
              setPaying(true);
              try {
                const result = await capturePaypalOrder(
                  data.orderID,
                  buyer,
                  "scanner"
                );
                await refreshSignups?.();
                unlockV2ScannerPremium?.(result?.email || buyer);
                showToast("Premium scanner unlocked");
              } catch (error) {
                showToast(error.message || "Payment capture failed");
              } finally {
                setPaying(false);
              }
            },
            onError: () => {
              showToast("PayPal checkout error — try again");
            },
            onCancel: () => {
              showToast("Payment cancelled");
            },
          })
          .render(paypalButtonsRef.current);

        if (!cancelled) setPaypalReady(true);
      } catch (error) {
        if (!cancelled) {
          setPaypalError(error.message || "PayPal is unavailable");
          setPaypalReady(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (paypalButtonsRef.current) paypalButtonsRef.current.innerHTML = "";
    };
  }, [
    coverEmail,
    email,
    refreshSignups,
    showToast,
    unlockV2ScannerPremium,
  ]);

  function saveEmail(event) {
    event.preventDefault();
    const next = String(email || "")
      .trim()
      .toLowerCase();
    if (!next || !next.includes("@")) {
      showToast("Enter a valid email");
      return;
    }
    setCoverEmail?.(next);
    showToast("Email saved — PayPal will load");
  }

  return (
    <section className="v2-scanner-paywall" aria-label="Premium scanner unlock">
      <div className="v2-scanner-paywall-card">
        <p className="v2-scanner-paywall-eyebrow">Premium</p>
        <h2 className="v2-scanner-paywall-title">Unlock Chart Scanner</h2>
        <p className="v2-scanner-paywall-copy">
          Interface 2 Chart Scanner is a premium tool. Unlock it with the same
          one-time PayPal payment used for ApexEA access —{" "}
          <strong>${amount} USD</strong>.
        </p>

        {!coverEmail ? (
          <form className="v2-scanner-paywall-form" onSubmit={saveEmail}>
            <label className="ea-field">
              <span>Account email</span>
              <input
                className="admin-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                required
              />
            </label>
            <button className="admin-btn admin-btn-solid admin-btn-block" type="submit">
              Continue to PayPal
            </button>
          </form>
        ) : (
          <p className="v2-scanner-paywall-email">
            Paying for <strong>{coverEmail}</strong>
          </p>
        )}

        <div className="paypal-panel v2-scanner-paywall-paypal">
          {paypalError ? (
            <p className="ea-hint" style={{ color: "#b42318" }}>
              {paypalError}
            </p>
          ) : null}
          {!paypalReady && !paypalError ? (
            <p className="ea-hint">Loading PayPal…</p>
          ) : null}
          <div ref={paypalButtonsRef} className="paypal-buttons" />
          {paying ? <p className="ea-hint">Confirming payment…</p> : null}
        </div>

        <button
          className="admin-btn admin-btn-outline admin-btn-block"
          type="button"
          onClick={onClose}
        >
          Back to Home
        </button>
      </div>
    </section>
  );
}
