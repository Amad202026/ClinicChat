(() => {
  "use strict";
  const CC = (globalThis.CC = globalThis.CC || {});
  CC.views = CC.views || {};
  const h = CC.h;

  CC.views.personal = (el, ctx) => {
    const { sb, user } = ctx;
    let cleanup = null;
    let disposed = false;

    function go(build) {
      if (cleanup) { try { cleanup(); } catch (_) {} cleanup = null; }
      if (disposed) return;
      el.replaceChildren();
      const pane = h("div", "pane view");
      el.append(pane);
      cleanup = build(pane) || null;
    }

    function roomView(pane, room, otherId) {
      const other = CC.staff.get(otherId) || { full_name: "Staff", role: "" };
      return CC.chatRoom(pane, ctx, {
        room,
        compact: true,
        header: { title: other.full_name, subtitle: other.role, onBack: () => go(listView) }
      });
    }

    async function otherOf(roomId) {
      const { data } = await sb.from("room_members").select("user_id").eq("room_id", roomId);
      const row = (data || []).find((m) => m.user_id !== user.id);
      return row ? row.user_id : null;
    }

    async function openRoom(id) {
      let room = null;
      let other = null;
      try {
        await CC.loadStaff();
        room = await CC.getRoom(id);
        if (room && room.type === "direct") other = await otherOf(id);
      } catch (_) {}
      if (disposed) return;
      if (room && other) go((p) => roomView(p, room, other));
      else go(listView);
    }

    function listView(pane) {
      pane.innerHTML = `
        <div class="list-head"><h3>Personal</h3><button type="button" class="btn-sm new">+ Baru</button></div>
        <div class="list" role="list"></div>`;
      const list = pane.querySelector(".list");
      let items = [];
      let timer = null;
      let dead = false;

      function paintRows() {
        list.replaceChildren();
        if (!items.length) {
          list.append(h("div", "empty", "Belum ada percakapan"));
          return;
        }
        for (const it of items) {
          const p = CC.staff.get(it.other) || { full_name: "Staff", role: "" };
          const u = CC.unread.get(it.room.id);
          const row = h("button", "row");
          row.type = "button";
          row.setAttribute("role", "listitem");
          const main = h("span", "row-main");
          main.append(h("strong", null, p.full_name), h("small", null, p.role));
          const side = h("span", "row-side");
          side.append(h("small", null, CC.formatListTime(it.room.last_message_at)));
          if (u.n) side.append(h("span", "unread" + (u.tag ? " tag" : ""), u.n > 99 ? "99+" : String(u.n)));
          row.append(CC.avatarEl({ ...p, id: it.other }, "row-av"), main, side);
          row.addEventListener("click", () => go((pp) => roomView(pp, it.room, it.other)));
          list.append(row);
        }
      }

      async function load() {
        try {
          await CC.loadStaff();
          const mine = await sb.from("room_members").select("room_id").eq("user_id", user.id);
          if (mine.error) throw mine.error;
          const ids = mine.data.map((m) => m.room_id);
          let rooms = [];
          let members = [];
          if (ids.length) {
            const r = await sb.from("rooms").select(CC.ROOM_COLS).in("id", ids).eq("type", "direct");
            if (r.error) throw r.error;
            rooms = r.data;
            if (rooms.length) {
              const m = await sb.from("room_members").select("room_id, user_id").in("room_id", rooms.map((x) => x.id));
              if (m.error) throw m.error;
              members = m.data;
            }
          }
          if (dead) return;
          items = rooms.map((room) => {
            CC.rooms.set(room.id, room);
            const row = members.find((m) => m.room_id === room.id && m.user_id !== user.id);
            return { room, other: row ? row.user_id : null };
          }).filter((x) => x.other)
            .sort((a, b) => String(b.room.last_message_at || "").localeCompare(String(a.room.last_message_at || "")));
          paintRows();
        } catch (_) {
          if (!dead) list.replaceChildren(h("div", "empty", "Gagal memuat percakapan"));
        }
      }

      const schedule = () => { clearTimeout(timer); timer = setTimeout(load, 250); };
      pane.querySelector(".new").addEventListener("click", () => go(newView));
      const offs = [
        CC.unread.onChange(() => { if (items.length) paintRows(); }),
        CC.notifications.onMessage((ev) => { if (ev.room && ev.room.type === "direct") schedule(); }),
        CC.notifications.onMembership(schedule)
      ];
      load();
      return () => { dead = true; clearTimeout(timer); offs.forEach((f) => f()); };
    }

    function newView(pane) {
      pane.innerHTML = `
        <div class="sub-head"><button type="button" class="icon-btn back" aria-label="Kembali">‹</button><strong>Percakapan baru</strong></div>
        <div class="notice" role="alert" hidden></div>
        <div class="picker-slot scroll"></div>`;
      const notice = pane.querySelector(".notice");
      let dead = false;
      let busy = false;
      const picker = CC.staffPicker({
        exclude: new Set([user.id]),
        multi: false,
        onPick: async (id) => {
          if (busy) return;
          busy = true;
          pane.classList.add("busy");
          const { data, error } = await sb.rpc("create_direct_room", { p_other: id });
          if (dead) return;
          if (error || !data) {
            busy = false;
            pane.classList.remove("busy");
            notice.textContent = "Percakapan gagal dibuat.";
            notice.className = "notice error shake";
            notice.hidden = false;
            return;
          }
          openRoom(data);
        }
      });
      pane.querySelector(".picker-slot").append(picker.el);
      CC.loadStaff().then(() => { if (!dead) picker.refresh(); }).catch(() => {});
      pane.querySelector(".back").addEventListener("click", () => go(listView));
      return () => { dead = true; };
    }

    CC.loadStaff().catch(() => {});
    if (ctx.openRoomId) openRoom(ctx.openRoomId);
    else go(listView);
    return () => {
      disposed = true;
      if (cleanup) { try { cleanup(); } catch (_) {} }
    };
  };
})();
