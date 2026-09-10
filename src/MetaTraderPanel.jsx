import { useMemo, useState } from "react";
import { useApp } from "./store.jsx";

const BROKERS = [
  { id: "ic-markets", name: "IC Markets", platforms: ["MT4", "MT5"] },
  { id: "pepperstone", name: "Pepperstone", platforms: ["MT4", "MT5"] },
  { id: "exness", name: "Exness", platforms: ["MT4", "MT5"] },
  { id: "xm", name: "XM", platforms: ["MT4", "MT5"] },
  { id: "fp-markets", name: "FP Markets", platforms: ["MT4", "MT5"] },
  { id: "tickmill", name: "Tickmill", platforms: ["MT4", "MT5"] },
  { id: "blackbull", name: "BlackBull Markets", platforms: ["MT4", "MT5"] },
  { id: "vantage", name: "Vantage", platforms: ["MT4", "MT5"] },
  { id: "fxpro", name: "FxPro", platforms: ["MT4", "MT5"] },
  { id: "hfm", name: "HFM", platforms: ["MT4", "MT5"] },
  { id: "octa", name: "Octa", platforms: ["MT4", "MT5"] },
  { id: "eightcap", name: "Eightcap", platforms: ["MT4", "MT5"] },
  { id: "oanda", name: "OANDA", platforms: ["MT4", "MT5"] },
  { id: "forex-com", name: "FOREX.com", platforms: ["MT4", "MT5"] },
  { id: "ig", name: "IG", platforms: ["MT4", "MT5"] },
  { id: "avatrade", name: "AvaTrade", platforms: ["MT4", "MT5"] },
];

const emptyLogin = { login: "", password: "", server: "" };

export default function MetaTraderPanel({ variant = "zeta" }) {
  const { showToast } = useApp();
  const [platform, setPlatform] = useState("MT5");
  const [query, setQuery] = useState("");
  const [selectedBroker, setSelectedBroker] = useState(null);
  const [step, setStep] = useState("browse");
  const [creds, setCreds] = useState(emptyLogin);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return BROKERS.filter((broker) => {
      if (!broker.platforms.includes(platform)) return false;
      if (!q) return true;
      return broker.name.toLowerCase().includes(q);
    });
  }, [platform, query]);

  function pickBroker(broker) {
    setSelectedBroker(broker);
    setCreds(emptyLogin);
    setStep("login");
  }

  function backToBrokers() {
    setStep("browse");
    setCreds(emptyLogin);
  }

  function updateCred(field, value) {
    setCreds((prev) => ({ ...prev, [field]: value }));
  }

  function connectAccount(event) {
    event.preventDefault();
    const login = creds.login.trim();
    const password = creds.password;
    const server = creds.server.trim();

    if (!login || !password || !server) {
      showToast("Enter login, password, and server");
      return;
    }

    showToast(`Connecting ${selectedBroker.name} · ${platform}`);
    setStep("browse");
    setQuery("");
    setCreds(emptyLogin);
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
          <h2 className="mt-panel-title">{selectedBroker.name}</h2>
          <p className="mt-panel-sub">Enter your MetaTrader account details to connect.</p>
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

          <button className="mt-connect-btn" type="submit">
            Connect
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
        <p className="mt-panel-sub">Choose your terminal, then pick a broker to connect.</p>
      </header>

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
          {filtered.length === 0 ? (
            <li className="mt-broker-empty">No brokers match that search.</li>
          ) : (
            filtered.map((broker) => (
              <li key={broker.id}>
                <button
                  type="button"
                  className="mt-broker-item"
                  onClick={() => pickBroker(broker)}
                >
                  <span className="mt-broker-name">{broker.name}</span>
                  <span className="mt-broker-meta">{platform}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
