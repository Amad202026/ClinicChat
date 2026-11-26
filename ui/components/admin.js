(() => {
  "use strict";
  const CC = (globalThis.CC = globalThis.CC || {});
  CC.views = CC.views || {};
  const h = CC.h;

  const STATUS = { baru: "Baru", ubah: "Diubah", sama: "Sama", gagal: "Gagal", hapus: "Dihapus" };
  const PARSE_ERRORS = {
    size: "File terlalu besar.",
    rows: "Maksimal 500 baris.",
    read: "File tidak bisa dibaca."
  };
  const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const MAX_FILE = 2 * 1024 * 1024;
  const MAX_SHOWN = 300;
  const PANES = ["staff", "import", "reset"];

  function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function parseXlsx(request) {
    return CC.bg({ type: "xlsx:parse", ...request }).then((res) => (res.ok ? res : { ok: false, error: res.error || "read" }));
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  function button(cls, label, type) {
    const b = h("button", cls, label);
    b.type = type || "button";
    return b;
  }

  async function downloadCredentials(items) {
    const rows = [["Nama", "Kode staff", "Email", "Password sementara"]];
    for (const c of items) rows.push([c.full_name, c.staff_code || "", c.email, c.password]);
    const res = await CC.bg({ type: "xlsx:build", sheet: "Akun", rows });
    if (res.ok) CC.saveBase64(res.data, "akun-clinicchat.xlsx", XLSX_MIME);
    return res.ok;
  }

  function credentialCard(items, title) {
    const card = h("div", "cred-card");
    const head = h("div", "cred-head");
    const close = button("btn-xs", "Tutup");
    close.addEventListener("click", () => card.remove());
    head.append(h("strong", null, title), close);
    card.append(head);

    const list = h("div", "cred-list");
    for (const c of items) {
      const row = h("div", "cred-row");
      const info = h("span", "cred-info");
      info.append(h("strong", null, c.full_name || c.email), h("small", null, c.email));
      const code = h("code", "cred-pass", c.password);
      const copy = button("btn-xs", "Salin");
      copy.addEventListener("click", async () => {
        copy.textContent = (await CC.copyText(c.password)) ? "Tersalin" : "Gagal";
        setTimeout(() => { copy.textContent = "Salin"; }, 1500);
      });
      row.append(info, code, copy);
      list.append(row);
    }
    card.append(list);

    if (items.length > 1) {
      const tools = h("div", "cred-tools");
      const all = button("btn-xs", "Salin semua");
      all.addEventListener("click", async () => {
        const text = items.map((c) => c.email + "\t" + c.password).join("\n");
        all.textContent = (await CC.copyText(text)) ? "Tersalin" : "Gagal";
        setTimeout(() => { all.textContent = "Salin semua"; }, 1500);
      });
      const file = button("btn-xs", "Unduh XLSX");
      file.addEventListener("click", async () => {
        file.disabled = true;
        const done = await downloadCredentials(items);
        file.textContent = done ? "Terunduh" : "Gagal";
        setTimeout(() => { file.textContent = "Unduh XLSX"; file.disabled = false; }, 1500);
      });
      tools.append(all, file);
      card.append(tools);
    }
    return card;
  }

  CC.views.admin = (el, ctx) => {
    const { sb, user } = ctx;
    let cleanup = null;

    if (!ctx.profile || !ctx.profile.is_admin) {
      el.append(h("div", "center", "Akses ditolak"));
      return null;
    }

    el.innerHTML = `
      <div class="pane">
        <div class="admin-head">
          <div class="seg" style="--n:3;--i:0">
            <span class="seg-ink"></span>
            <button type="button" class="on" data-p="staff">Staff</button>
            <button type="button" data-p="import">Impor</button>
            <button type="button" data-p="reset">Reset</button>
          </div>
        </div>
        <div class="admin-body"></div>
      </div>`;
    const seg = el.querySelector(".seg");
    const segButtons = [...seg.querySelectorAll("button")];
    const resetTab = segButtons.find((b) => b.dataset.p === "reset");
    const body = el.querySelector(".admin-body");
    let gone = false;

    function setPending(n) {
      resetTab.textContent = n > 0 ? "Reset " + n : "Reset";
    }

    async function refreshPending() {
      const { data } = await sb.from("password_reset_requests").select("id").eq("status", "pending");
      if (!gone && data) setPending(data.length);
    }

    function show(name) {
      if (cleanup) { try { cleanup(); } catch (_) {} cleanup = null; }
      segButtons.forEach((b) => b.classList.toggle("on", b.dataset.p === name));
      seg.style.setProperty("--i", String(PANES.indexOf(name)));
      body.replaceChildren();
      const box = h("div", "admin-pane view");
      body.append(box);
      const make = name === "staff" ? staffPane : name === "import" ? importPane : resetPane;
      cleanup = make(box) || null;
    }
    segButtons.forEach((b) => b.addEventListener("click", () => show(b.dataset.p)));

    function notifier(node) {
      return (text, kind) => {
        node.textContent = text || "";
        node.className = "notice " + (kind || "error");
        if (text && (kind || "error") === "error") node.classList.add("shake");
        node.hidden = !text;
      };
    }

    function staffPane(box) {
      box.innerHTML = `
        <div class="admin-tools">
          <input type="search" class="picker-q" placeholder="Cari staff" aria-label="Cari staff" autocomplete="off">
          <div class="admin-sum"></div>
        </div>
        <div class="notice" role="alert" hidden></div>
        <div class="cred-host"></div>
        <div class="list"></div>`;
      const q = box.querySelector(".picker-q");
      const sum = box.querySelector(".admin-sum");
      const list = box.querySelector(".list");
      const credHost = box.querySelector(".cred-host");
      const say = notifier(box.querySelector(".notice"));
      let items = [];
      let dead = false;

      async function act(p, patch) {
        const { error } = await sb.rpc("admin_set_staff", { p_user: p.id, p_active: patch.active, p_admin: patch.admin });
        if (dead) return;
        if (error) say(CC.errLabel(error, "Perubahan gagal"));
        else say("");
        load();
      }

      async function call(action, payload) {
        const res = await CC.callAdmin(action, payload);
        if (dead) return null;
        if (!res.ok) { say(res.message); return null; }
        say("");
        return res.data;
      }

      function paint() {
        const term = q.value.trim().toLowerCase();
        const shown = items.filter((x) => !term || (x.name + " " + x.role + " " + x.email + " " + x.code).toLowerCase().includes(term));
        const registered = items.filter((x) => x.p).length;
        const off = items.filter((x) => x.p && !x.p.is_active).length;
        sum.textContent = registered + " terdaftar · " + (items.length - registered) + " belum daftar" + (off ? " · " + off + " nonaktif" : "");
        list.replaceChildren();
        if (!shown.length) { list.append(h("div", "empty", "Staff tidak ditemukan")); return; }
        for (const x of shown) {
          const row = h("div", "member-row staff-row");
          const text = h("span", "pick-name");
          text.append(h("strong", null, x.name), h("small", null, x.role + (x.email ? " · " + x.email : "")));
          row.append(CC.avatarEl(x.p || { full_name: x.name }, "mention-av"), text);
          if (!x.p) row.append(h("span", "role-chip pending", "Belum daftar"));
          else {
            if (x.p.id === user.id) row.append(h("span", "role-chip", "Anda"));
            if (x.p.is_admin) row.append(h("span", "role-chip owner", "Admin"));
            if (x.p.must_change_password) row.append(h("span", "role-chip pending", "Password sementara"));
            if (!x.p.is_active) row.append(h("span", "role-chip off", "Nonaktif"));
          }
          const actions = h("div", "staff-actions");
          if (x.p && x.p.id !== user.id) {
            const toggle = button("btn-xs" + (x.p.is_active ? " danger" : ""), x.p.is_active ? "Nonaktifkan" : "Aktifkan");
            if (x.p.is_active) CC.confirmClick(toggle, () => act(x.p, { active: false, admin: null }));
            else toggle.addEventListener("click", () => act(x.p, { active: true, admin: null }));
            const adm = button("btn-xs", x.p.is_admin ? "Cabut admin" : "Jadikan admin");
            CC.confirmClick(adm, () => act(x.p, { active: null, admin: !x.p.is_admin }));
            const reset = button("btn-xs", "Reset password");
            CC.confirmClick(reset, async () => {
              const d = await call("reset_password", { user_id: x.p.id });
              if (!d) return;
              credHost.replaceChildren(credentialCard([{ full_name: d.full_name, email: d.email, password: d.password }], "Password sementara"));
              load();
              refreshPending();
            });
            actions.append(toggle, adm, reset);
          }
          const isSelf = x.p && x.p.id === user.id;
          if (!isSelf && !(x.p && x.p.is_admin) && x.email) {
            const del = button("btn-xs danger", "Hapus");
            CC.confirmClick(del, async () => {
              if (await call("delete_account", { email: x.email })) load();
            });
            actions.append(del);
          }
          if (actions.childElementCount) row.append(actions);
          list.append(row);
        }
      }

      async function load() {
        try {
          const [pr, rr] = await Promise.all([
            sb.from("profiles").select("id, staff_code, full_name, role, email, is_admin, is_active, must_change_password, avatar_v"),
            sb.from("staff_roster").select("email, staff_code, full_name, role")
          ]);
          if (pr.error) throw pr.error;
          if (rr.error) throw rr.error;
          if (dead) return;
          CC.avatars.sync(pr.data).catch(() => {});
          const byEmail = new Map(pr.data.filter((p) => p.email).map((p) => [p.email.toLowerCase(), p]));
          items = pr.data.map((p) => ({ p, name: p.full_name, role: p.role, email: p.email || "", code: p.staff_code || "" }));
          for (const r of rr.data) {
            if (!byEmail.has(r.email)) items.push({ p: null, name: r.full_name, role: r.role, email: r.email, code: r.staff_code || "" });
          }
          items.sort((a, b) => a.name.localeCompare(b.name, "id"));
          paint();
        } catch (err) {
          if (!dead) say(CC.errLabel(err, "Gagal memuat staff"));
        }
      }

      q.addEventListener("input", paint);
      load();
      return () => { dead = true; };
    }

    function resetPane(box) {
      box.innerHTML = `
        <div class="admin-tools"><div class="admin-sum"></div></div>
        <div class="notice" role="alert" hidden></div>
        <div class="cred-host"></div>
        <div class="list"></div>`;
      const sum = box.querySelector(".admin-sum");
      const list = box.querySelector(".list");
      const credHost = box.querySelector(".cred-host");
      const say = notifier(box.querySelector(".notice"));
      let dead = false;

      function paint(requests, people) {
        sum.textContent = requests.length + " permintaan";
        setPending(requests.length);
        list.replaceChildren();
        if (!requests.length) { list.append(h("div", "empty", "Tidak ada permintaan")); return; }
        for (const r of requests) {
          const who = people.get(r.user_id) || { full_name: "Staff", role: "", email: "" };
          const row = h("div", "member-row staff-row");
          const text = h("span", "pick-name");
          text.append(h("strong", null, who.full_name), h("small", null, (who.email || who.role) + " · " + CC.formatListTime(r.requested_at)));
          row.append(CC.avatarEl({ id: r.user_id, full_name: who.full_name }, "mention-av"), text);
          const actions = h("div", "staff-actions");
          const approve = button("btn-xs primary-xs", "Setujui");
          approve.addEventListener("click", async () => {
            approve.disabled = true;
            const res = await CC.callAdmin("reset_password", { request_id: r.id });
            if (dead) return;
            if (!res.ok) { approve.disabled = false; return say(res.message); }
            say("");
            credHost.replaceChildren(credentialCard([{ full_name: res.data.full_name, email: res.data.email, password: res.data.password }], "Password sementara"));
            load();
          });
          const reject = button("btn-xs danger", "Tolak");
          CC.confirmClick(reject, async () => {
            const { error } = await sb.rpc("reject_reset_request", { p_id: r.id });
            if (dead) return;
            if (error) say(CC.errLabel(error, "Gagal menolak"));
            else say("");
            load();
          });
          actions.append(approve, reject);
          row.append(actions);
          list.append(row);
        }
      }

      async function load() {
        try {
          const rq = await sb.from("password_reset_requests").select("id, user_id, requested_at")
            .eq("status", "pending").order("requested_at", { ascending: true });
          if (rq.error) throw rq.error;
          const ids = [...new Set(rq.data.map((r) => r.user_id))];
          const people = new Map();
          if (ids.length) {
            const pr = await sb.from("profiles").select("id, full_name, role, email, avatar_v").in("id", ids);
            if (pr.error) throw pr.error;
            for (const p of pr.data) people.set(p.id, p);
            CC.avatars.sync(pr.data).catch(() => {});
          }
          if (!dead) paint(rq.data, people);
        } catch (err) {
          if (!dead) say(CC.errLabel(err, "Gagal memuat permintaan"));
        }
      }

      load();
      return () => { dead = true; };
    }

    function importPane(box) {
      box.innerHTML = `
        <div class="scroll">
          <div class="admin-import">
            <div class="notice" role="alert" hidden></div>
            <div class="import-actions">
              <button type="button" class="primary from-folder"><span class="spinner" aria-hidden="true"></span><span class="label">Impor dari folder</span></button>
              <button type="button" class="secondary pick-file">Pilih file…</button>
              <input type="file" accept=".xlsx" hidden>
            </div>
            <div class="report" hidden></div>
          </div>
        </div>`;
      const say = notifier(box.querySelector(".notice"));
      const folderBtn = box.querySelector(".from-folder");
      const pickBtn = box.querySelector(".pick-file");
      const input = box.querySelector("input[type=file]");
      const report = box.querySelector(".report");
      let dead = false;
      let busy = false;

      function setBusy(on) {
        busy = on;
        folderBtn.disabled = on;
        pickBtn.disabled = on;
        folderBtn.classList.toggle("busy", on);
      }

      function chip(kind, label, n) {
        return h("span", "rep-chip " + kind, label + " " + n);
      }

      function rowList(rows, lines) {
        const wrap = h("div", "rep-list");
        rows.slice(0, MAX_SHOWN).forEach((r) => {
          const row = h("div", "rep-row");
          const info = h("span", "rep-info");
          const where = r.row ? "baris " + (lines[r.row - 1] || r.row) : "";
          info.append(h("strong", null, r.email || "(tanpa email)"), h("small", null, [r.message, where].filter(Boolean).join(" · ")));
          row.append(h("span", "rep-chip " + r.status, STATUS[r.status] || r.status), info);
          wrap.append(row);
        });
        return wrap;
      }

      function renderPreview(res, lines, onApply) {
        report.replaceChildren();
        const c = res.counts;
        const chips = h("div", "rep-chips");
        for (const key of ["baru", "ubah", "sama", "gagal", "hapus"]) chips.append(chip(key, STATUS[key], c[key]));
        chips.append(chip("akun", "Akun dibuat", c.akun));
        report.append(h("div", "rep-title", "Pratinjau"), chips);
        if (res.delete_blocked && c.gagal > 0) report.append(h("div", "rep-note", "Penghapusan ditunda: ada baris gagal"));
        report.append(rowList(res.rows, lines));
        if (res.rows.length > MAX_SHOWN) report.append(h("div", "rep-more", "+" + (res.rows.length - MAX_SHOWN) + " baris lainnya"));
        const usable = c.baru + c.ubah + c.sama + c.hapus;
        if (usable > 0) {
          const apply = button("primary", c.hapus > 0 ? "Terapkan · hapus " + c.hapus : "Terapkan");
          const go = () => { apply.disabled = true; onApply(); };
          if (c.hapus > 0) CC.confirmClick(apply, go);
          else apply.addEventListener("click", go);
          report.append(apply);
        }
        report.hidden = false;
      }

      function renderFinal(result, lines) {
        report.replaceChildren();
        const rep = result.report;
        const chips = h("div", "rep-chips");
        chips.append(chip("akun", "Akun dibuat", result.created.length), chip("hapus", "Dihapus", result.deleted.length));
        if (result.failed.length) chips.append(chip("gagal", "Gagal", result.failed.length));
        report.append(h("div", "rep-title", "Impor selesai"), chips);
        if (rep.delete_blocked && rep.counts.gagal > 0) report.append(h("div", "rep-note", "Penghapusan ditunda: ada baris gagal"));
        if (result.created.length) report.append(credentialCard(result.created, "Password sementara"));
        if (result.failed.length) {
          const wrap = h("div", "rep-list");
          for (const f of result.failed) {
            const row = h("div", "rep-row");
            const info = h("span", "rep-info");
            info.append(h("strong", null, f.email), h("small", null, f.step + " · " + f.reason));
            row.append(h("span", "rep-chip gagal", "Gagal"), info);
            wrap.append(row);
          }
          report.append(wrap);
        }
        report.append(rowList(rep.rows, lines));
        report.hidden = false;
        refreshPending();
      }

      async function run(request) {
        if (busy) return;
        setBusy(true);
        say("");
        report.hidden = true;
        const parsed = await parseXlsx(request);
        if (dead) return;
        if (!parsed.ok) { setBusy(false); return say(PARSE_ERRORS[parsed.error] || PARSE_ERRORS.read); }
        if (!parsed.rows.length) { setBusy(false); return say("Tidak ada data staff di file."); }
        const payload = parsed.rows.map((r) => ({ email: r.email, staff_code: r.staff_code, full_name: r.full_name, role: r.role }));
        const lines = parsed.rows.map((r) => r.line);
        const preview = await sb.rpc("import_roster", { p_rows: payload, p_apply: false, p_sync: true });
        if (dead) return;
        setBusy(false);
        if (preview.error) return say(CC.errLabel(preview.error, "Impor gagal"));
        renderPreview(preview.data, lines, async () => {
          setBusy(true);
          const done = await CC.callAdmin("sync", { rows: payload });
          if (dead) return;
          setBusy(false);
          if (!done.ok) { report.hidden = true; return say(done.message); }
          renderFinal(done.data, lines);
        });
      }

      folderBtn.addEventListener("click", () => run({ source: "folder" }));
      pickBtn.addEventListener("click", () => input.click());
      input.addEventListener("change", async () => {
        const file = input.files && input.files[0];
        input.value = "";
        if (!file) return;
        if (file.size > MAX_FILE) return say(PARSE_ERRORS.size);
        try {
          run({ source: "file", data: toBase64(await readFile(file)) });
        } catch (_) {
          say(PARSE_ERRORS.read);
        }
      });
      return () => { dead = true; };
    }

    refreshPending();
    show("staff");
    return () => {
      gone = true;
      if (cleanup) { try { cleanup(); } catch (_) {} }
    };
  };
})();
