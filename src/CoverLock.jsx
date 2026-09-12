import { useEffect, useRef, useState } from "react";
import {
  capturePaypalOrder,
  createPaypalOrder,
  fetchPaypalConfig,
  loadPaypalSdk,
} from "./paypalApi.js";
import { useApp } from "./store.jsx";

export default function CoverLock() {
  const {
    hasActiveBot,
    lockStep,
    setLockStep,
    coverEmail,
    requestSignup,
    getSignup,
    activateLicense,
    showToast,
    openAdmin,
    refreshSignups,
  } = useApp();

  const [email, setEmail] = useState(coverEmail || "");
  const [licenseKey, setLicenseKey] = useState("");
  const [paying, setPaying] = useState(false);
  const [paypalReady, setPaypalReady] = useState(false);
  const [paypalError, setPaypalError] = useState("");
  const hotspotRef = useRef({ count: 0, first: 0 });
  const paypalButtonsRef = useRef(null);
  const paypalRenderedRef = useRef(false);

  useEffect(() => {
    setEmail(coverEmail || "");
  }, [coverEmail]);

  useEffect(() => {
    if (lockStep !== "pay") {
      paypalRenderedRef.current = false;
      if (paypalButtonsRef.current) paypalButtonsRef.current.innerHTML = "";
      return undefined;
    }

    let cancelled = false;

    (async () => {
      setPaypalError("");
      setPaypalReady(false);
      try {
        const config = await fetchPaypalConfig();
        if (!config?.clientId) {
          throw new Error("PayPal client id is missing");
        }
        if (!config.ready) {
          throw new Error(
            "PayPal secret not set yet. Add PAYPAL_CLIENT_SECRET on Vercel, then retry."
          );
        }
        const paypal = await loadPaypalSdk(config.clientId);
        if (cancelled || !paypalButtonsRef.current) return;

        paypalButtonsRef.current.innerHTML = "";
        paypalRenderedRef.current = true;

        paypal
          .Buttons({
            style: {
              layout: "vertical",
              color: "gold",
              shape: "rect",
              label: "pay",
            },
            createOrder: async () => {
              const order = await createPaypalOrder(coverEmail || email);
              if (!order?.id) throw new Error("Could not start PayPal checkout");
              return order.id;
            },
            onApprove: async (data) => {
              setPaying(true);
              try {
                const result = await capturePaypalOrder(
                  data.orderID,
                  coverEmail || email
                );
                await refreshSignups?.();
                setLockStep("license");
                showToast(
                  result?.email
                    ? `Payment received — ${result.email} approved`
                    : "Payment received — account approved"
                );
              } catch (error) {
                showToast(error.message || "Payment capture failed");
              } finally {
                setPaying(false);
              }
            },
            onError: (error) => {
              console.error(error);
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
    };
  }, [lockStep, coverEmail, email, refreshSignups, setLockStep, showToast]);

  if (hasActiveBot) return null;

  const signup = getSignup(coverEmail || email);
  const declined = signup?.status === "declined";

  function onHotspotClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const now = Date.now();
    if (now - hotspotRef.current.first > 600) {
      hotspotRef.current = { count: 1, first: now };
    } else {
      hotspotRef.current.count += 1;
    }
    if (hotspotRef.current.count >= 3) {
      hotspotRef.current = { count: 0, first: 0 };
      openAdmin("dashboard");
      showToast("Admin portal");
    }
  }

  async function submitEmail(event) {
    event.preventDefault();
    if (!email.trim() || !event.currentTarget.checkValidity()) {
      showToast("Enter a valid email");
      return;
    }
    const key = await requestSignup(email);
    if (!key) return;
    const current = getSignup(key) || { email: key, status: "pending" };
    if (current?.status === "approved") {
      setLockStep("license");
      showToast("Already approved — enter your license key");
      return;
    }
    setLockStep("pay");
    showToast("Continue with PayPal for lifetime access");
  }

  async function checkStatus() {
    const key = String(coverEmail || email || "")
      .trim()
      .toLowerCase();
    const merged = await refreshSignups?.();
    const current =
      (Array.isArray(merged) ? merged.find((s) => s.email === key) : null) ||
      getSignup(key);
    if (!current) {
      setLockStep("cover");
      showToast("Submit your email first");
      return;
    }
    if (current.status === "approved") {
      setLockStep("license");
      showToast("Approved — enter your license key");
      return;
    }
    if (current.status === "declined") {
      await requestSignup(current.email);
      setLockStep("pay");
      showToast("Resubmitted — pay to unlock lifetime access");
      return;
    }
    setLockStep("pay");
    showToast("Payment still needed for lifetime access");
  }

  function submitLicense(event) {
    event.preventDefault();
    void activateLicense(licenseKey);
  }

  return (
    <div className="app-lock">
      <div className="app-lock-glow" aria-hidden="true" />
      <div className="app-lock-content">
        <div className="app-lock-orb" onClick={onHotspotClick}>
          <img src="/logo.png" alt="ApexEA" width="96" height="96" />
        </div>

        {lockStep === "cover" && (
          <section className="cover-step is-active">
            <h2 className="app-lock-title cover-title">Unlock ApexEA</h2>
            <p className="app-lock-sub">
              Enter your email, then pay once for lifetime access. After payment
              your account is approved automatically.
            </p>
            <form className="app-lock-form" onSubmit={submitEmail}>
              <label className="ea-field">
                <span>Email</span>
                <input
                  className="admin-input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <button className="admin-btn admin-btn-solid admin-btn-block" type="submit">
                Get Lifetime Access — $35.60
              </button>
            </form>
          </section>
        )}

        {lockStep === "pay" && (
          <section className="cover-step is-active">
            <p className="app-lock-eyebrow">Lifetime access</p>
            <h2 className="app-lock-title">Pay with PayPal</h2>
            <p className="app-lock-sub">
              One-time payment of <strong>$35.60 USD</strong> for{" "}
              <strong>{coverEmail || email || "your email"}</strong>. When PayPal
              confirms, you are auto-approved.
            </p>
            <div className="paypal-panel">
              {paypalError ? (
                <p className="ea-hint" style={{ color: "#ffb4b4" }}>
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
              onClick={checkStatus}
              style={{ marginTop: 12 }}
            >
              I already paid — check status
            </button>
            <button
              className="cover-back"
              type="button"
              onClick={() => setLockStep("cover")}
            >
              ← Change email
            </button>
          </section>
        )}

        {lockStep === "pending" && (
          <section className="cover-step is-active">
            <p className="app-lock-eyebrow">
              {declined ? "Access declined" : "Pending approval"}
            </p>
            <h2 className="app-lock-title">
              {declined ? "Request declined" : "Waiting for approval"}
            </h2>
            <p className="app-lock-sub">
              {declined
                ? `${coverEmail || "Your account"} was declined. You can change email or pay again for lifetime access.`
                : `${coverEmail} is pending. Pay for lifetime access to get approved instantly, or wait for a super admin.`}
            </p>
            <div className="pending-status-card">
              <span className={`admin-badge ${declined ? "is-declined" : "is-pending"}`}>
                {declined ? "Declined" : "Pending"}
              </span>
              <strong>{coverEmail || "—"}</strong>
            </div>
            <button
              className="admin-btn admin-btn-solid admin-btn-block"
              type="button"
              onClick={() => setLockStep("pay")}
            >
              Pay $35.60 for lifetime access
            </button>
            <button
              className="admin-btn admin-btn-outline admin-btn-block"
              type="button"
              onClick={checkStatus}
              style={{ marginTop: 10 }}
            >
              Check approval status
            </button>
            <button
              className="cover-back"
              type="button"
              onClick={() => setLockStep("cover")}
            >
              ← Change email
            </button>
          </section>
        )}

        {lockStep === "license" && (
          <section className="cover-step is-active">
            <p className="app-lock-eyebrow">ApexEA</p>
            <h2 className="app-lock-title">Activate license key</h2>
            <p className="app-lock-sub">
              {coverEmail
                ? `Approved · ${coverEmail}. Enter your license key to unlock the app.`
                : "Enter your license key to unlock the app."}
            </p>
            <form className="app-lock-form" onSubmit={submitLicense}>
              <label className="ea-field">
                <span>License key</span>
                <input
                  className="admin-input"
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  placeholder="APEX-XXXX-XXXX"
                  autoCapitalize="characters"
                  required
                />
              </label>
              <button className="admin-btn admin-btn-solid admin-btn-block" type="submit">
                Unlock app
              </button>
            </form>
            <button
              className="cover-back"
              type="button"
              onClick={() => setLockStep("cover")}
            >
              ← Change email
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
