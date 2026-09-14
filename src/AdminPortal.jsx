import { useEffect, useMemo, useState } from "react";
import AdminAuth from "./AdminAuth.jsx";
import {
  COMMISSION_USD,
  COMMISSION_ZAR,
  fetchMentors,
  SUPER_ADMIN_EMAIL,
  updateMentorBanking,
  updateMentorProfile,
  updateMentorStatus,
  WITHDRAW_MIN_KEYS,
} from "./mentorsApi.js";
import {
  formatLicenseDuration,
  formatLicenseExpiry,
  isLicenseExpired,
  LICENSE_DURATIONS,
  resolveLicenseExpiry,
} from "./licensesApi.js";
import {
  executeMentorSelfHostTrade,
  listMentorHostedAccounts,
} from "./mt5AccountsApi.js";
import { STRATEGY_LABELS, useApp } from "./store.jsx";
import { APP_COLOR_PRESETS, DEFAULT_APP_COLOR } from "./theme.js";

const ADMIN_SESSION_KEY = "apexea-admin-session";
const SELF_HOST_RECENT_KEY = "apexea-self-host-recent-v1";

function loadSelfHostRecent(mentorEmail) {
  try {
    const key = normalizeAdminEmail(mentorEmail);
    if (!key) return [];
    const raw = JSON.parse(localStorage.getItem(SELF_HOST_RECENT_KEY) || "{}");
    const list = Array.isArray(raw?.[key]) ? raw[key] : [];
    return list.slice(0, 12);
  } catch {
    return [];
  }
}

function saveSelfHostRecent(mentorEmail, entry) {
  try {
    const key = normalizeAdminEmail(mentorEmail);
    if (!key || !entry) return [];
    const raw = JSON.parse(localStorage.getItem(SELF_HOST_RECENT_KEY) || "{}");
    const prev = Array.isArray(raw?.[key]) ? raw[key] : [];
    const next = [entry, ...prev].slice(0, 12);
    localStorage.setItem(SELF_HOST_RECENT_KEY, JSON.stringify({ ...raw, [key]: next }));
    return next;
  } catch {
    return [];
  }
}

function isUploadedProfilePhoto(value) {
  const photo = String(value || "").trim();
  if (!photo) return false;
  if (photo === "/logo.png") return false;
  // Data URLs (just picked), synced API paths, or remote URLs.
  return (
    photo.startsWith("data:image/") ||
    photo.startsWith("/api/licenses/photo") ||
    /^https?:\/\//i.test(photo)
  );
}

function normalizeAdminEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isSuperAdminSession(session) {
  const role = String(session?.role || "").toLowerCase();
  const email = normalizeAdminEmail(session?.email);
  return role === "superadmin" || email === normalizeAdminEmail(SUPER_ADMIN_EMAIL);
}

function readAdminSession() {
  try {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed?.email) return null;
    if (isSuperAdminSession(parsed) && parsed.role !== "superadmin") {
      return { ...parsed, role: "superadmin", status: "approved" };
    }
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
  const email = normalizeAdminEmail(mentor.email);
  const role = isSuperAdminSession(mentor) ? "superadmin" : mentor.role || "mentor";
  sessionStorage.setItem(
    ADMIN_SESSION_KEY,
    JSON.stringify({
      id: mentor.id,
      email,
      username: mentor.username,
      role,
      status: role === "superadmin" ? "approved" : mentor.status,
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
    bypassAppAccess,
    bypassPremiumScanner,
    refreshSignups,
    eas,
    upsertEa,
    deleteEa,
    editingEaId,
    setEditingEaId,
    bots,
    licenseKeys,
    generateLicense,
    deactivateLicense,
    deleteLicense,
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
  const [licenseDuration, setLicenseDuration] = useState("1m");
  const [licenseSearch, setLicenseSearch] = useState("");
  const [commissionSearch, setCommissionSearch] = useState("");
  const [latestKey, setLatestKey] = useState("");
  const [latestLicenseMeta, setLatestLicenseMeta] = useState(null);
  const [licenseSheetOpen, setLicenseSheetOpen] = useState(false);
  const [bypassOpen, setBypassOpen] = useState(false);
  const [bypassEmail, setBypassEmail] = useState("");
  const [bypassBusy, setBypassBusy] = useState(false);
  const [bankingForm, setBankingForm] = useState({
    accountName: "",
    bankName: "",
    accountNumber: "",
    branchCode: "",
    accountType: "",
  });
  const [bankingBusy, setBankingBusy] = useState(false);
  const [hostSymbol, setHostSymbol] = useState("XAUUSD");
  const [hostSide, setHostSide] = useState("BUY");
  const [hostVolume, setHostVolume] = useState("0.01");
  const [hostSl, setHostSl] = useState("");
  const [hostTp, setHostTp] = useState("");
  const [hostAccounts, setHostAccounts] = useState([]);
  const [hostLoading, setHostLoading] = useState(false);
  const [hostBusy, setHostBusy] = useState(false);
  const [hostConfirmOpen, setHostConfirmOpen] = useState(false);
  const [hostResult, setHostResult] = useState(null);
  const [hostDetailsOpen, setHostDetailsOpen] = useState(false);
  const [hostRecent, setHostRecent] = useState([]);
  const [profileUsername, setProfileUsername] = useState("");
  const [profileContact, setProfileContact] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);

  async function copyLicenseKey(key) {
    const value = String(key || "").trim();
    if (!value) {
      showToast("No license key to copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      showToast("License key copied");
    } catch {
      try {
        const area = document.createElement("textarea");
        area.value = value;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.left = "-9999px";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
        showToast("License key copied");
      } catch {
        showToast("Could not copy — select the key manually");
      }
    }
  }

  async function onDeactivateLicense(key) {
    const result = await deactivateLicense?.(key);
    if (result) {
      await refreshLicenses?.();
      if (latestKey === key) setLicenseSheetOpen(true);
    }
  }

  async function onDeleteLicense(key) {
    const label = String(key || "").trim();
    if (!label) return;
    const ok = window.confirm(`Delete license ${label}? This cannot be undone.`);
    if (!ok) return;
    const deleted = await deleteLicense?.(key);
    if (deleted && latestKey === key) {
      setLatestKey("");
      setLatestLicenseMeta(null);
      setLicenseSheetOpen(false);
    }
  }

  function openLicenseDetail(entry) {
    if (!entry?.key) return;
    setLatestKey(entry.key);
    setLatestLicenseMeta({
      name: entry.clientName || entry.mainText || "",
      email: entry.clientEmail || "",
      botName: entry.botName || "",
      status: entry.used ? "Used" : "Available",
      duration: formatLicenseDuration(entry),
      expiry: formatLicenseExpiry(entry),
      createdAt: entry.createdAt || null,
      usedAt: entry.usedAt || null,
      mentorName: entry.mentorName || "",
      mentorEmail: entry.mentorEmail || "",
      expired: isLicenseExpired(entry),
    });
    setLicenseSheetOpen(true);
  }


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

  // Form fields are seeded in startEdit — do not rebind on `eas` poll updates
  // or a newly picked profile picture gets wiped before save.

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
        if (cancelled) return;
        setMentors((prev) => {
          const map = new Map(
            (Array.isArray(list) ? list : []).map((m) => [
              normalizeAdminEmail(m.email),
              m,
            ])
          );
          for (const m of prev) {
            const key = normalizeAdminEmail(m.email);
            const incoming = map.get(key);
            if (!incoming) {
              map.set(key, m);
              continue;
            }
            const keepBanking =
              m?.banking?.accountNumber && !incoming?.banking?.accountNumber
                ? m.banking
                : incoming.banking?.accountNumber
                  ? incoming.banking
                  : m.banking || incoming.banking;
            map.set(key, { ...incoming, banking: keepBanking });
          }
          return Array.from(map.values());
        });
      } catch {
        if (!cancelled) setMentors((prev) => prev);
      }
    }
    loadMentors();
    // Poll faster on Mentors page so new signups show in Pending quickly.
    const ms =
      adminPage === "mentors" || adminPage === "commissions" || adminPage === "commission"
        ? 5000
        : 12000;
    const timer = setInterval(loadMentors, ms);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [adminOpen, adminSession, adminPage]);

  useEffect(() => {
    if (!adminOpen || !adminSession || isSuperAdminSession(adminSession)) return;
    if (adminPage !== "self-hosting") return;
    setHostRecent(loadSelfHostRecent(adminSession.email));
    let cancelled = false;
    async function loadHosted() {
      setHostLoading(true);
      try {
        const accounts = await listMentorHostedAccounts(adminSession.email);
        if (cancelled) return;
        setHostAccounts(accounts);
      } catch (error) {
        if (!cancelled) {
          setHostAccounts([]);
          showToast(error.message || "Could not load connected robot clients");
        }
      } finally {
        if (!cancelled) setHostLoading(false);
      }
    }
    loadHosted();
    const timer = setInterval(loadHosted, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [adminOpen, adminSession, adminPage, showToast]);

  useEffect(() => {
    if (!adminSession?.email) return;
    const mine = mentors.find(
      (m) => normalizeAdminEmail(m.email) === normalizeAdminEmail(adminSession.email)
    );
    const banking = mine?.banking;
    // Never clobber in-progress / saved form fields with empty remote banking.
    // Polls used to wipe the banking form right after typing or saving.
    if (!banking?.accountNumber && !banking?.accountName) return;
    setBankingForm((prev) => {
      const incomingEmpty =
        !String(banking.accountName || "").trim() &&
        !String(banking.accountNumber || "").trim();
      if (incomingEmpty) return prev;
      const same =
        prev.accountName === (banking.accountName || "") &&
        prev.bankName === (banking.bankName || "") &&
        prev.accountNumber === (banking.accountNumber || "") &&
        prev.branchCode === (banking.branchCode || "") &&
        prev.accountType === (banking.accountType || "");
      if (same) return prev;
      // If the user already typed more complete details, keep them.
      if (
        prev.accountNumber &&
        !banking.accountNumber
      ) {
        return prev;
      }
      return {
        accountName: banking.accountName || prev.accountName || "",
        bankName: banking.bankName || prev.bankName || "",
        accountNumber: banking.accountNumber || prev.accountNumber || "",
        branchCode: banking.branchCode || prev.branchCode || "",
        accountType: banking.accountType || prev.accountType || "",
      };
    });
  }, [mentors, adminSession?.email]);

  useEffect(() => {
    if (!adminSession?.email) return;
    const mine = mentors.find(
      (m) => normalizeAdminEmail(m.email) === normalizeAdminEmail(adminSession.email)
    );
    setProfileUsername(String(mine?.username || adminSession.username || "").trim());
    setProfileContact(String(mine?.contact || "").trim());
  }, [mentors, adminSession?.email, adminSession?.username]);

  async function refreshMentorsList() {
    try {
      const list = await fetchMentors();
      setMentors((prev) => {
        // Preserve any richer banking details already in memory.
        const map = new Map(
          (Array.isArray(list) ? list : []).map((m) => [normalizeAdminEmail(m.email), m])
        );
        for (const m of prev) {
          const key = normalizeAdminEmail(m.email);
          const incoming = map.get(key);
          if (!incoming) {
            map.set(key, m);
            continue;
          }
          const keepBanking =
            m?.banking?.accountNumber && !incoming?.banking?.accountNumber
              ? m.banking
              : incoming.banking || m.banking;
          map.set(key, { ...incoming, banking: keepBanking });
        }
        return Array.from(map.values());
      });
      showToast("Mentors refreshed");
    } catch (error) {
      showToast(error.message || "Could not refresh mentors");
    }
  }

  async function saveMentorBanking() {
    if (!adminSession?.email) return;
    setBankingBusy(true);
    const snapshot = { ...bankingForm };
    try {
      const updated = await updateMentorBanking(adminSession.email, snapshot);
      const banking = {
        accountName: updated?.banking?.accountName || snapshot.accountName || "",
        bankName: updated?.banking?.bankName || snapshot.bankName || "",
        accountNumber: updated?.banking?.accountNumber || snapshot.accountNumber || "",
        branchCode: updated?.banking?.branchCode || snapshot.branchCode || "",
        accountType: updated?.banking?.accountType || snapshot.accountType || "",
      };
      setBankingForm(banking);
      setMentors((prev) => {
        const email = normalizeAdminEmail(adminSession.email);
        const next = prev.map((m) =>
          normalizeAdminEmail(m.email) === email
            ? { ...m, ...(updated || {}), banking }
            : m
        );
        if (!next.some((m) => normalizeAdminEmail(m.email) === email)) {
          next.unshift({
            ...(updated || {
              email: adminSession.email,
              username: adminSession.username,
              role: "mentor",
              status: "approved",
            }),
            banking,
          });
        }
        return next;
      });
      showToast("Banking details saved");
    } catch (error) {
      // Keep what the mentor typed even if sync fails.
      setBankingForm(snapshot);
      showToast(error.message || "Could not save banking details");
    } finally {
      setBankingBusy(false);
    }
  }

  useEffect(() => {
    if (!adminSession) return;
    // Upgrade stale sessions that belong to the reserved super-admin email.
    if (isSuperAdminSession(adminSession) && adminSession.role !== "superadmin") {
      const upgraded = { ...adminSession, role: "superadmin", status: "approved" };
      writeAdminSession(upgraded);
      setAdminSession(upgraded);
      return;
    }
    const isSuper = isSuperAdminSession(adminSession);
    const mentorPages = new Set([
      "dashboard",
      "manage-ea",
      "licenses",
      "profile",
      "settings",
      "commission",
      "self-hosting",
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

  function startEdit(ea) {
    setEditingEaId(ea.id);
    setName(ea.name || "");
    setStrategy(ea.strategy || "scalper");
    setPhoto(ea.photo || "/logo.png");
    setPhotoUploaded(isUploadedProfilePhoto(ea.photo));
    setDraftSymbols(Array.isArray(ea.symbols) ? [...ea.symbols] : []);
    setCustomSymbol("");
    setAdminPage("manage-ea");
    showToast(`Editing ${ea.name}`);
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
        // Cap size so GitHub/localStorage can keep the photo durable.
        // Oversized full-bleed uploads were returning API paths that 404'd later.
        const maxEdge = 1600;
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height, 1));
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
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);
        // JPEG stays under the GitHub Contents limit more reliably than PNG.
        let nextPhoto = canvas.toDataURL("image/jpeg", 0.88);
        if (nextPhoto.length > 1_100_000) {
          nextPhoto = canvas.toDataURL("image/jpeg", 0.78);
        }
        setPhoto(nextPhoto);
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

  async function submitEa(event) {
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
    const ok = await upsertEa({
      id: editingEaId || undefined,
      name: name.trim(),
      strategy,
      photo,
      symbols,
      ownerEmail: adminSession?.email || "",
      ownerId: adminSession?.id || "",
    });
    if (!ok) return;
    resetForm();
    setAdminPage("manage-ea");
  }

  const isSuperAdmin = isSuperAdminSession(adminSession);
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

  const licenseQuery = String(licenseSearch || "")
    .trim()
    .toLowerCase();
  const filteredLicenses = !licenseQuery
    ? myLicenses
    : myLicenses.filter((row) => {
        const name = String(row.clientName || row.mainText || "").toLowerCase();
        const email = String(row.clientEmail || "").toLowerCase();
        const key = String(row.key || "").toLowerCase();
        const bot = String(row.botName || "").toLowerCase();
        return (
          name.includes(licenseQuery) ||
          email.includes(licenseQuery) ||
          key.includes(licenseQuery) ||
          bot.includes(licenseQuery)
        );
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

  function countSoldKeysForMentor(mentor) {
    const email = normalizeAdminEmail(mentor?.email);
    const id = String(mentor?.id || "");
    return licenseKeys.filter((row) => {
      const owner = normalizeAdminEmail(row.mentorEmail);
      const ownerId = String(row.mentorId || "");
      const owns =
        (email && owner === email) || (id && ownerId === id);
      // Commission only when the key unlocked a paid app subscription for the
      // first time — not merely from generating a key or reusing existing access.
      return owns && Boolean(row.used) && Boolean(row.commissionEligible);
    }).length;
  }

  const soldKeysCount = countSoldKeysForMentor(adminSession);
  const commissionUsd = Number((soldKeysCount * COMMISSION_USD).toFixed(2));
  const commissionZar = soldKeysCount * COMMISSION_ZAR;
  const canWithdraw = soldKeysCount >= WITHDRAW_MIN_KEYS;
  const keysUntilWithdraw = Math.max(0, WITHDRAW_MIN_KEYS - soldKeysCount);

  const commissionRows = mentors
    .filter((m) => {
      const role = String(m.role || "").toLowerCase();
      const status = String(m.status || "").toLowerCase();
      return role !== "superadmin" && status === "approved";
    })
    .map((mentor) => {
      const sold = countSoldKeysForMentor(mentor);
      return {
        mentor,
        sold,
        usd: Number((sold * COMMISSION_USD).toFixed(2)),
        zar: sold * COMMISSION_ZAR,
        withdrawable: sold >= WITHDRAW_MIN_KEYS,
        banking: mentor.banking || {},
      };
    })
    .sort(
      (a, b) =>
        b.sold - a.sold ||
        String(a.mentor.username || "").localeCompare(String(b.mentor.username || ""))
    );

  const commissionQuery = String(commissionSearch || "")
    .trim()
    .toLowerCase();
  const filteredCommissionRows = !commissionQuery
    ? commissionRows
    : commissionRows.filter(({ mentor, banking }) => {
        const username = String(mentor.username || "").toLowerCase();
        const email = String(mentor.email || "").toLowerCase();
        const contact = String(mentor.contact || "").toLowerCase();
        const accountName = String(banking?.accountName || "").toLowerCase();
        const bankName = String(banking?.bankName || "").toLowerCase();
        const accountNumber = String(banking?.accountNumber || "").toLowerCase();
        return (
          username.includes(commissionQuery) ||
          email.includes(commissionQuery) ||
          contact.includes(commissionQuery) ||
          accountName.includes(commissionQuery) ||
          bankName.includes(commissionQuery) ||
          accountNumber.includes(commissionQuery)
        );
      });

  const nav = isSuperAdmin
    ? [
        ["dashboard", "Dashboard"],
        ["mentors", "Mentors"],
        ["commissions", "Commissions"],
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
        ["commission", "Mentor Commission"],
        ["self-hosting", "Self Hosting"],
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
                      <span className="ea-avatar">
                        <img
                          src={ea.photo || "/logo.png"}
                          alt=""
                          onError={(event) => {
                            if (event.currentTarget.src.endsWith("/logo.png")) return;
                            event.currentTarget.src = "/logo.png";
                          }}
                        />
                      </span>
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
              Client name is shown with the license. Your mentor username (from Profile) appears
              at the top of the client app. Enter the client name with their email and bot — the
              key syncs so they can activate on any phone after approval.
            </p>
            <div className="admin-card">
              <form
                className="license-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const key = await generateLicense(licenseBotId, {
                    clientName: licenseClientName,
                    mainText: licenseClientName,
                    clientEmail: licenseClientEmail,
                    duration: licenseDuration,
                    mentorEmail: adminSession.email,
                    mentorId: adminSession.id,
                    mentorName: adminSession.username || "",
                  });
                  if (key) {
                    const timing = resolveLicenseExpiry(licenseDuration);
                    openLicenseDetail({
                      key,
                      clientName: licenseClientName.trim(),
                      clientEmail: String(licenseClientEmail || "")
                        .trim()
                        .toLowerCase(),
                      botName:
                        myEas.find((b) => b.id === licenseBotId)?.name || "",
                      used: false,
                      duration: timing.duration,
                      expiresAt: timing.expiresAt,
                      createdAt: Date.now(),
                      mentorName: adminSession.username || "",
                      mentorEmail: adminSession.email || "",
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
                    placeholder="e.g. Sam smith"
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
                <label className="ea-field">
                  <span>License duration *</span>
                  <select
                    className="admin-input"
                    value={licenseDuration}
                    onChange={(e) => setLicenseDuration(e.target.value)}
                    required
                  >
                    {LICENSE_DURATIONS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
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
                  <div className="license-row-actions" style={{ marginTop: 10 }}>
                    <button
                      className="admin-btn admin-btn-solid admin-btn-sm"
                      type="button"
                      onClick={() => setLicenseSheetOpen(true)}
                    >
                      Open copy panel
                    </button>
                    <button
                      className="admin-btn admin-btn-outline admin-btn-sm"
                      type="button"
                      onClick={() => copyLicenseKey(latestKey)}
                    >
                      Copy key
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="admin-card" style={{ marginTop: 14 }}>
              <div className="admin-card-title-row">
                <h3>Generated keys</h3>
                <span className="admin-badge">{filteredLicenses.length}</span>
              </div>
              <div className="admin-search-row" style={{ marginBottom: 12 }}>
                <input
                  className="admin-input"
                  type="search"
                  value={licenseSearch}
                  onChange={(e) => setLicenseSearch(e.target.value)}
                  placeholder="Search by name, email, or key"
                  aria-label="Search license keys"
                />
              </div>
              {myLicenses.length === 0 ? (
                <p className="admin-empty">No license keys yet</p>
              ) : filteredLicenses.length === 0 ? (
                <p className="admin-empty">No keys match “{licenseSearch.trim()}”</p>
              ) : (
                [...filteredLicenses].reverse().map((entry) => (
                  <div
                    className={`license-row${entry.used ? " is-used" : ""}${
                      isLicenseExpired(entry) ? " is-expired" : ""
                    }`}
                    key={`${entry.key}-${entry.createdAt}`}
                  >
                    <button
                      className="license-row-key"
                      type="button"
                      onClick={() => openLicenseDetail(entry)}
                    >
                      {entry.key}
                    </button>
                    <span>
                      {entry.clientName ? `${entry.clientName} · ` : ""}
                      {entry.clientEmail || "no email"} · {entry.botName} ·{" "}
                      {entry.used ? "Used" : "Available"} · {formatLicenseDuration(entry)} ·{" "}
                      {formatLicenseExpiry(entry)}
                    </span>
                    <div className="license-row-actions">
                      <button
                        className="admin-btn admin-btn-outline admin-btn-sm"
                        type="button"
                        onClick={() => openLicenseDetail(entry)}
                      >
                        View
                      </button>
                      <button
                        className="admin-btn admin-btn-outline admin-btn-sm"
                        type="button"
                        onClick={() => copyLicenseKey(entry.key)}
                      >
                        Copy
                      </button>
                      <button
                        className="admin-btn admin-btn-ghost admin-btn-sm"
                        type="button"
                        onClick={() => void onDeactivateLicense(entry.key)}
                      >
                        {entry.used ? "Deactivate" : "Reset"}
                      </button>
                      <button
                        className="admin-btn admin-btn-outline admin-btn-sm"
                        type="button"
                        onClick={() => void onDeleteLicense(entry.key)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        
        {adminPage === "profile" && (
          <section className="admin-page is-active">
            <h2 className="admin-h1">Profile</h2>
            <p className="admin-sub">
              Edit your mentor details. Your username appears at the top of your clients&apos;
              app.
            </p>
            <div className="admin-card">
              <div className="admin-card-title-row">
                <h3>Account</h3>
                <span className="admin-badge is-approved">{adminSession.status || "approved"}</span>
              </div>
              {!isSuperAdmin ? (
                <form
                  className="license-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (profileBusy) return;
                    const username = String(profileUsername || "").trim();
                    const contact = String(profileContact || "").trim();
                    if (!username) {
                      showToast("Enter a username");
                      return;
                    }
                    setProfileBusy(true);
                    try {
                      const updated = await updateMentorProfile(adminSession.email, {
                        username,
                        contact,
                      });
                      const nextSession = {
                        ...adminSession,
                        username: updated?.username || username,
                      };
                      writeAdminSession(nextSession);
                      setAdminSession(nextSession);
                      setMentors((prev) => {
                        const key = normalizeAdminEmail(adminSession.email);
                        const mapped = prev.map((m) =>
                          normalizeAdminEmail(m.email) === key
                            ? {
                                ...m,
                                username: updated?.username || username,
                                contact: updated?.contact ?? contact,
                              }
                            : m
                        );
                        if (!mapped.some((m) => normalizeAdminEmail(m.email) === key)) {
                          mapped.unshift(updated || { ...adminSession, username, contact });
                        }
                        return mapped;
                      });
                      await refreshLicenses?.();
                      showToast("Profile saved — clients will see your username");
                    } catch (error) {
                      showToast(error.message || "Could not save profile");
                    } finally {
                      setProfileBusy(false);
                    }
                  }}
                >
                  <label className="ea-field">
                    <span>Username</span>
                    <input
                      className="admin-input"
                      value={profileUsername}
                      onChange={(e) => setProfileUsername(e.target.value)}
                      placeholder="Shown on client app header"
                      required
                    />
                  </label>
                  <label className="ea-field">
                    <span>Contact number</span>
                    <input
                      className="admin-input"
                      type="tel"
                      value={profileContact}
                      onChange={(e) => setProfileContact(e.target.value)}
                      placeholder="Phone / WhatsApp"
                    />
                  </label>
                  <label className="ea-field">
                    <span>Email</span>
                    <input className="admin-input" value={adminSession.email || ""} disabled />
                  </label>
                  <p className="admin-card-meta">
                    Role: Mentor · EAs: {myEas.length} · License keys: {myLicenses.length}
                  </p>
                  <button
                    className="admin-btn admin-btn-solid admin-btn-block"
                    type="submit"
                    disabled={profileBusy}
                  >
                    {profileBusy ? "Saving…" : "Save profile"}
                  </button>
                </form>
              ) : (
                <>
                  <p className="admin-card-meta">
                    <strong>Username:</strong> {adminSession.username || "—"}
                  </p>
                  <p className="admin-card-meta">
                    <strong>Email:</strong> {adminSession.email}
                  </p>
                  <p className="admin-card-meta">
                    <strong>Role:</strong> Super admin
                  </p>
                </>
              )}
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

        {!isSuperAdmin && adminPage === "commission" && (
          <section className="admin-page is-active">
            <h2 className="admin-h1">Mentor Commission</h2>
            <p className="admin-sub">
              Earn ${COMMISSION_USD.toFixed(2)} (R{COMMISSION_ZAR}) when your license key unlocks a
              paid app subscription for the first time. Withdrawals open after {WITHDRAW_MIN_KEYS}{" "}
              qualifying unlocks.
            </p>

            <div className="admin-stat-stack">
              <article className="admin-stat-card">
                <p className="admin-stat-label">Paid unlocks</p>
                <p className="admin-stat-value">{soldKeysCount}</p>
              </article>
              <article className="admin-stat-card">
                <p className="admin-stat-label">Commission earned</p>
                <p className="admin-stat-value">${commissionUsd.toFixed(2)}</p>
                <p className="admin-card-meta">R{commissionZar}</p>
              </article>
              <article className="admin-stat-card">
                <p className="admin-stat-label">Withdrawal status</p>
                <p className="admin-stat-value">{canWithdraw ? "Ready" : "Locked"}</p>
                <p className="admin-card-meta">
                  {canWithdraw
                    ? "You can withdraw your commission"
                    : `${keysUntilWithdraw} more unlock${keysUntilWithdraw === 1 ? "" : "s"} to unlock`}
                </p>
              </article>
            </div>

            <div className="admin-card" style={{ marginTop: 14 }}>
              <div className="admin-card-title-row">
                <h3>How it works</h3>
                <span className={`admin-badge${canWithdraw ? " is-approved" : " is-pending"}`}>
                  {canWithdraw ? "Withdrawable" : "Building"}
                </span>
              </div>
              <p className="admin-card-meta">
                As a mentor you get <strong>${COMMISSION_USD.toFixed(2)}</strong> which is{" "}
                <strong>R{COMMISSION_ZAR}</strong> for every license key that unlocks a{" "}
                <strong>paid</strong> app subscription.
              </p>
              <p className="admin-card-meta">
                Generating a key alone does not pay commission. The client must pay for app access,
                then activate your key on mobile for a robot that is getting access for the{" "}
                <strong>first time</strong>. Keys used on accounts that already had access do not
                count.
              </p>
              <p className="admin-card-meta">
                Commission becomes withdrawable after <strong>{WITHDRAW_MIN_KEYS}</strong> qualifying
                unlocks.
              </p>
            </div>

            <div className="admin-card" style={{ marginTop: 14 }}>
              <div className="admin-card-title-row">
                <h3>Banking details</h3>
                <span className="admin-badge">Payout</span>
              </div>
              <p className="ea-hint">
                Add your banking details so commissions can be paid to you.
              </p>
              <label className="ea-field">
                <span>Account name</span>
                <input
                  className="admin-input"
                  type="text"
                  value={bankingForm.accountName}
                  onChange={(e) =>
                    setBankingForm((prev) => ({ ...prev, accountName: e.target.value }))
                  }
                  placeholder="Full name on the account"
                />
              </label>
              <label className="ea-field">
                <span>Bank name</span>
                <input
                  className="admin-input"
                  type="text"
                  value={bankingForm.bankName}
                  onChange={(e) =>
                    setBankingForm((prev) => ({ ...prev, bankName: e.target.value }))
                  }
                  placeholder="e.g. FNB, Capitec, Standard Bank"
                />
              </label>
              <label className="ea-field">
                <span>Account number</span>
                <input
                  className="admin-input"
                  type="text"
                  inputMode="numeric"
                  value={bankingForm.accountNumber}
                  onChange={(e) =>
                    setBankingForm((prev) => ({ ...prev, accountNumber: e.target.value }))
                  }
                  placeholder="Account number"
                />
              </label>
              <label className="ea-field">
                <span>Branch code</span>
                <input
                  className="admin-input"
                  type="text"
                  value={bankingForm.branchCode}
                  onChange={(e) =>
                    setBankingForm((prev) => ({ ...prev, branchCode: e.target.value }))
                  }
                  placeholder="Optional"
                />
              </label>
              <label className="ea-field">
                <span>Account type</span>
                <input
                  className="admin-input"
                  type="text"
                  value={bankingForm.accountType}
                  onChange={(e) =>
                    setBankingForm((prev) => ({ ...prev, accountType: e.target.value }))
                  }
                  placeholder="Cheque / Savings"
                />
              </label>
              <button
                className="admin-btn admin-btn-solid admin-btn-block"
                type="button"
                disabled={bankingBusy}
                onClick={saveMentorBanking}
                style={{ marginTop: 12 }}
              >
                {bankingBusy ? "Saving…" : "Save banking details"}
              </button>
            </div>
          </section>
        )}

        {!isSuperAdmin && adminPage === "self-hosting" && (
          <section className="admin-page is-active">
            <div className="admin-card self-host-card">
              <h2 className="admin-h1 self-host-title">SELF HOSTING</h2>
              <p className="admin-sub">
                Place a trade and automatically send it to your connected robot clients.
              </p>

              <form
                className="license-form self-host-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (hostBusy) return;
                  const symbol = String(hostSymbol || "").trim().toUpperCase();
                  const stopLoss = Number(hostSl);
                  const takeProfit = Number(hostTp);
                  const volume = Number(hostVolume);
                  if (!symbol) {
                    showToast("Enter a symbol");
                    return;
                  }
                  if (!Number.isFinite(volume) || volume <= 0) {
                    showToast("Enter a valid lot size");
                    return;
                  }
                  if (!Number.isFinite(stopLoss) || stopLoss <= 0) {
                    showToast("Enter a valid stop loss price");
                    return;
                  }
                  if (!Number.isFinite(takeProfit) || takeProfit <= 0) {
                    showToast("Enter a valid take profit price");
                    return;
                  }
                  if (!hostAccounts.length) {
                    showToast("No connected robot clients yet");
                    return;
                  }
                  setHostResult(null);
                  setHostDetailsOpen(false);
                  setHostConfirmOpen(true);
                }}
              >
                <label className="ea-field">
                  <span>Symbol</span>
                  <input
                    className="admin-input"
                    value={hostSymbol}
                    onChange={(e) => setHostSymbol(e.target.value.toUpperCase())}
                    placeholder="XAUUSD"
                    required
                  />
                </label>

                <div className="ea-field">
                  <span>Direction</span>
                  <div className="self-host-side-row" role="group" aria-label="Direction">
                    <button
                      type="button"
                      className={`self-host-side-btn${hostSide === "BUY" ? " is-active is-buy" : ""}`}
                      onClick={() => setHostSide("BUY")}
                    >
                      BUY
                    </button>
                    <button
                      type="button"
                      className={`self-host-side-btn${hostSide === "SELL" ? " is-active is-sell" : ""}`}
                      onClick={() => setHostSide("SELL")}
                    >
                      SELL
                    </button>
                  </div>
                </div>

                <label className="ea-field">
                  <span>Lot Size</span>
                  <input
                    className="admin-input"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={hostVolume}
                    onChange={(e) => setHostVolume(e.target.value)}
                    placeholder="0.01"
                    required
                  />
                </label>

                <label className="ea-field">
                  <span>Stop Loss</span>
                  <input
                    className="admin-input"
                    type="number"
                    step="any"
                    value={hostSl}
                    onChange={(e) => setHostSl(e.target.value)}
                    placeholder="SL price"
                    required
                  />
                </label>

                <label className="ea-field">
                  <span>Take Profit</span>
                  <input
                    className="admin-input"
                    type="number"
                    step="any"
                    value={hostTp}
                    onChange={(e) => setHostTp(e.target.value)}
                    placeholder="TP price"
                    required
                  />
                </label>

                <div className="self-host-status">
                  <p className="self-host-status-label">CONNECTED ROBOT CLIENTS</p>
                  <p className="self-host-status-value">
                    <span className={`self-host-dot${hostAccounts.length ? " is-on" : ""}`} />
                    {hostLoading && !hostAccounts.length
                      ? "Checking connections…"
                      : `${hostAccounts.length} client${hostAccounts.length === 1 ? "" : "s"} connected`}
                  </p>
                </div>

                <button
                  className="admin-btn admin-btn-solid admin-btn-block self-host-execute"
                  type="submit"
                  disabled={hostBusy || !hostAccounts.length}
                >
                  EXECUTE TRADE
                </button>
              </form>
            </div>

            {hostResult ? (
              <div className="admin-card self-host-result-card">
                <p className="self-host-result-eyebrow">TRADE EXECUTED</p>
                <p className="self-host-result-headline">
                  {hostResult.side || hostSide} {hostResult.symbol || hostSymbol}
                </p>
                <p className="self-host-result-lot">
                  {Number(hostResult.volume || hostVolume || 0).toFixed(2)} LOT
                </p>
                <div className="self-host-result-stats">
                  <p>
                    <strong>{Number(hostResult.targeted || hostResult.connected || 0)}</strong>{" "}
                    clients targeted
                  </p>
                  <p>
                    <strong>{Number(hostResult.placed || 0)}</strong> trades executed
                  </p>
                  <p>
                    <strong>{Number(hostResult.offline || hostResult.failed || 0)}</strong> client
                    offline
                  </p>
                </div>
                {Array.isArray(hostResult.results) && hostResult.results.length ? (
                  <button
                    type="button"
                    className="admin-btn admin-btn-outline admin-btn-sm"
                    onClick={() => setHostDetailsOpen((v) => !v)}
                  >
                    {hostDetailsOpen ? "Hide details" : "View details"}
                  </button>
                ) : null}
                {hostDetailsOpen ? (
                  <ul className="self-host-detail-list">
                    {hostResult.results.map((row, idx) => (
                      <li key={`${row.accountId || row.email || "row"}-${idx}`}>
                        <strong>{row.email || "client"}</strong>
                        <span>
                          {row.ok
                            ? `Executed · ${row.side || hostResult.side} ${row.symbol || hostResult.symbol}`
                            : row.error || "Offline"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="admin-card self-host-recent-card">
              <h3 className="self-host-recent-title">Recent Trades</h3>
              {hostRecent.length === 0 ? (
                <p className="admin-card-meta">No recent self-hosted trades yet.</p>
              ) : (
                <ul className="self-host-recent-list">
                  {hostRecent.map((row) => (
                    <li key={row.id}>
                      <p className="self-host-recent-main">
                        {row.side} {row.symbol}
                      </p>
                      <p className="self-host-recent-meta">
                        {Number(row.volume || 0).toFixed(2)} LOT
                      </p>
                      <p className="self-host-recent-meta">
                        {row.targeted} clients
                        <br />
                        {row.placed} executed
                        {row.offline ? ` · ${row.offline} offline` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {hostConfirmOpen ? (
              <div className="self-host-modal-backdrop" role="presentation">
                <div
                  className="admin-card self-host-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Confirm trade"
                >
                  <p className="self-host-modal-question">
                    Execute this trade for all connected clients?
                  </p>
                  <p className="self-host-modal-trade">
                    {hostSide} {String(hostSymbol || "").trim().toUpperCase()}
                  </p>
                  <p className="self-host-modal-meta">Lot: {hostVolume}</p>
                  <p className="self-host-modal-meta">SL: {hostSl}</p>
                  <p className="self-host-modal-meta">TP: {hostTp}</p>
                  <p className="self-host-modal-meta">
                    {hostAccounts.length} connected client
                    {hostAccounts.length === 1 ? "" : "s"}
                  </p>
                  <div className="self-host-modal-actions">
                    <button
                      type="button"
                      className="admin-btn admin-btn-outline"
                      disabled={hostBusy}
                      onClick={() => setHostConfirmOpen(false)}
                    >
                      CANCEL
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn-solid"
                      disabled={hostBusy}
                      onClick={async () => {
                        if (hostBusy) return;
                        const symbol = String(hostSymbol || "").trim().toUpperCase();
                        const stopLoss = Number(hostSl);
                        const takeProfit = Number(hostTp);
                        const volume = Number(hostVolume);
                        setHostBusy(true);
                        try {
                          const result = await executeMentorSelfHostTrade({
                            mentorEmail: adminSession.email,
                            symbol,
                            side: hostSide,
                            volume: Number.isFinite(volume) && volume > 0 ? volume : 0.01,
                            stopLoss,
                            takeProfit,
                            comment: "mentor~APEXEA",
                          });
                          setHostResult(result);
                          setHostConfirmOpen(false);
                          const entry = {
                            id: `${Date.now()}-${symbol}-${hostSide}`,
                            at: Date.now(),
                            symbol: result.symbol || symbol,
                            side: result.side || hostSide,
                            volume: result.volume || volume,
                            stopLoss,
                            takeProfit,
                            targeted: Number(result.targeted || result.connected || 0),
                            placed: Number(result.placed || 0),
                            offline: Number(result.offline || result.failed || 0),
                          };
                          setHostRecent(saveSelfHostRecent(adminSession.email, entry));
                          const placed = Number(result?.placed || 0);
                          if (placed > 0) {
                            showToast(
                              `Executed ${placed} trade${placed === 1 ? "" : "s"} for connected clients`
                            );
                          } else {
                            showToast(result?.error || "No trades were placed");
                          }
                        } catch (error) {
                          showToast(error.message || "Could not execute trade");
                          setHostResult(error.data || { error: error.message });
                          setHostConfirmOpen(false);
                        } finally {
                          setHostBusy(false);
                        }
                      }}
                    >
                      {hostBusy ? "EXECUTING…" : "EXECUTE TRADE"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        )}

        {isSuperAdmin && adminPage === "commissions" && (
          <section className="admin-page is-active">
            <div className="admin-title-row">
              <h2 className="admin-h1">Mentor Commissions</h2>
            </div>
            <p className="admin-sub">
              Track paid first-time unlocks (${COMMISSION_USD.toFixed(2)} / R{COMMISSION_ZAR} each),
              and banking details so you can pay commissions. Generated-only keys and reuse on
              already-unlocked accounts do not count.
            </p>
            <div className="admin-search-row" style={{ marginBottom: 12 }}>
              <input
                className="admin-input"
                type="search"
                value={commissionSearch}
                onChange={(e) => setCommissionSearch(e.target.value)}
                placeholder="Search mentor by name, email, or phone"
                aria-label="Search mentors"
              />
            </div>
            {commissionRows.length === 0 ? (
              <div className="admin-card">
                <p className="admin-empty">No approved mentors yet</p>
              </div>
            ) : filteredCommissionRows.length === 0 ? (
              <div className="admin-card">
                <p className="admin-empty">
                  No mentors match “{commissionSearch.trim()}”
                </p>
              </div>
            ) : (
              filteredCommissionRows.map(({ mentor, sold, usd, zar, withdrawable, banking }) => {
                const hasBanking = Boolean(
                  banking?.accountName && banking?.bankName && banking?.accountNumber
                );
                return (
                  <div className="admin-card" style={{ marginTop: 14 }} key={mentor.id || mentor.email}>
                    <div className="admin-card-title-row">
                      <h3>{mentor.username || "Mentor"}</h3>
                      <span className={`admin-badge${withdrawable ? " is-approved" : " is-pending"}`}>
                        {withdrawable ? "Payable" : "Building"}
                      </span>
                    </div>
                    <p className="admin-card-meta">{mentor.email}</p>
                    <p className="admin-card-meta">{mentor.contact || "No contact number"}</p>
                    <p className="admin-card-meta">
                      <strong>Paid unlocks:</strong> {sold}
                    </p>
                    <p className="admin-card-meta">
                      <strong>Commission:</strong> ${usd.toFixed(2)} (R{zar})
                    </p>
                    <p className="admin-card-meta">
                      <strong>Withdrawal:</strong>{" "}
                      {withdrawable
                        ? "Ready (5+ paid unlocks)"
                        : `${Math.max(0, WITHDRAW_MIN_KEYS - sold)} more needed`}
                    </p>
                    <div className="admin-commission-bank" style={{ marginTop: 10 }}>
                      <strong>Banking</strong>
                      {hasBanking ? (
                        <>
                          <p className="admin-card-meta">
                            <strong>Name:</strong> {banking.accountName}
                          </p>
                          <p className="admin-card-meta">
                            <strong>Bank:</strong> {banking.bankName}
                          </p>
                          <p className="admin-card-meta">
                            <strong>Account:</strong> {banking.accountNumber}
                          </p>
                          {banking.branchCode ? (
                            <p className="admin-card-meta">
                              <strong>Branch:</strong> {banking.branchCode}
                            </p>
                          ) : null}
                          {banking.accountType ? (
                            <p className="admin-card-meta">
                              <strong>Type:</strong> {banking.accountType}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <p className="admin-empty">Mentor has not added banking details yet</p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </section>
        )}

        {isSuperAdmin && adminPage === "mentors" && (
          <section className="admin-page is-active">
            <div className="admin-title-row">
              <h2 className="admin-h1">Mentor Management</h2>
              <button
                className="admin-btn admin-btn-outline admin-btn-sm"
                type="button"
                onClick={() => setBypassOpen((open) => !open)}
              >
                Bypass
              </button>
            </div>
            <p className="admin-sub">
              Mentor signups land in Pending here until you approve them.
            </p>

            {bypassOpen ? (
              <div className="admin-card admin-bypass-card">
                <div className="admin-card-title-row">
                  <h3 className="admin-card-title">Payment bypass</h3>
                  <button
                    className="admin-btn admin-btn-ghost admin-btn-sm"
                    type="button"
                    onClick={() => setBypassOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <p className="admin-card-meta">
                  Enter a client email, then choose what to bypass without PayPal.
                </p>
                <label className="ea-field">
                  <span>Email</span>
                  <input
                    className="admin-input"
                    type="email"
                    value={bypassEmail}
                    onChange={(e) => setBypassEmail(e.target.value)}
                    placeholder="client@email.com"
                  />
                </label>
                <div className="admin-bypass-actions">
                  <button
                    className="admin-btn admin-btn-solid admin-btn-block"
                    type="button"
                    disabled={bypassBusy}
                    onClick={async () => {
                      setBypassBusy(true);
                      try {
                        await bypassAppAccess?.(bypassEmail);
                      } finally {
                        setBypassBusy(false);
                      }
                    }}
                  >
                    App access bypass
                  </button>
                  <button
                    className="admin-btn admin-btn-outline admin-btn-block"
                    type="button"
                    disabled={bypassBusy}
                    onClick={async () => {
                      setBypassBusy(true);
                      try {
                        await bypassPremiumScanner?.(bypassEmail);
                      } finally {
                        setBypassBusy(false);
                      }
                    }}
                  >
                    Premium scanner bypass
                  </button>
                </div>
              </div>
            ) : null}

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
                      {mentor.role !== "superadmin" ? (
                        <p className="admin-card-meta">
                          Paid unlocks: {countSoldKeysForMentor(mentor)} ·{" "}
                          {mentor.banking?.accountNumber
                            ? `${mentor.banking.bankName || "Bank"} · ${mentor.banking.accountNumber}`
                            : "No banking details"}
                        </p>
                      ) : null}
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

      {licenseSheetOpen && latestKey ? (
        <div className="license-side-sheet" role="dialog" aria-modal="true" aria-label="License details">
          <button
            className="license-side-backdrop"
            type="button"
            aria-label="Close"
            onClick={() => setLicenseSheetOpen(false)}
          />
          <aside className="license-side-panel">
            <div className="license-side-header">
              <h2>License details</h2>
              <button
                className="license-side-close"
                type="button"
                aria-label="Close"
                onClick={() => setLicenseSheetOpen(false)}
              >
                ×
              </button>
            </div>
            <code className="license-side-key">{latestKey}</code>
            <div className="license-side-meta">
              <p>
                <span>Client</span>
                <strong>{latestLicenseMeta?.name || "—"}</strong>
              </p>
              <p>
                <span>Email</span>
                <strong>{latestLicenseMeta?.email || "—"}</strong>
              </p>
              <p>
                <span>Bot</span>
                <strong>{latestLicenseMeta?.botName || "—"}</strong>
              </p>
              <p>
                <span>Status</span>
                <strong>
                  {latestLicenseMeta?.expired
                    ? "Expired"
                    : latestLicenseMeta?.status || "—"}
                </strong>
              </p>
              <p>
                <span>Duration</span>
                <strong>{latestLicenseMeta?.duration || "—"}</strong>
              </p>
              <p>
                <span>Expiry</span>
                <strong>{latestLicenseMeta?.expiry || "—"}</strong>
              </p>
              <p>
                <span>Created</span>
                <strong>
                  {latestLicenseMeta?.createdAt
                    ? new Date(latestLicenseMeta.createdAt).toLocaleString()
                    : "—"}
                </strong>
              </p>
              <p>
                <span>Used at</span>
                <strong>
                  {latestLicenseMeta?.usedAt
                    ? new Date(latestLicenseMeta.usedAt).toLocaleString()
                    : "Not used yet"}
                </strong>
              </p>
              {(latestLicenseMeta?.mentorName || latestLicenseMeta?.mentorEmail) && (
                <p>
                  <span>Mentor</span>
                  <strong>
                    {[latestLicenseMeta?.mentorName, latestLicenseMeta?.mentorEmail]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </strong>
                </p>
              )}
            </div>
            <button
              className="admin-btn admin-btn-solid admin-btn-block"
              type="button"
              onClick={() => copyLicenseKey(latestKey)}
            >
              Copy license key
            </button>
            <button
              className="admin-btn admin-btn-outline admin-btn-block"
              type="button"
              onClick={() => void onDeactivateLicense(latestKey)}
            >
              {latestLicenseMeta?.status === "Used" ? "Deactivate key" : "Reset key"}
            </button>
            <button
              className="admin-btn admin-btn-ghost admin-btn-block"
              type="button"
              onClick={() => void onDeleteLicense(latestKey)}
            >
              Delete key
            </button>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
