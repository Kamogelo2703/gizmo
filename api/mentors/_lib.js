import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { FALLBACK_GITHUB_TOKEN } from "../signups/_githubToken.js";

const REPO = process.env.SIGNUPS_GITHUB_REPO || "Kamogelo2703/gizmo";
const BRANCH = process.env.SIGNUPS_GITHUB_BRANCH || "main";
const FILE_PATH = process.env.MENTORS_FILE_PATH || "data/mentors.json";
const API = `https://api.github.com/repos/${REPO}`;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_FILE = path.resolve(__dirname, "../../data/mentors.json");

export const SUPER_ADMIN_EMAIL = String(
  process.env.SUPER_ADMIN_EMAIL || "trapgoatkaymow22@icloud.com"
)
  .trim()
  .toLowerCase();
export const SUPER_ADMIN_PASSWORD =
  process.env.SUPER_ADMIN_PASSWORD || "Admin12";
export const SUPER_ADMIN_USERNAME = "APEX EA";

let memoryMentors = null;

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function normalizePhone(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function requireToken() {
  const token =
    process.env.SIGNUPS_GITHUB_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    FALLBACK_GITHUB_TOKEN ||
    "";
  if (!token) {
    const err = new Error("Mentor store is not configured");
    err.status = 500;
    throw err;
  }
  return token;
}

async function ghFetch(url, { method = "GET", body, token, auth = true, cache } = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (auth) headers.Authorization = `Bearer ${token || requireToken()}`;
  if (body) headers["Content-Type"] = "application/json";

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    ...(cache ? { cache } : {}),
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
      (data && (data.message || data.error)) || `GitHub error ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function createSalt() {
  return crypto.randomBytes(16).toString("hex");
}

export function hashPassword(password, salt) {
  return crypto
    .createHash("sha256")
    .update(`${salt}:${String(password || "")}`)
    .digest("hex");
}

export function publicMentor(mentor) {
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

function decodeMentorsJson(raw, sha = null) {
  try {
    const parsed = JSON.parse(raw || "{}");
    const mentors = Array.isArray(parsed?.mentors) ? parsed.mentors : [];
    return {
      sha,
      mentors: mentors
        .map((m) => ({
          id: String(m.id || normalizeEmail(m.email) || crypto.randomUUID()),
          username: String(m.username || "").trim() || "Mentor",
          email: normalizeEmail(m.email),
          contact: normalizePhone(m.contact),
          role: String(m.role || "mentor").toLowerCase() === "superadmin" ? "superadmin" : "mentor",
          status: String(m.status || "pending").toLowerCase(),
          passwordHash: String(m.passwordHash || ""),
          salt: String(m.salt || ""),
          createdAt: Number(m.createdAt) || Date.now(),
        }))
        .filter((m) => m.email && m.email.includes("@")),
    };
  } catch {
    return { sha, mentors: [] };
  }
}

function decodeContent(file) {
  const raw = Buffer.from(String(file.content || "").replace(/\n/g, ""), "base64").toString(
    "utf8"
  );
  return decodeMentorsJson(raw, file.sha);
}

function readLocalStore() {
  if (Array.isArray(memoryMentors)) {
    return { sha: "local", mentors: memoryMentors.map((m) => ({ ...m })) };
  }
  try {
    if (fs.existsSync(LOCAL_FILE)) {
      const raw = fs.readFileSync(LOCAL_FILE, "utf8");
      const decoded = decodeMentorsJson(raw, "local");
      memoryMentors = decoded.mentors;
      return { sha: "local", mentors: decoded.mentors.map((m) => ({ ...m })) };
    }
  } catch {
    // ignore and use memory
  }
  memoryMentors = [];
  return { sha: "local", mentors: [] };
}

function writeLocalStore(mentors) {
  const next = mentors.map((m) => ({ ...m }));
  memoryMentors = next;
  try {
    fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
    fs.writeFileSync(
      LOCAL_FILE,
      JSON.stringify(
        {
          mentors: next
            .map((m) => ({
              id: m.id,
              username: m.username,
              email: normalizeEmail(m.email),
              contact: normalizePhone(m.contact),
              role: m.role || "mentor",
              status: m.status || "pending",
              passwordHash: m.passwordHash,
              salt: m.salt,
              createdAt: Number(m.createdAt) || Date.now(),
            }))
            .filter((m) => m.email && m.email.includes("@") && m.passwordHash && m.salt),
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
  } catch {
    // memory still holds the data for this process
  }
  return next;
}

async function readStore() {
  try {
    const file = await ghFetch(
      `${API}/contents/${FILE_PATH}?ref=${encodeURIComponent(BRANCH)}`,
      { cache: "no-store" }
    );
    return decodeContent(file);
  } catch (error) {
    if (error.status === 404) {
      return { sha: null, mentors: [], remote: true };
    }
    // Dev / bad token: fall back to local file store.
    const local = readLocalStore();
    return { ...local, remote: false };
  }
}

async function writeStore(mentors, sha, message) {
  const content = Buffer.from(
    JSON.stringify(
      {
        mentors: mentors
          .map((m) => ({
            id: m.id,
            username: m.username,
            email: normalizeEmail(m.email),
            contact: normalizePhone(m.contact),
            role: m.role || "mentor",
            status: m.status || "pending",
            passwordHash: m.passwordHash,
            salt: m.salt,
            createdAt: Number(m.createdAt) || Date.now(),
          }))
          .filter((m) => m.email && m.email.includes("@") && m.passwordHash && m.salt)
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
      },
      null,
      2
    ) + "\n",
    "utf8"
  ).toString("base64");

  const body = {
    message,
    content,
    branch: BRANCH,
  };
  if (sha && sha !== "local") body.sha = sha;

  try {
    return await ghFetch(`${API}/contents/${FILE_PATH}`, {
      method: "PUT",
      body,
    });
  } catch (error) {
    writeLocalStore(mentors);
    // Auth failures must surface — otherwise pending mentors appear saved but vanish
    // on the next serverless instance.
    if (error.status === 401 || error.status === 403) throw error;
    return { local: true };
  }
}

async function mutateStore(mutator, message) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const store = await readStore();
      const next = mutator(store.mentors.map((m) => ({ ...m })));
      await writeStore(next, store.sha, message);
      return next;
    } catch (error) {
      lastError = error;
      if (error.status === 409 || error.status === 422) continue;
      throw error;
    }
  }
  throw lastError || new Error("Could not update mentors store");
}

function ensureSuperAdminRecord(mentors) {
  const list = Array.isArray(mentors) ? [...mentors] : [];
  const idx = list.findIndex((m) => m.email === SUPER_ADMIN_EMAIL);
  const salt = idx >= 0 && list[idx].salt ? list[idx].salt : createSalt();
  const passwordHash = hashPassword(SUPER_ADMIN_PASSWORD, salt);
  const record = {
    id: idx >= 0 ? list[idx].id : "super-admin",
    username: SUPER_ADMIN_USERNAME,
    email: SUPER_ADMIN_EMAIL,
    contact: idx >= 0 ? list[idx].contact || "" : "",
    role: "superadmin",
    status: "approved",
    passwordHash,
    salt,
    createdAt: idx >= 0 ? list[idx].createdAt || Date.now() : Date.now(),
  };
  if (idx >= 0) list[idx] = { ...list[idx], ...record };
  else list.unshift(record);
  return list;
}

export async function listMentors() {
  // Use mutate path when seeding so a concurrent register cannot be overwritten
  // by a stale full-file write.
  let mentors = [];
  try {
    const store = await readStore();
    mentors = ensureSuperAdminRecord(store.mentors);
    const seeded = store.mentors.some((m) => m.email === SUPER_ADMIN_EMAIL);
    const sameHash =
      seeded &&
      store.mentors.find((m) => m.email === SUPER_ADMIN_EMAIL)?.passwordHash ===
        mentors.find((m) => m.email === SUPER_ADMIN_EMAIL)?.passwordHash;
    if (!seeded || !sameHash) {
      await mutateStore((current) => ensureSuperAdminRecord(current), "chore: seed super admin mentor account");
      const refreshed = await readStore();
      mentors = ensureSuperAdminRecord(refreshed.mentors);
    }
  } catch {
    mentors = ensureSuperAdminRecord(readLocalStore().mentors);
  }
  return mentors
    .map(publicMentor)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function registerMentor({ username, email, contact, password }) {
  const key = normalizeEmail(email);
  const name = String(username || "").trim();
  const phone = normalizePhone(contact);
  const pass = String(password || "");

  if (!name) {
    const err = new Error("Enter a username");
    err.status = 400;
    throw err;
  }
  if (!key || !key.includes("@")) {
    const err = new Error("Enter a valid email");
    err.status = 400;
    throw err;
  }
  if (!phone || phone.length < 7) {
    const err = new Error("Enter a valid contact number");
    err.status = 400;
    throw err;
  }
  if (pass.length < 6) {
    const err = new Error("Password must be at least 6 characters");
    err.status = 400;
    throw err;
  }
  if (key === SUPER_ADMIN_EMAIL) {
    const err = new Error("This email is reserved");
    err.status = 400;
    throw err;
  }

  let created = null;
  await mutateStore((mentors) => {
    const list = ensureSuperAdminRecord(mentors);
    if (list.some((m) => m.email === key)) {
      const err = new Error("An account with this email already exists");
      err.status = 409;
      throw err;
    }
    const salt = createSalt();
    created = {
      id: crypto.randomUUID(),
      username: name,
      email: key,
      contact: phone,
      role: "mentor",
      status: "pending",
      passwordHash: hashPassword(pass, salt),
      salt,
      createdAt: Date.now(),
    };
    list.unshift(created);
    return list;
  }, `chore: register mentor ${key}`);

  return publicMentor(created);
}

export async function loginMentor({ email, password }) {
  const key = normalizeEmail(email);
  const pass = String(password || "");
  if (!key || !pass) {
    const err = new Error("Enter email and password");
    err.status = 400;
    throw err;
  }

  // Always allow the configured super admin, even if the remote store is down.
  if (key === SUPER_ADMIN_EMAIL && pass === SUPER_ADMIN_PASSWORD) {
    return {
      id: "super-admin",
      username: SUPER_ADMIN_USERNAME,
      email: SUPER_ADMIN_EMAIL,
      contact: "",
      role: "superadmin",
      status: "approved",
      createdAt: Date.now(),
    };
  }

  const store = await readStore();
  const mentors = ensureSuperAdminRecord(store.mentors);
  const mentor = mentors.find((m) => m.email === key);
  if (!mentor) {
    const err = new Error("Invalid email or password");
    err.status = 401;
    throw err;
  }

  const hash = hashPassword(pass, mentor.salt);
  if (hash !== mentor.passwordHash) {
    const err = new Error("Invalid email or password");
    err.status = 401;
    throw err;
  }
  if (mentor.status !== "approved" && mentor.role !== "superadmin") {
    const err = new Error("Account pending approval by super admin");
    err.status = 403;
    throw err;
  }

  return publicMentor(mentor);
}

export async function setMentorStatus(email, status) {
  const key = normalizeEmail(email);
  const nextStatus = String(status || "").toLowerCase();
  if (!["pending", "approved", "declined"].includes(nextStatus)) {
    const err = new Error("Invalid status");
    err.status = 400;
    throw err;
  }
  if (key === SUPER_ADMIN_EMAIL) {
    const err = new Error("Cannot change super admin status");
    err.status = 400;
    throw err;
  }

  let updated = null;
  await mutateStore((mentors) => {
    const list = ensureSuperAdminRecord(mentors);
    const idx = list.findIndex((m) => m.email === key);
    if (idx < 0) {
      const err = new Error("Mentor not found");
      err.status = 404;
      throw err;
    }
    list[idx] = { ...list[idx], status: nextStatus };
    updated = list[idx];
    return list;
  }, `chore: set mentor ${key} to ${nextStatus}`);

  return publicMentor(updated);
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error("Invalid JSON body");
    err.status = 400;
    throw err;
  }
}

export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}
