(() => {
  "use strict";
  const CC = (globalThis.CC = globalThis.CC || {});
  const N = (CC.notifications = {});

  const MODE_KEY = "clinicchat.notifyMode";
  const MODES = ["all", "mentions", "off"];
  const messageFns = new Set();
  const statusFns = new Set();

  const memberFns = new Set();
  const unreadFns = new Set();
  const unreadMap = new Map();
  const TAB_OF = { lobby: "Lobby", group: "Groups", direct: "Personal" };
  const emitUnread = () => unreadFns.forEach((fn) => { try { fn(); } catch (_) {} });

  CC.unread = {
    viewing: null,
    get: (id) => unreadMap.get(id) || { n: 0, tag: false },
    add(id, type, mention) {
      const u = unreadMap.get(id) || { n: 0, tag: false, type };
      u.n += 1;
      u.tag = u.tag || !!mention;
      u.type = type || u.type;
      unreadMap.set(id, u);
      emitUnread();
    },
    clear(id) { if (unreadMap.delete(id)) emitUnread(); },
    reset() { if (unreadMap.size) { unreadMap.clear(); emitUnread(); } },
    setViewing(id) { CC.unread.viewing = id; emitUnread(); },
    summary(tab) {
      let n = 0;
      let tag = false;
      for (const u of unreadMap.values()) {
        if (tab && (TAB_OF[u.type] || "Lobby") !== tab) continue;
        n += u.n;
        tag = tag || u.tag;
      }
      return { n, tag };
    },
    onChange(fn) {
      unreadFns.add(fn);
      return () => unreadFns.delete(fn);
    }
  };

  let channel = null;
  let sb = null;
  let user = null;
  let status = "idle";
  let mode = "all";
  let queue = Promise.resolve();
  let session = 0;

  function setStatus(next) {
    status = next;
    statusFns.forEach((fn) => { try { fn(next); } catch (_) {} });
  }

  N.onMessage = (fn) => {
    messageFns.add(fn);
    return () => messageFns.delete(fn);
  };

  N.onStatus = (fn) => {
    statusFns.add(fn);
    try { fn(status); } catch (_) {}
    return () => statusFns.delete(fn);
  };

  N.onMembership = (fn) => {
    memberFns.add(fn);
    return () => memberFns.delete(fn);
  };

  N.getMode = () => mode;

  N.setMode = (next) => {
    if (!MODES.includes(next)) return;
    mode = next;
    try { chrome.storage.local.set({ [MODE_KEY]: next }); } catch (_) {}
  };

  N.wants = (mentioned) => mode === "all" || (mode === "mentions" && mentioned);

  N.desktop = ({ id, title, body, tab, roomId }) => {
    try {
      const sent = chrome.runtime.sendMessage({ type: "notify", id, title, body, tab, roomId });
      if (sent && sent.catch) sent.catch(() => {});
    } catch (_) {
      if (CC.handleInvalidated) CC.handleInvalidated();
    }
  };

  try {
    chrome.storage.local.get(MODE_KEY, (r) => {
      if (r && MODES.includes(r[MODE_KEY])) mode = r[MODE_KEY];
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      const c = changes[MODE_KEY];
      if (area === "local" && c && MODES.includes(c.newValue)) mode = c.newValue;
    });
  } catch (_) {}

  async function handle(m, mine) {
    if (mine !== session || !m) return;
    if (!CC.staff.has(m.sender_id)) {
      try { await CC.loadStaff(); } catch (_) {}
    }
    let room = null;
    try { room = await CC.getRoom(m.room_id); } catch (_) {}
    if (mine !== session) return;
    const ev = {
      m,
      room,
      sender: CC.staff.get(m.sender_id) || null,
      own: m.sender_id === user.id,
      mentioned: Array.isArray(m.mentions) && m.mentions.includes(user.id)
    };
    messageFns.forEach((fn) => { try { fn(ev); } catch (_) {} });
  }

  N.start = (opts) => {
    N.stop();
    sb = opts.sb;
    user = opts.user;
    const mine = ++session;
    setStatus("connecting");
    CC.loadStaff().catch(() => {});
    channel = sb.channel("inbox-" + user.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        queue = queue.then(() => handle(payload.new, mine)).catch(() => {});
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_members", filter: "user_id=eq." + user.id }, (payload) => {
        memberFns.forEach((fn) => { try { fn(payload.new); } catch (_) {} });
      })
      .subscribe((st) => {
        if (mine !== session) return;
        if (st === "SUBSCRIBED") setStatus("ok");
        else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") setStatus("warn");
        else if (st === "CLOSED") setStatus("closed");
      });
  };

  N.stop = () => {
    session++;
    if (channel && sb) { try { sb.removeChannel(channel); } catch (_) {} }
    channel = null;
    setStatus("idle");
  };
})();
