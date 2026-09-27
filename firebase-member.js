// เช็คว่าผู้ใช้อยู่ใน collection `member` ของเว็บแลปหลัก (Firestore) → ให้เป็น admin ของคลัง
//
// ทำไมต้องยิง Firestore: ID token บอกได้แค่ "คนนี้คือใคร" (uid/email) แต่ "เป็นสมาชิกไหม"
// อยู่ในฐานข้อมูลของเว็บหลัก ต้องไปอ่านเอง
//
// อ่านได้ 2 ทาง (เลือกอัตโนมัติ):
//   1. ใช้ ID token ของผู้ใช้เอง (ค่าเริ่มต้น ไม่ต้องตั้งอะไรเพิ่ม)
//      — ใช้ได้ถ้า security rules ของเว็บหลักยอมให้ผู้ใช้ที่ login แล้วอ่าน collection member
//   2. ใช้ service account (ตั้ง env FIREBASE_SERVICE_ACCOUNT = JSON ทั้งก้อน)
//      — อ่านได้เสมอ ไม่ขึ้นกับ rules ใช้เมื่อทางที่ 1 โดนปฏิเสธ
//
// ถ้าเช็คไม่ได้ (rules ปฏิเสธ/เน็ตล่ม) = ไม่ให้ admin แต่ยัง login เป็น staff ได้ตามปกติ
const crypto = require('crypto');

const FIRESTORE_URL = process.env.FIRESTORE_URL || 'https://firestore.googleapis.com';
const COLLECTION = (process.env.FIREBASE_MEMBER_COLLECTION || 'member').trim();
const TIMEOUT_MS = 6000;
// จำผลไว้ 10 นาที (ไม่ยิง Firestore ทุกครั้งที่เข้าเว็บ) — ตั้ง 0 เพื่อเช็คสดทุกครั้ง
const CACHE_MS = Number(process.env.FIREBASE_MEMBER_CACHE_MS ?? 10 * 60_000);

// ชื่อฟิลด์ที่อาจใช้เก็บ uid / อีเมล ในเอกสาร member (ลองทีละอัน — ไม่ต้องรู้โครงสร้างล่วงหน้า)
const UID_FIELDS = (process.env.FIREBASE_MEMBER_UID_FIELD || 'firebase_uid,uid,user_id,userId,id')
  .split(',').map((x) => x.trim()).filter(Boolean);
const EMAIL_FIELDS = (process.env.FIREBASE_MEMBER_EMAIL_FIELD || 'email,Email,mail')
  .split(',').map((x) => x.trim()).filter(Boolean);

const projectId = () => (process.env.FIREBASE_PROJECT_ID || '').trim();
const docsUrl = () => `${FIRESTORE_URL}/v1/projects/${projectId()}/databases/(default)/documents`;
const enabled = () => !!projectId() && process.env.FIREBASE_MEMBER_CHECK !== 'off';

// ---------- service account (ทางที่ 2) ----------
let _sa = null, _saToken = { value: '', until: 0 };
function serviceAccount() {
  if (_sa !== null) return _sa;
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  try { _sa = raw ? JSON.parse(raw) : false; }
  catch { console.error('FIREBASE_SERVICE_ACCOUNT ไม่ใช่ JSON ที่ถูกต้อง — ข้ามไปใช้ ID token ของผู้ใช้แทน'); _sa = false; }
  return _sa;
}
// แลก service account เป็น access token ของ Google (JWT bearer flow) — แคชไว้เกือบ 1 ชม.
async function serviceAccountToken() {
  const sa = serviceAccount();
  if (!sa) return '';
  if (_saToken.value && Date.now() < _saToken.until) return _saToken.value;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  })}`;
  const sig = crypto.createSign('RSA-SHA256').update(body).sign(sa.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${body}.${sig}` }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('แลก service account เป็น access token ไม่สำเร็จ: ' + (j.error_description || j.error || res.status));
  _saToken = { value: j.access_token, until: Date.now() + 55 * 60_000 };
  return j.access_token;
}

// ---------- เรียก Firestore ----------
async function call(url, authToken, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { authorization: 'Bearer ' + authToken, 'content-type': 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return res;
}

// หาเอกสารใน collection member ที่ตรงกับคนนี้ — ลองหลายแบบเพราะไม่รู้ว่าเว็บหลักเก็บยังไง
//   1. รหัสเอกสาร = uid   2. รหัสเอกสาร = อีเมล   3. query ฟิลด์ที่เก็บ uid   4. query ฟิลด์ที่เก็บอีเมล
async function lookup(uid, email, authToken) {
  const base = docsUrl();
  for (const id of [uid, email].filter(Boolean)) {
    const r = await call(`${base}/${COLLECTION}/${encodeURIComponent(id)}`, authToken);
    if (r.ok) return { found: true, how: 'รหัสเอกสาร = ' + (id === uid ? 'uid' : 'อีเมล') };
    if (r.status === 403) throw new Error('rules ของเว็บหลักไม่ยอมให้อ่าน collection ' + COLLECTION);
    if (r.status !== 404) throw new Error('Firestore ตอบ ' + r.status);
  }
  const tries = [...UID_FIELDS.map((f) => [f, uid]), ...(email ? EMAIL_FIELDS.map((f) => [f, email]) : [])];
  for (const [field, value] of tries) {
    const r = await call(base + ':runQuery', authToken, {
      method: 'POST',
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: COLLECTION }],
          where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } },
          limit: 1,
        },
      }),
    });
    if (r.status === 403) throw new Error('rules ของเว็บหลักไม่ยอมให้ query collection ' + COLLECTION);
    if (!r.ok) continue; // ฟิลด์นี้ไม่มีจริง/query ไม่ได้ → ลองชื่อถัดไป
    const rows = await r.json();
    if (Array.isArray(rows) && rows.some((x) => x.document)) return { found: true, how: `ฟิลด์ ${field}` };
  }
  return { found: false, how: '' };
}

const _cache = new Map(); // uid -> { member, until }

/**
 * อยู่ใน collection member ไหม (ผล cache 10 นาที)
 * @param {{uid:string,email:string}} info ข้อมูลจาก ID token ที่ตรวจแล้ว
 * @param {string} idToken ID token ของผู้ใช้ (ใช้อ่าน Firestore ในนามเขาเอง)
 * @returns {Promise<boolean|null>} true=เป็นสมาชิก · false=ไม่ใช่ · **null=เช็คไม่ได้** (ให้คงสิทธิ์เดิมไว้)
 */
async function isMember(info, idToken) {
  if (!enabled()) return null; // ปิดการเช็ค = ไม่ตัดสินอะไร ปล่อยให้ role เดิม/claim ว่ากันไป
  const hit = CACHE_MS > 0 && _cache.get(info.uid);
  if (hit && Date.now() < hit.until) return hit.member;

  let member;
  try {
    // มี service account = ใช้เลย (ไม่ติด rules) ไม่มีก็ใช้ token ของผู้ใช้
    const authToken = (await serviceAccountToken()) || idToken;
    const r = await lookup(info.uid, info.email, authToken);
    member = r.found;
    if (member) console.log(`SSO: ${info.email || info.uid} อยู่ใน ${COLLECTION} (${r.how}) → ให้สิทธิ์ admin`);
  } catch (e) {
    // เช็คไม่ได้ (rules ปฏิเสธ/เน็ตล่ม) → คืน null = "ไม่รู้" คนเดิมจะได้ไม่ถูกลดสิทธิ์เพราะ Firestore มีปัญหา
    // และไม่ cache ผลพลาด จะได้ลองใหม่ครั้งหน้า
    console.warn('SSO: เช็ค collection ' + COLLECTION + ' ไม่สำเร็จ (' + e.message + ') — คงสิทธิ์เดิมไว้ก่อน');
    return null;
  }
  if (CACHE_MS > 0) _cache.set(info.uid, { member, until: Date.now() + CACHE_MS });
  return member;
}

module.exports = { isMember, enabled, collection: () => COLLECTION };
