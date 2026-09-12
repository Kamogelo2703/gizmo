import { useEffect, useMemo, useState } from "react";
import AdminAuth from "./AdminAuth.jsx";
import {
  fetchMentors,
  updateMentorStatus,
} from "./mentorsApi.js";
import { STRATEGY_LABELS, useApp } from "./store.jsx";
import { APP_COLOR_PRESETS, DEFAULT_APP_COLOR } from "./theme.js";

const ADMIN_SESSION_KEY = "apexea-admin-session";

function isUploadedProfilePhoto(value) {
  const photo = String(value || "").trim();
  if (!photo) return false;
  if (photo === "/logo.png") return false;
  // Uploaded images are stored as data URLs (or remote URLs if ever used).
  return photo.startsWith("data:image/") || /^https?:\/\//i.test(photo);
}

function readAdminSession() {
  try {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeAdminSession(mentor) {
  if (!mentor) {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    return;
  }
  sessionStorage.setItem(
    ADMIN_SESSION_KEY,
    JSON.stringify({
      id: mentor.id,
      email: mentor.email,
      username: mentor.username,
      role: mentor.role,
      status: mentor.status,
    })
  );
}

export default function AdminPortal() {
  const {
    adminOpen,
    adminPage,
    setAdminPage,
    signups,
    setSignupStatus,
    refreshSignups,
    eas,
    upsertEa,
    deleteEa,
    editingEaId,
    setEditingEaId,
    bots,
    licenseKeys,
    generateLicense,
    refreshLicenses,
    catalog,
    ensureCatalog,
    normalizeSymbol,
    showToast,
    appColor,
    setAppColor,
  } = useApp();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [adminSession, setAdminSession] = useState(() => readAdminSession());
  const [mentors, setMentors] = useState([]);
  const [photo, setPhoto] = useState("/logo.png");
  const [photoUploaded, setPhotoUploaded] = useState(false);
  const [name, setName] = useState("");
  const [strategy, setStrategy] = useState("scalper");
  const [draftSymbols, setDraftSymbols] = useState([]);
  const [customSymbol, setCustomSymbol] = useState("");
  const [licenseBotId, setLicenseBotId] = useState("");
  const [licenseClientName, setLicenseClientName] = useState("");
  const [licenseClientEmail, setLicenseClientEmail] = useState("");
  const [latestKey, setLatestKey] = useState("");
  const [latestLicenseMeta, setLatestLicenseMeta] = useState(null);

  const pending = useMemo(
    () => signups.filter((s) => s.status === "pending").sort((a, b) => b.createdAt - a.createdAt),
    [signups]
  );
  const approved = useMemo(
    () => signups.filter((s) => s.status === "approved").sort((a, b) => b.createdAt - a.createdAt),
    [signups]
  );
  const declined = useMemo(
    () => signups.filter((s) => s.status === "declined").sort((a, b) => b.createdAt - a.createdAt),
    [signups]
  );
  const pendingMentors = useMemo(
    () =>
      mentors
        .filter((m) => String(m.status || "").toLowerCase() === "pending")
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [mentors]
  );
  const approvedMentors = useMemo(
    () =>
      mentors
        .filter((m) => {
          const status = String(m.status || "").toLowerCase();
          const role = String(m.role || "").toLowerCase();
          return status === "approved" || role === "superadmin";
        })
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [mentors]
  );
  const declinedMentors = useMemo(
    () =>
      mentors
        .filter((m) => String(m.status || "").toLowerCase() === "declined")
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [mentors]
  );

  useEffect(() => {
    if (!editingEaId) return;
    const ea = eas.find((e) => e.id === editingEaId);
    if (!ea) return;
    setName(ea.name);
    setStrategy(ea.strategy);
    setPhoto(ea.photo || "/logo.png");
    setPhotoUploaded(isUploadedProfilePhoto(ea.photo));
    setDraftSymbols([...ea.symbols]);
  }, [editingEaId, eas]);

  useEffect(() => {
    if (!licenseBotId && eas[0]) setLicenseBotId(eas[0].id);
  }, [eas, licenseBotId]);

  useEffect(() => {
    if (!adminOpen) return undefined;
    refreshSignups?.();
    const timer = setInterval(() => {
      refreshSignups?.();
    }, 8000);
    return () => clearInterval(timer);
  }, [adminOpen, adminPage, refreshSignups]);

  useEffect(() => {
    if (!adminOpen || !adminSession) return undefined;
    let cancelled = false;
    async function loadMentors() {
      try {
        const list = await fetchMentors();
        if (!cancelled) setMentors(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setMentors([]);
      }
    }
    loadMentors();
    // Poll faster on Mentors page so new signups show in Pending quickly.
    const ms = adminPage === "mentors" ? 5000 : 12000;
    const timer = setInterval(loadMentors, ms);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [adminOpen, adminSession, adminPage]);

  async function refreshMentorsList() {
    try {
      const list = await fetchMentors();
      setMentors(Array.isArray(list) ? list : []);
      showToast("Mentors refreshed");
    } catch (error) {
      showToast(error.message || "Could not refresh mentors");
    }
  }

  useEffect(() => {
    if (!adminSession) return;
    const isSuper =
      String(adminSession.role || "").toLowerCase() === "superadmin";
    const mentorPages = new Set([
      "dashboard",
      "manage-ea",
      "licenses",
      "profile",
      "settings",
    ]);
    if (!isSuper && !mentorPages.has(adminPage)) {
      setAdminPage("dashboard");
    }
  }, [adminSession, adminPage, setAdminPage]);

  if (!adminOpen) return null;

  function onAuthenticated(mentor) {
    writeAdminSession(mentor);
    setAdminSession(mentor);
    setAdminPage("dashboard");
  }

  function logoutAdmin() {
    writeAdminSession(null);
    setAdminSession(null);
    setDrawerOpen(false);
    setAdminPage("dashboard");
    // Stay on /admin so the mentor sign-in/register screen shows — do not close admin.
    if (typeof window !== "undefined" && !window.location.pathname.includes("/admin")) {
      window.history.pushState({ apexAdmin: true }, "", "/admin");
    }
    showToast("Signed out");
  }

  async function changeMentorStatus(email, status) {
    try {
      const updated = await updateMentorStatus(email, status);
      setMentors((prev) => {
        const next = prev.map((m) => (m.email === updated.email ? updated : m));
        if (!next.some((m) => m.email === updated.email)) next.unshift(updated);
        return next;
      });
      showToast(`Mentor ${status}`);
    } catch (error) {
      showToast(error.message || "Could not update mentor");
    }
  }

  if (!adminSession) {
    return (
      <div className="admin-portal admin-portal-auth">
        <header className="admin-topbar admin-topbar-auth">
          <span className="admin-topbar-title">Mentor Access</span>
        </header>
        <AdminAuth onAuthenticated={onAuthenticated} showToast={showToast} />
      </div>
    );
  }

  function resetForm() {
    setEditingEaId(null);
    setName("");
    setStrategy("scalper");
    setPhoto("/logo.png");
    setPhotoUploaded(false);
    setDraftSymbols([]);
    setCustomSymbol("");
  }

  function addCustomSymbol() {
    const symbol = normalizeSymbol(customSymbol);
    if (!symbol) {
      showToast("Enter a symbol");
      return;
    }
    ensureCatalog(symbol);
    setDraftSymbols((prev) => (prev.includes(symbol) ? prev : [...prev, symbol]));
    setCustomSymbol("");
    showToast("Symbol added");
  }

  function toggleDraftSymbol(symbol) {
    setDraftSymbols((prev) =>
      prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol]
    );
  }

  function onPhotoChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please upload an image");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const img = new Image();
      img.onload = () => {
        const max = 256;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          if (!dataUrl.startsWith("data:image/")) {
            setPhotoUploaded(false);
            showToast("Could not read image");
            return;
          }
          setPhoto(dataUrl);
          setPhotoUploaded(true);
          showToast("Picture ready");
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        setPhoto(canvas.toDataURL("image/jpeg", 0.72));
        setPhotoUploaded(true);
        showToast("Picture ready");
      };
      img.onerror = () => {
        setPhoto("/logo.png");
        setPhotoUploaded(false);
        showToast("Could not read image");
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  function submitEa(event) {
    event.preventDefault();
    let symbols = [...draftSymbols];
    if (customSymbol.trim()) {
      const symbol = normalizeSymbol(customSymbol);
      if (symbol) {
        ensureCatalog(symbol);
        if (!symbols.includes(symbol)) symbols.push(symbol);
      }
    }
    if (!name.trim()) {
      showToast("Enter a robot name");
      return;
    }
    const hasPhoto = photoUploaded || isUploadedProfilePhoto(photo);
    if (!hasPhoto) {
      showToast("Upload a profile picture before creating the bot");
      return;
    }
    if (symbols.length === 0) {
      showToast("Add at least one symbol");
      return;
    }
    upsertEa({
      id: editingEaId || undefined,
      name: name.trim(),
      strategy,
      photo,
      symbols,
      ownerEmail: adminSession?.email || "",
      ownerId: adminSession?.id || "",
    });
    resetForm();
    setAdminPage("manage-ea");
  }

  function startEdit(ea) {
    setEditingEaId(ea.id);
    setAdminPage("manage-ea");
    showToast(`Editing ${ea.name}`);
  }

  const isSuperAdmin =
    String(adminSession?.role || "").toLowerCase() === "superadmin";
  const mentorEmail = String(adminSession?.email || "")
    .trim()
    .toLowerCase();
  const mentorId = String(adminSession?.id || "").trim();

  const myEas = isSuperAdmin
    ? eas
    : eas.filter((ea) => {
        const owner = String(ea.ownerEmail || "").toLowerCase();
        const ownerId = String(ea.ownerId || "");
        return owner === mentorEmail || (mentorId && ownerId === mentorId);
      });

  const eaIds = new Set(myEas.map((ea) => ea.id));
  const myLicenses = isSuperAdmin
    ? licenseKeys
    : licenseKeys.filter((row) => {
        const owner = String(row.mentorEmail || "").toLowerCase();
        const ownerId = String(row.mentorId || "");
        if (owner === mentorEmail || (mentorId && ownerId === mentorId)) return true;
        return eaIds.has(row.botId);
      });

  const usedKeys = myLicenses.filter((k) => k.used);
  const availableKeys = myLicenses.filter((k) => !k.used);
  const activeBotIds = new Set(bots.filter((b) => b.active).map((b) => b.id));
  const activeKeys = myLicenses.filter((k) => k.used && activeBotIds.has(k.botId));
  const deactivatedKeys = myLicenses.filter(
    (k) => k.used && !activeBotIds.has(k.botId)
  );
  const recentKeys = [...myLicenses]
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 8);

  const nav = isSuperAdmin
    ? [
        ["dashboard", "Dashboard"],
        ["mentors", "Mentors"],
        ["clients", "Clients"],
        ["top-mentors", "Top Mentors"],
        ["activate", "Activate Accounts"],
        ["emails", "Send Emails"],
        ["manage-ea", "Manage EAs"],
        ["licenses", "License Keys"],
        ["settings", "Settings"],
      ]
    : [
        ["dashboard", "Dashboard"],
        ["manage-ea", "Manage EAs"],
        ["licenses", "License Keys"],
        ["profile", "Profile"],
        ["settings", "Settings"],
      ];

  return (
    <div className="admin-portal">
      <header className="admin-topbar">
        <button
          className="admin-icon-btn"
          type="button"
          aria-label="Open menu"
          onClick={() => setDrawerOpen(true)}
        >
          ☰
        </button>
        <h1 className="admin-topbar-title">{isSuperAdmin ? "Admin Portal" : "Mentor Portal"}</h1>
        <span className="admin-topbar-spacer" aria-hidden="true" />
      </header>

      {!drawerOpen ? null : (
        <div className="admin-drawer-backdrop" onClick={() => setDrawerOpen(false)} />
      )}
      <aside className={`admin-drawer${drawerOpen ? " is-open" : ""}`} aria-hidden={!drawerOpen}>
        <div className="admin-drawer-header">
          <div className="admin-drawer-user">
            <img src="/logo.png" alt="" width="36" height="36" />
            <span>{adminSession.username || "Admin"}</span>
          </div>
          <button className="admin-icon-btn" type="button" onClick={() => setDrawerOpen(false)}>
            ✕
          </button>
        </div>
        <nav className="admin-nav">
          {nav.map(([id, label]) => (
            <button
              key={id}
              className={`admin-nav-item${adminPage === id ? " is-active" : ""}`}
              type="button"
              onClick={() => {
                setAdminPage(id);
                setDrawerOpen(false);
              }}
            >
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="admin-drawer-footer">
          <button className="admin-nav-item admin-logout" type="button" onClick={logoutAdmin}>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <div className="admin-content">
        {adminPage === "dashboard" && (
          <section className="admin-page is-active">
            {isSuperAdmin ? (
              <>
                <h2 className="admin-h1">Admin Dashboard</h2>
                <p className="admin-sub">Manage mentors and system settings</p>
                <div className="admin-stat-stack">
                  <article className="admin-stat-card">
                    <p className="admin-stat-label">Total Mentors</p>
                    <p className="admin-stat-value">{mentors.length}</p>
                  </article>
                  <article className="admin-stat-card">
                    <p className="admin-stat-label">Pending Approval</p>
                    <p className="admin-stat-value is-warn">{pendingMentors.length}</p>
                  </article>
                  <article className="admin-stat-card">
                    <p className="admin-stat-label">Approved Mentors</p>
                    <p className="admin-stat-value is-ok">{approvedMentors.length}</p>
                  </article>
                </div>
              </>
            ) : (
              <>
                <h2 className="admin-h1">Dashboard</h2>
                <p className="admin-sub">
                  Your EAs, license keys, and live activations.
                </p>
                <div className="admin-stat-stack">
                  <article className="admin-stat-card">
                    <p className="admin-stat-label">Used license keys</p>
                    <p className="admin-stat-value">{usedKeys.length}</p>
                  </article>
                  <article className="admin-stat-card">
                    <p className="admin-stat-label">Available</p>
                    <p className="admin-stat-value is-ok">{availableKeys.length}</p>
                    <p className="admin-card-meta">Unlimited generation</p>
                  </article>
                  <article className="admin-stat-card">
                    <p className="admin-stat-label">Active</p>
                    <p className="admin-stat-value is-ok">{activeKeys.length}</p>
                    <p className="admin-card-meta">Keys working on connected bots</p>
                  </article>
                  <article className="admin-stat-card">
                    <p className="admin-stat-label">Deactivated license keys</p>
                    <p className="admin-stat-value is-warn">{deactivatedKeys.length}</p>
                  </article>
                  <article className="admin-stat-card">
                    <p className="admin-stat-label">Total EAs</p>
                    <p className="admin-stat-value">{myEas.length}</p>
                  </article>
                </div>
                <div className="admin-card" style={{ marginTop: 14 }}>
                  <div className="admin-card-title-row">
                    <h3 className="admin-card-title">Recent keys</h3>
                    <span className="admin-badge">{recentKeys.length}</span>
                  </div>
                  {recentKeys.length === 0 ? (
                    <p className="admin-empty">No license keys yet</p>
                  ) : (
                    recentKeys.map((entry) => (
                      <div className="license-row" key={`${entry.key}-${entry.createdAt}`}>
                        <strong>{entry.key}</strong>
                        <span>
                          {entry.clientName ? `${entry.clientName} · ` : ""}
                          {entry.clientEmail || "no email"} · {entry.botName} ·{" "}
                          {entry.used ? "Used" : "Available"}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {isSuperAdmin && adminPage === "clients" && (
          <section className="admin-page is-active">
            <h2 className="admin-h1">Client Management</h2>
            <p className="admin-sub">Manage client access and payment bypasses</p>
            <div className="admin-card">
              <p className="admin-card-meta">Total clients: {signups.length}</p>
              <div className="admin-table-head admin-table-head-2">
                <span>Email</span>
                <span>Status</span>
              </div>
              {signups.length === 0 ? (
                <p className="admin-empty">No clients yet</p>
              ) : (
                [...signups]
                  .sort((a, b) => b.createdAt - a.createdAt)
                  .map((s) => (
                    <div className="admin-table-row admin-table-row-2" key={s.email}>
                      <span className="admin-name">{s.email}</span>
                      <span
                        className={`admin-badge ${
                          s.status === "approved"
                            ? "is-approved"
                            : s.status === "declined"
                              ? "is-declined"
                              : "is-pending"
                        }`}
                      >
                        {s.status === "approved"
                          ? "Approved"
                          : s.status === "declined"
                            ? "Declined"
                            : "Pending"}
                      </span>
                    </div>
                  ))
              )}
            </div>
          </section>
        )}

        {isSuperAdmin && adminPage === "activate" && (
          <section className="admin-page is-active">
            <h2 className="admin-h1">Activate Accounts</h2>
            <p className="admin-sub">
              Approve or decline pending signups. Only approved clients can use a license key.
            </p>
            <div className="admin-card">
              <div className="admin-card-title-row">
                <h3>Pending signups</h3>
                <span className="admin-badge">{pending.length}</span>
              </div>
              <button
                className="admin-btn admin-btn-sm"
                type="button"
                style={{ marginBottom: 10 }}
                onClick={() => refreshSignups?.().then(() => showToast("Pending list refreshed"))}
              >
                Refresh pending
              </button>
              <div className="admin-activate-list">
                {pending.length === 0 ? (
                  <p className="admin-empty">No pending accounts</p>
                ) : (
                  pending.map((s) => (
                    <div className="admin-table-row has-actions" key={s.email}>
                      <span className="admin-name">{s.email}</span>
                      <span className="admin-badge is-pending">Pending</span>
                      <div className="admin-row-actions">
                        <button
                          className="admin-btn admin-btn-solid admin-btn-sm"
                          type="button"
                          onClick={() => setSignupStatus(s.email, "approved")}
                        >
                          Approve
                        </button>
                        <button
                          className="admin-btn admin-btn-danger admin-btn-sm"
                          type="button"
                          onClick={() => setSignupStatus(s.email, "declined")}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="admin-card" style={{ marginTop: 14 }}>
              <div className="admin-card-title-row">
                <h3>Approved accounts</h3>
                <span className="admin-badge">{approved.length}</span>
              </div>
              {approved.length === 0 ? (
                <p className="admin-empty">No approved accounts yet</p>
              ) : (
                approved.map((s) => (
                  <div className="admin-table-row is-status-only" key={s.email}>
                    <span className="admin-name">{s.email}</span>
                    <span className="admin-badge is-approved">Approved</span>
                  </div>
                ))
              )}
            </div>
            <div className="admin-card" style={{ marginTop: 14 }}>
              <div className="admin-card-title-row">
                <h3>Declined accounts</h3>
                <span className="admin-badge">{declined.length}</span>
              </div>
              {declined.length === 0 ? (
                <p className="admin-empty">No declined accounts</p>
              ) : (
                declined.map((s) => (
                  <div className="admin-table-row is-status-only" key={s.email}>
                    <span className="admin-name">{s.email}</span>
                    <span className="admin-badge is-declined">Declined</span>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {adminPage === "manage-ea" && (
          <section className="admin-page is-active">
            <h2 className="admin-h1">Manage EA</h2>
            <p className="admin-sub">Create and manage trading robot Expert Advisors.</p>
            <div className="admin-card ea-create-card">
              <div className="admin-card-title-row">
                <h3>{editingEaId ? "Edit Robot EA" : "Create Robot EA"}</h3>
              </div>
              <form className="ea-form" onSubmit={submitEa}>
                <div className={`ea-photo-field${photoUploaded || isUploadedProfilePhoto(photo) ? " has-photo" : " needs-photo"}`}>
                  <button
                    className="ea-photo-btn"
                    type="button"
                    onClick={() => document.getElementById("ea-photo-react")?.click()}
                  >
                    <img src={photo} alt="" />
                    <span>
                      {photoUploaded || isUploadedProfilePhoto(photo)
                        ? editingEaId
                          ? "Change picture"
                          : "Picture added"
                        : "Upload profile picture *"}
                    </span>
                  </button>
                  <input
                    id="ea-photo-react"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    hidden
                    onChange={onPhotoChange}
                  />
                  {photoUploaded || isUploadedProfilePhoto(photo) ? null : (
                    <p className="ea-hint ea-photo-required">
                      Profile picture is required for the bot interface.
                    </p>
                  )}
                </div>
                <label className="ea-field">
                  <span>Robot name</span>
                  <input
                    className="admin-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. ZETA SCALPER AI"
                    required
                  />
                </label>
                <label className="ea-field">
                  <span>Strategy</span>
                  <select
                    className="admin-input"
                    value={strategy}
                    onChange={(e) => setStrategy(e.target.value)}
                  >
                    <option value="scalper">Scalper</option>
                    <option value="trend">Trend Follower</option>
                    <option value="grid">Grid</option>
                    <option value="news">News Trader</option>
                  </select>
                </label>
                <div className="ea-field">
                  <span>Symbols</span>
                  <p className="ea-hint">Pick from the list or type your own symbol below.</p>
                  <div className="ea-symbol-picker">
                    {catalog.map((symbol) => (
                      <button
                        key={symbol}
                        type="button"
                        className={`ea-pick-chip${draftSymbols.includes(symbol) ? " is-on" : ""}`}
                        onClick={() => toggleDraftSymbol(symbol)}
                      >
                        {symbol}
                      </button>
                    ))}
                  </div>
                  <div className="ea-manual-symbol">
                    <input
                      className="admin-input"
                      value={customSymbol}
                      onChange={(e) => setCustomSymbol(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCustomSymbol();
                        }
                      }}
                      placeholder="Write your own symbol (e.g. US500)"
                    />
                    <button
                      className="admin-btn admin-btn-outline"
                      type="button"
                      onClick={addCustomSymbol}
                    >
                      Add
                    </button>
                  </div>
                  <div className="ea-symbol-selected">
                    {draftSymbols.length === 0 ? (
                      <span className="ea-hint">No symbols chosen yet</span>
                    ) : (
                      draftSymbols.map((symbol) => (
                        <span className="ea-sym-chip" key={symbol}>
                          <span>{symbol}</span>
                          <button type="button" onClick={() => toggleDraftSymbol(symbol)}>
                            ×
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <button className="admin-btn admin-btn-solid admin-btn-block" type="submit">
                  {editingEaId ? "Save profile" : "Create EA"}
                </button>
                {editingEaId ? (
                  <button
                    className="admin-btn admin-btn-outline admin-btn-block"
                    type="button"
                    style={{ marginTop: 8 }}
                    onClick={resetForm}
                  >
                    Cancel edit
                  </button>
                ) : null}
              </form>
            </div>

            <div className="admin-card">
              <div className="admin-card-title-row">
                <h3>Your EAs</h3>
                <span className="admin-badge">{myEas.length}</span>
              </div>
              <div className="ea-list">
                {myEas.length === 0 ? (
                  <p className="admin-empty">No EAs yet — create one above</p>
                ) : (
                  myEas.map((ea) => {
                    const bot = bots.find((b) => b.id === ea.id);
                    const isLive = Boolean(bot?.active);
                    return (
                    <div className="ea-item" key={ea.id}>
                      <img src={ea.photo || "/logo.png"} alt="" width="40" height="40" />
                      <div className="ea-meta">
                        <strong>{ea.name}</strong>
                        <span>
                          {STRATEGY_LABELS[ea.strategy] || ea.strategy} · {ea.symbols.length}{" "}
                          symbols
                        </span>
                        <div className="ea-item-symbols">
                          {ea.symbols.map((s) => (
                            <span className="ea-sym-chip" key={s}>
                              <span>{s}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="ea-item-actions">
                        <span className={`admin-badge${isLive ? " is-approved" : ""}`}>
                          {isLive ? "Live" : "Inactive"}
                        </span>
                        <button className="ea-edit-btn" type="button" onClick={() => startEdit(ea)}>
                          Edit profile
                        </button>
                        <button
                          className="ea-delete-btn"
                          type="button"
                          onClick={() => deleteEa(ea.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        )}

        {adminPage === "licenses" && (
          <section className="admin-page is-active">
            <h2 className="admin-h1">Generate License Key</h2>
            <p className="admin-sub">
              Enter the client name and email with the bot. The key syncs to that email so they
              can activate on any phone after approval.
            </p>
            <div className="admin-card">
              <form
                className="license-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const key = await generateLicense(licenseBotId, {
                    clientName: licenseClientName,
                    clientEmail: licenseClientEmail,
                    mentorEmail: adminSession.email,
                    mentorId: adminSession.id,
                  });
                  if (key) {
                    setLatestKey(key);
                    setLatestLicenseMeta({
                      name: licenseClientName.trim(),
                      email: String(licenseClientEmail || "")
                        .trim()
                        .toLowerCase(),
                    });
                  }
                  await refreshLicenses?.();
                }}
              >
                <label className="ea-field">
                  <span>Client name *</span>
                  <input
                    className="admin-input"
                    value={licenseClientName}
                    onChange={(e) => setLicenseClientName(e.target.value)}
                    placeholder="e.g. Mukundi"
                    required
                  />
                </label>
                <label className="ea-field">
                  <span>Client email *</span>
                  <input
                    className="admin-input"
                    type="email"
                    list="license-client-emails"
                    value={licenseClientEmail}
                    onChange={(e) => setLicenseClientEmail(e.target.value)}
                    placeholder="client@email.com"
                    required
                  />
                  <datalist id="license-client-emails">
                    {[...approved, ...pending].map((s) => (
                      <option key={s.email} value={s.email} />
                    ))}
                  </datalist>
                </label>
                <label className="ea-field">
                  <span>Bot</span>
                  <select
                    className="admin-input"
                    value={licenseBotId}
                    onChange={(e) => setLicenseBotId(e.target.value)}
                    required
                  >
                    {myEas.length === 0 ? (
                      <option value="" disabled>
                        No EAs yet
                      </option>
                    ) : (
                      myEas.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <button className="admin-btn admin-btn-solid admin-btn-block" type="submit">
                  Generate License Key
                </button>
              </form>
              {latestKey ? (
                <div className="license-result">
                  <p>Latest key</p>
                  <code>{latestKey}</code>
                  {latestLicenseMeta ? (
                    <p className="ea-hint" style={{ marginTop: 8 }}>
                      Bound to {latestLicenseMeta.name} · {latestLicenseMeta.email}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="admin-card" style={{ marginTop: 14 }}>
              <div className="admin-card-title-row">
                <h3>Generated keys</h3>
                <span className="admin-badge">{myLicenses.length}</span>
              </div>
              {myLicenses.length === 0 ? (
                <p className="admin-empty">No license keys yet</p>
              ) : (
                [...myLicenses].reverse().map((entry) => (
                  <div
                    className={`license-row${entry.used ? " is-used" : ""}`}
                    key={`${entry.key}-${entry.createdAt}`}
                  >
                    <strong>{entry.key}</strong>
                    <span>
                      {entry.clientName ? `${entry.clientName} · ` : ""}
                      {entry.clientEmail || "no email"} · {entry.botName} ·{" "}
                      {entry.used ? "Used" : "Available"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        
        {adminPage === "profile" && (
          <section className="admin-page is-active">
            <h2 className="admin-h1">Profile</h2>
            <p className="admin-sub">Your mentor account details</p>
            <div className="admin-card">
              <div className="admin-card-title-row">
                <h3>Account</h3>
                <span className="admin-badge is-approved">{adminSession.status || "approved"}</span>
              </div>
              <p className="admin-card-meta"><strong>Username:</strong> {adminSession.username || "—"}</p>
              <p className="admin-card-meta"><strong>Email:</strong> {adminSession.email}</p>
              <p className="admin-card-meta"><strong>Role:</strong> Mentor</p>
              <p className="admin-card-meta"><strong>EAs:</strong> {myEas.length}</p>
              <p className="admin-card-meta"><strong>License keys:</strong> {myLicenses.length}</p>
            </div>
          </section>
        )}

        {adminPage === "settings" && (
          <section className="admin-page is-active">
            <h2 className="admin-h1">Settings</h2>
            <p className="admin-sub">
              Change the app accent color. Buttons, highlights, and scanner accents update live.
            </p>
            <div className="admin-card">
              <div className="admin-card-title-row">
                <h3>App color</h3>
                <span className="admin-badge">{appColor || DEFAULT_APP_COLOR}</span>
              </div>
              <div className="app-color-preview" style={{ ["--preview-color"]: appColor }}>
                <div className="app-color-preview-orb" aria-hidden="true" />
                <div>
                  <strong>Live preview</strong>
                  <p className="ea-hint">This color drives the app theme on home, lock, and scanner.</p>
                </div>
              </div>
              <label className="ea-field" style={{ marginTop: 14 }}>
                <span>Custom color</span>
                <div className="app-color-picker-row">
                  <input
                    className="app-color-swatch"
                    type="color"
                    value={appColor || DEFAULT_APP_COLOR}
                    onChange={(e) => setAppColor(e.target.value)}
                    aria-label="Choose app color"
                  />
                  <input
                    className="admin-input"
                    type="text"
                    value={appColor || DEFAULT_APP_COLOR}
                    onChange={(e) => setAppColor(e.target.value)}
                    placeholder="#ff2d7a"
                  />
                  <button
                    className="admin-btn admin-btn-outline"
                    type="button"
                    onClick={() => setAppColor(DEFAULT_APP_COLOR)}
                  >
                    Reset
                  </button>
                </div>
              </label>
              <div className="app-color-presets" role="list">
                {APP_COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    role="listitem"
                    className={`app-color-preset${
                      String(appColor).toLowerCase() === preset.color ? " is-active" : ""
                    }`}
                    style={{ ["--swatch"]: preset.color }}
                    onClick={() => setAppColor(preset.color)}
                    title={preset.label}
                  >
                    <span className="app-color-preset-dot" aria-hidden="true" />
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="admin-card admin-logout-card">
              <div className="admin-card-title-row">
                <h3>Account</h3>
                <span className="admin-badge">{adminSession.email}</span>
              </div>
              <p className="ea-hint">
                Signed in as {adminSession.username || "mentor"}. Logout returns to the mentor
                sign-in page and keeps you on /admin.
              </p>
              <button
                className="admin-btn admin-btn-danger admin-btn-block admin-settings-logout"
                type="button"
                onClick={logoutAdmin}
              >
                Logout
              </button>
            </div>
          </section>
        )}

        {isSuperAdmin && adminPage === "mentors" && (
          <section className="admin-page is-active">
            <h2 className="admin-h1">Mentor Management</h2>
            <p className="admin-sub">
              Mentor signups land in Pending here until you approve them.
            </p>
            <div className="admin-card">
              <div className="admin-card-title-row">
                <h3 className="admin-card-title">Pending</h3>
                <span className="admin-badge is-pending">{pendingMentors.length}</span>
              </div>
              <button
                className="admin-btn admin-btn-sm"
                type="button"
                style={{ marginBottom: 10 }}
                onClick={refreshMentorsList}
              >
                Refresh pending
              </button>
              {pendingMentors.length === 0 ? (
                <p className="admin-empty">No pending mentors</p>
              ) : (
                pendingMentors.map((mentor) => (
                  <div className="admin-table-row" key={mentor.id || mentor.email}>
                    <div>
                      <strong>{mentor.username}</strong>
                      <p className="admin-card-meta">{mentor.email}</p>
                      <p className="admin-card-meta">{mentor.contact || "—"}</p>
                    </div>
                    <div className="admin-row-actions">
                      <button
                        className="admin-btn admin-btn-solid admin-btn-sm"
                        type="button"
                        onClick={() => changeMentorStatus(mentor.email, "approved")}
                      >
                        Approve
                      </button>
                      <button
                        className="admin-btn admin-btn-danger admin-btn-sm"
                        type="button"
                        onClick={() => changeMentorStatus(mentor.email, "declined")}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="admin-card" style={{ marginTop: 14 }}>
              <div className="admin-card-title-row">
                <h3 className="admin-card-title">Approved</h3>
                <span className="admin-badge is-approved">{approvedMentors.length}</span>
              </div>
              {approvedMentors.length === 0 ? (
                <p className="admin-empty">No approved mentors</p>
              ) : (
                approvedMentors.map((mentor) => (
                  <div className="admin-table-row" key={mentor.id || mentor.email}>
                    <div>
                      <strong>{mentor.username}</strong>
                      <p className="admin-card-meta">{mentor.email}</p>
                      <p className="admin-card-meta">
                        {mentor.role === "superadmin" ? "Super admin" : mentor.contact || "—"}
                      </p>
                    </div>
                    <span className="admin-badge is-approved">{mentor.status}</span>
                  </div>
                ))
              )}
            </div>
            <div className="admin-card" style={{ marginTop: 14 }}>
              <div className="admin-card-title-row">
                <h3 className="admin-card-title">Declined</h3>
                <span className="admin-badge is-declined">{declinedMentors.length}</span>
              </div>
              {declinedMentors.length === 0 ? (
                <p className="admin-empty">No declined mentors</p>
              ) : (
                declinedMentors.map((mentor) => (
                  <div className="admin-table-row" key={mentor.id || mentor.email}>
                    <div>
                      <strong>{mentor.username}</strong>
                      <p className="admin-card-meta">{mentor.email}</p>
                      <p className="admin-card-meta">{mentor.contact || "—"}</p>
                    </div>
                    <button
                      className="admin-btn admin-btn-solid admin-btn-sm"
                      type="button"
                      onClick={() => changeMentorStatus(mentor.email, "approved")}
                    >
                      Approve
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {isSuperAdmin && ["top-mentors", "emails"].includes(adminPage) && (
          <section className="admin-page is-active">
            <h2 className="admin-h1">
              {adminPage === "top-mentors" ? "Top Mentors" : "Email Management"}
            </h2>
            <p className="admin-sub">Starts empty — new data appears as clients sign up.</p>
            <div className="admin-card">
              <p className="admin-empty">No records yet</p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
