// Web push with nothing but WebCrypto: RFC 8291 (aes128gcm payload encryption) + RFC 8292 (VAPID).
// The VAPID keys live in the config table: vapid_public (base64url, 65-byte point) and vapid_private (base64url d).
const te = new TextEncoder();
export const b64u = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0; for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8));
}

export async function encryptPush(sub: { p256dh: string; auth: string }, text: string) {
  const uaPub = unb64u(sub.p256dh), auth = unb64u(sub.auth);
  const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, kp.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(te.encode("WebPush: info\0"), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(te.encode(text), new Uint8Array([2]))));
  const head = new Uint8Array(21);
  head.set(salt); new DataView(head.buffer).setUint32(16, 4096); head[20] = asPub.length;
  return concat(head, asPub, ct);
}

export async function vapidHeader(endpoint: string, pub: string, priv: string) {
  const p = unb64u(pub);
  const key = await crypto.subtle.importKey("jwk",
    { kty: "EC", crv: "P-256", d: priv, x: b64u(p.subarray(1, 33)), y: b64u(p.subarray(33, 65)), ext: true },
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "https://vianshah.github.io/for-you/" })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${pub}`;
}

// Returns the push service's status: 201 delivered, 404/410 the phone unsubscribed.
export async function sendPush(sub: { endpoint: string; p256dh: string; auth: string }, payload: unknown, vapid: { pub: string; priv: string }) {
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      TTL: "86400", Urgency: "high", "Content-Type": "application/octet-stream", "Content-Encoding": "aes128gcm",
      Authorization: await vapidHeader(sub.endpoint, vapid.pub, vapid.priv),
    },
    body: await encryptPush(sub, JSON.stringify(payload)),
  });
  return res.status;
}
