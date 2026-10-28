// Sends web-push notifications (RFC 8291 encryption + RFC 8292 VAPID), with nothing but Node's crypto.
// The subscriptions live in diary/push.json (encrypted with the diary's key); VAPID_PRIVATE is a repo secret.
import crypto from "node:crypto";

export const VAPID_PUBLIC = "BAtscJGZ_lyQig8866R2cuR_-rotxNMLBw9GgsimXVw9IxlsPV4yqLRpI803yI0iyF17qMhYEWMvL4k4nQLu5qU";
const b64u = b => Buffer.from(b).toString("base64url");
const hkdf = (salt, ikm, info, len) => Buffer.from(crypto.hkdfSync("sha256", ikm, salt, info, len));

function vapidJwt(audience, privateD) {
  const pub = Buffer.from(VAPID_PUBLIC, "base64url");
  const key = crypto.createPrivateKey({ format: "jwk", key: { kty: "EC", crv: "P-256", d: privateD, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) } });
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64u(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "https://vianshah.github.io/for-you/" }));
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64u(sig)}`;
}

// aes128gcm content encoding, one record.
export function encrypt(sub, text) {
  const uaPub = Buffer.from(sub.keys.p256dh, "base64url"), auth = Buffer.from(sub.keys.auth, "base64url");
  const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
  const asPub = ecdh.getPublicKey(), shared = ecdh.computeSecret(uaPub);
  const ikm = hkdf(auth, shared, Buffer.concat([Buffer.from("WebPush: info\0"), uaPub, asPub]), 32);
  const salt = crypto.randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const c = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(text), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const head = Buffer.alloc(21); salt.copy(head, 0); head.writeUInt32BE(4096, 16); head[20] = asPub.length;
  return Buffer.concat([head, asPub, ct]);
}

// Returns the HTTP status (201 = delivered to Apple/Google; 404/410 = that phone unsubscribed).
export async function sendPush(sub, payload, privateD) {
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      TTL: "86400", Urgency: "high", "Content-Type": "application/octet-stream", "Content-Encoding": "aes128gcm",
      Authorization: `vapid t=${vapidJwt(new URL(sub.endpoint).origin, privateD)}, k=${VAPID_PUBLIC}`,
    },
    body: encrypt(sub, JSON.stringify(payload)),
  });
  return res.status;
}
