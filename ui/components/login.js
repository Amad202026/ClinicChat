(() => {
  "use strict";
  const CC = (globalThis.CC = globalThis.CC || {});
  CC.views = CC.views || {};

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function friendly(error) {
    const msg = String(error && error.message || "").toLowerCase();
    if (error && error.status === 429) return "Terlalu banyak percobaan. Tunggu sebentar.";
    if (msg.includes("invalid login")) return "Email atau password salah.";
    if (msg.includes("not confirmed")) return "Email belum dikonfirmasi.";
    if (msg.includes("fetch") || msg.includes("network")) return "Tidak dapat terhubung ke server.";
    return "Login gagal.";
  }

  CC.views.login = (el, ctx) => {
    el.innerHTML = `
      <form class="login" novalidate>
        <div class="login-logo" aria-hidden="true">CC</div>
        <div class="notice" role="alert" hidden></div>
        <label>Email<input type="email" name="email" autocomplete="username" required></label>
        <label class="pass-field">Password<input type="password" name="password" autocomplete="current-password" required></label>
        <button type="submit" class="primary"><span class="spinner" aria-hidden="true"></span><span class="label">Masuk</span></button>
        <button type="button" class="link-btn toggle">Lupa password?</button>
      </form>`;

    const form = el.querySelector("form");
    const notice = el.querySelector(".notice");
    const btn = el.querySelector("button.primary");
    const label = btn.querySelector(".label");
    const toggle = el.querySelector(".toggle");
    const emailEl = form.querySelector("[name=email]");
    const passEl = form.querySelector("[name=password]");
    const passField = form.querySelector(".pass-field");

    let forgot = false;
    let disposed = false;

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

    function setForgot(on) {
      forgot = on;
      passField.hidden = on;
      label.textContent = on ? "Kirim permintaan" : "Masuk";
      toggle.textContent = on ? "Kembali" : "Lupa password?";
      showNotice("");
    }

    toggle.addEventListener("click", () => setForgot(!forgot));
    if (ctx.notice) showNotice(ctx.notice, "error");

    async function login(email, password) {
      setBusy(true);
      try {
        const { error } = await ctx.sb.auth.signInWithPassword({ email, password });
        if (disposed) return;
        passEl.value = "";
        if (error) showNotice(friendly(error), "error");
        else { ctx.onAuth(true); return; }
      } catch (err) {
        if (!disposed) showNotice(friendly(err), "error");
      }
      if (!disposed) setBusy(false);
    }

    async function request(email) {
      setBusy(true);
      try {
        const { error } = await ctx.sb.rpc("request_password_reset", { p_email: email });
        if (disposed) return;
        if (error) showNotice(CC.errLabel(error, "Permintaan gagal"), "error");
        else showNotice("Permintaan terkirim ke admin.", "ok");
      } catch (_) {
        if (!disposed) showNotice("Tidak dapat terhubung ke server.", "error");
      }
      if (!disposed) setBusy(false);
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = emailEl.value.trim();
      if (forgot) {
        if (!EMAIL_RE.test(email)) return showNotice("Isi email yang valid.", "error");
        return request(email);
      }
      const password = passEl.value;
      if (!email || !password) return showNotice("Isi email dan password.", "error");
      showNotice("");
      login(email, password);
    });

    return () => { disposed = true; };
  };
})();
