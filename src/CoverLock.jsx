import { useEffect, useRef, useState } from "react";
import { useApp } from "./store.jsx";

export default function CoverLock() {
  const {
    hasActiveBot,
    lockStep,
    setLockStep,
    coverEmail,
    setCoverEmail,
    requestSignup,
    getSignup,
    activateLicense,
    showToast,
    openAdmin,
    refreshSignups,
  } = useApp();

  const [email, setEmail] = useState(coverEmail || "");
  const [licenseKey, setLicenseKey] = useState("");
  const hotspotRef = useRef({ count: 0, first: 0 });

  useEffect(() => {
    setEmail(coverEmail || "");
  }, [coverEmail]);

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
    setLockStep("pending");
    showToast("Signup submitted — waiting for approval");
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
      setLockStep("pending");
      showToast("Resubmitted — waiting for approval");
      return;
    }
    showToast("Still pending — wait for super admin");
  }

  function submitLicense(event) {
    event.preventDefault();
    void activateLicense(licenseKey);
  }

  return (
    <div className="app-lock">
      <div className="app-lock-glow" aria-hidden="true" />
      <div className="app-lock-content">
        <div className="app-lock-orb">
          <img src="/logo.png" alt="ApexEA" width="96" height="96" />
        </div>

        {lockStep === "cover" && (
          <section className="cover-step is-active">
            <h2 className="app-lock-title cover-title">Unlock ApexEA</h2>
            <p className="app-lock-sub">
              Enter your email to request access. A super admin must approve you
              before you can use a license key.
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
                Get Lifetime Access
              </button>
            </form>
          </section>
        )}

        {lockStep === "pending" && (
          <section className="cover-step is-active">
            <p className="app-lock-eyebrow">
              {declined ? "Access declined" : "Pending approval"}
            </p>
            <h2 className="app-lock-title">
              {declined ? "Request declined" : "Waiting for super admin"}
            </h2>
            <p className="app-lock-sub">
              {declined
                ? `${coverEmail || "Your account"} was declined. You can change email or resubmit to request again.`
                : `${coverEmail} is pending approval. A super admin must approve or decline you in Activate Accounts.`}
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
              onClick={checkStatus}
            >
              {declined ? "Resubmit for approval" : "Check approval status"}
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
                  type="text"
                  placeholder="APEX-XXXX-XXXX"
                  autoComplete="off"
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  required
                />
              </label>
              <button className="admin-btn admin-btn-solid admin-btn-block" type="submit">
                Activate bot
              </button>
            </form>
            <button
              className="cover-back"
              type="button"
              onClick={() => setLockStep("pending")}
            >
              ← Back
            </button>
          </section>
        )}

        <p className="app-lock-admin">
          Powered by{" "}
          <span className="apexea-hotspot" onClick={onHotspotClick}>
            ApexEA
          </span>
        </p>
      </div>
    </div>
  );
}
