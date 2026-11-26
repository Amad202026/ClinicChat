(() => {
  "use strict";
  const CC = (globalThis.CC = globalThis.CC || {});
  CC.views = CC.views || {};
  CC.AUTH_KEY = "clinicchat.auth";

  const deadFns = [];
  CC.dead = false;
  CC.onInvalidated = (fn) => { deadFns.push(fn); };
  CC.handleInvalidated = () => {
    if (CC.dead) return;
    CC.dead = true;
    deadFns.forEach((fn) => { try { fn(); } catch (_) {} });
  };
  CC.alive = () => {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; }
  };

  const area = () => chrome.storage.local;
  const call = (fn, fallback) => new Promise((resolve) => {
    try {
      if (!CC.alive()) throw new Error("invalidated");
      fn(resolve);
    } catch (_) {
      CC.handleInvalidated();
      resolve(fallback);
    }
  });
  const storage = {
    getItem: (k) => call((done) => area().get(k, (v) => done(v && k in v ? v[k] : null)), null),
    setItem: (k, val) => call((done) => area().set({ [k]: val }, () => done()), undefined),
    removeItem: (k) => call((done) => area().remove(k, () => done()), undefined)
  };

  CC.proxyFetch = async (input, init) => {
    const opts = init || {};
    const req = typeof Request !== "undefined" && input instanceof Request ? input : null;
    const url = req ? req.url : String(input);
    const method = String(opts.method || (req && req.method) || "GET").toUpperCase();
    const headers = {};
    new Headers(opts.headers || (req && req.headers) || {}).forEach((v, k) => { headers[k] = v; });
    let body = opts.body != null ? opts.body : null;
    if (body == null && req && method !== "GET" && method !== "HEAD") body = await req.clone().text();
    if (body != null && typeof body !== "string") body = String(body);
    const signal = opts.signal || (req && req.signal);
    if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");

    const res = await new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type: "http", url, method, headers, body }, (r) => {
          if (chrome.runtime.lastError || !r || r.error) reject(new TypeError("Failed to fetch"));
          else resolve(r);
        });
      } catch (_) {
        CC.handleInvalidated();
        reject(new TypeError("Failed to fetch"));
      }
    });
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
  };

  CC.configured = () => {
    const c = CC.config || {};
    return typeof c.SUPABASE_URL === "string" && /^https:\/\/[^/\s]+/.test(c.SUPABASE_URL) &&
      typeof c.SUPABASE_KEY === "string" && c.SUPABASE_KEY.length > 20 &&
      !/GANTI/i.test(c.SUPABASE_URL + c.SUPABASE_KEY);
  };

  let client = null;
  CC.getClient = () => {
    if (client) return client;
    client = supabase.createClient(CC.config.SUPABASE_URL, CC.config.SUPABASE_KEY, {
      global: { fetch: CC.proxyFetch },
      auth: {
        storage,
        storageKey: CC.AUTH_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      },
      realtime: { params: { eventsPerSecond: 10 } }
    });
    return client;
  };

  CC.staff = new Map();
  CC.loadStaff = async () => {
    const { data, error } = await CC.getClient().from("profiles").select("id, full_name, role, staff_code, is_active, avatar_v");
    if (error) throw error;
    for (const p of data) CC.staff.set(p.id, p);
    CC.avatars.sync(data).catch(() => {});
    return data;
  };

  CC.ROOM_COLS = "id, type, name, description, last_message_at";
  CC.rooms = new Map();
  CC.getRoom = async (id) => {
    if (CC.rooms.has(id)) return CC.rooms.get(id);
    const { data } = await CC.getClient().from("rooms").select(CC.ROOM_COLS).eq("id", id).maybeSingle();
    if (data) CC.rooms.set(id, data);
    return data || null;
  };

  CC.fetchProfile = async (uid) => {
    const { data, error } = await CC.getClient().from("profiles")
      .select("id, staff_code, full_name, role, email, is_active, is_admin, must_change_password").eq("id", uid).maybeSingle();
    if (error) throw error;
    return data;
  };

  CC.bg = (message) => new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (res) => {
        if (chrome.runtime.lastError || !res) return resolve({ ok: false });
        resolve(res);
      });
    } catch (_) {
      CC.handleInvalidated();
      resolve({ ok: false });
    }
  });

  CC.callAdmin = async (action, payload) => {
    try {
      const { data, error } = await CC.getClient().functions.invoke("staff-admin", { body: { action, ...(payload || {}) } });
      if (!error) return data && data.error ? { ok: false, message: data.error } : { ok: true, data };
      let message = "";
      let status = "";
      if (error.context) {
        if (error.context.status) status = " [" + error.context.status + "]";
        try {
          const raw = await error.context.clone().text();
          try {
            const parsed = JSON.parse(raw);
            message = parsed.error || parsed.message || parsed.msg || "";
          } catch (_) {
            if (raw && raw.length < 160) message = raw;
          }
        } catch (_) {}
      }
      if (!message && /failed to fetch|fetch/i.test(String(error.message || ""))) message = "Tidak dapat terhubung";
      return { ok: false, message: (message || error.message || "Permintaan gagal") + status };
    } catch (_) {
      return { ok: false, message: "Tidak dapat terhubung" };
    }
  };

  CC.saveBase64 = (b64, filename, mime) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.documentElement.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  CC.copyText = async (value) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (_) {}
    try {
      const box = document.createElement("textarea");
      box.value = value;
      box.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.documentElement.append(box);
      box.select();
      const done = document.execCommand("copy");
      box.remove();
      return done;
    } catch (_) {
      return false;
    }
  };

  const AV_KEY = "clinicchat.avatars.v1";
  const avMem = new Map();
  const avEls = new Map();
  let avReady = null;
  let avTimer = null;

  function avPaint(id) {
    const set = avEls.get(id);
    if (!set) return;
    for (const el of [...set]) {
      if (!el.isConnected) { set.delete(el); continue; }
      avApply(el, id);
    }
    if (!set.size) avEls.delete(id);
  }

  function avApply(el, id) {
    const data = CC.avatars.get(id);
    let img = el.querySelector("img.av-img");
    if (!data) {
      if (img) img.remove();
      el.classList.remove("has-img");
      return;
    }
    if (img && img.getAttribute("src") === data) return;
    if (!img) {
      img = document.createElement("img");
      img.className = "av-img";
      img.alt = "";
      img.draggable = false;
      img.addEventListener("error", () => {
        img.remove();
        el.classList.remove("has-img");
      });
      el.append(img);
    }
    img.src = data;
    el.classList.add("has-img");
  }

  function avSave() {
    clearTimeout(avTimer);
    avTimer = setTimeout(() => {
      const out = {};
      for (const [id, e] of avMem) out[id] = e;
      storage.setItem(AV_KEY, out);
    }, 400);
  }

  CC.avatars = {
    ready: () => {
      if (!avReady) {
        avReady = storage.getItem(AV_KEY).then((saved) => {
          if (saved && typeof saved === "object") {
            for (const [id, e] of Object.entries(saved)) {
              if (e && typeof e.v === "string" && typeof e.data === "string" && !avMem.has(id)) avMem.set(id, e);
            }
          }
          for (const id of [...avEls.keys()]) avPaint(id);
        });
      }
      return avReady;
    },
    get: (id) => {
      const e = avMem.get(id);
      return e ? e.data : null;
    },
    set: (id, v, data) => {
      if (data) avMem.set(id, { v: String(v), data });
      else avMem.delete(id);
      avSave();
      avPaint(id);
    },
    sync: async (rows) => {
      await CC.avatars.ready();
      const stale = [];
      for (const p of rows) {
        const v = p.avatar_v ? String(p.avatar_v) : null;
        const cur = avMem.get(p.id);
        if (!v) {
          if (cur) CC.avatars.set(p.id, null, null);
        } else if (!cur || cur.v !== v) {
          stale.push(p.id);
        }
      }
      for (let i = 0; i < stale.length; i += 20) {
        const { data, error } = await CC.getClient().from("profiles")
          .select("id, avatar, avatar_v").in("id", stale.slice(i, i + 20));
        if (error || !data) return;
        for (const row of data) {
          if (row.avatar && row.avatar_v) CC.avatars.set(row.id, row.avatar_v, row.avatar);
        }
      }
    },
    prepare: async (file) => {
      if (!file || !/^image\//.test(file.type) || file.size > 8 * 1024 * 1024) throw new Error("type");
      const bitmap = await createImageBitmap(file);
      const size = 128;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const g = canvas.getContext("2d");
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, size, size);
      const side = Math.min(bitmap.width, bitmap.height);
      g.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
      if (bitmap.close) bitmap.close();
      for (const quality of [0.85, 0.7, 0.55, 0.4]) {
        const url = canvas.toDataURL("image/jpeg", quality);
        if (url.length <= 30000) return url;
      }
      throw new Error("size");
    }
  };

  CC.avatarEl = (profile, cls) => {
    const el = document.createElement("span");
    el.className = cls;
    el.textContent = CC.initial(profile && profile.full_name);
    if (profile && profile.id) {
      let set = avEls.get(profile.id);
      if (!set) { set = new Set(); avEls.set(profile.id, set); }
      set.add(el);
      avApply(el, profile.id);
      CC.avatars.ready();
    }
    return el;
  };

  CC.errLabel = (err, fallback) => {
    const code = err && (err.code || err.status);
    const msg = String((err && err.message) || "").toLowerCase();
    if (code === "42501" || code === 401 || code === 403 || msg.includes("not allowed")) return "Akses ditolak";
    if (["42703", "42P01", "PGRST202", "PGRST204", "PGRST205"].includes(code)) return "Database belum diperbarui";
    if (code === "P0001" && err.message) return err.message;
    if (msg.includes("failed to fetch")) return "Tidak dapat terhubung";
    return fallback + (code ? " (" + code + ")" : "");
  };

  CC.h = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };

  CC.initial = (name) => String(name || "?").trim().charAt(0).toUpperCase() || "?";

  CC.confirmClick = (btn, fn) => {
    const label = btn.textContent;
    let timer = null;
    btn.addEventListener("click", () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        btn.textContent = label;
        btn.classList.remove("ask");
        fn();
        return;
      }
      btn.textContent = "Yakin?";
      btn.classList.add("ask");
      timer = setTimeout(() => {
        timer = null;
        btn.textContent = label;
        btn.classList.remove("ask");
      }, 3000);
    });
  };

  CC.formatListTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (d.toDateString() === new Date().toDateString()) return CC.formatTime(iso);
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  };

  CC.formatTime = (iso) => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  CC.formatDay = (iso) => {
    const d = new Date(iso), now = new Date();
    const same = (a, b) => a.toDateString() === b.toDateString();
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    if (same(d, now)) return "Hari ini";
    if (same(d, yest)) return "Kemarin";
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  };
})();
