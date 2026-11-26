(() => {
  "use strict";
  const CC = (globalThis.CC = globalThis.CC || {});

  const PAGE = 50;
  const COLS = "id, room_id, sender_id, content, mentions, created_at";
  const STATES = {
    ok: ["ok", "Terhubung"],
    connecting: ["warn", "Menyambung…"],
    idle: ["warn", "Menyambung…"],
    warn: ["warn", "Menyambung ulang…"],
    closed: ["warn", "Koneksi terputus"]
  };

  CC.chatRoom = (el, ctx, opts) => {
    const { sb, user } = ctx;
    const head = opts.header || null;
    let disposed = false, roomId = null, lastTs = null, lastDay = "", sending = false, loaded = false;
    let memberIds = null;
    const seen = new Set();
    const pending = [];

    el.innerHTML = `
      <div class="chat">
        ${head ? `<div class="room-head">
          <button type="button" class="icon-btn back" aria-label="Kembali">‹</button>
          <div class="room-title"><strong></strong><span></span></div>
          <button type="button" class="icon-btn info" aria-label="Info" hidden>i</button>
        </div>` : ""}
        <div class="chat-status"><span class="dot warn"></span><span class="st-text">Menyambung…</span></div>
        <div class="msgs" role="log" aria-live="polite"></div>
        <div class="composer-wrap">
          <div class="mention-menu" role="listbox" hidden></div>
          <form class="composer">
            <textarea rows="1" maxlength="2000" placeholder="Tulis pesan…" aria-label="Tulis pesan"></textarea>
            <button type="submit" class="send" aria-label="Kirim pesan">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>
            </button>
          </form>
        </div>
      </div>`;
    const list = el.querySelector(".msgs");
    const dot = el.querySelector(".dot");
    const stText = el.querySelector(".st-text");
    const form = el.querySelector("form");
    const ta = form.querySelector("textarea");
    const sendBtn = form.querySelector(".send");
    const subtitle = el.querySelector(".room-title span");

    if (head) {
      el.querySelector(".room-title strong").textContent = head.title || "";
      if (subtitle) subtitle.textContent = head.subtitle || "";
      el.querySelector(".back").addEventListener("click", () => head.onBack && head.onBack());
      const info = el.querySelector(".info");
      if (head.onInfo) {
        info.hidden = false;
        info.addEventListener("click", () => head.onInfo());
      }
    }

    const mention = CC.mentions.attach({
      textarea: ta,
      menu: el.querySelector(".mention-menu"),
      meId: user.id,
      getCandidates: () => (memberIds ? [...memberIds].map((id) => CC.staff.get(id)).filter(Boolean) : [...CC.staff.values()])
    });

    const setStatus = (kind, text) => { dot.className = "dot " + kind; stText.textContent = text; };

    function nearBottom() { return list.scrollHeight - list.scrollTop - list.clientHeight < 70; }
    function toBottom(smooth) {
      if (smooth && list.scrollTo) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
      else list.scrollTop = list.scrollHeight;
    }

    function addMessage(m, fresh) {
      if (disposed || !m || seen.has(m.id)) return;
      seen.add(m.id);
      const own = m.sender_id === user.id;
      const tagged = Array.isArray(m.mentions) && m.mentions.includes(user.id);
      const stick = nearBottom() || own;

      const day = CC.formatDay(m.created_at);
      if (day !== lastDay) {
        list.append(CC.h("div", "day", day));
        lastDay = day;
      }

      const row = CC.h("div", "msg " + (own ? "own" : "other") + (tagged && !own ? " mentioned" : "") + (fresh ? " fresh" : ""));
      const who = CC.staff.get(m.sender_id);
      if (!own && !opts.compact) {
        const meta = CC.h("div", "meta");
        const name = who ? who.full_name : m.sender_id ? "Staff" : "Akun dihapus";
        meta.append(CC.avatarEl(who || { full_name: name }, "msg-av"), CC.h("strong", null, name), CC.h("span", null, who ? " · " + who.role : ""));
        row.append(meta);
      }
      const bubble = CC.h("div", "bubble");
      CC.mentions.render(bubble, m.content, m.mentions, user.id);
      const time = CC.h("div", "time", CC.formatTime(m.created_at));
      time.title = new Date(m.created_at).toLocaleString("id-ID");
      row.append(bubble, time);
      list.append(row);

      if (!lastTs || m.created_at > lastTs) lastTs = m.created_at;
      if (stick) toBottom(fresh);
    }

    async function ensureSender(id) {
      if (id && !CC.staff.has(id)) { try { await CC.loadStaff(); } catch (_) {} }
    }

    async function fetchAfter(ts) {
      let q = sb.from("messages").select(COLS)
        .eq("room_id", roomId).order("created_at", { ascending: true }).limit(200);
      if (ts) q = q.gt("created_at", ts);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    }

    async function backfill() {
      if (!roomId || disposed) return;
      try {
        const missed = await fetchAfter(lastTs);
        for (const m of missed) {
          await ensureSender(m.sender_id);
          list.querySelector(".empty")?.remove();
          addMessage(m, true);
        }
      } catch (_) {}
    }

    const offMessage = CC.notifications.onMessage((ev) => {
      if (!loaded) { pending.push(ev.m); return; }
      if (ev.m.room_id !== roomId) return;
      list.querySelector(".empty")?.remove();
      addMessage(ev.m, true);
    });

    let wasOk = false;
    const offStatus = CC.notifications.onStatus((st) => {
      if (disposed) return;
      const [kind, text] = STATES[st] || STATES.warn;
      setStatus(kind, text);
      if (st === "ok" && wasOk && loaded) backfill();
      if (st === "ok") wasOk = true;
    });

    async function loadMembers() {
      try {
        const { data } = await sb.from("room_members").select("user_id").eq("room_id", roomId);
        if (disposed || !data) return;
        memberIds = new Set(data.map((r) => r.user_id));
        if (head && head.memberCount && subtitle) subtitle.textContent = memberIds.size + " anggota";
      } catch (_) {}
    }

    async function init() {
      try {
        const room = opts.room || (await opts.resolveRoom());
        if (disposed) return;
        if (!room) { setStatus("bad", "Ruang tidak ditemukan"); return; }
        roomId = room.id;
        CC.rooms.set(room.id, { ...(CC.rooms.get(room.id) || {}), ...room });
        CC.unread.setViewing(roomId);
        await CC.loadStaff();
        if (room.type !== "lobby") loadMembers();
        const { data, error } = await sb.from("messages").select(COLS)
          .eq("room_id", roomId).order("created_at", { ascending: false }).limit(PAGE);
        if (error) throw error;
        if (disposed) return;
        data.reverse().forEach((m) => addMessage(m, false));
        toBottom(false);
        loaded = true;
        pending.filter((m) => m.room_id === roomId).forEach((m) => addMessage(m, true));
        pending.length = 0;
        if (!list.querySelector(".msg")) list.append(CC.h("div", "empty", "Belum ada pesan"));
        backfill();
      } catch (_) {
        if (!disposed) setStatus("bad", "Gagal memuat pesan");
      }
    }

    async function send() {
      const text = ta.value.replace(/\s+$/, "");
      if (!text.trim() || sending || !roomId) return;
      sending = true; sendBtn.disabled = true;
      sendBtn.classList.add("fly");
      setTimeout(() => sendBtn.classList.remove("fly"), 450);
      try {
        const { data, error } = await sb.from("messages")
          .insert({ room_id: roomId, sender_id: user.id, content: text, mentions: CC.mentions.collect(text, user.id) })
          .select(COLS).single();
        if (error) throw error;
        ta.value = ""; ta.style.height = "auto";
        mention.close();
        list.querySelector(".empty")?.remove();
        addMessage(data, true);
      } catch (_) {
        setStatus("bad", "Pesan gagal terkirim");
      } finally {
        sending = false; sendBtn.disabled = false; ta.focus();
      }
    }

    form.addEventListener("submit", (e) => { e.preventDefault(); send(); });
    ta.addEventListener("keydown", (e) => {
      if (mention.handleKey(e)) return;
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
    });
    ta.addEventListener("input", () => {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 96) + "px";
    });

    init();
    return () => {
      disposed = true;
      offMessage();
      offStatus();
      if (CC.unread.viewing === roomId) CC.unread.setViewing(null);
    };
  };
})();
