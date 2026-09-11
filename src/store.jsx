import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  fetchSignups,
  mergeSignups,
  submitSignup,
  updateSignupStatus,
} from "./signupsApi.js";

const STORAGE_KEY = "apexea-app-v1";
const BACKUP_KEY = "apexea-app-v1-backup";
const MT5_SESSION_KEY = "apexea-mt5-session";

function loadMt5Session() {
  try {
    const raw = localStorage.getItem(MT5_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistMt5Session(session) {
  try {
    if (!session) localStorage.removeItem(MT5_SESSION_KEY);
    else localStorage.setItem(MT5_SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export const DEFAULT_SYMBOLS = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "USDCHF",
  "AUDUSD",
  "USDCAD",
  "NZDUSD",
  "EURGBP",
  "EURJPY",
  "GBPJPY",
  "XAUUSD",
  "XAGUSD",
  "BTCUSD",
  "ETHUSD",
  "NAS100",
  "US30",
];

export const STRATEGY_LABELS = {
  scalper: "Scalper",
  trend: "Trend Follower",
  grid: "Grid",
  news: "News Trader",
};

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function normalizeSymbol(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._/-]/g, "");
}

function randomLicenseKey() {
  const chunk = () =>
    Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(2, 6);
  return `APEX-${chunk()}-${chunk()}`;
}

function parseState(raw) {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

function eaCount(state) {
  return Array.isArray(state?.eas) ? state.eas.length : 0;
}

function loadState() {
  try {
    const primary = parseState(localStorage.getItem(STORAGE_KEY));
    const backup = parseState(localStorage.getItem(BACKUP_KEY));
    if (eaCount(primary) === 0 && eaCount(backup) > 0) {
      return {
        ...(primary || {}),
        eas: backup.eas,
        bots: Array.isArray(backup.bots) ? backup.bots : primary?.bots || [],
        licenseKeys: Array.isArray(backup.licenseKeys)
          ? backup.licenseKeys
          : primary?.licenseKeys || [],
        catalog: backup.catalog?.length ? backup.catalog : primary?.catalog,
        symbolMeta: backup.symbolMeta || primary?.symbolMeta || {},
        coverEmail: primary?.coverEmail || backup.coverEmail || "",
        signups: primary?.signups?.length ? primary.signups : backup.signups || [],
        activeInterface: primary?.activeInterface || backup.activeInterface || "zeta",
      };
    }
    return primary || backup;
  } catch {
    return null;
  }
}

function stripHeavyPhotos(payload) {
  return {
    ...payload,
    eas: (payload.eas || []).map((ea) => ({
      ...ea,
      photo:
        typeof ea.photo === "string" && ea.photo.startsWith("data:")
          ? "/logo.png"
          : ea.photo || "/logo.png",
    })),
    bots: (payload.bots || []).map((bot) => ({
      ...bot,
      photo:
        typeof bot.photo === "string" && bot.photo.startsWith("data:")
          ? "/logo.png"
          : bot.photo || "/logo.png",
    })),
  };
}

function saveState(payload) {
  const raw = JSON.stringify(payload);
  localStorage.setItem(STORAGE_KEY, raw);
  // Keep the last non-empty EA snapshot so an empty overwrite can be recovered.
  if (eaCount(payload) > 0) {
    localStorage.setItem(BACKUP_KEY, raw);
  }
}

function clearEaBackup() {
  try {
    localStorage.removeItem(BACKUP_KEY);
  } catch {
    // ignore
  }
}

const defaultState = {
  activeInterface: "zeta",
  coverEmail: "",
  signups: [],
  eas: [],
  bots: [],
  licenseKeys: [],
  catalog: [...DEFAULT_SYMBOLS],
  symbolMeta: {},
  toast: "",
};

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const saved = loadState();
  const [activeInterface, setActiveInterface] = useState(
    saved?.activeInterface === "v2" ? "v2" : "zeta"
  );
  const [coverEmail, setCoverEmail] = useState(saved?.coverEmail || "");
  const [signups, setSignups] = useState(saved?.signups || []);
  const [eas, setEas] = useState(saved?.eas || []);
  const [bots, setBots] = useState(saved?.bots || []);
  const [licenseKeys, setLicenseKeys] = useState(saved?.licenseKeys || []);
  const [catalog, setCatalog] = useState(
    saved?.catalog?.length ? saved.catalog : [...DEFAULT_SYMBOLS]
  );
  const [symbolMeta, setSymbolMeta] = useState(saved?.symbolMeta || {});
  const [toast, setToast] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPage, setAdminPage] = useState("dashboard");
  const [lockStep, setLockStep] = useState("cover");
  const [pairsOpen, setPairsOpen] = useState(false);
  const [zetaView, setZetaView] = useState("home");
  const [v2View, setV2View] = useState("home");
  const [v2Running, setV2Running] = useState(true);
  const [v2SymTab, setV2SymTab] = useState("allowed");
  const [editingSymbol, setEditingSymbol] = useState(null);
  const [editingEaId, setEditingEaId] = useState(null);
  const [mt5Session, setMt5SessionState] = useState(() => loadMt5Session());
  const [engineMode, setEngineMode] = useState("idle");
  const [engineStep, setEngineStep] = useState(0);
  const [engineLogs, setEngineLogs] = useState([]);
  const persistReady = useRef(false);

  const setMt5Session = useCallback((session) => {
    setMt5SessionState(session);
    persistMt5Session(session);
  }, []);

  const pushEngineLog = useCallback((line) => {
    setEngineLogs((prev) => [...prev.slice(-40), String(line)]);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(""), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((message) => setToast(message), []);

  useEffect(() => {
    // Skip the first run so Strict Mode remounts cannot blank a prior save
    // before React state finishes hydrating from localStorage.
    if (!persistReady.current) {
      persistReady.current = true;
      return;
    }

    const payload = {
      activeInterface,
      coverEmail,
      signups,
      eas,
      bots,
      licenseKeys,
      catalog,
      symbolMeta,
    };

    try {
      saveState(payload);
    } catch {
      try {
        saveState(stripHeavyPhotos(payload));
        showToast("Storage full — EA photos reset to logo so data can save");
      } catch {
        showToast("Could not save — storage is full. Remove old site data.");
      }
    }
  }, [
    activeInterface,
    coverEmail,
    signups,
    eas,
    bots,
    licenseKeys,
    catalog,
    symbolMeta,
    showToast,
  ]);

  const hasActiveBot = useMemo(
    () => bots.some((b) => b.active),
    [bots]
  );

  const activeBot = useMemo(() => {
    const active = bots.find((b) => b.active && b.selected) || bots.find((b) => b.active);
    return active || null;
  }, [bots]);

  const appSymbols = useMemo(() => {
    const set = new Set();
    eas.forEach((ea) => ea.symbols.forEach((s) => set.add(s)));
    return set;
  }, [eas]);

  const ensureCatalog = useCallback((symbol) => {
    setCatalog((prev) => (prev.includes(symbol) ? prev : [...prev, symbol]));
  }, []);

  const getSymbolMeta = useCallback(
    (symbol) =>
      symbolMeta[symbol] || {
        lotSize: 0.01,
        action: "BOTH",
        platform: "MT5",
        trades: 1,
      },
    [symbolMeta]
  );

  const refreshSignups = useCallback(async () => {
    try {
      const remote = await fetchSignups();
      let merged = remote;
      setSignups((prev) => {
        merged = mergeSignups(prev, remote);
        return merged;
      });
      return merged;
    } catch (error) {
      // Keep local cache if remote sync is temporarily unavailable.
      return null;
    }
  }, []);

  useEffect(() => {
    refreshSignups();
    const timer = setInterval(() => {
      refreshSignups();
    }, 15000);
    return () => clearInterval(timer);
  }, [refreshSignups]);

  const requestSignup = useCallback(
    async (email) => {
      const key = normalizeEmail(email);
      setCoverEmail(key);
      setSignups((prev) => {
        const existing = prev.find((s) => s.email === key);
        if (existing) {
          if (existing.status === "declined") {
            return prev.map((s) =>
              s.email === key
                ? { ...s, status: "pending", createdAt: Date.now() }
                : s
            );
          }
          return prev;
        }
        return [...prev, { email: key, status: "pending", createdAt: Date.now() }];
      });

      try {
        const remote = await submitSignup(key);
        if (remote) {
          setSignups((prev) => mergeSignups(prev, [remote]));
        } else {
          await refreshSignups();
        }
      } catch (error) {
        showToast(error.message || "Could not sync signup to server");
      }
      return key;
    },
    [refreshSignups, showToast]
  );

  const setSignupStatus = useCallback(
    async (email, status) => {
      const key = normalizeEmail(email);
      setSignups((prev) => {
        const exists = prev.some((s) => s.email === key);
        if (exists) {
          return prev.map((s) => (s.email === key ? { ...s, status } : s));
        }
        return [...prev, { email: key, status, createdAt: Date.now() }];
      });

      try {
        const remote = await updateSignupStatus(key, status);
        if (remote) setSignups((prev) => mergeSignups(prev, [remote]));
      } catch (error) {
        showToast(error.message || "Could not update signup on server");
      }

      showToast(
        status === "approved"
          ? `${key} approved`
          : status === "declined"
            ? `${key} declined`
            : `${key} updated`
      );
      if (status === "approved" && normalizeEmail(coverEmail) === key) {
        setLockStep("license");
        showToast("Approved — enter your license key");
      }
      if (status === "declined" && normalizeEmail(coverEmail) === key) {
        setLockStep("pending");
      }
    },
    [coverEmail, showToast]
  );


  const getSignup = useCallback(
    (email = coverEmail) => {
      const key = normalizeEmail(email);
      return signups.find((s) => s.email === key) || null;
    },
    [coverEmail, signups]
  );

  const resolveLockStep = useCallback(() => {
    const signup = getSignup(coverEmail);
    if (!signup) {
      setLockStep("cover");
      return;
    }
    if (signup.status === "approved") {
      setLockStep("license");
      return;
    }
    setLockStep("pending");
  }, [coverEmail, getSignup]);

  useEffect(() => {
    if (!hasActiveBot) resolveLockStep();
  }, [hasActiveBot, resolveLockStep]);

  const upsertEa = useCallback(
    ({ id, name, strategy, photo, symbols }) => {
      const cleanSymbols = symbols.map(normalizeSymbol).filter(Boolean);
      cleanSymbols.forEach(ensureCatalog);
      const photoValue = String(photo || "").trim();
      const hasProfilePhoto =
        photoValue.startsWith("data:image/") || /^https?:\/\//i.test(photoValue);
      if (!hasProfilePhoto) {
        showToast("Upload a profile picture before creating the bot");
        return null;
      }
      if (id) {
        setEas((prev) =>
          prev.map((ea) =>
            ea.id === id
              ? { ...ea, name, strategy, photo: photoValue, symbols: cleanSymbols }
              : ea
          )
        );
        setBots((prev) =>
          prev.map((bot) =>
            bot.id === id ? { ...bot, name, photo: photoValue, active: true } : bot
          )
        );
        showToast(`${name} profile updated`);
      } else {
        const newId = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
        setEas((prev) => [
          {
            id: newId,
            name,
            strategy,
            photo: photoValue,
            symbols: cleanSymbols,
          },
          ...prev,
        ]);
        setBots((prev) => [
          ...prev.map((b) => ({ ...b, selected: false })),
          {
            id: newId,
            name,
            photo: photoValue,
            active: true,
            selected: true,
          },
        ]);
        showToast(`${name} created`);
      }
      setEditingEaId(null);
      return true;
    },
    [ensureCatalog, showToast]
  );

  const selectBot = useCallback((botId) => {
    setBots((prev) =>
      prev.map((b) => ({ ...b, selected: b.id === botId }))
    );
  }, []);

  const removeActiveBot = useCallback(() => {
    const current =
      bots.find((b) => b.active && b.selected) || bots.find((b) => b.active);
    if (!current) {
      showToast("No active bot to remove");
      return;
    }
    const ok = window.confirm(
      `Remove ${current.name} from the app home?\n\nYour EA stays in Manage EA. Use a license key to activate it again.`
    );
    if (!ok) return;
    setBots((prev) => {
      const updated = prev.map((b) =>
        b.id === current.id ? { ...b, active: false, selected: false } : b
      );
      const next = updated.find((b) => b.active);
      if (next) {
        return updated.map((b) => ({ ...b, selected: b.id === next.id }));
      }
      return updated;
    });
    showToast(`${current.name} removed — restore with a license key`);
  }, [bots, showToast]);

  const deleteEa = useCallback(
    (eaId) => {
      const ea = eas.find((e) => e.id === eaId);
      const ok = window.confirm(
        `Delete ${ea?.name || "this EA"} permanently?\n\nThis cannot be undone.`
      );
      if (!ok) return;
      setEas((prev) => {
        const next = prev.filter((e) => e.id !== eaId);
        if (next.length === 0) clearEaBackup();
        return next;
      });
      setBots((prev) => {
        const next = prev.filter((b) => b.id !== eaId);
        if (!next.some((b) => b.selected) && next.some((b) => b.active)) {
          const first = next.find((b) => b.active);
          return next.map((b) => ({ ...b, selected: b.id === first.id }));
        }
        return next;
      });
      showToast(`${ea?.name || "EA"} deleted`);
      if (editingEaId === eaId) setEditingEaId(null);
    },
    [eas, editingEaId, showToast]
  );

  const generateLicense = useCallback(
    (botId) => {
      const bot = bots.find((b) => b.id === botId);
      if (!bot) {
        showToast("Select a bot");
        return null;
      }
      const key = randomLicenseKey();
      setLicenseKeys((prev) => [
        ...prev,
        {
          key,
          botId: bot.id,
          botName: bot.name,
          used: false,
          createdAt: Date.now(),
        },
      ]);
      showToast("License key generated");
      return key;
    },
    [bots, showToast]
  );

  const activateLicense = useCallback(
    (rawKey) => {
      const signup = getSignup(coverEmail);
      if (!signup || signup.status !== "approved") {
        setLockStep(signup?.status === "declined" ? "pending" : "pending");
        showToast(
          signup?.status === "declined"
            ? "Access was declined"
            : "Account must be approved first"
        );
        return false;
      }
      const key = String(rawKey || "").trim().toUpperCase();
      const entry = licenseKeys.find((item) => item.key === key);
      if (!entry) {
        showToast("Invalid license key");
        return false;
      }
      if (entry.used) {
        showToast("License key already used");
        return false;
      }
      const bot = bots.find((b) => b.id === entry.botId);
      if (!bot) {
        showToast("Bot not found for this key");
        return false;
      }
      setLicenseKeys((prev) =>
        prev.map((item) =>
          item.key === key ? { ...item, used: true } : item
        )
      );
      setBots((prev) =>
        prev.map((b) =>
          b.id === bot.id
            ? { ...b, active: true, selected: true }
            : { ...b, selected: false }
        )
      );
      showToast(`${bot.name} activated`);
      return true;
    },
    [bots, coverEmail, getSignup, licenseKeys, showToast]
  );

  const saveSymbolMeta = useCallback((symbol, meta) => {
    setSymbolMeta((prev) => ({ ...prev, [symbol]: meta }));
    ensureCatalog(symbol);
    // If not on any EA yet, attach to first EA
    setEas((prev) => {
      if (prev.some((ea) => ea.symbols.includes(symbol))) return prev;
      if (prev.length === 0) return prev;
      const [first, ...rest] = prev;
      return [{ ...first, symbols: [...first.symbols, symbol] }, ...rest];
    });
    showToast(`${symbol} saved`);
  }, [ensureCatalog, showToast]);

  const removeSymbolEverywhere = useCallback((symbol) => {
    setEas((prev) =>
      prev.map((ea) => ({
        ...ea,
        symbols: ea.symbols.filter((s) => s !== symbol),
      }))
    );
    setSymbolMeta((prev) => {
      const next = { ...prev };
      delete next[symbol];
      return next;
    });
    showToast(`${symbol} removed`);
  }, [showToast]);

  const toggleInterface = useCallback(() => {
    setActiveInterface((prev) => (prev === "zeta" ? "v2" : "zeta"));
    setZetaView("home");
    setV2View("home");
  }, []);

  const value = {
    activeInterface,
    toggleInterface,
    coverEmail,
    setCoverEmail,
    signups,
    requestSignup,
    setSignupStatus,
    refreshSignups,
    getSignup,
    eas,
    upsertEa,
    deleteEa,
    editingEaId,
    setEditingEaId,
    bots,
    activeBot,
    hasActiveBot,
    selectBot,
    removeActiveBot,
    licenseKeys,
    generateLicense,
    activateLicense,
    catalog,
    ensureCatalog,
    appSymbols,
    getSymbolMeta,
    saveSymbolMeta,
    removeSymbolEverywhere,
    normalizeSymbol,
    normalizeEmail,
    toast,
    showToast,
    adminOpen,
    setAdminOpen,
    adminPage,
    setAdminPage,
    lockStep,
    setLockStep,
    resolveLockStep,
    pairsOpen,
    setPairsOpen,
    zetaView,
    setZetaView,
    v2View,
    setV2View,
    v2Running,
    setV2Running,
    v2SymTab,
    setV2SymTab,
    editingSymbol,
    setEditingSymbol,
    mt5Session,
    setMt5Session,
    engineMode,
    setEngineMode,
    engineStep,
    setEngineStep,
    engineLogs,
    setEngineLogs,
    pushEngineLog,
    STRATEGY_LABELS,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
