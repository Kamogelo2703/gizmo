import { useEffect, useMemo, useRef, useState } from "react";
import EnginePanel from "./EnginePanel.jsx";
import { CONNECT_ENGINE_STEPS, sleep } from "./chartScanner.js";
import { connectAccount, disconnectAccount, searchBrokers } from "./metaApi.js";
import { useApp } from "./store.jsx";

const emptyLogin = { login: "", password: "", server: "" };

export default function MetaTraderPanel({ variant = "zeta" }) {
  const {
    showToast,
    mt5Session,
    setMt5Session,
    engineMode,
    setEngineMode,
    engineStep,
    setEngineStep,
    engineLogs,
    setEngineLogs,
    pushEngineLog,
  } = useApp();
  const [platform, setPlatform] = useState("MT5");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectedBroker, setSelectedBroker] = useState(null);
  const [step, setStep] = useState("browse");
  const [creds, setCreds] = useState(emptyLogin);
  const [connecting, setConnecting] = useState(false);
  const searchRef = useRef(0);

  const hasQuery = query.trim().length > 0;
  const session = mt5Session;

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearchError("");
      setSearching(false);
      return undefined;
    }

    const requestId = ++searchRef.current;
    const controller = new AbortController();
    setSearching(true);
    setSearchError("");

    const timer = setTimeout(async () => {
      try {
        const brokers = await searchBrokers(q, platform, { signal: controller.signal });
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
  }, [query, platform]);

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
    const server =
      broker.local || broker.custom ? "" : String(broker.name || "").trim();
    setCreds({
      login: "",
      password: "",
      server,
    });
    setStep("login");
  }

  function backToBrokers() {
    setStep("browse");
    setCreds(emptyLogin);
    setConnecting(false);
    if (engineMode === "connecting") setEngineMode("idle");
  }

  function updateCred(field, value) {
    setCreds((prev) => ({ ...prev, [field]: value }));
  }

  async function onConnect(event) {
    event.preventDefault();
    const login = creds.login.trim();
    const password = creds.password;
    const server = creds.server.trim();

    if (!login || !password || !server) {
      showToast("Enter login, password, and server");
      return;
    }

    setConnecting(true);
    setEngineLogs([]);
    setEngineMode("connecting");
    setEngineStep(0);
    pushEngineLog(CONNECT_ENGINE_STEPS[0].label);

    const advance = async (index) => {
      setEngineStep(index);
      pushEngineLog(CONNECT_ENGINE_STEPS[index].label);
      await sleep(380);
    };

    try {
      await advance(0);
      await advance(1);
      const connected = await connectAccount({
        login,
        password,
        server,
        platform,
        company: selectedBroker?.company || "",
        onProgress: async () => {
          setEngineStep((prev) => Math.min(3, Math.max(2, prev)));
        },
      });
      await advance(2);
      await advance(3);
      await advance(4);

      const nextSession = {
        accountId: connected.accountId,
        login: connected.login,
        server: connected.server,
        company: connected.company || selectedBroker?.company || server,
        platform: connected.platform || platform,
        connectionStatus: connected.connectionStatus,
        subscribed: connected.subscribed,
        strategyId: connected.strategyId,
        subscriptionError: connected.subscriptionError,
        region: connected.region || null,
        connectedAt: Date.now(),
      };
      setMt5Session(nextSession);
      pushEngineLog("Trading engine armed · MT5 connected");
      showToast(
        connected.subscribed
          ? `Connected ${nextSession.company} · copy trading on`
          : `Connected ${nextSession.company}`
      );
      setStep("browse");
      setQuery("");
      setResults([]);
      setCreds(emptyLogin);
      await sleep(700);
      setEngineMode("idle");
    } catch (error) {
      setEngineMode("idle");
      showToast(error.message || "Connection failed");
    } finally {
      setConnecting(false);
    }
  }

  async function clearSession() {
    const accountId = session?.accountId;
    setMt5Session(null);
    if (accountId) {
      try {
        await disconnectAccount(accountId);
      } catch {
        // local disconnect still ok
      }
    }
    showToast("Disconnected MetaTrader session");
  }

  const rootClass = variant === "v2" ? "mt-panel mt-panel--v2" : "mt-panel";

  if (connecting || engineMode === "connecting") {
    return (
      <div className={rootClass}>
        <EnginePanel
          mode="connecting"
          stepIndex={engineStep}
          logs={engineLogs}
          subtitle={`${selectedBroker?.company || "Broker"} · ${creds.server || "server"}`}
        />
      </div>
    );
  }

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

        <form className="mt-login-form" onSubmit={onConnect}>
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
              placeholder="Exact MT server name (from MT5)"
              value={creds.server}
              onChange={(e) => updateCred("server", e.target.value)}
              required
            />
          </label>

          <button className="mt-connect-btn" type="submit" disabled={connecting}>
            {connecting ? "Starting connecting engine…" : "Connect"}
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
        <p className="mt-panel-sub">
          Search brokers, connect MT5, then arm the ApexEA trading engine.
        </p>
      </header>

      {session?.accountId ? (
        <div className="mt-session">
          <div>
            <strong>{session.company || session.server}</strong>
            <span>
              {session.server} · login {session.login}
              {session.subscribed ? " · copying" : ""} · engine armed
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
