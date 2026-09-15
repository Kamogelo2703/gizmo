import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { mediaUrl } from "./apiOrigin.js";
import {
  fetchSignups,
  mergeSignups,
  submitSignup,
  updateSignupAccessPaid,
  updateSignupPremiumScanner,
  updateSignupStatus,
} from "./signupsApi.js";
import {
  createLicenseRemote,
  deactivateLicenseRemote,
  deleteLicenseRemote,
  fetchLicense,
  fetchLicenses,
  fetchLicensesByEmail,
  mergeLicenses,
  markLicenseUsedRemote,
  normalizeLicenseKey,
  licenseKeyVariants,
  isLicenseExpired,
  resolveLicenseExpiry,
  photoFreshness,
  pickFresherPhoto,
  uploadBotPhotoRemote,
} from "./licensesApi.js";
import { getOrCreateDeviceId } from "./deviceId.js";
import {
  hasDeviceAccess,
  isSignupEntitled,
  rememberDeviceAccess,
} from "./deviceAccess.js";
import {
  DEFAULT_MENTOR_LICENSE_KEYS,
  fetchMentors,
  SUPER_ADMIN_EMAIL,
} from "./mentorsApi.js";
import {
  DEFAULT_APP_COLOR,
  applyAppTheme,
  normalizeHexColor,
} from "./theme.js";

const STORAGE_KEY = "apexea-app-v1";
const BACKUP_KEY = "apexea-app-v1-backup";
const MT5_SESSION_KEY = "apexea-mt5-session";
export const ADMIN_PATH = "/admin";

export function isAdminPath(pathname = typeof window !== "undefined" ? window.location.pathname : "/") {
  const path = String(pathname || "/")
    .replace(/\/+$/, "")
    .toLowerCase() || "/";
  return path === ADMIN_PATH || path.endsWith(ADMIN_PATH);
}

/** Capacitor Android/iOS shell — client trading app only (no mentor portal). */
export function isNativeApp() {
  try {
    return Boolean(
      typeof window !== "undefined" &&
        window.Capacitor &&
        typeof window.Capacitor.isNativePlatform === "function" &&
        window.Capacitor.isNativePlatform()
    );
  } catch {
    return false;
  }
}

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
  // Avoid 0/O/1/I/L so keys stay clear when typed on another phone.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const chunk = () =>
    Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join(
      ""
    );
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
        appColor: primary?.appColor || backup.appColor || DEFAULT_APP_COLOR,
        coverEmail: primary?.coverEmail || backup.coverEmail || "",
        signups: primary?.signups?.length ? primary.signups : backup.signups || [],
        activeInterface: primary?.activeInterface || backup.activeInterface || "zeta",
        premiumScannerEmails: Array.isArray(primary?.premiumScannerEmails)
          ? primary.premiumScannerEmails
          : backup.premiumScannerEmails || [],
      };
    }
    return primary || backup;
  } catch {
    return null;
  }
}

function isRealProfilePhoto(value) {
  const photo = String(value || "").trim();
  if (!photo || photo === "/logo.png") return false;
  return (
    photo.startsWith("data:image/") ||
    photo.startsWith("/api/licenses/photo") ||
    /^https?:\/\//i.test(photo)
  );
}

/** Photos kept in localStorage must stay tiny — mobile Safari quota is ~5MB total. */
const MAX_STORED_DATA_URL = 48_000;

function slimPhotoForStorage(value) {
  const photo = String(value || "").trim();
  if (!photo) return "/logo.png";
  if (photo === "/logo.png") return photo;
  if (photo.startsWith("/api/licenses/photo") || /^https?:\/\//i.test(photo)) return photo;
  if (photo.startsWith("data:image/")) {
    // Large embeds blow quota (and multiply across every license row).
    if (photo.length > MAX_STORED_DATA_URL) return "/logo.png";
    return photo;
  }
  return photo;
}

/** Prefer a real uploaded/synced photo over the placeholder logo. */
function pickProfilePhoto(...candidates) {
  for (const value of candidates) {
    if (isRealProfilePhoto(value)) return String(value).trim();
  }
  for (const value of candidates) {
    const photo = String(value || "").trim();
    if (photo) return photo;
  }
  return "/logo.png";
}

function slimPayloadForStorage(payload) {
  return {
    ...payload,
    eas: (payload.eas || []).map((ea) => ({
      ...ea,
      ownerEmail: String(ea.ownerEmail || ea.mentorEmail || "")
        .trim()
        .toLowerCase(),
      ownerId: String(ea.ownerId || ea.mentorId || "").trim(),
      photo: slimPhotoForStorage(ea.photo),
    })),
    bots: (payload.bots || []).map((bot) => ({
      ...bot,
      photo: slimPhotoForStorage(bot.photo),
    })),
    licenseKeys: (payload.licenseKeys || []).map((row) => ({
      ...row,
      bot: row.bot
        ? {
            ...row.bot,
            photo: slimPhotoForStorage(row.bot.photo),
          }
        : row.bot,
    })),
  };
}

function stripAllEmbeddedPhotos(payload) {
  const wipe = (photo) => {
    const value = String(photo || "").trim();
    if (value.startsWith("/api/licenses/photo") || /^https?:\/\//i.test(value)) return value;
    return "/logo.png";
  };
  return {
    ...payload,
    eas: (payload.eas || []).map((ea) => ({ ...ea, photo: wipe(ea.photo) })),
    bots: (payload.bots || []).map((bot) => ({ ...bot, photo: wipe(bot.photo) })),
    licenseKeys: (payload.licenseKeys || []).map((row) => ({
      ...row,
      bot: row.bot ? { ...row.bot, photo: wipe(row.bot.photo) } : row.bot,
    })),
  };
}

/** Prefer durable API photo paths so Home can show full-quality bytes. */
async function materializePhotoForLicense(photo) {
  const value = String(photo || "").trim();
  if (!value || value === "/logo.png") return "/logo.png";
  if (value.startsWith("/api/licenses/photo") || /^https?:\/\//i.test(value)) {
    return value;
  }
  if (value.startsWith("data:image/")) return value;
  return value;
}

function saveState(payload) {
  const slim = slimPayloadForStorage(payload);
  const raw = JSON.stringify(slim);
  localStorage.setItem(STORAGE_KEY, raw);
  // Keep the last non-empty EA snapshot so an empty overwrite can be recovered.
  if (eaCount(slim) > 0) {
    try {
      localStorage.setItem(BACKUP_KEY, raw);
    } catch {
      // Backup is optional — primary save already succeeded.
    }
  }
}

function clearEaBackup() {
  try {
    localStorage.removeItem(BACKUP_KEY);
  } catch {
    // ignore
  }
}

function clearAppStoragePressure() {
  clearEaBackup();
  try {
    // Drop known heavy keys that are not required for EA save.
    localStorage.removeItem("apexea-app-v1-backup");
    localStorage.removeItem("apexea-float-pos");
    localStorage.removeItem("apexea-float-pos-zeta");
    localStorage.removeItem("apexea-float-pos-v2");
    localStorage.removeItem("apexea-self-host-recent-v1");
    localStorage.removeItem("apexea-daily-scans-v1");
    localStorage.removeItem("apexea-trade-management");
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
  appColor: DEFAULT_APP_COLOR,
  toast: "",
};

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const savedRaw = loadState();
  const saved = savedRaw
    ? {
        ...savedRaw,
        ...slimPayloadForStorage(savedRaw),
      }
    : null;
  // Free quota from older oversized photo embeds / backups as soon as the app boots.
  if (typeof window !== "undefined") {
    try {
      clearAppStoragePressure();
      if (saved) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(slimPayloadForStorage(saved)));
      }
    } catch {
      try {
        clearAppStoragePressure();
        if (saved) {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(stripAllEmbeddedPhotos(saved))
          );
        }
      } catch {
        // ignore — persist effect will keep trying
      }
    }
  }
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
  const [appColor, setAppColorState] = useState(
    normalizeHexColor(saved?.appColor || DEFAULT_APP_COLOR)
  );
  const [premiumScannerEmails, setPremiumScannerEmails] = useState(() => {
    const list = Array.isArray(saved?.premiumScannerEmails)
      ? saved.premiumScannerEmails
      : [];
    return list
      .map((email) =>
        String(email || "")
          .trim()
          .toLowerCase()
      )
      .filter((email) => email.includes("@"));
  });
  /** mentorEmail → portal username (for client header) */
  const [mentorDirectory, setMentorDirectory] = useState({});
  const [toast, setToast] = useState("");
  const [adminOpen, setAdminOpenState] = useState(() =>
    typeof window !== "undefined" ? isAdminPath() && !isNativeApp() : false
  );
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
  const [orbTradeLive, setOrbTradeLive] = useState(null);
  const persistReady = useRef(false);

  const syncAdminPath = useCallback((open) => {
    if (typeof window === "undefined") return;
    const onAdmin = isAdminPath();
    if (open && !onAdmin) {
      window.history.pushState({ apexAdmin: true }, "", ADMIN_PATH);
    } else if (!open && onAdmin) {
      window.history.pushState({ apexAdmin: false }, "", "/");
    }
  }, []);

  const openAdmin = useCallback(
    (page = "dashboard") => {
      if (isNativeApp()) return;
      if (page) setAdminPage(page);
      setAdminOpenState(true);
      syncAdminPath(true);
    },
    [syncAdminPath]
  );

  const setAdminOpen = useCallback(
    (open) => {
      if (open) {
        if (isNativeApp()) return;
        openAdmin("dashboard");
        return;
      }
      setAdminOpenState(false);
      syncAdminPath(false);
    },
    [openAdmin, syncAdminPath]
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    function onPopState() {
      if (isNativeApp()) {
        if (isAdminPath()) {
          window.history.replaceState({ apexAdmin: false }, "", "/");
        }
        setAdminOpenState(false);
        return;
      }
      setAdminOpenState(isAdminPath());
    }
    window.addEventListener("popstate", onPopState);
    // Deep-link /admin on first load — blocked in the native trading app.
    if (isNativeApp()) {
      if (isAdminPath()) window.history.replaceState({ apexAdmin: false }, "", "/");
      setAdminOpenState(false);
    } else if (isAdminPath()) {
      setAdminOpenState(true);
    }
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const previous = document.title;
    if (adminOpen) document.title = "Admin — APEX EA";
    else document.title = previous.includes("Admin") ? "apex-ea" : previous;
    return () => {
      document.title = previous;
    };
  }, [adminOpen]);

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
    applyAppTheme(appColor);
  }, [appColor]);

  const setAppColor = useCallback(
    (next) => {
      const color = normalizeHexColor(next);
      setAppColorState(color);
      applyAppTheme(color);
      showToast(`App color updated`);
    },
    [showToast]
  );

  const lastPersistRawRef = useRef("");
  const persistTimerRef = useRef(0);

  useEffect(() => {
    // Skip the first run so Strict Mode remounts cannot blank a prior save
    // before React state finishes hydrating from localStorage.
    if (!persistReady.current) {
      persistReady.current = true;
      return undefined;
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
      appColor,
      premiumScannerEmails,
    };

    const flush = () => {
      try {
        const slim = slimPayloadForStorage(payload);
        const raw = JSON.stringify(slim);
        // Skip identical writes — 5s license polls used to thrash localStorage on Android.
        if (raw === lastPersistRawRef.current) return;
        lastPersistRawRef.current = raw;
        localStorage.setItem(STORAGE_KEY, raw);
        if (eaCount(slim) > 0) {
          try {
            localStorage.setItem(BACKUP_KEY, raw);
          } catch {
            // Backup is optional — primary save already succeeded.
          }
        }
      } catch {
        try {
          clearAppStoragePressure();
          saveState(payload);
        } catch {
          try {
            clearAppStoragePressure();
            const stripped = stripAllEmbeddedPhotos(payload);
            saveState(stripped);
            // Slim in-memory state so we stop rewriting oversized embeds.
            setEas((prev) =>
              prev.map((ea) => ({ ...ea, photo: slimPhotoForStorage(ea.photo) }))
            );
            setBots((prev) =>
              prev.map((bot) => ({ ...bot, photo: slimPhotoForStorage(bot.photo) }))
            );
            setLicenseKeys((prev) =>
              prev.map((row) =>
                row.bot
                  ? {
                      ...row,
                      bot: { ...row.bot, photo: slimPhotoForStorage(row.bot.photo) },
                    }
                  : row
              )
            );
            showToast("Storage was full — cleared local image cache so saves can continue");
          } catch {
            try {
              clearEaBackup();
              const minimal = stripAllEmbeddedPhotos(payload);
              localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal));
              setEas((prev) =>
                prev.map((ea) => ({ ...ea, photo: slimPhotoForStorage(ea.photo) }))
              );
              setBots((prev) =>
                prev.map((bot) => ({ ...bot, photo: slimPhotoForStorage(bot.photo) }))
              );
              setLicenseKeys((prev) =>
                prev.map((row) =>
                  row.bot
                    ? {
                        ...row,
                        bot: { ...row.bot, photo: slimPhotoForStorage(row.bot.photo) },
                      }
                    : row
                )
              );
              showToast("Storage was full — EA saved; re-upload the picture if needed");
            } catch {
              showToast(
                "Could not save — storage is full. Clear site data for apex-ea.com and retry."
              );
            }
          }
        }
      }
    };

    // Debounce on native WebView so rapid setState from polls does not block the UI thread.
    const delay = isNativeApp() ? 600 : 0;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    if (!delay) {
      flush();
      return undefined;
    }
    persistTimerRef.current = window.setTimeout(flush, delay);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [
    activeInterface,
    coverEmail,
    signups,
    eas,
    bots,
    licenseKeys,
    catalog,
    symbolMeta,
    appColor,
    premiumScannerEmails,
    showToast,
  ]);

  const hasActiveBot = useMemo(
    () => bots.some((b) => b.active),
    [bots]
  );

  const v2ScannerPremium = useMemo(() => {
    const email = normalizeEmail(coverEmail);
    if (!email) return false;
    if (premiumScannerEmails.includes(email)) return true;
    const signup = signups.find((row) => normalizeEmail(row.email) === email);
    return Boolean(signup?.premiumScanner);
  }, [coverEmail, premiumScannerEmails, signups]);

  const unlockV2ScannerPremium = useCallback(
    (email = coverEmail) => {
      const key = normalizeEmail(email);
      if (!key || !key.includes("@")) {
        showToast("Missing email for premium unlock");
        return false;
      }
      setCoverEmail(key);
      setPremiumScannerEmails((prev) =>
        prev.includes(key) ? prev : [...prev, key]
      );
      setSignups((prev) =>
        mergeSignups(prev, [
          {
            email: key,
            status: "approved",
            createdAt: Date.now(),
            premiumScanner: true,
            premiumScannerAt: Date.now(),
          },
        ])
      );
      return true;
    },
    [coverEmail, showToast]
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
      // Restore local premium-scanner unlocks from remote signup flags only
      // (never from plain approved/app-access payment).
      const paid = (merged || [])
        .filter((row) => row?.premiumScanner)
        .map((row) =>
          String(row.email || "")
            .trim()
            .toLowerCase()
        )
        .filter((email) => email.includes("@"));
      if (paid.length) {
        setPremiumScannerEmails((prev) => Array.from(new Set([...prev, ...paid])));
      }
      return merged;
    } catch (error) {
      // Keep local cache if remote sync is temporarily unavailable.
      return null;
    }
  }, []);

  useEffect(() => {
    const pollMs = isNativeApp() ? 30000 : 15000;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      refreshSignups();
    };
    tick();
    const timer = setInterval(tick, pollMs);
    return () => clearInterval(timer);
  }, [refreshSignups]);

  const refreshMentorDirectory = useCallback(async () => {
    try {
      const list = await fetchMentors();
      const map = {};
      for (const mentor of list || []) {
        const email = normalizeEmail(mentor?.email);
        const username = String(mentor?.username || "").trim();
        if (email && username) map[email] = username;
      }
      setMentorDirectory(map);
      return map;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    // Android APK: fetch once at boot. Continuous mentor polls were burning main-thread time.
    refreshMentorDirectory();
    if (isNativeApp()) return undefined;
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      refreshMentorDirectory();
    }, 20000);
    return () => clearInterval(timer);
  }, [refreshMentorDirectory]);

  // Stamp mentor portal usernames onto license rows that only have mentorEmail.
  useEffect(() => {
    if (!Object.keys(mentorDirectory).length) return undefined;
    setLicenseKeys((prev) => {
      let changed = false;
      const next = prev.map((row) => {
        if (String(row.mentorName || "").trim()) return row;
        const email = normalizeEmail(row.mentorEmail);
        const username = email ? mentorDirectory[email] : "";
        if (!username) return row;
        changed = true;
        return { ...row, mentorName: username };
      });
      return changed ? next : prev;
    });
    return undefined;
  }, [mentorDirectory]);

  const refreshLicenses = useCallback(async () => {
    try {
      const remote = await fetchLicenses();
      setLicenseKeys((prev) => mergeLicenses(prev, remote));

      // Mentor photo updates sync live onto local EAs/bots.
      // Always keep the freshest photo (versioned API path beats stale data URLs).
      const photoByBotId = new Map();
      remote.forEach((row) => {
        const id = String(row.botId || row.bot?.id || "").trim();
        const photo = String(row.bot?.photo || "").trim();
        if (!id || !photo || photo === "/logo.png") return;
        const prevPhoto = photoByBotId.get(id);
        photoByBotId.set(id, prevPhoto ? pickFresherPhoto(photo, prevPhoto) : photo);
      });
      if (photoByBotId.size) {
        setEas((prev) =>
          prev.map((ea) => {
            const remotePhoto = photoByBotId.get(ea.id);
            if (!remotePhoto) return ea;
            const localPhoto = String(ea.photo || "");
            // Never replace a working embedded photo with an API path that can 404
            // after serverless cold starts (that is what made Manage EAs avatars vanish).
            if (
              localPhoto.startsWith("data:image/") &&
              remotePhoto.startsWith("/api/licenses/photo")
            ) {
              return ea;
            }
            const remoteFresh = photoFreshness(remotePhoto);
            const localFresh = photoFreshness(localPhoto);
            if (remoteFresh > localFresh) return { ...ea, photo: remotePhoto };
            if (remoteFresh < localFresh) return ea;
            // Tie on unversioned data URLs: keep local so a just-uploaded picture
            // is not overwritten by an older embedded remote snapshot.
            if (
              remotePhoto.startsWith("data:") &&
              localPhoto.startsWith("data:") &&
              remotePhoto !== localPhoto
            ) {
              return ea;
            }
            if (remotePhoto.includes("v=") && !localPhoto.includes("v=")) {
              if (localPhoto.startsWith("data:image/")) return ea;
              return { ...ea, photo: remotePhoto };
            }
            return ea;
          })
        );
        setBots((prev) =>
          prev.map((bot) => {
            const remotePhoto = photoByBotId.get(bot.id);
            if (!remotePhoto) return bot;
            const localPhoto = String(bot.photo || "");
            if (
              localPhoto.startsWith("data:image/") &&
              remotePhoto.startsWith("/api/licenses/photo")
            ) {
              return bot;
            }
            const remoteFresh = photoFreshness(remotePhoto);
            const localFresh = photoFreshness(localPhoto);
            if (remoteFresh > localFresh) return { ...bot, photo: remotePhoto };
            if (remoteFresh < localFresh) return bot;
            if (
              remotePhoto.startsWith("data:") &&
              localPhoto.startsWith("data:") &&
              remotePhoto !== localPhoto
            ) {
              return bot;
            }
            if (remotePhoto.includes("v=") && !localPhoto.includes("v=")) {
              if (localPhoto.startsWith("data:image/")) return bot;
              return { ...bot, photo: remotePhoto };
            }
            return bot;
          })
        );
      }
      return remote;
    } catch {
      return null;
    }
  }, []);

  // Push any device-local keys into the shared store once so other phones can use them.
  const licenseMigrateRef = useRef(false);
  useEffect(() => {
    if (licenseMigrateRef.current) return;
    licenseMigrateRef.current = true;
    (async () => {
      const local = Array.isArray(licenseKeys) ? licenseKeys : [];
      for (const entry of local) {
        if (!entry?.key) continue;
        if (!entry.clientEmail || !String(entry.clientEmail).includes("@")) continue;
        if (!entry.clientName) continue;
        try {
          const photo = String(entry.bot?.photo || "");
          await createLicenseRemote({
            ...entry,
            bot: entry.bot
              ? {
                  ...entry.bot,
                  // Prefer API photo paths; data URLs only when no synced path exists.
                  photo: photo || "/logo.png",
                }
              : undefined,
          });
        } catch {
          // keep going — remote may already have the key
        }
      }
      await refreshLicenses();
    })();
  }, [licenseKeys, refreshLicenses]);

  useEffect(() => {
    // Web can poll often; Android WebView freezes when HTTPS + localStorage hit every 5s.
    const pollMs = isNativeApp() ? 45000 : 5000;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      refreshLicenses();
    };
    const timer = setInterval(tick, pollMs);
    const onVis = () => {
      if (!document.hidden) refreshLicenses();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refreshLicenses]);

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

  const bypassAppAccess = useCallback(
    async (email) => {
      const key = normalizeEmail(email);
      if (!key || !key.includes("@")) {
        showToast("Enter a valid email");
        return false;
      }
      await setSignupStatus(key, "approved");
      try {
        const remote = await updateSignupAccessPaid(key);
        if (remote) setSignups((prev) => mergeSignups(prev, [remote]));
      } catch {
        // Still mark paid locally so "I have paid" restores on this phone.
        setSignups((prev) =>
          mergeSignups(prev, [
            {
              email: key,
              status: "approved",
              accessPaid: true,
              accessPaidAt: Date.now(),
              createdAt: Date.now(),
            },
          ])
        );
      }
      rememberDeviceAccess(key, { paid: true, bypassed: true });
      showToast(`App access bypassed for ${key}`);
      return true;
    },
    [setSignupStatus, showToast]
  );

  const bypassPremiumScanner = useCallback(
    async (email) => {
      const key = normalizeEmail(email);
      if (!key || !key.includes("@")) {
        showToast("Enter a valid email");
        return false;
      }
      try {
        const remote = await updateSignupPremiumScanner(key);
        if (remote) setSignups((prev) => mergeSignups(prev, [remote]));
        unlockV2ScannerPremium(key);
        showToast(`Premium scanner bypassed for ${key}`);
        return true;
      } catch (error) {
        // Expired GitHub token used to surface "Bad credentials" and block bypass.
        // Still unlock locally so admin bypass always works for this device/session.
        unlockV2ScannerPremium(key);
        setSignups((prev) =>
          mergeSignups(prev, [
            {
              email: key,
              status: "approved",
              createdAt: Date.now(),
              premiumScanner: true,
              premiumScannerAt: Date.now(),
            },
          ])
        );
        showToast(`Premium scanner bypassed for ${key}`);
        return true;
      }
    },
    [showToast, unlockV2ScannerPremium]
  );


  const getSignup = useCallback(
    (email = coverEmail) => {
      const key = normalizeEmail(email);
      return signups.find((s) => s.email === key) || null;
    },
    [coverEmail, signups]
  );


  const mentorDisplayName = useMemo(() => {
    const formatFromEmail = (email) => {
      const mail = String(email || "").trim();
      if (!mail.includes("@")) return "";
      const local = mail.split("@")[0].replace(/[._-]+/g, " ").trim();
      if (!local) return "";
      return local
        .split(" ")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    };

    const pickFromLicense = (row) => {
      if (!row) return "";
      const named = String(row.mentorName || "").trim();
      if (named) return named;
      return formatFromEmail(row.mentorEmail);
    };

    const account = normalizeEmail(coverEmail);
    const keys = Array.isArray(licenseKeys) ? licenseKeys : [];
    const eaList = Array.isArray(eas) ? eas : [];
    const botId = String(activeBot?.id || "").trim();

    // Prefer the mentor tied to the active bot first (multi-bot clients).
    if (botId) {
      const forBot = keys.filter(
        (row) =>
          String(row.botId || "").trim() === botId ||
          String(row.bot?.id || "").trim() === botId
      );
      forBot.sort(
        (a, b) =>
          Number(b.usedAt || b.updatedAt || 0) - Number(a.usedAt || a.updatedAt || 0)
      );
      const fromBotLicense = pickFromLicense(forBot.find((row) => row?.used) || forBot[0]);
      if (fromBotLicense) return fromBotLicense;
    }

    if (account) {
      const used = keys.filter(
        (row) => row?.used && normalizeEmail(row.clientEmail) === account
      );
      used.sort(
        (a, b) =>
          Number(b.usedAt || b.updatedAt || 0) - Number(a.usedAt || a.updatedAt || 0)
      );
      const fromUsed = pickFromLicense(used[0]);
      if (fromUsed) return fromUsed;

      const bound = keys.filter((row) => normalizeEmail(row.clientEmail) === account);
      bound.sort(
        (a, b) =>
          Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0)
      );
      const fromBound = pickFromLicense(bound[0]);
      if (fromBound) return fromBound;
    }

    if (botId) {
      const ea =
        eaList.find((item) => item.id === botId) ||
        eaList.find((item) => String(item.ownerEmail || "").includes("@"));
      const fromOwner = formatFromEmail(ea?.ownerEmail);
      if (fromOwner) return fromOwner;
    }

    const anyOwner = eaList.find((item) => String(item.ownerEmail || "").includes("@"));
    return formatFromEmail(anyOwner?.ownerEmail);
  }, [activeBot, coverEmail, eas, licenseKeys]);

  /** Mentor portal username shown in the client top header. Never use client main text. */
  const mainTextDisplay = useMemo(() => {
    const account = normalizeEmail(coverEmail);
    const keys = Array.isArray(licenseKeys) ? licenseKeys : [];
    const eaList = Array.isArray(eas) ? eas : [];
    const botId = String(activeBot?.id || "").trim();

    const resolveMentorUsername = (row) => {
      if (!row) return "";
      const named = String(row.mentorName || "").trim();
      if (named) return named;
      const mentorEmail = normalizeEmail(row.mentorEmail);
      if (mentorEmail && mentorDirectory[mentorEmail]) {
        return mentorDirectory[mentorEmail];
      }
      return "";
    };

    if (botId) {
      const forBot = keys.filter(
        (row) =>
          String(row.botId || "").trim() === botId ||
          String(row.bot?.id || "").trim() === botId
      );
      forBot.sort(
        (a, b) =>
          Number(b.usedAt || b.updatedAt || 0) - Number(a.usedAt || a.updatedAt || 0)
      );
      const fromBot = resolveMentorUsername(forBot.find((row) => row?.used) || forBot[0]);
      if (fromBot) return fromBot;

      const ea =
        eaList.find((item) => item.id === botId) ||
        eaList.find((item) => String(item.ownerEmail || "").includes("@"));
      const ownerEmail = normalizeEmail(ea?.ownerEmail);
      if (ownerEmail && mentorDirectory[ownerEmail]) return mentorDirectory[ownerEmail];
    }

    if (account) {
      const used = keys.filter(
        (row) => row?.used && normalizeEmail(row.clientEmail) === account
      );
      used.sort(
        (a, b) =>
          Number(b.usedAt || b.updatedAt || 0) - Number(a.usedAt || a.updatedAt || 0)
      );
      const fromUsed = resolveMentorUsername(used[0]);
      if (fromUsed) return fromUsed;

      const bound = keys.filter((row) => normalizeEmail(row.clientEmail) === account);
      bound.sort(
        (a, b) =>
          Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0)
      );
      const fromBound = resolveMentorUsername(bound[0]);
      if (fromBound) return fromBound;
    }

    // Last resort: any EA owner that maps to a mentor username.
    for (const ea of eaList) {
      const ownerEmail = normalizeEmail(ea?.ownerEmail);
      if (ownerEmail && mentorDirectory[ownerEmail]) return mentorDirectory[ownerEmail];
    }

    return "";
  }, [activeBot, coverEmail, eas, licenseKeys, mentorDirectory]);

  const resolveLockStep = useCallback(() => {
    const signup = getSignup(coverEmail);
    if (!signup && !hasDeviceAccess(coverEmail)) {
      setLockStep("cover");
      return;
    }
    if (isSignupEntitled(signup, coverEmail)) {
      setLockStep("license");
      return;
    }
    // Pending / declined clients wait on the pending screen for super admin.
    setLockStep("pending");
  }, [coverEmail, getSignup]);

  useEffect(() => {
    if (!hasActiveBot) resolveLockStep();
  }, [hasActiveBot, resolveLockStep]);

  const upsertEa = useCallback(
    async ({ id, name, strategy, photo, symbols, ownerEmail = "", ownerId = "" }) => {
      const cleanSymbols = symbols.map(normalizeSymbol).filter(Boolean);
      cleanSymbols.forEach(ensureCatalog);
      let photoValue = String(photo || "").trim();
      const hasProfilePhoto =
        photoValue.startsWith("data:image/") ||
        photoValue.startsWith("/api/licenses/photo") ||
        /^https?:\/\//i.test(photoValue);
      if (!hasProfilePhoto) {
        showToast("Upload a profile picture before creating the bot");
        return null;
      }
      const owner = {
        ownerEmail: String(ownerEmail || "")
          .trim()
          .toLowerCase(),
        ownerId: String(ownerId || "").trim(),
      };
      const botId =
        id ||
        `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;

      // Upload gallery/camera data URLs. Prefer a short API path in app state so
      // localStorage never fills up with multi-MB embeds (that blocked saves).
      if (photoValue.startsWith("data:image/")) {
        const originalDataUrl = photoValue;
        try {
          const uploaded = await uploadBotPhotoRemote(botId, photoValue);
          const uploadedPhoto = String(uploaded || "").trim();
          if (uploadedPhoto.startsWith("/api/licenses/photo")) {
            try {
              const check = await fetch(mediaUrl(uploadedPhoto), { method: "GET", cache: "no-store" });
              photoValue = check.ok ? uploadedPhoto : slimPhotoForStorage(originalDataUrl);
            } catch {
              photoValue = slimPhotoForStorage(originalDataUrl);
            }
          } else if (
            uploadedPhoto.startsWith("data:image/") &&
            uploadedPhoto.length <= MAX_STORED_DATA_URL
          ) {
            photoValue = uploadedPhoto;
          } else if (
            uploadedPhoto.startsWith("/api/licenses/photo") ||
            /^https?:\/\//i.test(uploadedPhoto)
          ) {
            photoValue = uploadedPhoto;
          } else {
            photoValue = slimPhotoForStorage(originalDataUrl);
            if (photoValue === "/logo.png") {
              showToast("Picture uploaded — avatar will show once storage frees up");
            }
          }
        } catch {
          photoValue = slimPhotoForStorage(originalDataUrl);
          if (photoValue === "/logo.png") {
            showToast("Picture too large for this phone — try a smaller image");
          } else {
            showToast("Picture saved on this device");
          }
        }
      }

      // API paths are safe; huge data URLs are slimmed so license rows do not explode quota.
      const statePhoto =
        photoValue.startsWith("/api/licenses/photo") || /^https?:\/\//i.test(photoValue)
          ? photoValue
          : slimPhotoForStorage(photoValue);
      const licensePhoto = slimPhotoForStorage(statePhoto);

      if (id) {
        setEas((prev) =>
          prev.map((ea) =>
            ea.id === id
              ? {
                  ...ea,
                  name,
                  strategy,
                  photo: statePhoto,
                  symbols: cleanSymbols,
                  ownerEmail: owner.ownerEmail || ea.ownerEmail || "",
                  ownerId: owner.ownerId || ea.ownerId || "",
                }
              : ea
          )
        );
        setBots((prev) =>
          prev.map((bot) =>
            bot.id === id ? { ...bot, name, photo: statePhoto, active: true } : bot
          )
        );
        setLicenseKeys((prev) =>
          prev.map((row) => {
            const rowBotId = String(row.botId || row.bot?.id || "").trim();
            if (rowBotId !== id) return row;
            return {
              ...row,
              botName: name || row.botName,
              updatedAt: Date.now(),
              bot: {
                ...(row.bot || { id, name, strategy: "scalper", symbols: [] }),
                id,
                name: name || row.bot?.name || row.botName || "Bot",
                photo: licensePhoto,
              },
            };
          })
        );
        showToast(`${name} profile updated`);
        // Pull the rewritten license photos quickly so client apps sync.
        window.setTimeout(() => {
          void refreshLicenses();
        }, 400);
      } else {
        setEas((prev) => [
          {
            id: botId,
            name,
            strategy,
            photo: statePhoto,
            symbols: cleanSymbols,
            ...owner,
          },
          ...prev,
        ]);
        setBots((prev) => [
          ...prev.map((b) => ({ ...b, selected: false })),
          {
            id: botId,
            name,
            photo: statePhoto,
            active: true,
            selected: true,
          },
        ]);
        showToast(`${name} created`);
      }
      setEditingEaId(null);
      return true;
    },
    [ensureCatalog, refreshLicenses, showToast]
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
    async (
      botId,
      {
        clientEmail = "",
        clientName = "",
        mainText = "",
        mentorEmail = "",
        mentorId = "",
        mentorName = "",
        duration = "lifetime",
      } = {}
    ) => {
      const bot = bots.find((b) => b.id === botId);
      if (!bot) {
        showToast("Select a bot");
        return null;
      }
      const email = normalizeEmail(clientEmail);
      const name = String(clientName || "").trim();
      const username = String(mainText || name || "").trim();
      if (!name) {
        showToast("Enter the client name");
        return null;
      }
      if (!email || !email.includes("@")) {
        showToast("Enter the client email");
        return null;
      }

      const ea = eas.find((item) => item.id === botId);
      const key = randomLicenseKey();
      const ownerEmail =
        String(mentorEmail || ea?.ownerEmail || "")
          .trim()
          .toLowerCase() || "";
      const ownerId = String(mentorId || ea?.ownerId || "").trim();
      const ownerName = String(mentorName || "").trim();
      const createdAt = Date.now();
      const timing = resolveLicenseExpiry(duration, createdAt);

      if (ownerEmail && ownerEmail !== String(SUPER_ADMIN_EMAIL).toLowerCase()) {
        let allowance = DEFAULT_MENTOR_LICENSE_KEYS;
        try {
          const mentors = await fetchMentors();
          const mentor = (Array.isArray(mentors) ? mentors : []).find(
            (m) => normalizeEmail(m.email) === ownerEmail
          );
          if (mentor && String(mentor.role || "").toLowerCase() === "superadmin") {
            allowance = null;
          } else if (mentor?.licenseKeysAllowed != null) {
            allowance = Number(mentor.licenseKeysAllowed);
          }
        } catch {
          allowance = DEFAULT_MENTOR_LICENSE_KEYS;
        }
        if (allowance != null && Number.isFinite(allowance)) {
          const used = (Array.isArray(licenseKeys) ? licenseKeys : []).filter(
            (row) => normalizeEmail(row.mentorEmail) === ownerEmail
          ).length;
          if (used >= allowance) {
            showToast(
              `License key limit reached (${used}/${allowance}). Ask super admin to add more keys.`
            );
            return null;
          }
        }
      }

      // Prefer the versioned API photo path so every activation gets the latest
      // picture. Fall back to an embedded data URL only when upload cannot sync.
      let photo = String(bot.photo || ea?.photo || "/logo.png").trim() || "/logo.png";
      const originalPhoto = photo;
      if (photo.startsWith("data:image/")) {
        try {
          const uploaded = await uploadBotPhotoRemote(bot.id, photo);
          const uploadedPhoto = String(uploaded || "").trim();
          if (uploadedPhoto.startsWith("/api/licenses/photo")) {
            try {
              const check = await fetch(mediaUrl(uploadedPhoto), { method: "GET", cache: "no-store" });
              photo = check.ok ? uploadedPhoto : originalPhoto;
            } catch {
              photo = originalPhoto;
            }
          } else if (uploadedPhoto.startsWith("data:image/")) {
            photo = uploadedPhoto;
          } else if (isRealProfilePhoto(uploadedPhoto)) {
            photo = uploadedPhoto;
          }
        } catch {
          // Keep the local data URL — createLicenseRemote will embed it.
          photo = originalPhoto;
        }
      } else if (photo.startsWith("/api/licenses/photo")) {
        // Verify the synced path still serves; otherwise fall back to logo later.
        try {
          const check = await fetch(mediaUrl(photo), { method: "GET", cache: "no-store" });
          if (!check.ok) photo = await materializePhotoForLicense(originalPhoto);
        } catch {
          photo = await materializePhotoForLicense(originalPhoto);
        }
      } else {
        photo = await materializePhotoForLicense(photo);
      }

      const entry = {
        key,
        botId: bot.id,
        botName: bot.name,
        clientEmail: email,
        clientName: name,
        mainText: username,
        mentorEmail: ownerEmail,
        mentorId: ownerId,
        mentorName: ownerName,
        used: false,
        duration: timing.duration,
        expiresAt: timing.expiresAt,
        createdAt,
        usedAt: null,
        deviceId: null,
        boundAt: null,
        updatedAt: Date.now(),
        bot: {
          id: bot.id,
          name: bot.name,
          photo,
          strategy: ea?.strategy || "scalper",
          symbols: Array.isArray(ea?.symbols) ? ea.symbols : [],
        },
      };
      setLicenseKeys((prev) => mergeLicenses(prev, [entry]));

      // Keep signup list in sync — license email is approved for activation.
      try {
        await submitSignup(email);
        await updateSignupStatus(email, "approved");
        setSignups((prev) =>
          mergeSignups(prev, [{ email, status: "approved", createdAt: Date.now() }])
        );
      } catch {
        // license create still proceeds
      }

      try {
        const remote = await createLicenseRemote({
          ...entry,
          bot: {
            ...entry.bot,
            photo: entry.bot.photo || "/logo.png",
          },
        });
        if (remote) {
          setLicenseKeys((prev) => mergeLicenses(prev, [remote]));
          const syncedPhoto = remote.bot?.photo;
          if (syncedPhoto && syncedPhoto !== "/logo.png") {
            setEas((prev) =>
              prev.map((item) =>
                item.id === bot.id ? { ...item, photo: syncedPhoto } : item
              )
            );
            setBots((prev) =>
              prev.map((item) =>
                item.id === bot.id ? { ...item, photo: syncedPhoto } : item
              )
            );
          }
        }
        showToast(`License ready for ${name} · ${email}`);
        return remote?.key || key;
      } catch (error) {
        // Keep the local key so mentors can still copy/share it when GitHub sync fails.
        showToast(
          error.message === "Bad credentials"
            ? `License created locally for ${name} — copy it now (server sync needs a fresh GitHub token)`
            : `License created for ${name} — copy it now (sync pending: ${error.message || "offline"})`
        );
        return key;
      }
    },
    [bots, eas, licenseKeys, showToast]
  );

  const activateLicense = useCallback(
    async (rawKey) => {
      const accountEmail = normalizeEmail(coverEmail);
      const signup = getSignup(accountEmail);
      if (!signup || signup.status !== "approved") {
        setLockStep("pending");
        showToast(
          signup?.status === "declined"
            ? "Access was declined by super admin"
            : "Account must be approved by super admin first"
        );
        return false;
      }

      const key = normalizeLicenseKey(rawKey);
      if (!key) {
        showToast("Enter a license key");
        return false;
      }

      const variants = licenseKeyVariants(rawKey);
      let entry =
        licenseKeys.find((item) => variants.includes(normalizeLicenseKey(item.key))) ||
        null;

      if (!entry) {
        try {
          entry = await fetchLicense(rawKey);
          if (entry) setLicenseKeys((prev) => mergeLicenses(prev, [entry]));
        } catch {
          entry = null;
        }
      }
      if (!entry && accountEmail) {
        try {
          const byEmail = await fetchLicensesByEmail(accountEmail);
          setLicenseKeys((prev) => mergeLicenses(prev, byEmail));
          entry =
            byEmail.find((item) => variants.includes(normalizeLicenseKey(item.key))) ||
            null;
        } catch {
          // continue
        }
      }
      if (!entry) {
        try {
          const remote = await fetchLicenses();
          setLicenseKeys((prev) => mergeLicenses(prev, remote));
          entry =
            remote.find((item) => variants.includes(normalizeLicenseKey(item.key))) ||
            null;
        } catch {
          // keep local miss
        }
      }

      if (!entry) {
        showToast("Invalid license key — ask your mentor to generate a new one");
        return false;
      }

      if (isLicenseExpired(entry)) {
        showToast("License key has expired — ask your mentor for a new one");
        return false;
      }

      const deviceId = getOrCreateDeviceId();
      const boundDevice = String(entry.deviceId || "").trim();
      const licenseEmail = normalizeEmail(entry.clientEmail);
      const emailOwnsLicense = Boolean(
        accountEmail && licenseEmail && accountEmail === licenseEmail
      );
      if (entry.used && boundDevice && boundDevice !== deviceId && !emailOwnsLicense) {
        showToast("This license is locked to another phone");
        return false;
      }

      // Bind to this phone (or reclaim by matching email after reinstall / new device).
      let remote = null;
      try {
        remote = await markLicenseUsedRemote(entry.key || key, {
          deviceId,
          email: accountEmail,
        });
      } catch (error) {
        showToast(error.message || "Could not lock license to this phone");
        return false;
      }
      if (remote) {
        entry = remote;
        setLicenseKeys((prev) => mergeLicenses(prev, [remote]));
      }

      const snapshot = entry.bot || {
        id: entry.botId,
        name: entry.botName || "Bot",
        photo: "/logo.png",
        strategy: "scalper",
        symbols: [],
      };

      setEas((prev) => {
        if (prev.some((ea) => ea.id === snapshot.id)) {
          return prev.map((ea) =>
            ea.id === snapshot.id
              ? {
                  ...ea,
                  name: snapshot.name || ea.name,
                  // Don't let a logo placeholder from an old key wipe an existing picture.
                  photo: pickProfilePhoto(snapshot.photo, ea.photo),
                  strategy: snapshot.strategy || ea.strategy,
                  ownerEmail: ea.ownerEmail || entry.mentorEmail || "",
                  ownerId: ea.ownerId || entry.mentorId || "",
                  symbols:
                    Array.isArray(snapshot.symbols) && snapshot.symbols.length
                      ? snapshot.symbols
                      : ea.symbols,
                }
              : ea
          );
        }
        return [
          {
            id: snapshot.id,
            name: snapshot.name || entry.botName || "Bot",
            photo: pickProfilePhoto(snapshot.photo),
            strategy: snapshot.strategy || "scalper",
            ownerEmail: entry.mentorEmail || "",
            ownerId: entry.mentorId || "",
            symbols: Array.isArray(snapshot.symbols) ? snapshot.symbols : [],
          },
          ...prev,
        ];
      });

      setBots((prev) => {
        const exists = prev.some((b) => b.id === snapshot.id);
        if (exists) {
          return prev.map((b) =>
            b.id === snapshot.id
              ? {
                  ...b,
                  name: snapshot.name || b.name,
                  photo: pickProfilePhoto(snapshot.photo, b.photo),
                  active: true,
                  selected: true,
                }
              : { ...b, selected: false }
          );
        }
        return [
          ...prev.map((b) => ({ ...b, selected: false })),
          {
            id: snapshot.id,
            name: snapshot.name || entry.botName || "Bot",
            photo: pickProfilePhoto(snapshot.photo),
            active: true,
            selected: true,
          },
        ];
      });

      const usedAt = Number(entry.usedAt) || Date.now();
      const priorUsed = licenseKeys.some(
        (item) =>
          normalizeEmail(item.clientEmail) === accountEmail &&
          item.used &&
          !variants.includes(normalizeLicenseKey(item.key))
      );
      const accessPaid = Boolean(signup?.accessPaid);
      const alreadyUnlocked = Boolean(signup?.appAccessUnlockedAt);
      const commissionEligible = Boolean(
        accessPaid && !alreadyUnlocked && !priorUsed
      );
      const commissionReason = commissionEligible
        ? "first_paid_access"
        : !accessPaid
          ? "not_paid"
          : "access_already_active";

      setLicenseKeys((prev) =>
        mergeLicenses(prev, [
          {
            ...entry,
            used: true,
            usedAt,
            deviceId: entry.deviceId || deviceId,
            boundAt: entry.boundAt || usedAt,
            updatedAt: usedAt,
            commissionEligible:
              entry.commissionEligible != null
                ? Boolean(entry.commissionEligible)
                : commissionEligible,
            commissionReason: entry.commissionReason || commissionReason,
            clientEmail: entry.clientEmail || accountEmail,
          },
        ])
      );

      setSignups((prev) =>
        mergeSignups(prev, [
          {
            ...(signup || { email: accountEmail, status: "approved" }),
            email: accountEmail,
            status: "approved",
            appAccessUnlockedAt: signup?.appAccessUnlockedAt || usedAt,
          },
        ])
      );

      rememberDeviceAccess(accountEmail, {
        paid: Boolean(signup?.accessPaid) || hasDeviceAccess(accountEmail),
        bypassed: false,
      });

      const wasReclaimed =
        entry.used &&
        boundDevice &&
        boundDevice !== deviceId &&
        emailOwnsLicense;

      showToast(
        wasReclaimed
          ? `${snapshot.name || entry.botName || "Bot"} restored for ${accountEmail}`
          : `${snapshot.name || entry.botName || "Bot"} activated for ${accountEmail}`
      );
      return true;
    },
    [coverEmail, getSignup, licenseKeys, showToast]
  );

  /** Re-bind every non-expired license owned by this email onto this phone. */
  const restoreLicensesByEmail = useCallback(
    async (rawEmail = coverEmail) => {
      const accountEmail = normalizeEmail(rawEmail || coverEmail);
      if (!accountEmail || !accountEmail.includes("@")) {
        showToast("Enter the email linked to your license");
        return false;
      }

      let remote = [];
      try {
        remote = await fetchLicensesByEmail(accountEmail);
        if (remote.length) setLicenseKeys((prev) => mergeLicenses(prev, remote));
      } catch {
        remote = [];
      }

      const mine = (remote.length ? remote : licenseKeys).filter(
        (row) =>
          normalizeEmail(row.clientEmail) === accountEmail &&
          !isLicenseExpired(row) &&
          String(row.key || "").trim()
      );

      const signup = getSignup(accountEmail);
      const entitled =
        isSignupEntitled(signup, accountEmail) || mine.length > 0;
      if (!entitled) {
        showToast("Pay or get approved before restoring access");
        return false;
      }

      if (mine.length && !isSignupEntitled(signup, accountEmail)) {
        try {
          const remoteSignup = await updateSignupAccessPaid(accountEmail);
          if (remoteSignup) setSignups((prev) => mergeSignups(prev, [remoteSignup]));
        } catch {
          setSignups((prev) =>
            mergeSignups(prev, [
              {
                email: accountEmail,
                status: "approved",
                accessPaid: true,
                accessPaidAt: Date.now(),
                createdAt: Date.now(),
              },
            ])
          );
        }
      }

      rememberDeviceAccess(accountEmail, {
        paid: true,
        bypassed: true,
      });

      if (!mine.length) {
        return false;
      }

      let restored = 0;
      for (const row of mine) {
        const ok = await activateLicense(row.key);
        if (ok) restored += 1;
      }
      if (restored === 0) {
        return false;
      }
      return true;
    },
    [activateLicense, coverEmail, getSignup, licenseKeys, showToast]
  );

  const deactivateLicense = useCallback(
    async (rawKey) => {
      const key = normalizeLicenseKey(rawKey);
      if (!key) {
        showToast("Missing license key");
        return null;
      }
      const variants = licenseKeyVariants(key);
      const local = licenseKeys.find((item) =>
        variants.includes(normalizeLicenseKey(item.key))
      );
      const cleared = {
        ...(local || { key }),
        key: local?.key || key,
        used: false,
        usedAt: null,
        deviceId: null,
        boundAt: null,
        updatedAt: Date.now(),
      };
      setLicenseKeys((prev) => mergeLicenses(prev, [cleared]));
      try {
        const remote = await deactivateLicenseRemote(key);
        if (remote) setLicenseKeys((prev) => mergeLicenses(prev, [remote]));
        showToast("License deactivated — available again");
        return remote || cleared;
      } catch (error) {
        showToast(error.message || "Could not deactivate license");
        return null;
      }
    },
    [licenseKeys, showToast]
  );

  const deleteLicense = useCallback(
    async (rawKey) => {
      const key = normalizeLicenseKey(rawKey);
      if (!key) {
        showToast("Missing license key");
        return false;
      }
      const variants = licenseKeyVariants(key);
      setLicenseKeys((prev) =>
        prev.filter((item) => !variants.includes(normalizeLicenseKey(item.key)))
      );
      try {
        await deleteLicenseRemote(key);
        showToast("License deleted");
        return true;
      } catch (error) {
        showToast(error.message || "Could not delete license");
        await refreshLicenses?.();
        return false;
      }
    },
    [refreshLicenses, showToast]
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

  const publishOrbTrade = useCallback((details = {}) => {
    setOrbTradeLive({
      botName: String(details.botName || "").trim(),
      comment: String(details.comment || "").trim(),
      symbol: String(details.symbol || "").trim().toUpperCase(),
      lotSize: Number(details.lotSize) > 0 ? Number(details.lotSize) : 0.01,
      action: String(details.action || details.side || "BOTH").toUpperCase(),
      side: String(details.side || "").toUpperCase(),
      at: Date.now(),
    });
  }, []);

  const clearOrbTrade = useCallback(() => {
    setOrbTradeLive(null);
  }, []);

  const value = {
    activeInterface,
    toggleInterface,
    coverEmail,
    setCoverEmail,
    mentorDisplayName,
    mainTextDisplay,
    signups,
    requestSignup,
    setSignupStatus,
    bypassAppAccess,
    bypassPremiumScanner,
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
    v2ScannerPremium,
    unlockV2ScannerPremium,
    selectBot,
    removeActiveBot,
    licenseKeys,
    generateLicense,
    activateLicense,
    restoreLicensesByEmail,
    deactivateLicense,
    deleteLicense,
    refreshLicenses,
    catalog,
    ensureCatalog,
    appSymbols,
    getSymbolMeta,
    saveSymbolMeta,
    removeSymbolEverywhere,
    normalizeSymbol,
    normalizeEmail,
    appColor,
    setAppColor,
    toast,
    showToast,
    adminOpen,
    setAdminOpen,
    openAdmin,
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
    orbTradeLive,
    publishOrbTrade,
    clearOrbTrade,
    STRATEGY_LABELS,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
