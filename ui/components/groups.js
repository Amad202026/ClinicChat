(() => {
  "use strict";
  const CC = (globalThis.CC = globalThis.CC || {});
  CC.views = CC.views || {};
  const h = CC.h;

  CC.views.groups = (el, ctx) => {
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

    function roomView(pane, room) {
      return CC.chatRoom(pane, ctx, {
        room,
        header: {
          title: room.name,
          memberCount: true,
          onBack: () => go(listView),
          onInfo: () => go((p) => infoView(p, room))
        }
      });
    }

    async function openRoom(id) {
      let room = null;
      try { room = await CC.getRoom(id); } catch (_) {}
      if (disposed) return;
      if (room && room.type === "group") go((p) => roomView(p, room));
      else go(listView);
    }

    function listView(pane) {
      pane.innerHTML = `
        <div class="list-head"><h3>Grup</h3><button type="button" class="btn-sm new">+ Buat</button></div>
        <div class="list" role="list"></div>`;
      const list = pane.querySelector(".list");
      let rooms = [];
      let timer = null;
      let dead = false;

      function paintRows() {
        list.replaceChildren();
        if (!rooms.length) {
          list.append(h("div", "empty", "Belum ada grup"));
          return;
        }
        for (const r of rooms) {
          const u = CC.unread.get(r.id);
          const row = h("button", "row");
          row.type = "button";
          row.setAttribute("role", "listitem");
          const main = h("span", "row-main");
          main.append(h("strong", null, r.name), h("small", null, r.description || ""));
          const side = h("span", "row-side");
          side.append(h("small", null, CC.formatListTime(r.last_message_at)));
          if (u.n) side.append(h("span", "unread" + (u.tag ? " tag" : ""), u.n > 99 ? "99+" : String(u.n)));
          row.append(h("span", "row-av", CC.initial(r.name)), main, side);
          row.addEventListener("click", () => go((p) => roomView(p, r)));
          list.append(row);
        }
      }

      async function load() {
        try {
          const { data: mine, error } = await sb.from("room_members").select("room_id").eq("user_id", user.id);
          if (error) throw error;
          const ids = mine.map((m) => m.room_id);
          let found = [];
          if (ids.length) {
            const res = await sb.from("rooms").select(CC.ROOM_COLS).in("id", ids).eq("type", "group");
            if (res.error) throw res.error;
            found = res.data;
          }
          if (dead) return;
          found.forEach((r) => CC.rooms.set(r.id, r));
          rooms = found.sort((a, b) => String(b.last_message_at || "").localeCompare(String(a.last_message_at || "")) || a.name.localeCompare(b.name, "id"));
          paintRows();
        } catch (_) {
          if (!dead) { list.replaceChildren(h("div", "empty", "Gagal memuat grup")); }
        }
      }

      const schedule = () => { clearTimeout(timer); timer = setTimeout(load, 250); };
      pane.querySelector(".new").addEventListener("click", () => go(createView));
      const offs = [
        CC.unread.onChange(() => { if (rooms.length) paintRows(); }),
        CC.notifications.onMessage((ev) => { if (ev.room && ev.room.type === "group") schedule(); }),
        CC.notifications.onMembership(schedule)
      ];
      load();
      return () => { dead = true; clearTimeout(timer); offs.forEach((f) => f()); };
    }

    function createView(pane) {
      pane.innerHTML = `
        <div class="sub-head"><button type="button" class="icon-btn back" aria-label="Kembali">‹</button><strong>Grup baru</strong></div>
        <form class="form scroll">
          <div class="notice" role="alert" hidden></div>
          <label>Nama grup<input name="name" maxlength="80" autocomplete="off"></label>
          <label>Deskripsi<textarea name="desc" rows="2" maxlength="300"></textarea></label>
          <div class="section-title">Anggota <span class="count-chip">0</span></div>
          <div class="picker-slot"></div>
          <button type="submit" class="primary"><span class="spinner" aria-hidden="true"></span><span class="label">Buat grup</span></button>
        </form>`;
      const form = pane.querySelector("form");
      const notice = pane.querySelector(".notice");
      const btn = pane.querySelector(".primary");
      const counter = pane.querySelector(".count-chip");
      let dead = false;
      const picker = CC.staffPicker({
        exclude: new Set([user.id]),
        multi: true,
        onChange: (ids) => { counter.textContent = String(ids.length); }
      });
      pane.querySelector(".picker-slot").append(picker.el);
      CC.loadStaff().then(() => { if (!dead) picker.refresh(); }).catch(() => {});
      pane.querySelector(".back").addEventListener("click", () => go(listView));

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = form.elements.name.value.trim();
        if (!name) {
          notice.textContent = "Nama grup wajib diisi.";
          notice.className = "notice error shake";
          notice.hidden = false;
          return;
        }
        btn.disabled = true; btn.classList.add("busy");
        const { data, error } = await sb.rpc("create_group", {
          p_name: name,
          p_description: form.elements.desc.value.trim() || null,
          p_members: picker.selected()
        });
        if (dead) return;
        if (error || !data) {
          btn.disabled = false; btn.classList.remove("busy");
          notice.textContent = "Grup gagal dibuat.";
          notice.className = "notice error shake";
          notice.hidden = false;
          return;
        }
        openRoom(data);
      });
      return () => { dead = true; };
    }

    function infoView(pane, room) {
      pane.innerHTML = `
        <div class="sub-head"><button type="button" class="icon-btn back" aria-label="Kembali">‹</button><strong>Info grup</strong></div>
        <div class="scroll">
          <div class="notice" role="alert" hidden></div>
          <div class="meta-slot"></div>
          <div class="section-title members-title"></div>
          <div class="members"></div>
          <div class="actions"></div>
        </div>`;
      const notice = pane.querySelector(".notice");
      const metaSlot = pane.querySelector(".meta-slot");
      const membersEl = pane.querySelector(".members");
      const actions = pane.querySelector(".actions");
      const title = pane.querySelector(".members-title");
      let dead = false;
      let current = room;

      const say = (text, kind) => {
        notice.textContent = text;
        notice.className = "notice " + (kind || "error");
        if (kind !== "ok") notice.classList.add("shake");
        notice.hidden = !text;
      };
      pane.querySelector(".back").addEventListener("click", () => go((p) => roomView(p, CC.rooms.get(room.id) || current)));

      async function act(fn, failText) {
        const res = await fn();
        if (dead) return;
        if (res && res.error) say(failText);
        else say("");
        await load();
      }

      function paint(mem) {
        const me = mem.find((m) => m.user_id === user.id);
        const manager = me.member_role !== "member";
        const owner = me.member_role === "owner";

        metaSlot.replaceChildren();
        if (manager) {
          const f = h("form", "form");
          f.innerHTML = `
            <label>Nama grup<input name="name" maxlength="80" autocomplete="off"></label>
            <label>Deskripsi<textarea name="desc" rows="2" maxlength="300"></textarea></label>
            <button type="submit" class="secondary">Simpan</button>`;
          f.elements.name.value = current.name || "";
          f.elements.desc.value = current.description || "";
          f.addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = f.elements.name.value.trim();
            if (!name) return say("Nama grup wajib diisi.");
            const res = await sb.from("rooms").update({ name, description: f.elements.desc.value.trim() || null }).eq("id", current.id);
            if (dead) return;
            if (res.error) return say("Perubahan gagal disimpan.");
            current = { ...current, name, description: f.elements.desc.value.trim() || null };
            CC.rooms.set(current.id, current);
            say("Tersimpan.", "ok");
          });
          metaSlot.append(f);
        } else {
          const box = h("div", "about");
          box.append(h("h3", null, current.name), h("p", null, current.description || ""));
          metaSlot.append(box);
        }

        title.textContent = "Anggota (" + mem.length + ")";
        membersEl.replaceChildren();
        const rank = { owner: 0, admin: 1, member: 2 };
        const sorted = [...mem].sort((a, b) => rank[a.member_role] - rank[b.member_role]
          || String((CC.staff.get(a.user_id) || {}).full_name).localeCompare(String((CC.staff.get(b.user_id) || {}).full_name), "id"));
        for (const m of sorted) {
          const p = CC.staff.get(m.user_id) || { full_name: "Staff", role: "" };
          const row = h("div", "member-row");
          const text = h("span", "pick-name");
          text.append(h("strong", null, p.full_name + (m.user_id === user.id ? " (Anda)" : "")), h("small", null, p.role));
          row.append(CC.avatarEl({ ...p, id: m.user_id }, "mention-av"), text);
          if (m.member_role !== "member") row.append(h("span", "role-chip " + m.member_role, m.member_role === "owner" ? "Pemilik" : "Admin"));
          const canRemove = m.member_role !== "owner" && m.user_id !== user.id && (owner || (manager && m.member_role === "member"));
          if (owner && m.member_role !== "owner") {
            const toggle = h("button", "btn-xs", m.member_role === "admin" ? "Cabut admin" : "Jadikan admin");
            toggle.type = "button";
            toggle.addEventListener("click", () => act(
              () => sb.rpc("set_member_role", { p_room: current.id, p_user: m.user_id, p_role: m.member_role === "admin" ? "member" : "admin" }),
              "Peran gagal diubah."
            ));
            row.append(toggle);
          }
          if (canRemove) {
            const rm = h("button", "btn-xs danger", "Keluarkan");
            rm.type = "button";
            CC.confirmClick(rm, () => act(
              () => sb.from("room_members").delete().eq("room_id", current.id).eq("user_id", m.user_id),
              "Anggota gagal dikeluarkan."
            ));
            row.append(rm);
          }
          membersEl.append(row);
        }

        actions.replaceChildren();
        if (manager) {
          const add = h("button", "secondary", "Tambah anggota");
          add.type = "button";
          const slot = h("div", "add-slot");
          slot.hidden = true;
          const confirm = h("button", "primary", "Tambahkan");
          confirm.type = "button";
          confirm.disabled = true;
          const picker = CC.staffPicker({
            exclude: new Set(mem.map((m) => m.user_id)),
            multi: true,
            onChange: (ids) => { confirm.disabled = !ids.length; confirm.textContent = ids.length ? "Tambahkan (" + ids.length + ")" : "Tambahkan"; }
          });
          slot.append(picker.el, confirm);
          add.addEventListener("click", () => { slot.hidden = !slot.hidden; });
          confirm.addEventListener("click", () => {
            const ids = picker.selected();
            if (!ids.length) return;
            confirm.disabled = true;
            act(() => sb.from("room_members").insert(ids.map((id) => ({ room_id: current.id, user_id: id }))), "Anggota gagal ditambahkan.");
          });
          actions.append(add, slot);
        }
        if (!owner) {
          const leave = h("button", "secondary danger", "Keluar dari grup");
          leave.type = "button";
          CC.confirmClick(leave, async () => {
            const res = await sb.from("room_members").delete().eq("room_id", current.id).eq("user_id", user.id);
            if (dead) return;
            if (res.error) return say("Gagal keluar dari grup.");
            go(listView);
          });
          actions.append(leave);
        }
      }

      async function load() {
        try {
          await CC.loadStaff();
          const [r, m] = await Promise.all([
            sb.from("rooms").select(CC.ROOM_COLS).eq("id", room.id).maybeSingle(),
            sb.from("room_members").select("user_id, member_role").eq("room_id", room.id)
          ]);
          if (dead) return;
          if (!r.data || !m.data || !m.data.some((x) => x.user_id === user.id)) return go(listView);
          current = r.data;
          CC.rooms.set(current.id, current);
          paint(m.data);
        } catch (_) {
          if (!dead) say("Gagal memuat info grup.");
        }
      }

      load();
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
