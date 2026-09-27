// ตรวจ Firebase ID token ของเว็บแลปหลัก (projectId จาก env FIREBASE_PROJECT_ID)
//
// ทำไมไม่ใช้ firebase-admin: เราต้องการแค่ "verify token" อย่างเดียว (ไม่ยุ่ง Firestore/FCM)
// แต่ firebase-admin ลากมาเกือบ 50MB + boot ช้า ซึ่งเจ็บมากบน Render free tier ที่ต้องตื่นจากโหมดหลับ
// การ verify ID token คือ verify JWT RS256 ด้วยกุญแจสาธารณะของ Google — ทำเองด้วย node:crypto ได้ ไม่มี dep เพิ่ม
//
// สิ่งที่ตรวจ (เหมือนที่ firebase-admin ทำ):
//   alg=RS256 · ลายเซ็นตรงกับกุญแจสาธารณะของ Google ตาม kid
//   iss = https://securetoken.google.com/<projectId> · aud = <projectId>
//   exp ยังไม่หมด · iat/auth_time ไม่ใช่อนาคต · sub (uid) ไม่ว่าง
const crypto = require('crypto');

// endpoint กุญแจสาธารณะของระบบ token ฝั่ง Firebase (override ได้เพื่อเทสต์)
const JWK_URL =
  process.env.FIREBASE_JWK_URL ||
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const SKEW_SEC = 60; // เผื่อนาฬิกาเครื่องเหลื่อมกัน

const PROJECT_ID = () => (process.env.FIREBASE_PROJECT_ID || '').trim();
const enabled = () => !!PROJECT_ID();

// ---------- แคชกุญแจ ----------
// Google หมุนกุญแจเป็นระยะ และบอกอายุมาใน Cache-Control: max-age
let _cache = { keys: null, until: 0 };
async function getKeys(force = false) {
  if (!force && _cache.keys && Date.now() < _cache.until) return _cache.keys;
  const res = await fetch(JWK_URL);
  if (!res.ok) throw new Error('ดึงกุญแจสาธารณะของ Google ไม่สำเร็จ (' + res.status + ')');
  const body = await res.json();
  const keys = new Map();
  for (const jwk of body.keys || []) {
    try { keys.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' })); } catch {}
  }
  if (keys.size === 0) throw new Error('ไม่พบกุญแจสาธารณะในคำตอบของ Google');
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1] || 3600);
  _cache = { keys, until: Date.now() + Math.max(60, maxAge) * 1000 };
  return keys;
}

const b64urlJson = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

/**
 * ตรวจ ID token แล้วคืนข้อมูลผู้ใช้ — โยน Error ถ้าไม่ผ่าน (ข้อความเป็นไทย ใช้โชว์ได้เลย)
 * @returns {Promise<{uid:string,email:string,name:string,emailVerified:boolean,claims:object}>}
 */
async function verifyIdToken(token) {
  const projectId = PROJECT_ID();
  if (!projectId) throw new Error('ยังไม่ได้ตั้ง FIREBASE_PROJECT_ID บนเซิร์ฟเวอร์');
  if (typeof token !== 'string' || token.length < 20) throw new Error('ไม่มี token');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('รูปแบบ token ไม่ถูกต้อง');
  const [h64, p64, s64] = parts;

  let header, payload;
  try { header = b64urlJson(h64); payload = b64urlJson(p64); }
  catch { throw new Error('อ่าน token ไม่ออก'); }

  if (header.alg !== 'RS256') throw new Error('token ใช้อัลกอริทึมที่ไม่รองรับ');
  if (!header.kid) throw new Error('token ไม่มี kid');

  // หากุญแจตาม kid — ถ้าไม่เจอ อาจเพิ่งหมุนกุญแจ ลองดึงใหม่อีกรอบ
  let keys = await getKeys();
  let key = keys.get(header.kid);
  if (!key) { keys = await getKeys(true); key = keys.get(header.kid); }
  if (!key) throw new Error('ไม่พบกุญแจที่ตรงกับ token (อาจเป็น token ปลอม)');

  const ok = crypto
    .createVerify('RSA-SHA256')
    .update(`${h64}.${p64}`)
    .verify(key, Buffer.from(s64, 'base64url'));
  if (!ok) throw new Error('ลายเซ็น token ไม่ถูกต้อง');

  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) throw new Error('token ไม่ได้ออกให้โปรเจกต์นี้');
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('ผู้ออก token ไม่ถูกต้อง');
  if (!payload.sub || typeof payload.sub !== 'string') throw new Error('token ไม่มีรหัสผู้ใช้');
  if (!(payload.exp > now - SKEW_SEC)) throw new Error('token หมดอายุแล้ว — กลับไปเว็บแลปแล้วกดเข้าใหม่');
  if (payload.iat > now + SKEW_SEC) throw new Error('เวลาบน token ผิดปกติ');
  if (payload.auth_time && payload.auth_time > now + SKEW_SEC) throw new Error('เวลาบน token ผิดปกติ');

  return {
    uid: payload.sub,
    email: (payload.email || '').trim(),
    name: (payload.name || payload.display_name || '').trim(),
    emailVerified: !!payload.email_verified,
    claims: payload,
  };
}

module.exports = { verifyIdToken, enabled, projectId: PROJECT_ID, JWK_URL };
