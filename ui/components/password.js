(() => {
  "use strict";
  const CC = (globalThis.CC = globalThis.CC || {});
  CC.views = CC.views || {};

  function friendly(error) {
    const msg = String(error && error.message || "").toLowerCase();
    if (msg.includes("different from the old")) return "Password harus berbeda dari yang lama.";
    if (msg.includes("reauthentication") || msg.includes("session")) return "Masuk ulang lalu coba lagi.";
    if (msg.includes("fetch") || msg.includes("network")) return "Tidak dapat terhubung ke server.";
    if (msg.includes("password")) return "Password tidak memenuhi syarat.";
    return "Gagal mengganti password.";
  }

  CC.views.password = (el, ctx) => {
    el.innerHTML = `
      <form class="login" novalidate>
        <div class="login-logo" aria-hidden="true">CC</div>
        <h2 class="form-title">Ganti password</h2>
        <div class="notice" role="alert" hidden></div>
        <label>Password baru<input type="password" name="password" autocomplete="new-password" required></label>
        <label>Ulangi password<input type="password" name="password2" autocomplete="new-password" required></label>
        <button type="submit" class="primary"><span class="spinner" aria-hidden="true"></span><span class="label">Simpan</span></button>
        <button type="button" class="link-btn leave"></button>
      </form>`;

    const form = el.querySelector("form");
    const notice = el.querySelector(".notice");
    const btn = el.querySelector("button.primary");
    const leave = el.querySelector(".leave");
    const passEl = form.querySelector("[name=password]");
    const pass2El = form.querySelector("[name=password2]");
    leave.textContent = ctx.forced ? "Keluar" : "Batal";

    let disposed = false;
    let changed = false;

    function showNotice(text, kind) {
      notice.textContent = text;
      notice.className = "notice " + (kind || "error");
      notice.hidden = !text;
      if (text && (kind || "error") === "error") {
        notice.classList.remove("shake");
        void notice.offsetWidth;
        notice.classList.add("shake");
      }
    }

    function setBusy(busy) {
      btn.disabled = busy;
      btn.classList.toggle("busy", busy);
    }

    leave.addEventListener("click", async () => {
      if (!ctx.forced) return ctx.onDone && ctx.onDone();
      leave.disabled = true;
      try { await ctx.sb.auth.signOut({ scope: "local" }); } catch (_) {}
      CC.staff.clear();
      CC.rooms.clear();
      ctx.onAuth(true);
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const password = passEl.value;
      if (!changed) {
        if (password.length < 8) return showNotice("Password minimal 8 karakter.", "error");
        if (password !== pass2El.value) return showNotice("Password tidak sama.", "error");
      }
      showNotice("");
      setBusy(true);
      try {
        if (!changed) {
          const { error } = await ctx.sb.auth.updateUser({ password });
          if (disposed) return;
          if (error) { setBusy(false); return showNotice(friendly(error), "error"); }
          changed = true;
        }
        const done = await ctx.sb.rpc("finish_password_change");
        if (disposed) return;
        if (done.error) { setBusy(false); return showNotice("Password diganti, status belum tersimpan.", "error"); }
        passEl.value = "";
        pass2El.value = "";
        if (ctx.forced) ctx.onAuth(true);
        else if (ctx.onDone) ctx.onDone("Password diganti.");
      } catch (err) {
        if (!disposed) { setBusy(false); showNotice(friendly(err), "error"); }
      }
    });

    return () => { disposed = true; };
  };
})();
