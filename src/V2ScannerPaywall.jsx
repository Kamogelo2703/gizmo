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
    getSignup,
    showToast,
    refreshSignups,
  } = useApp();

  const [email, setEmail] = useState(coverEmail || "");
  const [amount, setAmount] = useState("35.60");
  const [paying, setPaying] = useState(false);
  const [checking, setChecking] = useState(false);
  const [showAlreadyPaid, setShowAlreadyPaid] = useState(false);
  const [paidEmail, setPaidEmail] = useState(coverEmail || "");
  const [paypalReady, setPaypalReady] = useState(false);
  const [paypalError, setPaypalError] = useState("");
  const paypalButtonsRef = useRef(null);

  useEffect(() => {
    setEmail(coverEmail || "");
    if (!showAlreadyPaid) setPaidEmail(coverEmail || "");
  }, [coverEmail, showAlreadyPaid]);

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
          setPaypalError("Enter your account email before paying.");
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
              // Always create a scanner-purpose order — separate from app access.
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
                // Only unlock when this capture was a scanner purchase.
                if (result?.purpose === "scanner" || result?.premiumScanner) {
                  unlockV2ScannerPremium?.(result?.email || buyer);
                  showToast("Premium scanner unlocked — 20 scans per day");
                } else {
                  showToast(
                    "That payment was for app access only. Chart Scanner needs its own payment."
                  );
                }
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

  async function checkAlreadyPaid(event) {
    event?.preventDefault?.();
    const buyer = String(paidEmail || coverEmail || email || "")
      .trim()
      .toLowerCase();
    if (!buyer || !buyer.includes("@")) {
      showToast("Enter the email you paid with");
      return;
    }
    setChecking(true);
    try {
      setCoverEmail?.(buyer);
      const merged = await refreshSignups?.();
      const fromRemote = Array.isArray(merged)
        ? merged.find((row) => String(row.email || "").toLowerCase() === buyer)
        : null;
      const signup = fromRemote || getSignup?.(buyer);
      if (signup?.premiumScanner) {
        unlockV2ScannerPremium?.(buyer);
        showToast("Premium scanner restored for this email");
      } else {
        showToast(
          "No premium scanner payment found for this email. App access payment does not unlock the scanner — please pay again."
        );
      }
    } catch (error) {
      showToast(error.message || "Could not check payment status");
    } finally {
      setChecking(false);
    }
  }

  return (
    <section className="v2-scanner-paywall" aria-label="Premium scanner unlock">
      <div className="v2-scanner-paywall-card">
        <p className="v2-scanner-paywall-eyebrow">Premium</p>
        <h2 className="v2-scanner-paywall-title">Unlock Chart Scanner</h2>
        <p className="v2-scanner-paywall-copy">
          Interface 2 Chart Scanner is a separate premium purchase. Pay{" "}
          <strong>${amount} USD</strong> once with PayPal to unlock it. The
          premium scanner comes with <strong>20 scans per day</strong>.
        </p>
        <p className="v2-scanner-paywall-note">
          App access / homepage subscription does not unlock this scanner — even
          with the same email, you must pay for the scanner separately.
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

        {showAlreadyPaid ? (
          <form className="v2-scanner-paywall-form" onSubmit={checkAlreadyPaid}>
            <label className="ea-field">
              <span>Email you paid with</span>
              <input
                className="admin-input"
                type="email"
                value={paidEmail}
                onChange={(e) => setPaidEmail(e.target.value)}
                placeholder="you@email.com"
                required
                autoFocus
              />
            </label>
            <button
              className="admin-btn admin-btn-solid admin-btn-block"
              type="submit"
              disabled={checking}
            >
              {checking ? "Checking…" : "Restore scanner access"}
            </button>
            <button
              className="v2-scanner-paywall-already"
              type="button"
              onClick={() => setShowAlreadyPaid(false)}
              disabled={checking}
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            className="v2-scanner-paywall-already"
            type="button"
            onClick={() => {
              setPaidEmail(coverEmail || email || "");
              setShowAlreadyPaid(true);
            }}
          >
            Already paid?
          </button>
        )}

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
