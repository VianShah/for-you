// The couple server: everything a diary phone needs, checked against the couple's secret.
// Every request: POST { action, ... } with headers x-couple (the couple id) and x-auth (a secret
// derived from the couple's code; only its sha-256 is stored). Contents are encrypted on the phones,
// so nothing here can read a page, a picture or a name.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { sendPush } from "../_shared/webpush.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const BUCKET = "couples";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-couple, x-auth, apikey, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const sha256 = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, "0")).join("");
const ID = /^[a-f0-9]{32}$/;
const okPath = (p: unknown) => typeof p === "string" && /^[\w][\w./-]{0,200}$/.test(p) && !p.includes("..");
const okMedia = (p: unknown) => okPath(p) && (p as string).startsWith("diary/");
const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);

let vapid: { pub: string; priv: string } | null = null;
async function getVapid() {
  if (vapid) return vapid;
  const { data } = await db.from("config").select("key, value").in("key", ["vapid_public", "vapid_private"]);
  const m = Object.fromEntries((data || []).map(r => [r.key, r.value]));
  return (vapid = { pub: m.vapid_public, priv: m.vapid_private });
}
export async function pushTo(couple: string, person: string, payload: Record<string, unknown>) {
  const { data: subs } = await db.from("push_subs").select("*").eq("couple_id", couple).eq("person", person);
  let delivered = 0;
  for (const s of subs || []) {
    try {
      const status = await sendPush(s, payload, await getVapid());
      if (status >= 200 && status < 300) delivered++;
      else if (status === 404 || status === 410) await db.from("push_subs").delete().eq("endpoint", s.endpoint);
    } catch { /* one phone failing doesn't stop the others */ }
  }
  return delivered;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let b: Record<string, any>;
  try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  // A new diary: the phone made the code, and sends only what's derived from it. Needs an unused invite.
  if (b.action === "create") {
    if (!ID.test(b.cid) || !/^[a-f0-9]{64}$/.test(b.authHash) || typeof b.meta !== "string" || b.meta.length > 20000) return json({ error: "bad request" }, 400);
    const token = typeof b.invite === "string" ? b.invite.slice(0, 80) : "";
    const { data: inv } = token ? await db.from("invites").update({ used_at: new Date().toISOString() }).eq("token", token).is("used_at", null).select("label") : { data: null };
    if (!inv?.length) return json({ error: "This invite link has already been used, or isn't one. Ask for a new one." }, 403);
    const { error } = await db.from("couples").insert({ id: b.cid, auth_hash: b.authHash, label: inv[0].label });
    if (error) {
      await db.from("invites").update({ used_at: null }).eq("token", token); // give the invite back
      return json({ error: error.code === "23505" ? "taken" : error.message }, error.code === "23505" ? 409 : 500);
    }
    await db.from("invites").update({ couple_id: b.cid }).eq("token", token);
    await db.from("docs").insert({ couple_id: b.cid, path: "meta", body: b.meta });
    return json({ ok: true });
  }

  // Everything else needs the couple's secret.
  const cid = req.headers.get("x-couple") || "", auth = req.headers.get("x-auth") || "";
  if (!ID.test(cid) || !auth) return json({ error: "no couple" }, 401);
  const { data: couple } = await db.from("couples").select("auth_hash, rules").eq("id", cid).maybeSingle();
  if (!couple || couple.auth_hash !== await sha256(auth)) return json({ error: "That code doesn't open any diary." }, 401);

  switch (b.action) {
    case "get": { // { path, have } → { version, body } (body left out when the phone already has that version)
      if (!okPath(b.path)) return json({ error: "bad path" }, 400);
      const { data } = await db.from("docs").select("body, version").eq("couple_id", cid).eq("path", b.path).maybeSingle();
      if (!data) return json({ version: 0, body: null });
      return json(b.have === data.version ? { version: data.version, same: true } : data);
    }
    case "put": { // { path, body, version } → saves only if nobody else saved since that version
      if (!okPath(b.path) || b.path === "meta" || typeof b.body !== "string" || b.body.length > 5e6) return json({ error: "bad request" }, 400);
      if (!b.version) {
        const { error } = await db.from("docs").insert({ couple_id: cid, path: b.path, body: b.body, version: 1 });
        return error ? json({ error: "conflict" }, 409) : json({ version: 1 });
      }
      const { data } = await db.from("docs").update({ body: b.body, version: b.version + 1, updated_at: new Date().toISOString() })
        .eq("couple_id", cid).eq("path", b.path).eq("version", b.version).select("version");
      return data?.length ? json({ version: data[0].version }) : json({ error: "conflict" }, 409);
    }
    case "upload": { // { path } → a one-time link the phone uploads the (encrypted) file to
      if (!okMedia(b.path)) return json({ error: "bad path" }, 400);
      const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(`${cid}/${b.path}`, { upsert: true });
      return error ? json({ error: error.message }, 500) : json({ url: data.signedUrl });
    }
    case "remove": { // { paths: [...] }
      const paths = (Array.isArray(b.paths) ? b.paths : []).filter(okMedia).slice(0, 100).map((p: string) => `${cid}/${p}`);
      if (paths.length) await db.storage.from(BUCKET).remove(paths);
      return json({ ok: true });
    }
    case "vapid": return json({ key: (await getVapid()).pub });
    case "rules": return json({ rules: couple.rules || {} }); // goldies set by hand, for this couple only
    case "subscribe": { // { person, endpoint, keys: { p256dh, auth } }
      if (typeof b.endpoint !== "string" || !/^https:\/\//.test(b.endpoint) || !b.keys?.p256dh || !b.keys?.auth) return json({ error: "bad subscription" }, 400);
      const { error } = await db.from("push_subs").upsert({ endpoint: b.endpoint, couple_id: cid, person: clip(b.person, 60), p256dh: b.keys.p256dh, auth: b.keys.auth });
      return error ? json({ error: error.message }, 500) : json({ ok: true });
    }
    case "notify": { // { to, title, body, url, tag } → { delivered }
      const url = /^app\/[\w./#-]*$/.test(b.url || "") ? b.url : "app/";
      const delivered = await pushTo(cid, clip(b.to, 60), { title: clip(b.title, 120) || "Our diary 💌", body: clip(b.body, 300), url, tag: b.tag ? clip(b.tag, 40) : undefined });
      return json({ delivered });
    }
    case "alerts": { // { list: [{ key, at, person, title, body, url }] } replaces all upcoming alerts
      const list = (Array.isArray(b.list) ? b.list : []).slice(0, 20).filter((a: any) => a && a.key && !isNaN(Date.parse(a.at)))
        .map((a: any) => ({ couple_id: cid, key: clip(a.key, 60), at: new Date(a.at).toISOString(), person: clip(a.person, 60), title: clip(a.title, 120), body: clip(a.body, 300), url: /^app\/[\w./#-]*$/.test(a.url || "") ? a.url : "app/" }));
      await db.from("alerts").delete().eq("couple_id", cid);
      if (list.length) await db.from("alerts").insert(list);
      return json({ ok: true });
    }
  }
  return json({ error: "unknown action" }, 400);
});
