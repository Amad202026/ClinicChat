importScripts("/config.js", "/lib/xlsx.mini.min.js");

const ROSTER_FILE = "data/staff.xlsx";
const ICON = "icons/icon-128.png";
const SEEN_TTL = 60000;

const HEADERS = {
  staff_code: ["staffcode", "kodestaff", "kode", "nip", "idstaff"],
  full_name: ["fullname", "nama", "namalengkap", "name"],
  role: ["role", "jabatan", "peran", "posisi"],
  email: ["email", "emailaddress", "alamatemail", "surel"]
};

const clean = (v) => String(v == null ? "" : v).trim();
const key = (v) => clean(v).toLowerCase().replace(/[^a-z0-9]/g, "");

function field(row, name) {
  for (const k of Object.keys(row)) {
    if (HEADERS[name].includes(key(k))) return clean(row[k]);
  }
  return "";
}

function toRows(buffer) {
  if (typeof XLSX === "undefined") throw new Error("XLSX library tidak termuat");
  const book = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const sheet = book.Sheets[book.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  return json
    .map((row, i) => ({
      line: i + 2,
      email: field(row, "email").toLowerCase(),
      staff_code: field(row, "staff_code"),
      full_name: field(row, "full_name"),
      role: field(row, "role")
    }))
    .filter((r) => r.email || r.full_name || r.staff_code || r.role);
}

async function folderBuffer() {
  const url = chrome.runtime.getURL(ROSTER_FILE);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Gagal membaca file " + ROSTER_FILE + " (" + res.status + ")");
  return res.arrayBuffer();
}

const MAX_FILE_B64 = 3000000;
const MAX_ROWS = 500;

async function parseRequest(m) {
  try {
    let buffer;
    if (m.source === "file") {
      if (typeof m.data !== "string" || m.data.length > MAX_FILE_B64) return { ok: false, error: "size" };
      const bin = atob(m.data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      buffer = bytes.buffer;
    } else {
      buffer = await folderBuffer();
    }
    const rows = toRows(buffer);
    if (rows.length > MAX_ROWS) return { ok: false, error: "rows" };
    return { ok: true, rows };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : "read" };
  }
}

const MAX_BUILD_ROWS = 600;

function buildSheet(m) {
  try {
    if (!Array.isArray(m.rows) || m.rows.length > MAX_BUILD_ROWS) return { ok: false };
    const rows = m.rows.map((r) => (Array.isArray(r) ? r.slice(0, 12).map((c) => clean(c).slice(0, 300)) : []));
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, clean(m.sheet).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Data");
    return { ok: true, data: XLSX.write(book, { type: "base64", bookType: "xlsx" }) };
  } catch (_) {
    return { ok: false };
  }
}

const seen = new Map();
function firstTime(id) {
  const now = Date.now();
  for (const [k, t] of seen) if (now - t > SEEN_TTL) seen.delete(k);
  if (seen.has(id)) return false;
  seen.set(id, now);
  return true;
}

const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function notify(msg, sender) {
  const id = "m-" + clean(msg.id).slice(0, 64);
  if (!msg.id || !firstTime(id)) return;
  chrome.notifications.create(id, {
    type: "basic",
    iconUrl: chrome.runtime.getURL(ICON),
    title: cut(clean(msg.title) || "ClinicChat", 70),
    message: cut(clean(msg.body), 160),
    priority: 1
  });
  if (sender && sender.tab) {
    chrome.storage.session.set({
      ["n:" + id]: { tabId: sender.tab.id, windowId: sender.tab.windowId, tab: msg.tab || "Lobby", roomId: msg.roomId || null }
    });
  }
}

const NULL_BODY = [101, 204, 205, 304];

async function proxyHttp(m) {
  try {
    const target = new URL(m.url);
    const allowed = new URL(CC.config.SUPABASE_URL);
    if (target.origin !== allowed.origin) return { error: "blocked" };
    const init = { method: m.method, headers: m.headers || {}, cache: "no-store" };
    if (m.body != null && m.method !== "GET" && m.method !== "HEAD") init.body = m.body;
    const res = await fetch(target.href, init);
    const headers = [];
    res.headers.forEach((v, k) => headers.push([k, v]));
    const body = NULL_BODY.includes(res.status) ? null : await res.text();
    return { status: res.status, statusText: res.statusText, headers, body };
  } catch (_) {
    return { error: "network" };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !msg) return false;

  if (msg.type === "http") {
    proxyHttp(msg).then(respond);
    return true;
  }

  if (msg.type === "xlsx:parse") {
    parseRequest(msg).then(respond);
    return true;
  }

  if (msg.type === "xlsx:build") {
    respond(buildSheet(msg));
    return false;
  }

  if (msg.type === "notify") {
    notify(msg, sender);
    return false;
  }
  return false;
});

chrome.notifications.onClicked.addListener(async (id) => {
  chrome.notifications.clear(id);
  const stored = await chrome.storage.session.get("n:" + id);
  const target = stored["n:" + id];
  if (!target) return;
  try {
    await chrome.windows.update(target.windowId, { focused: true });
    await chrome.tabs.update(target.tabId, { active: true });
    await chrome.tabs.sendMessage(target.tabId, { type: "open-panel", tab: target.tab, roomId: target.roomId });
  } catch (_) {}
  chrome.storage.session.remove("n:" + id);
});