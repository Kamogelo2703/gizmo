import { useEffect, useMemo, useState } from "react";
import { STRATEGY_LABELS, useApp } from "./store.jsx";

export default function AdminPortal() {
  const {
    adminOpen,
    setAdminOpen,
    adminPage,
    setAdminPage,
    signups,
    setSignupStatus,
    eas,
    upsertEa,
    deleteEa,
    editingEaId,
    setEditingEaId,
    bots,
    licenseKeys,
    generateLicense,
    catalog,
    ensureCatalog,
    normalizeSymbol,
    showToast,
  } = useApp();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [photo, setPhoto] = useState("/avatar.png");
  const [name, setName] = useState("");
  const [strategy, setStrategy] = useState("scalper");
  const [draftSymbols, setDraftSymbols] = useState([]);
  const [customSymbol, setCustomSymbol] = useState("");
  const [licenseBotId, setLicenseBotId] = useState("");
  const [latestKey, setLatestKey] = useState("");

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

  useEffect(() => {
    if (!editingEaId) return;
    const ea = eas.find((e) => e.id === editingEaId);
    if (!ea) return;
    setName(ea.name);
    setStrategy(ea.strategy);
    setPhoto(ea.photo || "/avatar.png");
    setDraftSymbols([...ea.symbols]);
  }, [editingEaId, eas]);

  useEffect(() => {
    if (!licenseBotId && bots[0]) setLicenseBotId(bots[0].id);
  }, [bots, licenseBotId]);

  if (!adminOpen) return null;

  function resetForm() {
    setEditingEaId(null);
    setName("");
    setStrategy("scalper");
    setPhoto("/avatar.png");
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
      setPhoto(String(reader.result || "/avatar.png"));
      showToast("Picture ready");
    };
    reader.readAsDataURL(file);
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
    });
    resetForm();
    setAdminPage("manage-ea");
  }

  function startEdit(ea) {
    setEditingEaId(ea.id);
    setAdminPage("manage-ea");
    showToast(`Editing ${ea.name}`);
  }

  const nav = [
    ["dashboard", "Dashboard"],
    ["mentors", "Mentors"],
    ["clients", "Clients"],
    ["top-mentors", "Top Mentors"],
    ["activate", "Activate Accounts"],
    ["emails", "Send Emails"],
    ["manage-ea", "Manage EA"],
    ["licenses", "License Keys"],
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
        <h1 className="admin-topbar-title">Admin Portal</h1>
        <button
          className="admin-icon-btn"
          type="button"
          aria-label="Close admin portal"
          onClick={() => setAdminOpen(false)}
        >
          ✕
        </button>
      </header>

      {!drawerOpen ? null : (
        <div className="admin-drawer-backdrop" onClick={() => setDrawerOpen(false)} />
      )}
      <aside className={`admin-drawer${drawerOpen ? " is-open" : ""}`} aria-hidden={!drawerOpen}>
        <div className="admin-drawer-header">
          <div className="admin-drawer-user">
            <img src="/avatar.png" alt="" width="36" height="36" />
            <span>Admin</span>
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
      </aside>

      <div className="admin-content">
        {adminPage === "dashboard" && (
          <section className="admin-page is-active">
            <h2 className="admin-h1">Admin Dashboard</h2>
            <p className="admin-sub">Manage mentors and system settings</p>
            <div className="admin-stat-stack">
              <article className="admin-stat-card">
                <p className="admin-stat-label">Total Mentors</p>
                <p className="admin-stat-value">{signups.length}</p>
              </article>
              <article className="admin-stat-card">
                <p className="admin-stat-label">Pending Approval</p>
                <p className="admin-stat-value is-warn">{pending.length}</p>
              </article>
              <article className="admin-stat-card">
                <p className="admin-stat-label">Approved Mentors</p>
                <p className="admin-stat-value is-ok">{approved.length}</p>
              </article>
            </div>
          </section>
        )}

        {adminPage === "clients" && (
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

        {adminPage === "activate" && (
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
                <div className="ea-photo-field">
                  <button
                    className="ea-photo-btn"
                    type="button"
                    onClick={() => document.getElementById("ea-photo-react")?.click()}
                  >
                    <img src={photo} alt="" />
                    <span>{editingEaId ? "Change picture" : "Upload picture"}</span>
                  </button>
                  <input
                    id="ea-photo-react"
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={onPhotoChange}
                  />
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
                <span className="admin-badge">{eas.length}</span>
              </div>
              <div className="ea-list">
                {eas.length === 0 ? (
                  <p className="admin-empty">No EAs yet — create one above</p>
                ) : (
                  eas.map((ea) => (
                    <div className="ea-item" key={ea.id}>
                      <img src={ea.photo || "/avatar.png"} alt="" width="40" height="40" />
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
                        <span className="admin-badge is-approved">Live</span>
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
                  ))
                )}
              </div>
            </div>
          </section>
        )}

        {adminPage === "licenses" && (
          <section className="admin-page is-active">
            <h2 className="admin-h1">Generate License Key</h2>
            <p className="admin-sub">
              Create a license key so a removed bot can be activated again on the app.
            </p>
            <div className="admin-card">
              <form
                className="license-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const key = generateLicense(licenseBotId);
                  if (key) setLatestKey(key);
                }}
              >
                <label className="ea-field">
                  <span>Bot</span>
                  <select
                    className="admin-input"
                    value={licenseBotId}
                    onChange={(e) => setLicenseBotId(e.target.value)}
                    required
                  >
                    {bots.length === 0 ? (
                      <option value="" disabled>
                        No bots yet
                      </option>
                    ) : (
                      bots.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                          {b.active ? "" : " (removed)"}
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
                </div>
              ) : null}
            </div>
            <div className="admin-card" style={{ marginTop: 14 }}>
              <div className="admin-card-title-row">
                <h3>Generated keys</h3>
                <span className="admin-badge">{licenseKeys.length}</span>
              </div>
              {licenseKeys.length === 0 ? (
                <p className="admin-empty">No license keys yet</p>
              ) : (
                [...licenseKeys].reverse().map((entry) => (
                  <div
                    className={`license-row${entry.used ? " is-used" : ""}`}
                    key={`${entry.key}-${entry.createdAt}`}
                  >
                    <strong>{entry.key}</strong>
                    <span>
                      {entry.botName} · {entry.used ? "Used" : "Available"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {["mentors", "top-mentors", "emails", "settings"].includes(adminPage) && (
          <section className="admin-page is-active">
            <h2 className="admin-h1">
              {adminPage === "mentors"
                ? "Mentor Management"
                : adminPage === "top-mentors"
                  ? "Top Mentors"
                  : adminPage === "emails"
                    ? "Email Management"
                    : "Settings"}
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
