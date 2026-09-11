const API_BASE = "/api/mentors";
const LOCAL_KEY = "apexea-mentors-v1";

export const SUPER_ADMIN_EMAIL = "trapgoatkaymow22@icloud.com";
export const SUPER_ADMIN_PASSWORD = "Admin12";
export const SUPER_ADMIN_USERNAME = "APEX EA";

async function apiFetch(path = "", { method = "GET", body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message =
      (data && (data.error || data.message)) ||
      (typeof data === "string" ? data : `Mentor sync failed (${response.status})`);
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  return data;
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function readLocalMentors() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed?.mentors) ? parsed.mentors : [];
  } catch {
    return [];
  }
}

function writeLocalMentors(mentors) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify({ mentors }));
}

function publicLocal(mentor) {
  if (!mentor) return null;
  return {
    id: mentor.id,
    username: mentor.username,
    email: mentor.email,
    contact: mentor.contact || "",
    role: mentor.role || "mentor",
    status: mentor.status || "pending",
    createdAt: mentor.createdAt || Date.now(),
  };
}

function ensureLocalSuperAdmin(list) {
  const mentors = Array.isArray(list) ? [...list] : [];
  const email = normalizeEmail(SUPER_ADMIN_EMAIL);
  const idx = mentors.findIndex((m) => m.email === email);
  const record = {
    id: "super-admin",
    username: SUPER_ADMIN_USERNAME,
    email,
    contact: "",
    role: "superadmin",
    status: "approved",
    password: SUPER_ADMIN_PASSWORD,
    createdAt: idx >= 0 ? mentors[idx].createdAt || Date.now() : Date.now(),
  };
  if (idx >= 0) mentors[idx] = { ...mentors[idx], ...record };
  else mentors.unshift(record);
  return mentors;
}

export async function fetchMentors() {
  try {
    const data = await apiFetch();
    const remote = Array.isArray(data?.mentors) ? data.mentors : [];
    if (remote.length) {
      writeLocalMentors(
        ensureLocalSuperAdmin(
          remote.map((m) => ({
            ...m,
            password:
              normalizeEmail(m.email) === normalizeEmail(SUPER_ADMIN_EMAIL)
                ? SUPER_ADMIN_PASSWORD
                : undefined,
          }))
        )
      );
    }
    return remote;
  } catch {
    return ensureLocalSuperAdmin(readLocalMentors()).map(publicLocal);
  }
}

export async function loginMentorAccount({ email, password }) {
  const key = normalizeEmail(email);
  const pass = String(password || "");

  try {
    const data = await apiFetch("", {
      method: "POST",
      body: { action: "login", email: key, password: pass },
    });
    return data?.mentor || null;
  } catch (error) {
    // Local fallback (dev / offline).
    if (key === normalizeEmail(SUPER_ADMIN_EMAIL) && pass === SUPER_ADMIN_PASSWORD) {
      return {
        id: "super-admin",
        username: SUPER_ADMIN_USERNAME,
        email: key,
        contact: "",
        role: "superadmin",
        status: "approved",
        createdAt: Date.now(),
      };
    }
    const mentors = ensureLocalSuperAdmin(readLocalMentors());
    const mentor = mentors.find((m) => m.email === key);
    if (!mentor || String(mentor.password || "") !== pass) {
      throw error.status === 401 || error.status === 403
        ? error
        : new Error("Invalid email or password");
    }
    if (mentor.status !== "approved" && mentor.role !== "superadmin") {
      throw new Error("Account pending approval by super admin");
    }
    return publicLocal(mentor);
  }
}

export async function registerMentorAccount({
  username,
  email,
  contact,
  password,
}) {
  const payload = {
    action: "register",
    username,
    email,
    contact,
    password,
  };

  try {
    const data = await apiFetch("", { method: "POST", body: payload });
    return data?.mentor || null;
  } catch (error) {
    // If remote says conflict / validation, surface it.
    if (error.status && error.status < 500) throw error;

    const key = normalizeEmail(email);
    const name = String(username || "").trim();
    const phone = String(contact || "").trim();
    const pass = String(password || "");
    if (!name) throw new Error("Enter a username");
    if (!key.includes("@")) throw new Error("Enter a valid email");
    if (phone.length < 7) throw new Error("Enter a valid contact number");
    if (pass.length < 6) throw new Error("Password must be at least 6 characters");
    if (key === normalizeEmail(SUPER_ADMIN_EMAIL)) {
      throw new Error("This email is reserved");
    }

    const mentors = ensureLocalSuperAdmin(readLocalMentors());
    if (mentors.some((m) => m.email === key)) {
      throw new Error("An account with this email already exists");
    }
    const created = {
      id: `local-${Date.now()}`,
      username: name,
      email: key,
      contact: phone,
      role: "mentor",
      status: "pending",
      password: pass,
      createdAt: Date.now(),
    };
    mentors.unshift(created);
    writeLocalMentors(mentors);
    return publicLocal(created);
  }
}

export async function updateMentorStatus(email, status) {
  try {
    const data = await apiFetch("", {
      method: "PATCH",
      body: { email, status },
    });
    return data?.mentor || null;
  } catch (error) {
    if (error.status && error.status < 500) throw error;
    const key = normalizeEmail(email);
    const mentors = ensureLocalSuperAdmin(readLocalMentors());
    const idx = mentors.findIndex((m) => m.email === key);
    if (idx < 0) throw new Error("Mentor not found");
    if (key === normalizeEmail(SUPER_ADMIN_EMAIL)) {
      throw new Error("Cannot change super admin status");
    }
    mentors[idx] = { ...mentors[idx], status };
    writeLocalMentors(mentors);
    return publicLocal(mentors[idx]);
  }
}
