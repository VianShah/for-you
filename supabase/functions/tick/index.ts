// Runs every few minutes (pg_cron): sends the notifications the phones scheduled ("Goldiee is crying"),
// then forgets them. Holds no secrets of the diary: the alert texts were written by the phones.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { sendPush } from "../_shared/webpush.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

Deno.serve(async req => {
  const { data: cfg } = await db.from("config").select("key, value").in("key", ["vapid_public", "vapid_private", "tick_secret"]);
  const m = Object.fromEntries((cfg || []).map(r => [r.key, r.value]));
  if (!m.tick_secret || req.headers.get("x-tick") !== m.tick_secret) return new Response("no", { status: 401 });
  // No private key yet: keep the alerts for later instead of dropping them unsent.
  if (!m.vapid_public || !m.vapid_private) return new Response("waiting for the VAPID private key");
  const { data: due } = await db.from("alerts").select("*").lte("at", new Date().toISOString()).limit(200);
  if (!due?.length) return new Response("nothing due");
  const vapid = { pub: m.vapid_public, priv: m.vapid_private };
  let sent = 0;
  for (const a of due) {
    // Too late to matter (the phones were off for hours)? Just drop it.
    if (Date.now() - Date.parse(a.at) < 3 * 3600e3) {
      const { data: subs } = await db.from("push_subs").select("*").eq("couple_id", a.couple_id).eq("person", a.person);
      for (const s of subs || []) {
        try {
          const status = await sendPush(s, { title: a.title, body: a.body, url: a.url, tag: a.key }, vapid);
          if (status >= 200 && status < 300) sent++;
          else if (status === 404 || status === 410) await db.from("push_subs").delete().eq("endpoint", s.endpoint);
        } catch { /* keep going */ }
      }
    }
    await db.from("alerts").delete().eq("couple_id", a.couple_id).eq("key", a.key);
  }
  return new Response(`sent ${sent}`);
});
