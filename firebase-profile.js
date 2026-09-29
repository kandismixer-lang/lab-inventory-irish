// ถามเว็บแลปหลัก (irish-tech.com) ว่าผู้ใช้คนนี้คือใคร/สิทธิ์อะไร — server-to-server ครั้งเดียวตอนรับ token
//
// ทำไมไม่อ่าน Firestore เอง: เว็บหลักปิด rules ฝั่ง client ทั้งหมด และไม่แชร์ service account (= สิทธิ์ admin ทั้งโปรเจกต์)
// เขาเลยเปิด endpoint ให้แทน: ส่ง ID token ไป → ได้ role / display_name / email กลับมา
//
// ตอบกลับ:
//   200 {"ok":true,"user":{...}}  มีโปรไฟล์ → ใช้ role ("admin"/"user"), display_name, email
//   200 {"ok":true,"user":null}   มีบัญชี Firebase แต่ยังไม่เคย login เว็บ → ผู้ยืมทั่วไป
//   401                            token ไม่ถูกต้อง/หมดอายุ → ปฏิเสธการเข้า
//
// ข้อตกลงกับเว็บหลัก:
//   - คำตอบมีข้อมูลอื่นติดมา (เบอร์โทร วันเกิด จังหวัด) → หยิบแค่ 3 ฟิลด์ ที่เหลือทิ้งทันที ไม่เก็บ ไม่ log
//   - ไม่เก็บ ID token หลังตั้ง session (มันใช้เรียก API เว็บหลักในนามผู้ใช้ได้ 1 ชม.) — โมดูลนี้แค่ส่งต่อ ไม่แคช
const PROFILE_URL = () => (process.env.MAIN_SITE_PROFILE_URL || '').trim();
const TIMEOUT_MS = Number(process.env.MAIN_SITE_PROFILE_TIMEOUT_MS ?? 6000);
const enabled = () => !!PROFILE_URL();

// token ถูกเว็บหลักปฏิเสธ (401) — แยกชนิดไว้ให้ route ตอบ 401 แทนการ fallback
class TokenRejected extends Error {}

/**
 * @param {string} idToken ID token ที่ตรวจลายเซ็นแล้ว
 * @returns {Promise<{role:'admin'|'user',name:string,email:string} | null | undefined>}
 *   object = มีโปรไฟล์ · null = มีบัญชีแต่ยังไม่มีโปรไฟล์ (ผู้ยืมทั่วไป) · undefined = เช็คไม่ได้ (ล่ม/ยังไม่ตั้ง URL)
 * @throws {TokenRejected} เว็บหลักตอบ 401
 */
async function fetchProfile(idToken) {
  if (!enabled()) return undefined;
  let res;
  try {
    res = await fetch(PROFILE_URL(), {
      headers: { authorization: 'Bearer ' + idToken, accept: 'application/json' },
      redirect: 'error', // ไม่ตาม redirect — กัน Bearer token ไหลไปปลายทางอื่น
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    console.warn('SSO: เรียก endpoint โปรไฟล์เว็บหลักไม่ได้ (' + e.message + ') — ใช้ค่าสำรอง');
    return undefined;
  }
  if (res.status === 401) throw new TokenRejected('เว็บแลปปฏิเสธการเข้าสู่ระบบ (token หมดอายุหรือไม่ถูกต้อง) — กลับไปเว็บแลปแล้วกดเข้าใหม่');
  if (!res.ok) {
    console.warn('SSO: endpoint โปรไฟล์เว็บหลักตอบ ' + res.status + ' — ใช้ค่าสำรอง');
    return undefined;
  }
  let body;
  try { body = await res.json(); } catch { return undefined; }
  if (!body || body.ok !== true) return undefined;
  if (body.user == null) return null;
  const u = body.user;
  // หยิบแค่ 3 ฟิลด์ที่ตกลงกันไว้ — ห้ามส่ง u ทั้งก้อนต่อ (มีเบอร์โทร/วันเกิด/จังหวัด)
  return {
    role: u.role === 'admin' ? 'admin' : 'user',
    name: typeof u.display_name === 'string' ? u.display_name.trim().slice(0, 80) : '',
    email: typeof u.email === 'string' ? u.email.trim().slice(0, 200) : '',
  };
}

module.exports = { fetchProfile, enabled, TokenRejected };
