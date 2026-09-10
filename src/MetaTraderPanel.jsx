import { useMemo, useState } from "react";
import { useApp } from "./store.jsx";

const BOTH = ["MT4", "MT5"];

const BROKER_NAMES = [
  "IC Markets",
  "Pepperstone",
  "Exness",
  "XM",
  "FP Markets",
  "Tickmill",
  "BlackBull Markets",
  "Vantage",
  "FxPro",
  "HFM",
  "Octa",
  "Eightcap",
  "OANDA",
  "FOREX.com",
  "IG",
  "AvaTrade",
  "Admiral Markets",
  "Axi",
  "Axiory",
  "ActivTrades",
  "Alpari",
  "ATC Brokers",
  "BDSwiss",
  "Blueberry Markets",
  "Capital.com",
  "CMC Markets",
  "Darwinex",
  "Dukascopy",
  "EasyMarkets",
  "Ebury",
  "eToro",
  "FBS",
  "FXTM",
  "FXCM",
  "FXOpen",
  "FXPrimus",
  "GBE brokers",
  "Global Prime",
  "GO Markets",
  "Hantec Markets",
  "HotForex",
  "HYCM",
  "ICM Trader",
  "InstaForex",
  "Interactive Brokers",
  "IronFX",
  "Just2Trade",
  "Libertex",
  "LiteFinance",
  "LMAX",
  "Markets.com",
  "MEX Atlantic",
  "Moneta Markets",
  "MultiBank Group",
  "NordFX",
  "NPBFX",
  "Optimus Futures",
  "Orbex",
  "Plus500",
  "PuPrime",
  "RoboForex",
  "Saxo Bank",
  "Spreadex",
  "Swissquote",
  "ThinkMarkets",
  "TMGM",
  "Trade Nation",
  "Tradeview Markets",
  "Trading 212",
  "Trireme Capital",
  "Union Markets",
  "Velocity Trade",
  "VT Markets",
  "Windsor Brokers",
  "XTB",
  "ZuluTrade",
  "Fusion Markets",
  "Raw Trading Ltd",
  "Skilling",
  "StarTrader",
  "AcerTrade",
  "AMarkets",
  "AETOS",
  "AFX Group",
  "Anzo Capital",
  "Aron Groups",
  "Aspire Forex",
  "Ava Options",
  "Baxia Markets",
  "Big Markets",
  "Bonds.com",
  "Broker Direct",
  "Bullwaves",
  "CFI Financial",
  "City Index",
  "ClickTrades",
  "Core Spreads",
  "Deriv",
  "DoTrading",
  "Earn Markets",
  "EC Markets",
  "Equiti",
  "Errante",
  "Eurotrader",
  "eXcentral",
  "Finam",
  "Fincorp",
  "FXTM Invest",
  "Gala Markets",
  "GC Money",
  "Golden Brokers",
  "Grand Capital",
  "GTCM",
  "HF Markets",
  "iCFD",
  "ICM Capital",
  "IFC Markets",
  "iFOREX",
  "Invast Global",
  "InvestAZ",
  "JustMarkets",
  "Key to Markets",
  "Land-FX",
  "LegacyFX",
  "Leverate",
  "LiquidityX",
  "Lirunex",
  "LQD Markets",
  "M4Markets",
  "MaxiMarkets",
  "MetaQuotes Demo",
  "MFX Broker",
  "MTrading",
  "NAGA",
  "NAGA Markets",
  "NestTrade",
  "NSBroker",
  "One Financial Markets",
  "Pacific Union",
  "PaxForex",
  "PHAT Markets",
  "Pocket Option",
  "PrimeXBT",
  "Profit Trading",
  "Purple Trading",
  "Quotex",
  "RannForex",
  "Refresh Markets",
  "Rivkin Securities",
  "Royal Financial Trading",
  "Safi Markets",
  "Sapa Markets",
  "Scope Markets",
  "SimpleFX",
  "Smart Markets",
  "ST Market",
  "Storm Markets",
  "Svenska Handelsbanken",
  "Switch Markets",
  "Taurex",
  "T4Trade",
  "The Forex Market",
  "TickTrader",
  "Titans Forex",
  "Trade Capital Markets",
  "Tradeo",
  "Tradivex",
  "TriumphFX",
  "TruTrade",
  "UFX",
  "Vantage International",
  "Vantage Global",
  "Vibon Markets",
  "Vision Trade",
  "VTB Forex",
  "Whitelabel Brokers",
  "XTB Online Trading",
  "Yapikredi Invest",
  "Yes Traders",
  "Z.com Trade",
  "ZBIFX",
  "ZFX",
  "AAAFx",
  "ACY Securities",
  "AETOS Capital Group",
  "Alfa Forex",
  "Alpari International",
  "Askap Futures",
  "ATFX",
  "AvaTradeEU",
  "AXSTrade",
  "Baxia",
  "BCS Forex",
  "Binance Futures",
  "BIT Markets",
  "BlackWell Global",
  "BrokerCreditService",
  "Bybit",
  "Capital Bear",
  "Capitals.com",
  "CFD Capital",
  "CMS Prime",
  "Colmex Pro",
  "CyberTrade",
  "DCI Capital",
  "Doto Brokers",
  "Ducascopy Bank",
  "EBC Financial Group",
  "EFX Group",
  "Elite Trader Funding",
  "EverFX",
  "Evo Markets",
  "Exclusive Markets",
  "FINAM Forex",
  "FirewoodFX",
  "Forex4you",
  "ForexChief",
  "Forex.com UK",
  "ForexTime",
  "Fortune Prime Global",
  "FreshForex",
  "FTMO",
  "FXTM Global",
  "GCEX",
  "GDMFX",
  "Gembell Limited",
  "Global Futures",
  "GMI Markets",
  "Goldenburg Capital",
  "GTCFX",
  "Guggenheim Markets",
  "Hantec Markets UK",
  "HF Markets Global",
  "HFM Global",
  "Holi Capital",
  "HotForex Global",
  "HY Markets",
  "IC Brokers",
  "IC Markets Global",
  "IC Markets EU",
  "IC Markets AU",
  "ICM Brokers",
  "Icon FX",
  "IFC Markets Global",
  "IG Index",
  "IG Markets",
  "InstaForex Europe",
  "IronFX Global",
  "iTrade Global",
  "Just2Trade Global",
  "JustMarkets Global",
  "Key Trading",
  "Kraken Futures",
  "KVB Markets",
  "KVB Kunlun",
  "LCG",
  "Libertex Global",
  "LiteFinance Global",
  "LMAX Exchange",
  "LMAX Global",
  "LMAX Digital",
  "London Capital Group",
  "Magic Trading",
  "Market.com",
  "Markets.com UK",
  "Maxi Markets",
  "MEX Group",
  "MTrading Global",
  "MultiBank FX",
  "NAGA Trader",
  "NordFX Global",
  "NPBFX Global",
  "OANDA Global Markets",
  "OANDA Europe",
  "OANDA Asia Pacific",
  "OctaFX",
  "Octa Markets",
  "Octa Markets Global",
  "OneRoyal",
  "Optimus",
  "Orbex Global",
  "Pepperstone Global",
  "Pepperstone AU",
  "Pepperstone UK",
  "Pepperstone EU",
  "PhillipCapital",
  "Plus500CY",
  "Prime Trading",
  "PuPrime Global",
  "RoboForex EU",
  "RoboForex Global",
  "Royal Markets",
  "Saxo Markets",
  "Scope Markets Global",
  "Skilling Markets",
  "StarTrader Global",
  "Swissquote Bank",
  "ThinkMarkets Global",
  "Tickmill Europe",
  "Tickmill UK",
  "Tickmill Global",
  "TMGM Global",
  "Trade360",
  "Trade Nation Global",
  "Tradeview",
  "Trireme",
  "Umarkets",
  "Union Markets Global",
  "Vantage Markets",
  "Vantage FX",
  "VT Markets Global",
  "Windsor Brokers Global",
  "XM Global",
  "XM Trading",
  "XM.com",
  "XTB Limited",
  "XTB Africa",
  "YesTrader",
  "Z.com Forex",

  // South Africa & Africa-focused brokers
  "Razor Markets",
  "Razor Markets SA",
  "GT247",
  "GT247.com",
  "EasyTrader",
  "EasyEquities",
  "RocketX",
  "CapX Markets",
  "CMC Markets South Africa",
  "IG South Africa",
  "Saxo Capital Markets South Africa",
  "Swissquote South Africa",
  "OANDA South Africa",
  "Interactive Brokers South Africa",
  "Plus500 South Africa",
  "eToro South Africa",
  "Trading 212 South Africa",
  "XTB South Africa",
  "Markets.com South Africa",
  "City Index South Africa",
  "Admirals South Africa",
  "Admiral Markets South Africa",
  "ThinkMarkets South Africa",
  "Pepperstone South Africa",
  "IC Markets South Africa",
  "Exness South Africa",
  "XM South Africa",
  "HFM South Africa",
  "HF Markets South Africa",
  "AvaTrade South Africa",
  "Tickmill South Africa",
  "Vantage South Africa",
  "FP Markets South Africa",
  "Blueberry Markets South Africa",
  "Fusion Markets South Africa",
  "GO Markets South Africa",
  "Global Prime South Africa",
  "Axi South Africa",
  "BlackBull Markets South Africa",
  "OctaFX",
  "JustMarkets",
  "JustForex",
  "FXPesa",
  "Accuindex",
  "SafeTrade",
  "Safe Markets",
  "AfrAsia Securities",
  "Standard Bank Online Trading",
  "Investec Share Trading",
  "PSG Wealth",
  "SatrixNOW",
  "Purple Group",
  "Velocity Trade South Africa",
  "FundedNext",
  "The Funded Trader",
  "FTMO",
  "Fidelcrest",
  "SurgeTrader",
  "E8 Funding",
  "Topstep",
  "My Forex Funds",
  "DNA Funded",
  "FundingPips",
  "Instant Funding",
  "Maven Trading",
  "Prop Firm Match",
];

const BROKER_ALIASES = {
  "razor-markets": ["razor", "razormarkets", "razor markets sa", "razor mt5"],
  "razor-markets-sa": ["razor", "razormarkets"],
  gt247: ["gt 247", "gt247.com", "easytrader", "purple group"],
  "gt247-com": ["gt247", "gt 247"],
  easytrader: ["gt247", "easy trader"],
  rocketx: ["rocket x", "rocketx sa"],
  "octafx": ["octa", "octa fx"],
  justmarkets: ["just markets", "justforex", "just forex"],
  justforex: ["justmarkets", "just markets"],
  fxpesa: ["fx pesa", "fxpesa kenya"],
  "hfm-south-africa": ["hfm", "hotforex", "hf markets"],
  "hf-markets-south-africa": ["hfm", "hotforex"],
  "exness-south-africa": ["exness sa", "exness africa"],
  "xm-south-africa": ["xm sa", "xm africa"],
  "pepperstone-south-africa": ["pepperstone sa"],
  "ic-markets-south-africa": ["ic markets sa", "icmarkets"],
  "xtb-south-africa": ["xtb sa", "xtb africa"],
  "ig-south-africa": ["ig sa", "ig markets sa"],
  "cmc-markets-south-africa": ["cmc sa", "cmc markets sa"],
  "velocity-trade-south-africa": ["velocity", "velocitytrade"],
};

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const BROKERS = Array.from(
  new Map(
    BROKER_NAMES.map((name) => {
      const id = slugify(name);
      return [
        id,
        {
          id,
          name,
          platforms: BOTH,
          aliases: BROKER_ALIASES[id] || [],
        },
      ];
    })
  ).values()
).sort((a, b) => a.name.localeCompare(b.name));

function matchesBroker(broker, q) {
  if (broker.name.toLowerCase().includes(q)) return true;
  return (broker.aliases || []).some((alias) => alias.toLowerCase().includes(q) || q.includes(alias.toLowerCase()));
}

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
    if (!q) return [];
    return BROKERS.filter((broker) => {
      if (!broker.platforms.includes(platform)) return false;
      return matchesBroker(broker, q);
    });
  }, [platform, query]);

  const hasQuery = query.trim().length > 0;
  const exactMatch = filtered.some(
    (broker) => broker.name.toLowerCase() === query.trim().toLowerCase()
  );
  const customBroker =
    hasQuery && !exactMatch
      ? {
          id: `custom-${slugify(query.trim())}`,
          name: query.trim(),
          platforms: BOTH,
          aliases: [],
          custom: true,
        }
      : null;

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
        <p className="mt-panel-sub">Choose your terminal, then search for your broker.</p>
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
          {!hasQuery ? (
            <li className="mt-broker-empty">Search for your broker</li>
          ) : (
            <>
              {filtered.map((broker) => (
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
              {filtered.length === 0 && !customBroker ? (
                <li className="mt-broker-empty">No brokers match that search.</li>
              ) : null}
            </>
          )}
        </ul>
      </section>
    </div>
  );
}
