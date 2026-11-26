(() => {
  "use strict";

  const ROOT_ID = "clinicchat-root";
  if (document.getElementById(ROOT_ID)) return;

  const CC = globalThis.CC;
  const SIZE = 58;
  const MARGIN = 8;
  const GAP = 14;
  const EDGE = 120;
  const DRAG_THRESHOLD = 5;
  const POS_KEY = "clinicchat.launcherPos.v2";
  const OLD_POS_KEY = "clinicchat.launcherPos";
  const DEFAULT_POS = { right: 22, bottom: 22 };
  const BASE_TABS = ["Lobby", "Groups", "Personal", "Profile"];
  const CHAT_TABS = ["Lobby", "Groups", "Personal"];

  const host = document.createElement("div");
  host.id = ROOT_ID;
  host.style.position = "fixed";
  host.style.right = DEFAULT_POS.right + "px";
  host.style.bottom = DEFAULT_POS.bottom + "px";
  host.style.zIndex = "2147483647";
  host.style.width = SIZE + "px";
  host.style.height = SIZE + "px";
  host.style.pointerEvents = "none";
  host.style.visibility = "hidden";
  document.documentElement.appendChild(host);

  const keepAttached = new MutationObserver(() => {
    if (!host.isConnected) document.documentElement.appendChild(host);
  });
  keepAttached.observe(document.documentElement, { childList: true });

  CC.onInvalidated(() => {
    keepAttached.disconnect();
    window.removeEventListener("resize", applyPosition);
    try { CC.notifications.stop(); } catch (_) {}
    try {
      const sb = CC.getClient();
      sb.auth.stopAutoRefresh();
      sb.realtime.disconnect();
    } catch (_) {}
    host.remove();
  });

  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = CC.buildCss({ SIZE, GAP });

  const wrap = document.createElement("div");
  wrap.className = "wrap";
  wrap.innerHTML = `
    <section class="panel up" role="dialog" aria-label="ClinicChat" aria-modal="false">
      <header class="header">
        <div class="badge" aria-hidden="true">CC</div>
        <div class="brand">
          <strong>ClinicChat</strong>
          <span>Komunikasi internal klinik</span>
        </div>
        <button class="close" type="button" aria-label="Tutup panel">×</button>
      </header>
      <nav class="nav" aria-label="Navigasi chat" style="--i:0">
        <button class="active" type="button" data-tab="Lobby">Lobby<span class="pill" hidden></span></button>
        <button type="button" data-tab="Groups">Groups<span class="pill" hidden></span></button>
        <button type="button" data-tab="Personal">Personal<span class="pill" hidden></span></button>
        <button type="button" data-tab="Profile">Profile</button>
        <button type="button" data-tab="Admin" hidden>Admin</button>
        <span class="ink"></span>
      </nav>
      <div class="stage">
        <main class="body"></main>
        <div class="toast" role="status" hidden>
          <div class="toast-av" aria-hidden="true"></div>
          <div class="toast-text"><strong></strong><span></span></div>
        </div>
      </div>
    </section>
    <button class="launcher" type="button" aria-label="Buka ClinicChat" aria-expanded="false" title="ClinicChat">
      <span class="logo" aria-hidden="true">CC</span>
      <span class="count" hidden></span>
    </button>
  `;

  shadow.append(style, wrap);

  const panel = shadow.querySelector(".panel");
  const launcher = shadow.querySelector(".launcher");
  const count = shadow.querySelector(".count");
  const close = shadow.querySelector(".close");
  const nav = shadow.querySelector(".nav");
  const body = shadow.querySelector(".body");
  const toast = shadow.querySelector(".toast");
  const tabButtons = [...shadow.querySelectorAll("[data-tab]")];

  ["keydown", "keyup", "keypress"].forEach((t) => wrap.addEventListener(t, (e) => e.stopPropagation()));

  let pos = { ...DEFAULT_POS };
  let drag = null;
  let suppressClick = false;

  function viewport() {
    return {
      vw: document.documentElement.clientWidth || window.innerWidth,
      vh: document.documentElement.clientHeight || window.innerHeight
    };
  }

  function span() {
    const { vw, vh } = viewport();
    return { x: Math.max(1, vw - SIZE - MARGIN * 2), y: Math.max(1, vh - SIZE - MARGIN * 2) };
  }

  function clampPos() {
    const { vw, vh } = viewport();
    pos.right = Math.min(Math.max(pos.right, MARGIN), Math.max(MARGIN, vw - SIZE - MARGIN));
    pos.bottom = Math.min(Math.max(pos.bottom, MARGIN), Math.max(MARGIN, vh - SIZE - MARGIN));
  }

  function snapshot() {
    const s = span();
    return {
      right: pos.right,
      bottom: pos.bottom,
      rx: (pos.right - MARGIN) / s.x,
      ry: (pos.bottom - MARGIN) / s.y
    };
  }

  function restore(saved) {
    const s = span();
    const axis = (px, ratio, size) => (px <= EDGE ? px : MARGIN + ratio * size);
    pos = {
      right: axis(saved.right, saved.rx, s.x),
      bottom: axis(saved.bottom, saved.ry, s.y)
    };
  }

  function validSaved(v) {
    return v && [v.right, v.bottom, v.rx, v.ry].every(Number.isFinite);
  }

  function legacy(v) {
    if (!v || !Number.isFinite(v.right) || !Number.isFinite(v.bottom)) return null;
    const s = span();
    return { right: v.right, bottom: v.bottom, rx: (v.right - MARGIN) / s.x, ry: (v.bottom - MARGIN) / s.y };
  }

  function layoutPanel() {
    const { vw, vh } = viewport();
    const launcherTop = vh - pos.bottom - SIZE;
    const launcherBottom = vh - pos.bottom;
    const launcherLeft = vw - pos.right - SIZE;

    const spaceAbove = launcherTop - GAP - MARGIN;
    const spaceBelow = vh - launcherBottom - GAP - MARGIN;
    const openUp = spaceAbove >= spaceBelow;
    const space = openUp ? spaceAbove : spaceBelow;

    panel.classList.toggle("up", openUp);
    panel.classList.toggle("down", !openUp);
    panel.style.height = Math.max(0, Math.min(500, space)) + "px";

    const width = Math.min(360, vw - MARGIN * 2);
    panel.style.width = width + "px";

    const alignRight = launcherLeft + SIZE / 2 >= vw / 2;
    let panelLeft = alignRight ? launcherLeft + SIZE - width : launcherLeft;
    panelLeft = Math.min(Math.max(panelLeft, MARGIN), vw - width - MARGIN);
    panel.style.left = panelLeft - launcherLeft + "px";
    panel.style.transformOrigin = (openUp ? "bottom " : "top ") + (alignRight ? "right" : "left");
  }

  function applyPosition() {
    clampPos();
    host.style.right = pos.right + "px";
    host.style.bottom = pos.bottom + "px";
    layoutPanel();
  }

  function savePosition() {
    try { chrome.storage.local.set({ [POS_KEY]: snapshot() }); } catch (_) {}
  }

  function reveal() {
    if (host.style.visibility === "visible") return;
    host.style.visibility = "visible";
    launcher.classList.add("intro");
    launcher.addEventListener("animationend", () => launcher.classList.remove("intro"), { once: true });
  }

  function loadPosition() {
    const fallback = setTimeout(() => { applyPosition(); reveal(); }, 1500);
    try {
      chrome.storage.local.get([POS_KEY, OLD_POS_KEY], (res) => {
        clearTimeout(fallback);
        const saved = validSaved(res && res[POS_KEY]) ? res[POS_KEY] : legacy(res && res[OLD_POS_KEY]);
        if (saved) restore(saved);
        applyPosition();
        reveal();
      });
    } catch (_) {
      clearTimeout(fallback);
      applyPosition();
      reveal();
    }
  }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[POS_KEY] || drag) return;
      const next = changes[POS_KEY].newValue;
      if (!validSaved(next)) return;
      restore(next);
      applyPosition();
    });
  } catch (_) {}

  launcher.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, right: pos.right, bottom: pos.bottom, moved: false };
    launcher.setPointerCapture(e.pointerId);
  });

  launcher.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      drag.moved = true;
      launcher.classList.add("dragging");
    }
    if (drag.moved) {
      pos.right = drag.right - dx;
      pos.bottom = drag.bottom - dy;
      applyPosition();
    }
  });

  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    launcher.classList.remove("dragging");
    try { launcher.releasePointerCapture(e.pointerId); } catch (_) {}
    if (moved) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      savePosition();
    }
  }
  launcher.addEventListener("pointerup", endDrag);
  launcher.addEventListener("pointercancel", endDrag);

  let currentTab = "Lobby";
  let auth = { status: "loading" };
  let notice = "";
  let disposeView = null;
  let sbEvents = false;
  let toastTimer = null;
  let toastTab = "Lobby";
  let toastRoom = null;
  let openRoomId = null;

  const isOpen = () => panel.classList.contains("open");
  const attentive = () => !document.hidden && document.hasFocus();

  function paintBadges() {
    let total = 0;
    let anyTag = false;
    for (const tab of CHAT_TABS) {
      const u = CC.unread.summary(tab);
      total += u.n;
      anyTag = anyTag || u.tag;
      const pill = shadow.querySelector(`[data-tab="${tab}"] .pill`);
      pill.textContent = u.n > 99 ? "99+" : String(u.n);
      pill.hidden = u.n === 0;
      pill.classList.toggle("tag", u.tag);
    }
    const text = total > 99 ? "99+" : String(total);
    const changed = count.textContent !== text;
    count.hidden = total === 0;
    count.classList.toggle("tag", anyTag);
    if (changed) {
      count.textContent = text;
      count.style.animation = "none";
      void count.offsetWidth;
      count.style.animation = "";
    }
    launcher.classList.toggle("alert", total > 0 && !isOpen());
  }

  function resetUnread() {
    CC.unread.reset();
    paintBadges();
  }

  function clearIfViewing() {
    if (!isOpen() || !attentive() || !CC.unread.viewing) return;
    CC.unread.clear(CC.unread.viewing);
  }

  CC.unread.onChange(() => {
    paintBadges();
    clearIfViewing();
  });

  function hideToast() {
    clearTimeout(toastTimer);
    toast.hidden = true;
  }

  function showToast(ev, tab) {
    const name = ev.sender ? ev.sender.full_name : "Staff";
    toast.className = "toast" + (ev.mentioned ? " tag" : "");
    toast.querySelector(".toast-av").textContent = name.charAt(0).toUpperCase();
    toast.querySelector("strong").textContent = ev.mentioned ? name + " menyebut Anda" : name;
    toast.querySelector("span").textContent = ev.m.content;
    toastTab = tab;
    toastRoom = ev.m.room_id;
    toast.hidden = true;
    void toast.offsetWidth;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 4500);
  }

  toast.addEventListener("click", () => {
    hideToast();
    switchTab(toastTab, toastRoom);
  });

  function tabOf(room) {
    if (!room || room.type === "lobby") return "Lobby";
    return room.type === "group" ? "Groups" : "Personal";
  }

  function onIncoming(ev) {
    if (ev.own || auth.status !== "in") return;
    const tab = tabOf(ev.room);
    const viewing = isOpen() && attentive() && CC.unread.viewing === ev.m.room_id;
    if (!viewing) CC.unread.add(ev.m.room_id, ev.room ? ev.room.type : "lobby", ev.mentioned);
    if (isOpen() && !document.hidden && !viewing) showToast(ev, tab);
    if (!viewing && CC.notifications.wants(ev.mentioned)) {
      const name = ev.sender ? ev.sender.full_name : "Staff";
      const where = ev.room && ev.room.type !== "direct" && ev.room.name ? ev.room.name : "";
      let title = where ? name + " · " + where : name;
      if (ev.mentioned) title = name + " menyebut Anda" + (where ? " di " + where : "");
      CC.notifications.desktop({ id: ev.m.id, title, body: ev.m.content, tab, roomId: ev.m.room_id });
    }
  }

  function setOpen(open) {
    panel.classList.toggle("open", open);
    launcher.classList.toggle("open-state", open);
    launcher.setAttribute("aria-expanded", String(open));
    launcher.setAttribute("aria-label", open ? "Tutup ClinicChat" : "Buka ClinicChat");
    if (open) {
      layoutPanel();
      clearIfViewing();
    } else {
      hideToast();
    }
    paintBadges();
  }

  launcher.addEventListener("click", () => {
    if (suppressClick) return;
    setOpen(!isOpen());
  });
  close.addEventListener("click", () => setOpen(false));

  async function syncRealtimeSession() {
    if (!CC.configured()) return;
    try {
      const sb = CC.getClient();
      const { data } = await sb.auth.getSession();
      const token = data && data.session && data.session.access_token;
      if (token && sb.realtime) {
        sb.realtime.setAuth(token);
      }
    } catch (_) {}
  }

  document.addEventListener("visibilitychange", () => {
    clearIfViewing();
    if (!document.hidden && auth.status === "in") {
      syncRealtimeSession();
    }
  });
  window.addEventListener("focus", () => {
    clearIfViewing();
    if (auth.status === "in") {
      syncRealtimeSession();
    }
  });

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || msg.type !== "open-panel") return;
      if (auth.status === "in" && tabs().includes(msg.tab)) switchTab(msg.tab, msg.roomId);
      setOpen(true);
    });
  } catch (_) {}

  const tabs = () => (auth.status === "in" && auth.profile && auth.profile.is_admin ? [...BASE_TABS, "Admin"] : BASE_TABS);

  function syncNav() {
    const list = tabs();
    if (!list.includes(currentTab)) currentTab = "Lobby";
    shadow.querySelector('[data-tab="Admin"]').hidden = !list.includes("Admin");
    nav.style.setProperty("--n", String(list.length));
    nav.style.setProperty("--i", String(list.indexOf(currentTab)));
    tabButtons.forEach((b) => b.classList.toggle("active", b.dataset.tab === currentTab));
  }

  function center(html) {
    const d = document.createElement("div");
    d.className = "center";
    d.innerHTML = html;
    return d;
  }

  function placeholder(title, text) {
    const d = center('<div class="symbol" aria-hidden="true">CC</div><h2></h2><p></p>');
    d.querySelector("h2").textContent = title;
    d.querySelector("p").textContent = text;
    return d;
  }

  function render() {
    if (disposeView) { try { disposeView(); } catch (_) {} disposeView = null; }
    body.replaceChildren();
    const mount = document.createElement("div");
    mount.className = "mount view";
    body.append(mount);

    if (auth.status === "loading") { mount.append(placeholder("Memuat…", "")); return; }
    if (auth.status === "noconfig") {
      mount.append(center('<div class="symbol" aria-hidden="true">!</div><h2>Konfigurasi belum diisi</h2>'));
      return;
    }
    if (auth.status === "error") {
      const d = center('<div class="symbol" aria-hidden="true">!</div><h2>Tidak dapat terhubung</h2><button class="secondary retry" type="button">Coba lagi</button>');
      d.querySelector(".retry").addEventListener("click", () => refreshAuth(true));
      mount.append(d);
      return;
    }

    syncNav();
    const sb = CC.getClient();
    const ctx = { sb, onAuth: (force) => refreshAuth(force), notice };

    if (auth.status === "out") {
      disposeView = CC.views.login(mount, ctx);
      return;
    }

    ctx.user = auth.user;
    ctx.profile = auth.profile;
    ctx.openRoomId = openRoomId;
    openRoomId = null;
    if (auth.profile && auth.profile.must_change_password) {
      disposeView = CC.views.password(mount, { ...ctx, forced: true });
      return;
    }
    if (currentTab === "Lobby") disposeView = CC.views.lobby(mount, ctx);
    else if (currentTab === "Profile") disposeView = CC.views.profile(mount, ctx);
    else if (currentTab === "Admin") disposeView = CC.views.admin(mount, ctx);
    else if (currentTab === "Groups") disposeView = CC.views.groups(mount, ctx);
    else disposeView = CC.views.personal(mount, ctx);
  }

  function switchTab(name, roomId) {
    if (!tabs().includes(name)) return;
    currentTab = name;
    openRoomId = roomId || null;
    tabButtons.forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    nav.style.setProperty("--i", String(tabs().indexOf(name)));
    render();
    clearIfViewing();
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  async function loadAuth() {
    if (!CC.configured()) return { status: "noconfig" };
    const sb = CC.getClient();
    try {
      const { data } = await sb.auth.getSession();
      const session = data && data.session;
      if (!session) return { status: "out" };
      let profile = await CC.fetchProfile(session.user.id);
      if (!profile || !profile.is_active) {
        notice = "Akun belum aktif atau belum terdaftar.";
        await sb.auth.signOut({ scope: "local" });
        return { status: "out" };
      }
      return { status: "in", user: session.user, profile };
    } catch (_) {
      return { status: "error" };
    }
  }

  let refreshing = false;
  let refreshAgain = false;
  async function refreshAuth(force) {
    if (refreshing) { refreshAgain = true; return; }
    refreshing = true;
    try {
      const next = await loadAuth();
      const prevUser = auth.status === "in" ? auth.user.id : null;
      const same = auth.status === "in" && next.status === "in" && auth.user.id === next.user.id;
      const prevStatus = auth.status;
      const adminChanged = Boolean(auth.profile && auth.profile.is_admin) !== Boolean(next.profile && next.profile.is_admin);
      auth = next;
      if (next.status === "in") {
        notice = "";
        if (prevUser !== next.user.id) CC.notifications.start({ sb: CC.getClient(), user: next.user });
      } else if (prevUser) {
        CC.notifications.stop();
        resetUnread();
        hideToast();
      }
      if (force || !same || adminChanged || prevStatus !== next.status) render();
    } finally {
      refreshing = false;
      if (refreshAgain) { refreshAgain = false; refreshAuth(false); }
    }
  }

  CC.notifications.onMessage(onIncoming);

  function startAuth() {
    render();
    refreshAuth(true).then(() => {
      if (!CC.configured() || sbEvents) return;
      sbEvents = true;
      CC.getClient().auth.onAuthStateChange((event, session) => {
        if (event === "TOKEN_REFRESHED") {
          if (session && session.access_token) {
            try { CC.getClient().realtime.setAuth(session.access_token); } catch (_) {}
          }
          return;
        }
        if (event === "INITIAL_SESSION") return;
        setTimeout(() => refreshAuth(false), 0);
      });
      try {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === "local" && changes[CC.AUTH_KEY]) {
            syncRealtimeSession();
            setTimeout(() => refreshAuth(false), 100);
          }
        });
      } catch (_) {}
    });
  }

  window.addEventListener("resize", applyPosition);

  applyPosition();
  loadPosition();
  startAuth();
})();