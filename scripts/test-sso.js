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

// endpoint โปรไฟล์ปลอมของเว็บหลัก — รับ Bearer ID token แล้วตอบ role/display_name/email (+ข้อมูลส่วนตัวที่ต้องทิ้ง)
const ADMIN_SUBS = new Set(['UID_ADMIN', 'UID_KEEP']);
const PROFILE_NAMES = { UID_TEST_2: 'ชื่อจากฐานข้อมูลเว็บหลัก', UID_EVIL: 'ชื่อจริงจากเว็บหลัก' };
let profileDown = false;
let lastAuthHeader = '';
const profileServer = http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  lastAuthHeader = req.headers.authorization || '';
  if (profileDown) { res.statusCode = 500; return res.end('{"ok":false}'); }
  const tok = lastAuthHeader.replace(/^Bearer\s+/i, '');
  let p = {};
  try { p = JSON.parse(Buffer.from(tok.split('.')[1] || '', 'base64url').toString()); } catch {}
  if (!tok || !p.sub || p.sub === 'UID_401') { res.statusCode = 401; return res.end('{"ok":false}'); }
  if (p.sub === 'UID_NOPROFILE') return res.end('{"ok":true,"user":null}');
  res.end(JSON.stringify({ ok: true, user: {
    role: ADMIN_SUBS.has(p.sub) ? 'admin' : 'user',
    display_name: PROFILE_NAMES[p.sub] ?? p.name ?? '',
    email: p.email || '',
    phone: '0812345678', birthday: '2000-01-01', province: 'กรุงเทพ', // ต้องไม่ไปถึงคลัง
  } }));
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

  t('ส่ง ID token ไปเว็บหลักแบบ Bearer', /^Bearer ey/.test(lastAuthHeader), lastAuthHeader.slice(0, 12));
  t('ข้อมูลส่วนตัวอื่น (เบอร์/วันเกิด) ไม่หลุดมาถึงคลัง', !JSON.stringify(me).includes('0812345678') && me.phone === undefined, JSON.stringify(me));

  // 3. ชื่อต้องมาจาก display_name ของเว็บหลัก ไม่ใช่ name ในฟอร์ม (ฟอร์มปลอมได้)
  r = await postForm({ token: mint({ sub: 'UID_TEST_2', name: undefined, email: 'b@irish.ac.th' }), name: 'ชื่อปลอมจากฟอร์ม' });
  const c2 = jar(r);
  const me2 = await (await fetch(BASE + '/api/me', { headers: { cookie: c2 } })).json();
  t('ชื่อ = display_name เว็บหลัก (ไม่สนชื่อในฟอร์ม)', me2.fullname === 'ชื่อจากฐานข้อมูลเว็บหลัก' && me2.id !== idBefore, JSON.stringify(me2));

  // 3b. endpoint ล่ม → ใช้ชื่อในฟอร์มเป็นค่าสำรอง (ยังเข้าได้)
  profileDown = true;
  r = await postForm({ token: mint({ sub: 'UID_TEST_3', name: undefined, email: 'c@irish.ac.th' }), name: 'ชื่อสำรองจากฟอร์ม' });
  profileDown = false;
  const me3 = await (await fetch(BASE + '/api/me', { headers: { cookie: jar(r) } })).json();
  t('endpoint ล่ม → ใช้ชื่อในฟอร์มเป็นค่าสำรอง + เป็น staff', me3.fullname === 'ชื่อสำรองจากฟอร์ม' && me3.role === 'staff', JSON.stringify(me3));

  // 3c. เว็บหลักตอบ 401 → ปฏิเสธการเข้า
  const r401 = await postForm({ token: mint({ sub: 'UID_401' }) });
  const got401 = (r401.headers.getSetCookie?.() || []).some((c) => /^sess=.+/.test(c));
  t('เว็บหลักตอบ 401 → ปฏิเสธ ไม่ตั้ง session', r401.status === 401 && !got401, 'status=' + r401.status);

  // 3d. user:null (มีบัญชี Firebase แต่ยังไม่เคย login เว็บ) → ผู้ยืมทั่วไป ใช้ชื่อจาก token
  r = await postForm({ token: mint({ sub: 'UID_NOPROFILE', email: 'np@irish.ac.th', name: 'ยังไม่มีโปรไฟล์' }), name: 'ชื่อฟอร์ม' });
  const meNp = await (await fetch(BASE + '/api/me', { headers: { cookie: jar(r) } })).json();
  t('user:null → staff + ชื่อจาก token (ไม่ใช้ฟอร์ม)', meNp.role === 'staff' && meNp.fullname === 'ยังไม่มีโปรไฟล์', JSON.stringify(meNp));

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
  t('ปลอมชื่อในฟอร์ม → ได้ชื่อจริงจากเว็บหลัก', meEvil.fullname === 'ชื่อจริงจากเว็บหลัก', meEvil.fullname);

  // 6. admin ต้องมาจาก role ของเว็บหลักเท่านั้น — claim ใน token อย่างเดียวไม่พอ
  r = await postForm({ token: mint({ sub: 'UID_BOSS', email: 'boss@x.com', name: 'อาจารย์', admin: true }) });
  const meBoss = await (await fetch(BASE + '/api/me', { headers: { cookie: jar(r) } })).json();
  t('claim admin=true แต่เว็บหลักบอก user → staff', meBoss.role === 'staff', JSON.stringify(meBoss));

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

  // 11. role "admin" บนเว็บหลัก → เป็น admin ของคลัง
  const loginAs = async (payload, extra = {}) => {
    const rr = await postForm({ token: mint(payload), ...extra });
    const ck = jar(rr);
    return await (await fetch(BASE + '/api/me', { headers: { cookie: ck } })).json();
  };
  const mAdmin = await loginAs({ sub: 'UID_ADMIN', email: 'ad@irish.ac.th', name: 'แอดมินเว็บแลป' });
  t('role admin บนเว็บหลัก → admin คลัง', mAdmin.role === 'admin', JSON.stringify(mAdmin));

  const notM = await loginAs({ sub: 'UID_OUTSIDER', email: 'out@irish.ac.th', name: 'คนนอก' });
  t('role user บนเว็บหลัก → staff', notM.role === 'staff', JSON.stringify(notM));

  // ถูกลด role ที่เว็บหลัก → ลดเป็น staff ตอนเข้าครั้งถัดไป
  ADMIN_SUBS.delete('UID_ADMIN');
  const demoted = await loginAs({ sub: 'UID_ADMIN', email: 'ad@irish.ac.th', name: 'แอดมินเว็บแลป' });
  t('ถูกลด role ที่เว็บหลัก → ลดเป็น staff', demoted.role === 'staff' && demoted.id === mAdmin.id, JSON.stringify(demoted));

  // endpoint ล่มตอนที่เคยเป็น admin อยู่ → คงสิทธิ์เดิม ไม่ลดเพราะระบบเขาล่ม
  const keep1 = await loginAs({ sub: 'UID_KEEP', email: 'keep@irish.ac.th', name: 'คงสิทธิ์' });
  profileDown = true;
  const keep2 = await loginAs({ sub: 'UID_KEEP', email: 'keep@irish.ac.th', name: 'คงสิทธิ์' });
  profileDown = false;
  t('endpoint ล่ม → admin เดิมไม่ถูกลดสิทธิ์', keep1.role === 'admin' && keep2.role === 'admin', keep1.role + '→' + keep2.role);

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

profileServer.listen(4556);
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
      MAIN_SITE_PROFILE_URL: 'http://127.0.0.1:4556/api/lab-profile',
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
  profileServer.close();
  process.exit(code ? 1 : 0);
});
