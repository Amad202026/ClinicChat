(() => {
  "use strict";
  const CC = (globalThis.CC = globalThis.CC || {});
  CC.views = CC.views || {};

  const MODES = ["all", "mentions", "off"];

  CC.views.profile = (el, ctx) => {
    const p = ctx.profile;
    let disposeInner = null;
    let disposed = false;

    function render(flash) {
      if (disposeInner) { try { disposeInner(); } catch (_) {} disposeInner = null; }
      el.innerHTML = `
        <div class="profile">
          <div class="avatar-slot"></div>
          <div class="avatar-actions">
            <button type="button" class="btn-xs pick-photo">Ubah foto</button>
            <button type="button" class="btn-xs danger drop-photo" hidden>Hapus foto</button>
            <input type="file" accept="image/*" hidden>
          </div>
          <div class="notice" role="alert" hidden></div>
          <h2 class="p-name"></h2>
          <p class="p-role"></p>
          <dl>
            <dt>Kode staff</dt><dd class="p-code"></dd>
            <dt>Email</dt><dd class="p-email"></dd>
          </dl>
          <div class="setting">
            <span class="set-label">Notifikasi desktop</span>
            <div class="seg" style="--n:3;--i:0">
              <span class="seg-ink"></span>
              <button type="button" data-m="all">Semua</button>
              <button type="button" data-m="mentions">@ Saya</button>
              <button type="button" data-m="off">Mati</button>
            </div>
          </div>
          <button type="button" class="secondary change-pass">Ganti password</button>
          <button type="button" class="secondary logout">Keluar</button>
        </div>`;

      const slot = el.querySelector(".avatar-slot");
      slot.append(CC.avatarEl(p, "avatar"));
      el.querySelector(".p-name").textContent = p.full_name;
      el.querySelector(".p-role").textContent = p.role;
      el.querySelector(".p-code").textContent = p.staff_code;
      el.querySelector(".p-email").textContent = p.email || ctx.user.email || "-";

      const notice = el.querySelector(".notice");
      function say(text, kind) {
        notice.textContent = text || "";
        notice.className = "notice " + (kind || "error");
        notice.hidden = !text;
      }
      if (flash) say(flash, "ok");

      const pick = el.querySelector(".pick-photo");
      const drop = el.querySelector(".drop-photo");
      const input = el.querySelector("input[type=file]");
      const paintDrop = () => { drop.hidden = !CC.avatars.get(p.id); };
      CC.avatars.ready().then(() => { if (!disposed) paintDrop(); });
      paintDrop();

      async function store(value) {
        const { data, error } = await ctx.sb.from("profiles").update({ avatar: value }).eq("id", p.id).select("avatar_v").maybeSingle();
        if (disposed) return;
        if (error || !data) return say(CC.errLabel(error || {}, "Foto gagal disimpan"));
        CC.avatars.set(p.id, data.avatar_v, value);
        paintDrop();
        say("");
      }

      pick.addEventListener("click", () => input.click());
      input.addEventListener("change", async () => {
        const file = input.files && input.files[0];
        input.value = "";
        if (!file) return;
        pick.disabled = true;
        try {
          await store(await CC.avatars.prepare(file));
        } catch (_) {
          if (!disposed) say("Foto tidak bisa dipakai.");
        }
        if (!disposed) pick.disabled = false;
      });
      CC.confirmClick(drop, async () => {
        drop.disabled = true;
        await store(null);
        if (!disposed) drop.disabled = false;
      });

      const seg = el.querySelector(".seg");
      const buttons = [...seg.querySelectorAll("button")];
      function paint() {
        const current = CC.notifications.getMode();
        buttons.forEach((b) => b.classList.toggle("on", b.dataset.m === current));
        seg.style.setProperty("--i", String(Math.max(0, MODES.indexOf(current))));
      }
      buttons.forEach((b) => b.addEventListener("click", () => {
        CC.notifications.setMode(b.dataset.m);
        paint();
      }));
      paint();
      const settle = setTimeout(paint, 150);

      el.querySelector(".change-pass").addEventListener("click", () => {
        if (disposeInner) { try { disposeInner(); } catch (_) {} }
        disposeInner = CC.views.password(el, { ...ctx, forced: false, onDone: (text) => render(text) });
      });

      const out = el.querySelector(".logout");
      out.addEventListener("click", async () => {
        out.disabled = true;
        try { await ctx.sb.auth.signOut({ scope: "local" }); } catch (_) {}
        CC.staff.clear();
        CC.rooms.clear();
        ctx.onAuth(true);
      });

      disposeInner = () => clearTimeout(settle);
    }

    render();
    return () => {
      disposed = true;
      if (disposeInner) disposeInner();
    };
  };
})();
