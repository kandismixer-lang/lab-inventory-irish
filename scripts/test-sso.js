// เทสต์ SSO ครบวง (รัน: node scripts/test-sso.js)
// มินต์ ID token ด้วยกุญแจของเราเอง + เสิร์ฟ JWK/Firestore ปลอมในเครื่อง แล้วยิงเข้า server จริง
// ไม่แตะ DB จริง (สร้าง DB ชั่วคราวใหม่ทุกครั้ง) และไม่ต้องต่อเน็ต
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'sso-test-'));
const DB = path.join(TMP, 'test-sso.db');
for (const f of [DB, DB + '-wal', DB + '-shm']) { try { fs.unlinkSync(f); } catch {} }

const PROJECT = 'irish-lab';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-kid-1';
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };

const jwkServer = http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'public, max-age=3600');
  res.end(JSON.stringify({ keys: [jwk] }));
});

// Firestore ปลอม: collection member มี 2 แบบ — ผูกด้วยรหัสเอกสาร และผูกด้วยฟิลด์
const MEMBER_DOC_IDS = new Set(['UID_MEMBER_DOC', 'member@irish.ac.th']);
const MEMBER_BY_FIELD = new Set(['UID_MEMBER_FIELD']);
let fsDown = false;
const fsServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (fsDown) { res.statusCode = 500; return res.end('{"error":{"message":"firestore down"}}'); }
    const m = /\/documents\/member\/([^?]+)$/.exec(req.url);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (id.startsWith('UID_403')) { res.statusCode = 403; return res.end('{"error":{"message":"denied"}}'); }
      if (MEMBER_DOC_IDS.has(id)) return res.end(JSON.stringify({ name: 'projects/x/databases/(default)/documents/member/' + id, fields: {} }));
      res.statusCode = 404; return res.end('{"error":{"message":"not found"}}');
    }
    if (req.url.endsWith(':runQuery')) {
      const f = JSON.parse(body || '{}').structuredQuery?.where?.fieldFilter;
      const val = f?.value?.stringValue;
      // เว็บหลักเก็บ uid ไว้ในฟิลด์ firebase_uid
      if (f?.field?.fieldPath === 'firebase_uid' && MEMBER_BY_FIELD.has(val))
        return res.end(JSON.stringify([{ document: { name: 'member/x', fields: {} } }]));
      return res.end(JSON.stringify([{ readTime: new Date().toISOString() }]));
    }
    res.statusCode = 404; res.end('{}');
  });
});

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function mint(payload = {}, { kid = KID, alg = 'RS256', key = privateKey } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const p = {
    iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT,
    sub: 'UID_TEST_1', auth_time: now, iat: now, exp: now + 3600,
    email: 'student@irish.ac.th', email_verified: true, name: 'นักศึกษา ทดสอบ',
    ...payload,
  };
  const head = b64({ alg, kid, typ: 'JWT' });
  const body = b64(p);
  const sig = crypto.createSign('RSA-SHA256').update(head + '.' + body).sign(key).toString('base64url');
  return head + '.' + body + '.' + sig;
}

let cookies = '';
const jar = (r) => (r.headers.getSetCookie?.() || []).map((x) => x.split(';')[0]).join('; ');
const keep = (r) => { const c = jar(r); if (c) cookies = c; };
const BASE = 'http://127.0.0.1:3999';
const form = (obj) => new URLSearchParams(obj).toString();
const postForm = (body) => fetch(BASE + '/auth/firebase', {
  method: 'POST', redirect: 'manual',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: form(body),
});

let pass = 0, fail = 0;
const t = (name, ok, extra) => { ok ? pass++ : fail++; console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' — ' + extra : '')); };

async function run() {
  // 1. token ถูกต้อง → 302 + ได้ session
  let r = await postForm({ token: mint() });
  keep(r);
  t('token ถูกต้อง → redirect เข้าเว็บ', r.status === 302 && r.headers.get('location') === '/', 'status=' + r.status);

  let me = await (await fetch(BASE + '/api/me', { headers: { cookie: cookies } })).json();
  t('session เป็นผู้ใช้จาก Firebase', me.role === 'staff' && me.fullname === 'นักศึกษา ทดสอบ', JSON.stringify(me));

  // 2. เข้าซ้ำ + เปลี่ยนชื่อที่เว็บหลัก → ต้องเป็นคนเดิม (uid เดิม) แต่ชื่ออัปเดต
  const idBefore = me.id;
  r = await postForm({ token: mint({ name: 'นักศึกษา เปลี่ยนชื่อ' }) });
  keep(r);
  me = await (await fetch(BASE + '/api/me', { headers: { cookie: cookies } })).json();
  t('เข้าซ้ำ = บัญชีเดิม + ชื่ออัปเดตตามเว็บหลัก', me.id === idBefore && me.fullname === 'นักศึกษา เปลี่ยนชื่อ', JSON.stringify(me));

  // 3. กรณี B: token ไม่มี claim name → ใช้ name จากฟอร์ม
  r = await postForm({ token: mint({ sub: 'UID_TEST_2', name: undefined, email: 'b@irish.ac.th' }), name: 'ชื่อจากฐานข้อมูลเว็บหลัก' });
  const c2 = jar(r);
  const me2 = await (await fetch(BASE + '/api/me', { headers: { cookie: c2 } })).json();
  t('กรณี B: ไม่มี claim name → ใช้ชื่อจากฟอร์ม', me2.fullname === 'ชื่อจากฐานข้อมูลเว็บหลัก' && me2.id !== idBefore, JSON.stringify(me2));

  // 4. token ปลอม/ผิดเงื่อนไข ต้องไม่ผ่านทุกกรณี
  const now = Math.floor(Date.now() / 1000);
  const bad = [
    ['ลายเซ็นจากกุญแจอื่น', mint({}, { key: crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey })],
    ['หมดอายุ', mint({ exp: now - 120 })],
    ['aud ผิดโปรเจกต์', mint({ aud: 'other-project' })],
    ['iss ผิด', mint({ iss: 'https://evil.example.com/' + PROJECT })],
    ['alg=none', b64({ alg: 'none', kid: KID }) + '.' + b64({ iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, sub: 'HACK', exp: now + 999, iat: now }) + '.'],
    ['kid ไม่รู้จัก', mint({}, { kid: 'ไม่มีจริง' })],
    ['ไม่มี token', ''],
    ['ขยะ', 'abc.def.ghi'],
  ];
  for (const [name, tok] of bad) {
    const rr = await postForm({ token: tok });
    const gotSession = (rr.headers.getSetCookie?.() || []).some((c) => /^sess=.+/.test(c));
    t('token ไม่ถูกต้อง (' + name + ') → ปฏิเสธ', rr.status === 401 && !gotSession, 'status=' + rr.status);
  }

  // 5. ห้ามยกสิทธิ์ตัวเองเป็น admin ผ่านฟอร์ม
  r = await postForm({ token: mint({ sub: 'UID_EVIL', email: 'evil@x.com' }), role: 'admin', name: 'คนแอบ' });
  const cEvil = jar(r);
  const meEvil = await (await fetch(BASE + '/api/me', { headers: { cookie: cEvil } })).json();
  const users = await fetch(BASE + '/api/users', { headers: { cookie: cEvil } });
  t('ส่ง role=admin มาในฟอร์ม → ยังเป็น staff', meEvil.role === 'staff' && users.status === 403, meEvil.role + '/' + users.status);

  // 6. custom claim admin=true → เป็น admin ของคลัง
  r = await postForm({ token: mint({ sub: 'UID_BOSS', email: 'boss@x.com', name: 'อาจารย์', admin: true }) });
  const cBoss = jar(r);
  const meBoss = await (await fetch(BASE + '/api/me', { headers: { cookie: cBoss } })).json();
  t('custom claim admin=true → role admin', meBoss.role === 'admin', JSON.stringify(meBoss));

  // 7. open redirect
  r = await postForm({ token: mint(), next: 'https://evil.example.com/steal' });
  t('next ไปเว็บนอก → ถูกตัดเหลือ /', r.headers.get('location') === '/', r.headers.get('location'));
  r = await postForm({ token: mint(), next: '/requests' });
  t('next เป็น path ภายใน → ใช้ได้', r.headers.get('location') === '/requests', r.headers.get('location'));

  // 7b. open redirect แบบ bypass (backslash / อักขระควบคุม) — เบราว์เซอร์แปลงเป็น // แล้วหลุดออกนอกเว็บ
  const BS = String.fromCharCode(92), TAB = String.fromCharCode(9), NL = String.fromCharCode(10);
  const evilNext = ['/' + BS + 'evil.com', '//evil.com', '/' + TAB + '/evil.com', '/' + NL + '//evil.com',
    'https://evil.com', BS + BS + 'evil.com', '/' + BS + BS + 'evil.com', '/' + BS + '/evil.com'];
  for (const n of evilNext) {
    const rr = await postForm({ token: mint(), next: n });
    const loc = rr.headers.get('location') || '';
    let escaped = false;
    try { escaped = new URL(loc, BASE).origin !== BASE; } catch { escaped = true; }
    t('next=' + JSON.stringify(n) + ' → ไม่หลุดออกนอกเว็บ', !escaped, 'location=' + JSON.stringify(loc));
  }
  const keepPath = await postForm({ token: mint(), next: '/requests?tab=mine#top' });
  t('next ที่ถูกต้องยังเก็บ query/hash ครบ', keepPath.headers.get('location') === '/requests?tab=mine#top', keepPath.headers.get('location'));

  // 7c. login-CSRF: เว็บอื่นยัด form POST มา (มี header Origin แปลกปลอม) ต้องถูกปฏิเสธ
  const csrf = await fetch(BASE + '/auth/firebase', {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example.com' },
    body: form({ token: mint() }),
  });
  const csrfCookie = (csrf.headers.getSetCookie?.() || []).some((c) => /^sess=.+/.test(c));
  t('form POST จาก origin แปลกปลอม → ปฏิเสธ ไม่ตั้ง session', csrf.status === 403 && !csrfCookie, 'status=' + csrf.status);
  const okOrigin = await fetch(BASE + '/auth/firebase', {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://irish-lab.example.com' },
    body: form({ token: mint() }),
  });
  t('form POST จากเว็บหลัก (origin ตรง) → ผ่าน', okOrigin.status === 302, 'status=' + okOrigin.status);

  // 8. ผู้ใช้ SSO login ด้วยรหัสผ่านไม่ได้ (ไม่มีรหัสผ่านให้เดา)
  const tryPw = await fetch(BASE + '/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'student@irish.ac.th', password: '-' }),
  });
  t('บัญชี SSO login ด้วยรหัสผ่านไม่ได้', tryPw.status === 401, 'status=' + tryPw.status);

  // 9. flow จริง: ผู้ใช้ SSO ขอยืมของ → เห็นคำขอของตัวเอง (ไม่ต้องกรอกรหัสบัตร)
  const admin = await fetch(BASE + '/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin1234' }),
  });
  const ac = jar(admin);
  const item = await (await fetch(BASE + '/api/items', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: ac },
    body: JSON.stringify({ name: 'ไขควงทดสอบ SSO', category: 'เครื่องมือ', qty: 5, unit: 'อัน' }),
  })).json();

  const ordRes = await fetch(BASE + '/api/orders', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: cookies },
    body: JSON.stringify({ note: 'เทส SSO', items: [{ item_id: item.id, qty: 2 }] }),
  });
  const ord = await ordRes.json();
  t('ผู้ใช้ SSO ส่งคำขอยืมได้', ordRes.ok, JSON.stringify(ord));
  const mine = await (await fetch(BASE + '/api/requests', { headers: { cookie: cookies } })).json();
  t('เห็นคำขอของตัวเอง + ชื่อผู้ขอมาจากบัญชี (ไม่ได้กรอกเอง)', mine.length === 1 && mine[0].person === 'นักศึกษา ทดสอบ',
    JSON.stringify(mine.map((x) => ({ p: x.person, s: x.status }))));
  const others = await (await fetch(BASE + '/api/requests', { headers: { cookie: c2 } })).json();
  t('ผู้ใช้ SSO คนอื่นไม่เห็นคำขอคนนี้', others.length === 0, 'เห็น ' + others.length + ' รายการ');

  // อนุมัติ → คืน
  const apv = await fetch(BASE + '/api/requests/' + mine[0].id + '/approve', { method: 'POST', headers: { 'content-type': 'application/json', cookie: ac }, body: '{}' });
  t('admin อนุมัติคำขอของผู้ใช้ SSO ได้', apv.ok, 'status=' + apv.status);
  const after = (await (await fetch(BASE + '/api/items/' + item.id, { headers: { cookie: ac } })).json()).item;
  t('สต็อกถูกตัดถูกต้อง (5-2=3)', after.qty === 3, 'qty=' + after.qty);
  const ret = await fetch(BASE + '/api/requests/' + mine[0].id + '/return', { method: 'POST', headers: { 'content-type': 'application/json', cookie: ac }, body: '{}' });
  const after2 = (await (await fetch(BASE + '/api/items/' + item.id, { headers: { cookie: ac } })).json()).item;
  t('คืนของแล้วสต็อกกลับเป็น 5', ret.ok && after2.qty === 5, 'qty=' + after2.qty);

  // 10. เปิด SSO แล้ว guest ต้องยืมไม่ได้ (บังคับที่ server ไม่ใช่แค่ซ่อนปุ่ม)
  const gOrder = await fetch(BASE + '/api/orders', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ person: 'คนไม่ล็อกอิน', card: '12345', items: [{ item_id: item.id, qty: 1 }] }),
  });
  t('เปิด SSO แล้ว guest ยืมไม่ได้', gOrder.status === 401, 'status=' + gOrder.status);
  const afterG = (await (await fetch(BASE + '/api/items/' + item.id, { headers: { cookie: ac } })).json()).item;
  t('สต็อกไม่ถูกแตะจากคำขอ guest ที่ถูกปฏิเสธ', afterG.qty === 5, 'qty=' + afterG.qty);

  // 11. collection member ของเว็บหลัก → เป็น admin ของคลัง
  const loginAs = async (payload, extra = {}) => {
    const rr = await postForm({ token: mint(payload), ...extra });
    const ck = jar(rr);
    return await (await fetch(BASE + '/api/me', { headers: { cookie: ck } })).json();
  };
  const mDoc = await loginAs({ sub: 'UID_MEMBER_DOC', email: 'md@irish.ac.th', name: 'สมาชิก (รหัสเอกสาร)' });
  t('อยู่ใน member (รหัสเอกสาร = uid) → admin', mDoc.role === 'admin', JSON.stringify(mDoc));

  const mMail = await loginAs({ sub: 'UID_MEMBER_MAIL', email: 'member@irish.ac.th', name: 'สมาชิก (อีเมล)' });
  t('อยู่ใน member (รหัสเอกสาร = อีเมล) → admin', mMail.role === 'admin', JSON.stringify(mMail));

  const mField = await loginAs({ sub: 'UID_MEMBER_FIELD', email: 'mf@irish.ac.th', name: 'สมาชิก (ฟิลด์)' });
  t('อยู่ใน member (ฟิลด์ firebase_uid) → admin', mField.role === 'admin', JSON.stringify(mField));

  const notM = await loginAs({ sub: 'UID_OUTSIDER', email: 'out@irish.ac.th', name: 'คนนอก' });
  t('ไม่อยู่ใน member → staff', notM.role === 'staff', JSON.stringify(notM));
  const outUsers = await fetch(BASE + '/api/users', { headers: { cookie: cookies } });

  const denied = await loginAs({ sub: 'UID_403_X', email: 'x403@irish.ac.th', name: 'rules ปฏิเสธ' });
  t('Firestore ปฏิเสธ → ยัง login ได้เป็น staff (ไม่ล็อกคนออก)', denied.role === 'staff', JSON.stringify(denied));

  // ถูกถอดออกจาก collection member → ลดสิทธิ์เป็น staff ตอนเข้าครั้งถัดไป
  MEMBER_DOC_IDS.delete('UID_MEMBER_DOC');
  const demoted = await loginAs({ sub: 'UID_MEMBER_DOC', email: 'md@irish.ac.th', name: 'สมาชิก (รหัสเอกสาร)' });
  t('ถูกถอดออกจาก member → ลดเป็น staff', demoted.role === 'staff', JSON.stringify(demoted));

  // Firestore ล่มตอนที่เคยเป็น admin อยู่ → ต้องคงสิทธิ์เดิม ไม่ลดเพราะระบบเขาล่ม
  MEMBER_DOC_IDS.add('UID_KEEP');
  const keep1 = await loginAs({ sub: 'UID_KEEP', email: 'keep@irish.ac.th', name: 'คงสิทธิ์' });
  fsDown = true;
  const keep2 = await loginAs({ sub: 'UID_KEEP', email: 'keep@irish.ac.th', name: 'คงสิทธิ์' });
  fsDown = false;
  t('Firestore ล่ม → admin เดิมไม่ถูกลดสิทธิ์', keep1.role === 'admin' && keep2.role === 'admin', keep1.role + '→' + keep2.role);

  // 11b. ประตูหน้าเว็บ: ยังไม่ล็อกอิน = ไม่เห็นข้อมูลอะไรเลย (ไม่ใช่แค่ยืมไม่ได้)
  const closed = ['/api/items', '/api/requests', '/api/dashboard', '/api/broken', '/api/locations', '/api/requests/counts', '/api/guest/name'];
  for (const path of closed) {
    const rr = await fetch(BASE + path);
    t('ยังไม่ล็อกอิน → ' + path + ' ปิด', rr.status === 401, 'status=' + rr.status);
  }
  for (const path of ['/api/config', '/api/me']) {
    const rr = await fetch(BASE + path);
    t('เส้นที่ต้องเปิดไว้เพื่อให้ล็อกอินได้ → ' + path, rr.ok, 'status=' + rr.status);
  }
  const stillIn = await fetch(BASE + '/api/items', { headers: { cookie: ac } });
  t('ล็อกอินแล้วยังใช้งานได้ปกติ', stillIn.ok, 'status=' + stillIn.status);

  // 12. /api/config
  const cfg = await (await fetch(BASE + '/api/config')).json();
  t('/api/config บอกว่าเปิด SSO + ปิดทาง guest', cfg.sso === true && cfg.projectId === PROJECT && cfg.guestBorrow === false, JSON.stringify(cfg));

  console.log('\nผ่าน ' + pass + ' / ล้ม ' + fail);
  return fail;
}

fsServer.listen(4556);
jwkServer.listen(4555, async () => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: '3999',
      DB_PATH: DB,
      SESSION_SECRET: 'test-secret-only',
      FIREBASE_PROJECT_ID: PROJECT,
      FIREBASE_JWK_URL: 'http://127.0.0.1:4555/jwk',
      FIRESTORE_URL: 'http://127.0.0.1:4556',
      FIREBASE_MEMBER_COLLECTION: 'member',
      FIREBASE_MEMBER_CACHE_MS: '0',
      SSO_MAX_PER_MIN: '500', // เทสต์ยิงถี่กว่าคนจริงมาก
      MAIN_SITE_URL: 'https://irish-lab.example.com',
      TURSO_URL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
  child.stderr.on('data', (d) => process.stderr.write('[server:err] ' + d));
  for (let i = 0; i < 60; i++) {
    try { await fetch(BASE + '/healthz'); break; } catch { await new Promise((r) => setTimeout(r, 300)); }
  }
  let code = 1;
  try { code = await run(); } catch (e) { console.error('ทดสอบพัง:', e); }
  child.kill();
  jwkServer.close();
  fsServer.close();
  process.exit(code ? 1 : 0);
});
