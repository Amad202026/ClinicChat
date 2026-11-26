import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGIT = "23456789";
const ALPHABET = UPPER + LOWER + DIGIT;
const PASSWORD_LENGTH = 12;
const POOL_SIZE = 5;

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function text(value: unknown, max: number) {
  return String(value ?? "").slice(0, max);
}

function randomIndex(size: number) {
  const limit = Math.floor(0x100000000 / size) * size;
  const buffer = new Uint32Array(1);
  while (true) {
    crypto.getRandomValues(buffer);
    if (buffer[0] < limit) return buffer[0] % size;
  }
}

function makePassword() {
  while (true) {
    let out = "";
    for (let i = 0; i < PASSWORD_LENGTH; i++) out += ALPHABET[randomIndex(ALPHABET.length)];
    if ([...out].some((c) => UPPER.includes(c)) && [...out].some((c) => LOWER.includes(c)) && [...out].some((c) => DIGIT.includes(c))) {
      return out;
    }
  }
}

async function runPool<T>(items: T[], worker: (item: T) => Promise<void>) {
  let next = 0;
  const lanes = Array.from({ length: Math.min(POOL_SIZE, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await worker(items[index]);
    }
  });
  await Promise.all(lanes);
}

function resolveKey(primaryEnv: string, jsonListEnv: string) {
  const direct = Deno.env.get(primaryEnv) ?? "";
  if (direct) return direct;
  try {
    const parsed = JSON.parse(Deno.env.get(jsonListEnv) ?? "{}");
    if (parsed && typeof parsed.default === "string" && parsed.default) return parsed.default as string;
    const first = Object.values(parsed).find((v) => typeof v === "string" && v.length > 0);
    if (typeof first === "string") return first;
  } catch (_) {}
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Metode tidak didukung." }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const publishableKey = resolveKey("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS");
  const secretKey = resolveKey("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS");
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!url || !publishableKey || !secretKey) {
    return reply({ error: "Konfigurasi server belum lengkap." }, 500);
  }
  if (!token) return reply({ error: "Sesi tidak valid." }, 401);

  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const adminClient = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: authData, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !authData.user) {
    return reply({ error: "Sesi tidak valid: " + (authError?.message ?? "user tidak ditemukan") }, 401);
  }

  // Baca profil menggunakan userClient (punya izin RLS ke baris miliknya sendiri)
  const { data: actor, error: actorError } = await userClient.from("profiles")
    .select("id, is_admin, is_active")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (actorError) {
    return reply({ error: "Gagal cek profil admin: " + actorError.message }, 403);
  }
  if (!actor || !actor.is_admin || !actor.is_active) {
    return reply({ error: "Akses hanya untuk admin (" + authData.user.email + ")." }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (_) {
    return reply({ error: "Permintaan tidak valid." }, 400);
  }

  const action = text(body.action, 30);

  if (action === "sync") {
    if (!Array.isArray(body.rows) || body.rows.length > 500) {
      return reply({ error: "Maksimal 500 baris." }, 400);
    }

    const rows = body.rows.map((r) => {
      const row = (r ?? {}) as Record<string, unknown>;
      return {
        email: text(row.email, 400),
        staff_code: text(row.staff_code, 400),
        full_name: text(row.full_name, 400),
        role: text(row.role, 400)
      };
    });

    const preview = await adminClient.rpc("import_roster", { p_rows: rows, p_apply: false, p_sync: true });
    if (preview.error) {
      const detail = [preview.error.message, preview.error.details, preview.error.hint].filter(Boolean).join(" | ");
      return reply({ error: detail || "Preview gagal." }, 400);
    }

    const deleted: string[] = [];
    const created: Array<{ email: string; full_name: string; staff_code: string | null; password: string }> = [];
    const failed: Array<{ email: string; step: string; reason: string }> = [];

    const planned = (Array.isArray(preview.data.delete_users) ? preview.data.delete_users : []) as Array<{ id: string; email: string }>;
    if (planned.length) {
      const { data: protectedRows } = await adminClient.from("profiles")
        .select("id")
        .in("id", planned.map((p) => p.id))
        .eq("is_admin", true);
      const blocked = new Set((protectedRows ?? []).map((p: { id: string }) => p.id));
      blocked.add(actor.id);
      await runPool(planned.filter((p) => !blocked.has(p.id)), async (target) => {
        const { error } = await adminClient.auth.admin.deleteUser(target.id);
        if (error) failed.push({ email: target.email, step: "hapus", reason: error.message });
        else deleted.push(target.email);
      });
    }

    const applied = await adminClient.rpc("import_roster", { p_rows: rows, p_apply: true, p_sync: true });
    if (applied.error) {
      const detail = [applied.error.message, applied.error.details, applied.error.hint].filter(Boolean).join(" | ");
      return reply({ error: detail || "Apply gagal.", deleted, failed }, 400);
    }

    const info = new Map<string, { full_name: string; staff_code: string | null }>();
    for (const r of applied.data.rows as Array<{ email: string; full_name: string; staff_code: string | null; status: string }>) {
      if (r.status !== "gagal" && r.status !== "hapus") info.set(r.email, { full_name: r.full_name, staff_code: r.staff_code });
    }

    const emails = (Array.isArray(applied.data.create_emails) ? applied.data.create_emails : []) as string[];
    await runPool(emails, async (email) => {
      const password = makePassword();
      const { data, error } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) {
        failed.push({ email, step: "buat", reason: error ? error.message : "gagal" });
        return;
      }
      const flag = await adminClient.from("profiles").update({ must_change_password: true }).eq("id", data.user.id);
      if (flag.error) failed.push({ email, step: "tandai", reason: flag.error.message });
      const known = info.get(email);
      created.push({
        email,
        full_name: known ? known.full_name : "",
        staff_code: known ? known.staff_code : null,
        password
      });
    });

    created.sort((a, b) => a.email.localeCompare(b.email));
    return reply({ ok: true, report: applied.data, created, deleted, failed });
  }

  if (action === "delete_account") {
    const email = text(body.email, 254).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return reply({ error: "Email tidak valid." }, 400);

    const { data: target } = await adminClient.from("profiles")
      .select("id, is_admin")
      .eq("email", email)
      .maybeSingle();

    if (target) {
      if (target.id === actor.id) return reply({ error: "Akun sendiri tidak bisa dihapus." }, 400);
      if (target.is_admin) return reply({ error: "Cabut status admin dulu." }, 400);
      const { error } = await adminClient.auth.admin.deleteUser(target.id);
      if (error) return reply({ error: error.message }, 500);
    }

    const removed = await adminClient.from("staff_roster").delete().eq("email", email);
    if (removed.error) return reply({ error: removed.error.message }, 500);
    return reply({ ok: true });
  }

  if (action === "reset_password") {
    let userId = text(body.user_id, 80);
    const requestId = text(body.request_id, 80);

    if (requestId) {
      const { data: request } = await adminClient.from("password_reset_requests")
        .select("user_id, status")
        .eq("id", requestId)
        .maybeSingle();
      if (!request || request.status !== "pending") return reply({ error: "Permintaan tidak ditemukan." }, 404);
      userId = request.user_id;
    }
    if (!userId) return reply({ error: "Akun tidak valid." }, 400);
    if (userId === actor.id) return reply({ error: "Gunakan Ganti password di Profile." }, 400);

    const { data: target } = await adminClient.from("profiles")
      .select("id, full_name, email")
      .eq("id", userId)
      .maybeSingle();
    if (!target) return reply({ error: "Akun tidak ditemukan." }, 404);

    const password = makePassword();
    const updated = await adminClient.auth.admin.updateUserById(target.id, { password });
    if (updated.error) return reply({ error: updated.error.message }, 500);

    const flag = await adminClient.from("profiles").update({ must_change_password: true }).eq("id", target.id);
    if (flag.error) return reply({ error: flag.error.message }, 500);

    await adminClient.from("password_reset_requests")
      .update({ status: "approved", resolved_at: new Date().toISOString(), resolved_by: actor.id })
      .eq("user_id", target.id)
      .eq("status", "pending");

    return reply({ ok: true, password, full_name: target.full_name, email: target.email });
  }

  return reply({ error: "Aksi tidak dikenal." }, 400);
});