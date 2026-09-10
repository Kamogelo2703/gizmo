import { useEffect, useMemo, useRef, useState } from "react";
import {
  connectByHost,
  connectByServer,
  parseAccessPoint,
  searchBrokers,
} from "./mt5Api.js";
import { useApp } from "./store.jsx";

const emptyLogin = { login: "", password: "", server: "" };
const MT5_SESSION_KEY = "apexea-mt5-session";

function loadSession() {
  try {
    const raw = localStorage.getItem(MT5_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(session) {
  try {
    if (!session) localStorage.removeItem(MT5_SESSION_KEY);
    else localStorage.setItem(MT5_SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore quota
  }
}

export default function MetaTraderPanel({ variant = "zeta" }) {
  const { showToast } = useApp();
  const [platform, setPlatform] = useState("MT5");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectedBroker, setSelectedBroker] = useState(null);
  const [step, setStep] = useState("browse");
  const [creds, setCreds] = useState(emptyLogin);
  const [connecting, setConnecting] = useState(false);
  const [session, setSession] = useState(() => loadSession());
  const searchRef = useRef(0);

  const hasQuery = query.trim().length > 0;

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearchError("");
      setSearching(false);
      return undefined;
    }

    // API is MT5 broker directory; keep MT4 UI but still search same catalog.
    const requestId = ++searchRef.current;
    const controller = new AbortController();
    setSearching(true);
    setSearchError("");

    const timer = setTimeout(async () => {
      try {
        const brokers = await searchBrokers(q, { signal: controller.signal });
        if (requestId !== searchRef.current) return;
        setResults(brokers);
        if (!brokers.length) setSearchError("No brokers match that search.");
      } catch (error) {
        if (controller.signal.aborted) return;
        if (requestId !== searchRef.current) return;
        setResults([]);
        setSearchError(error.message || "Broker search failed");
      } finally {
        if (requestId === searchRef.current) setSearching(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const customBroker = useMemo(() => {
    if (!hasQuery) return null;
    const exact = results.some(
      (broker) => broker.name.toLowerCase() === query.trim().toLowerCase()
    );
    if (exact) return null;
    return {
      id: `custom-${query.trim().toLowerCase()}`,
      company: query.trim(),
      name: query.trim(),
      site: "",
      logoUrl: "",
      access: [],
      platform,
      custom: true,
    };
  }, [hasQuery, query, results, platform]);

  function pickBroker(broker) {
    setSelectedBroker(broker);
    setCreds({
      login: "",
      password: "",
      server: broker.name || "",
    });
    setStep("login");
  }

  function backToBrokers() {
    setStep("browse");
    setCreds(emptyLogin);
    setConnecting(false);
  }

  function updateCred(field, value) {
    setCreds((prev) => ({ ...prev, [field]: value }));
  }

  async function connectAccount(event) {
    event.preventDefault();
    const login = creds.login.trim();
    const password = creds.password;
    const server = creds.server.trim();

    if (!login || !password || !server) {
      showToast("Enter login, password, and server");
      return;
    }

    setConnecting(true);
    try {
      let token;
      // Prefer server-name connect; fall back to first access host:port if needed.
      try {
        token = await connectByServer({ login, password, server });
      } catch (serverError) {
        const point = parseAccessPoint(selectedBroker?.access?.[0]);
        if (!point) throw serverError;
        token = await connectByHost({
          login,
          password,
          host: point.host,
          port: point.port,
        });
      }

      const nextSession = {
        token,
        login,
        server,
        company: selectedBroker?.company || server,
        platform,
        connectedAt: Date.now(),
      };
      setSession(nextSession);
      saveSession(nextSession);
      showToast(`Connected ${selectedBroker?.company || server}`);
      setStep("browse");
      setQuery("");
      setResults([]);
      setCreds(emptyLogin);
    } catch (error) {
      showToast(error.message || "Connection failed");
    } finally {
      setConnecting(false);
    }
  }

  function clearSession() {
    setSession(null);
    saveSession(null);
    showToast("Disconnected MetaTrader session");
  }

  const rootClass = variant === "v2" ? "mt-panel mt-panel--v2" : "mt-panel";

  if (step === "login" && selectedBroker) {
    return (
      <div className={rootClass}>
        <header className="mt-panel-head">
          <button className="mt-back-btn" type="button" onClick={backToBrokers}>
            ← Brokers
          </button>
          <p className="mt-panel-kicker">{platform}</p>
          <h2 className="mt-panel-title">{selectedBroker.company}</h2>
          <p className="mt-panel-sub">
            {selectedBroker.custom
              ? "Enter your MetaTrader account details to connect."
              : `Server ${selectedBroker.name}. Enter login details to connect.`}
          </p>
        </header>

        <form className="mt-login-form" onSubmit={connectAccount}>
          <label className="mt-field">
            <span>Login</span>
            <input
              className="mt-search-input"
              type="text"
              inputMode="numeric"
              autoComplete="username"
              placeholder="Enter login"
              value={creds.login}
              onChange={(e) => updateCred("login", e.target.value)}
              required
            />
          </label>

          <label className="mt-field">
            <span>Password</span>
            <input
              className="mt-search-input"
              type="password"
              autoComplete="current-password"
              placeholder="Enter password"
              value={creds.password}
              onChange={(e) => updateCred("password", e.target.value)}
              required
            />
          </label>

          <label className="mt-field">
            <span>Server</span>
            <input
              className="mt-search-input"
              type="text"
              autoComplete="off"
              placeholder="Enter server"
              value={creds.server}
              onChange={(e) => updateCred("server", e.target.value)}
              required
            />
          </label>

          <button className="mt-connect-btn" type="submit" disabled={connecting}>
            {connecting ? "Connecting…" : "Connect"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className={rootClass}>
      <header className="mt-panel-head">
        <p className="mt-panel-kicker">MetaTrader</p>
        <h2 className="mt-panel-title">Brokers</h2>
        <p className="mt-panel-sub">Search live brokers, then connect with login details.</p>
      </header>

      {session?.token ? (
        <div className="mt-session">
          <div>
            <strong>{session.company || session.server}</strong>
            <span>
              {session.server} · login {session.login}
            </span>
          </div>
          <button type="button" className="mt-session-btn" onClick={clearSession}>
            Disconnect
          </button>
        </div>
      ) : null}

      <div className="mt-platform-row" role="group" aria-label="MetaTrader platform">
        {["MT5", "MT4"].map((id) => (
          <button
            key={id}
            type="button"
            className={`mt-platform-btn${platform === id ? " is-active" : ""}`}
            onClick={() => setPlatform(id)}
            aria-pressed={platform === id}
          >
            <span className="mt-platform-label">{id}</span>
            <span className="mt-platform-hint">
              {id === "MT5" ? "MetaTrader 5" : "MetaTrader 4"}
            </span>
          </button>
        ))}
      </div>

      <section className="mt-find" aria-label="Find broker">
        <h3 className="mt-find-title">Find broker</h3>
        <label className="mt-search">
          <span className="sr-only">Search for your broker</span>
          <input
            className="mt-search-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for your broker"
            autoComplete="off"
            inputMode="search"
          />
        </label>

        <ul className="mt-broker-list">
          {!hasQuery ? (
            <li className="mt-broker-empty">Search for your broker</li>
          ) : searching ? (
            <li className="mt-broker-empty">Searching brokers…</li>
          ) : (
            <>
              {results.map((broker) => (
                <li key={broker.id}>
                  <button
                    type="button"
                    className="mt-broker-item"
                    onClick={() => pickBroker(broker)}
                  >
                    <span className="mt-broker-main">
                      {broker.logoUrl ? (
                        <img
                          className="mt-broker-logo"
                          src={broker.logoUrl}
                          alt=""
                          width="28"
                          height="28"
                        />
                      ) : null}
                      <span className="mt-broker-text">
                        <span className="mt-broker-name">{broker.company}</span>
                        <span className="mt-broker-server">{broker.name}</span>
                      </span>
                    </span>
                    <span className="mt-broker-meta">{platform}</span>
                  </button>
                </li>
              ))}
              {customBroker ? (
                <li key={customBroker.id}>
                  <button
                    type="button"
                    className="mt-broker-item"
                    onClick={() => pickBroker(customBroker)}
                  >
                    <span className="mt-broker-name">Use “{customBroker.name}”</span>
                    <span className="mt-broker-meta">{platform}</span>
                  </button>
                </li>
              ) : null}
              {!results.length && searchError ? (
                <li className="mt-broker-empty">{searchError}</li>
              ) : null}
            </>
          )}
        </ul>
      </section>
    </div>
  );
}
