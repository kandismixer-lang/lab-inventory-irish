# รวม Login กับเว็บแลปหลัก (Firebase SSO)

> สถานะ: **โค้ดฝั่งเราทำเสร็จแล้ว ทดสอบผ่าน 24/24** · รอเปิดใช้จริง (ตั้ง env + ทีมเว็บหลักเพิ่มปุ่ม) · อัปเดต 2026-09-27

## เป้าหมาย
- ผู้ยืม **login ที่เว็บแลปหลักก่อน** แล้วกดเข้ามาเว็บยืมของได้ทันที ไม่ต้อง login ซ้ำ
- ชื่อผู้ยืม **เติมอัตโนมัติ** จากบัญชีเว็บหลัก แทนการกรอกชื่อ/รหัสบัตรเอง
- admin ของเรายัง login ด้วย username/รหัสผ่านเดิมได้ (สำรองกรณี Firebase ล่ม)

## วิธีเปิดใช้ (3 ขั้น)

### 1. ตั้ง env บน Render (Dashboard → Environment)
| ตัวแปร | ค่า | จำเป็น |
|---|---|---|
| `FIREBASE_PROJECT_ID` | `irish-lab` | ✅ ไม่ตั้ง = ปิด SSO ทั้งระบบ |
| `MAIN_SITE_URL` | `https://<โดเมนเว็บแลปหลัก>` | ใช้โชว์ปุ่ม "เข้าสู่ระบบด้วยบัญชีเว็บแลป" ที่เมนูซ้าย |
| `FIREBASE_ADMIN_EMAILS` | `a@x.com,b@x.com` | อีเมลที่ให้เป็น admin ของคลังด้วย (ไม่ตั้ง = ทุกคนเป็น staff) |

### 2. ส่งโค้ดปุ่มนี้ให้ทีมเว็บหลัก
วางปุ่ม "ยืมของ / เข้าคลังแลป" ในเว็บหลัก (ต้องกดตอน login อยู่):

```js
async function goToBorrowSite() {
  const user = getAuth().currentUser;            // SDK v9 (v8: firebase.auth().currentUser)
  if (!user) return alert('กรุณาเข้าสู่ระบบก่อน');
  const token = await user.getIdToken();

  const f = document.createElement('form');
  f.method = 'POST';
  f.action = 'https://<โดเมนเว็บยืมของ>/auth/firebase';
  const fields = {
    token,
    name: user.displayName || '',   // ถ้าชื่ออยู่แค่ใน Firestore ให้ใส่ชื่อจากที่นั่นแทน
    // next: '/requests',           // (ไม่บังคับ) หน้าที่จะพาไปหลังเข้าระบบ
  };
  for (const [k, v] of Object.entries(fields)) {
    const i = document.createElement('input');
    i.type = 'hidden'; i.name = k; i.value = v;
    f.appendChild(i);
  }
  document.body.appendChild(f);
  f.submit();
}
```

**ห้ามส่ง token ทาง URL query** (`?token=...`) — จะค้างใน log เซิร์ฟเวอร์และประวัติเบราว์เซอร์ ใช้ form POST เท่านั้น

### 3. ทดสอบ
กดปุ่มจากเว็บหลัก → ต้องเด้งเข้าเว็บคลังโดยเมนูซ้ายขึ้นชื่อจริง (ไม่ใช่ "ผู้เยี่ยมชม") → กดยืมของ ช่อง "ชื่อผู้ยืม" ต้องเติมมาให้แล้ว และไม่มีช่องรหัสบัตร

## สิ่งที่ทำไปแล้ว (โค้ด)

| ไฟล์ | สิ่งที่เพิ่ม |
|---|---|
| [firebase-auth.js](firebase-auth.js) | ตรวจ Firebase ID token เอง (JWT RS256 + กุญแจสาธารณะ Google, แคชตาม `Cache-Control`) |
| [db.js](db.js) | คอลัมน์ `users.firebase_uid` (UNIQUE เฉพาะที่ไม่ NULL) + `users.email` |
| [server.js](server.js) | `POST /auth/firebase` (form จากเว็บหลัก → redirect), `POST /api/auth/firebase` (JSON), `GET /api/config` |
| [client/src/App.jsx](client/src/App.jsx) | ปุ่ม "เข้าสู่ระบบด้วยบัญชีเว็บแลป" (โชว์เมื่อยังไม่ล็อกอิน + ตั้ง `MAIN_SITE_URL` แล้ว) |
| [client/src/Items.jsx](client/src/Items.jsx) | ฟอร์มยืมบอกว่าชื่อมาจากบัญชี (แก้ได้ถ้ายืมแทนคนอื่น) |
| [server.js](server.js) `/api/orders` | คนที่ล็อกอินแล้วไม่ต้องส่งชื่อมา — ใช้ชื่อบัญชีอัตโนมัติ (guest ยังบังคับกรอกเหมือนเดิม) |

### ทำไมไม่ใช้ `firebase-admin`
เราต้องการแค่ "verify token" อย่างเดียว แต่ `firebase-admin` ลากมาเกือบ 50MB และทำให้ cold start บน Render free tier ช้าลงอีก
การ verify ID token คือการ verify JWT RS256 ด้วยกุญแจสาธารณะของ Google — เขียนเองด้วย `node:crypto` ได้ในไฟล์เดียว **ไม่เพิ่ม dependency เลย**

### สิ่งที่ตรวจในทุก token
`alg=RS256` · ลายเซ็นตรงกับกุญแจ Google ตาม `kid` (หมุนกุญแจแล้วดึงใหม่อัตโนมัติ) · `aud = irish-lab` · `iss = https://securetoken.google.com/irish-lab` · `exp` ยังไม่หมด · `iat`/`auth_time` ไม่ใช่อนาคต · `sub` (uid) ไม่ว่าง · เผื่อนาฬิกาเหลื่อม 60 วิ

### กติกาความปลอดภัยที่บังคับในโค้ด
- **role ไม่รับจากฟอร์ม** — เป็น admin ได้ทางเดียวคือ custom claim (`admin:true` / `role:'admin'`) หรืออยู่ใน `FIREBASE_ADMIN_EMAILS`
- บัญชีที่มาจาก SSO ตั้งรหัสผ่านสุ่มทิ้ง → **login ด้วยรหัสผ่านไม่ได้** ต้องมาทาง SSO เท่านั้น
- `next` รับเฉพาะ path ภายในเว็บเรา (กัน open redirect ไปเว็บปลอม)
- จำกัด 30 ครั้ง/นาที/IP (ตรวจลายเซ็นกิน CPU)
- ชื่อจากฟอร์ม (`name`) เชื่อได้เพราะต้องมี token จริงของตัวเองก่อน และประวัติผูกกับ `firebase_uid` เสมอ
- session ฝั่งเรา 8 ชม. — คนที่ถูกลบจากเว็บหลักจะหลุดเองภายในวันเดียว

## ผลการทดสอบ (24/24 ผ่าน)
ยิงเข้า server จริงด้วย token ที่มินต์เอง + JWK ปลอม (ทดสอบทั้งเส้นทางเหมือนของจริง):

- ✅ token ถูกต้อง → เข้าระบบ, เข้าซ้ำ = บัญชีเดิม, เปลี่ยนชื่อที่เว็บหลัก → ชื่อที่เราอัปเดตตาม
- ✅ กรณี B (token ไม่มีชื่อ) → ใช้ชื่อที่เว็บหลักส่งมาในฟอร์ม
- ✅ ปฏิเสธครบ 8 แบบ: ลายเซ็นกุญแจอื่น / หมดอายุ / `aud` ผิด / `iss` ผิด / `alg=none` / `kid` ไม่รู้จัก / ไม่มี token / ขยะ
- ✅ ส่ง `role=admin` มาในฟอร์ม → ยังเป็น staff และเรียก `/api/users` ไม่ได้ (403)
- ✅ custom claim `admin:true` → เป็น admin
- ✅ `next` ชี้เว็บนอก → ถูกตัดเหลือ `/`
- ✅ บัญชี SSO login ด้วยรหัสผ่านไม่ได้
- ✅ flow จริง: ผู้ใช้ SSO ขอยืม (ไม่กรอกชื่อ/บัตร) → เห็นเฉพาะคำขอตัวเอง → admin อนุมัติ → สต็อก 5→3 → คืน → กลับเป็น 5

## ยังค้าง / ต้องตัดสินใจ
- [ ] โดเมนเว็บแลปหลัก (ใส่ `MAIN_SITE_URL`) และทีมเว็บหลักเพิ่มปุ่มให้
- [ ] `display name` อยู่ใน Firebase Auth หรือแค่ใน Firestore (กำหนดว่าปุ่มต้องส่ง `name` มาด้วยไหม) — โค้ดเรารองรับทั้งสองแบบแล้ว
- [ ] อีเมลไหนบ้างเป็น admin ของคลัง (`FIREBASE_ADMIN_EMAILS`)
- [ ] **จะปิดทาง guest (กรอกชื่อ+รหัสบัตร) เลยไหม** — ตอนนี้ยังเปิดคู่กันไว้ ถ้าจะบังคับ SSO อย่างเดียวค่อยตัดทีหลัง (ตัด `guest_key`/`card` ออกจาก UI)
- [ ] ผู้ใช้เก่าที่ยืมแบบ guest ไว้ — ประวัติผูกกับรหัสบัตร ไม่ย้ายเข้าบัญชี SSO อัตโนมัติ (ถ้าต้องการ ทำสคริปต์จับคู่ทีหลังได้)

## ผลกระทบต่อข้อมูลเดิม
ไม่มี — requests/transactions อ้างผู้ใช้ด้วย `user_id` อยู่แล้ว คำขอเก่าของ guest ยังอยู่ครบ และถ้าไม่ตั้ง `FIREBASE_PROJECT_ID` ระบบทำงานเหมือนเดิมทุกอย่าง
