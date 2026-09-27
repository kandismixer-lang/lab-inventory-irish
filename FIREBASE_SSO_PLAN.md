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
| `FIREBASE_PROJECT_ID` | `irish-lab` | ✅ **สวิตช์หลัก** ไม่ตั้ง = ปิด SSO ทั้งระบบ |
| `MAIN_SITE_URL` | `https://irish-tech.com/en` | ตั้งไว้ใน `render.yaml` แล้ว — ใช้โชว์ปุ่ม "เข้าสู่ระบบด้วยบัญชีเว็บแลป" |
| `FIREBASE_MEMBER_COLLECTION` | `member` | ตั้งไว้ใน `render.yaml` แล้ว — คนใน collection นี้ = admin ของคลัง |
| `FIREBASE_SERVICE_ACCOUNT` | JSON ทั้งก้อน | เฉพาะกรณี security rules ไม่ยอมให้ผู้ใช้อ่าน `member` (ดูหัวข้อถัดไป) |
| `FIREBASE_ADMIN_EMAILS` | `a@x.com,b@x.com` | (ไม่บังคับ) รายชื่ออีเมล admin แบบกำหนดเอง เสริมจาก `member` |
| `ALLOW_GUEST` | `1` | (ไม่บังคับ) เปิด SSO แล้วแต่ยังให้ยืมแบบ guest คู่กันไว้ช่วงเปลี่ยนผ่าน |

> ⚠️ ใส่ `FIREBASE_PROJECT_ID` **หลัง**ทีมเว็บหลักเพิ่มปุ่มเสร็จแล้วเท่านั้น เพราะใส่ปุ๊บ = ยืมแบบ guest ปิดทันที

### 2. ส่งโค้ดปุ่มนี้ให้ทีมเว็บหลัก (ยังไม่ทำ — ติดอยู่ตรงนี้)

**ปัญหาปัจจุบัน:** เมนู "Equipment Loan" ที่ irish-tech.com เป็นลิงก์ธรรมดา
`<a href="https://lab-inventory-t9oe.onrender.com">` — ไม่ได้ส่ง ID token มา คนกดเข้ามาจึงยังเป็นผู้เยี่ยมชม
ต้องเปลี่ยนเป็นปุ่มที่ดึง token แล้ว **form POST** มาให้เรา

> ⚠️ ห้ามส่ง token ทาง URL (`?token=...`) เพราะจะค้างใน log เซิร์ฟเวอร์และประวัติเบราว์เซอร์ — ใช้ form POST เท่านั้น

---
#### 📋 ข้อความสำหรับส่งต่อให้ทีมเว็บหลัก

> ขอเปลี่ยนเมนู **Equipment Loan** จากลิงก์ธรรมดา เป็นปุ่มที่ส่ง Firebase ID token มาให้ระบบคลัง
> เพื่อให้คนที่ login เว็บแลปอยู่แล้วเข้าไปยืมของได้เลยโดยไม่ต้อง login ซ้ำ และชื่อผู้ยืมถูกเติมให้อัตโนมัติ
>
> ปลายทาง: `POST https://lab-inventory-t9oe.onrender.com/auth/firebase`
> ฟิลด์: `token` (จำเป็น, ได้จาก `user.getIdToken()`) · `name` (ถ้า displayName ว่าง ให้ใส่ชื่อจาก Firestore) · `next` (ไม่บังคับ)
>
> ระบบคลังจะตรวจลายเซ็น token กับ Google ทุกครั้ง แล้ว redirect เข้าเว็บคลังให้เอง
> คนที่อยู่ใน collection `member` จะได้สิทธิ์ admin ของคลังอัตโนมัติ ที่เหลือเป็นผู้ยืมทั่วไป

```jsx
'use client';
import { useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

const BORROW_SITE = 'https://lab-inventory-t9oe.onrender.com/auth/firebase';

export default function EquipmentLoanButton() {
  const [user, setUser] = useState(null);
  // ต้องรอ onAuthStateChanged — ตอนเพิ่งโหลดหน้า currentUser ยังเป็น null อยู่แม้ login ค้างไว้
  useEffect(() => onAuthStateChanged(getAuth(), setUser), []);

  const go = async () => {
    if (!user) return alert('Please sign in first / กรุณาเข้าสู่ระบบก่อน');
    const token = await user.getIdToken();
    // ถ้า displayName ว่าง ให้ใส่ชื่อจากเอกสาร users ใน Firestore แทน
    const name = user.displayName || '';

    const f = document.createElement('form');
    f.method = 'POST';
    f.action = BORROW_SITE;
    for (const [k, v] of Object.entries({ token, name })) {
      const i = document.createElement('input');
      i.type = 'hidden'; i.name = k; i.value = v;
      f.appendChild(i);
    }
    document.body.appendChild(f);
    f.submit();
  };

  return <button onClick={go}>Equipment Loan</button>;
}
```

**หมายเหตุสำหรับทีมเว็บหลัก**
- ระบบคลังอยู่บน Render free tier — ถ้าไม่มีคนใช้นาน เซิร์ฟเวอร์จะหลับ ครั้งแรกอาจรอ 30–50 วินาที (token อายุ 1 ชม. ไม่หมดก่อนแน่นอน)
- ถ้าอยากให้เปิดแท็บใหม่ ใส่ `f.target = '_blank'` ก่อน `f.submit()`
- ไม่ต้องตั้ง CORS อะไรเพิ่ม (เป็น form POST แบบเปลี่ยนหน้า ไม่ใช่ fetch)
- ถ้าโดเมนระบบคลังเปลี่ยน แจ้งด้วยเพื่อแก้ `BORROW_SITE`
---

### 3. ใครเป็น admin ของคลัง — ดูจาก collection `member`
คนที่อยู่ใน collection `member` ของเว็บหลัก = **admin ของคลัง** · ที่เหลือ = staff (ขอยืมได้อย่างเดียว)

- เราไปอ่าน Firestore ตอน login **ในนามของผู้ใช้เอง** (ใช้ ID token ของเขา) — ใช้ได้ถ้า security rules ยอมให้คนที่ login แล้วอ่าน `member`
- ถ้า rules ไม่ยอม (log จะขึ้น `rules ของเว็บหลักไม่ยอมให้อ่าน collection member`) → โหลด service account key จาก Firebase Console → Project settings → Service accounts แล้วเอา JSON ทั้งก้อนใส่ env `FIREBASE_SERVICE_ACCOUNT` (อ่านได้โดยไม่ติด rules)
- **ไม่ต้องรู้โครงสร้างเอกสารล่วงหน้า** — โค้ดลองให้ 4 แบบ: รหัสเอกสาร = uid → รหัสเอกสาร = อีเมล → ฟิลด์ที่เก็บ uid (`firebase_uid`/`uid`/`user_id`/`userId`/`id`) → ฟิลด์อีเมล (`email`/`Email`/`mail`) · ถ้าเว็บหลักใช้ชื่อฟิลด์อื่น ตั้ง `FIREBASE_MEMBER_UID_FIELD` / `FIREBASE_MEMBER_EMAIL_FIELD` เพิ่มได้
- **ถูกถอดออกจาก `member` = ลดเป็น staff อัตโนมัติ** ตอนเข้าครั้งถัดไป (สิทธิ์ยึดตามเว็บหลักเป็นหลัก)
- **Firestore ล่ม/อ่านไม่ได้ = คงสิทธิ์เดิมไว้** ไม่ลดสิทธิ์ใครเพราะระบบเขามีปัญหา และยัง login ได้ตามปกติ
- ผลเช็คแคช 10 นาที (`FIREBASE_MEMBER_CACHE_MS`) — เพิ่มคนเข้า `member` แล้วอาจต้องรอถึง 10 นาที + เข้าใหม่

### 4. ทดสอบ
กดปุ่มจากเว็บหลัก → ต้องเด้งเข้าเว็บคลังโดยเมนูซ้ายขึ้นชื่อจริง (ไม่ใช่ "ผู้เยี่ยมชม") → กดยืมของ ช่อง "ชื่อผู้ยืม" ต้องเติมมาให้แล้ว และไม่มีช่องรหัสบัตร

## สิ่งที่ทำไปแล้ว (โค้ด)

| ไฟล์ | สิ่งที่เพิ่ม |
|---|---|
| [firebase-auth.js](firebase-auth.js) | ตรวจ Firebase ID token เอง (JWT RS256 + กุญแจสาธารณะ Google, แคชตาม `Cache-Control`) |
| [db.js](db.js) | คอลัมน์ `users.firebase_uid` (UNIQUE เฉพาะที่ไม่ NULL) + `users.email` |
| [firebase-member.js](firebase-member.js) | อ่าน collection `member` ของเว็บหลัก (Firestore REST) → ตัดสินว่าใครเป็น admin · รองรับทั้ง ID token ของผู้ใช้และ service account |
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
- ✅ เปิด SSO แล้ว guest ยิง `/api/orders` ตรงๆ → 401 และสต็อกไม่ถูกแตะ
- ✅ ยังไม่ตั้ง `FIREBASE_PROJECT_ID` → `guestBorrow: true` และ guest ยังยืมได้เหมือนเดิม
- ✅ อยู่ใน `member` → เป็น admin (ทดสอบครบ 3 แบบ: รหัสเอกสาร=uid / รหัสเอกสาร=อีเมล / ฟิลด์ `firebase_uid`)
- ✅ ไม่อยู่ใน `member` → staff · ถูกถอดออกภายหลัง → ลดเป็น staff ตอนเข้าครั้งถัดไป
- ✅ Firestore ปฏิเสธ/ล่ม → ยัง login ได้ และ admin เดิมไม่ถูกลดสิทธิ์

## ยังค้าง / ต้องตัดสินใจ
- [ ] **ทีมเว็บหลักเปลี่ยนเมนู Equipment Loan เป็นปุ่มส่ง token** (โค้ดข้อ 2) ← ค้างอยู่ตรงนี้
- [ ] เสร็จแล้วค่อยใส่ `FIREBASE_PROJECT_ID=irish-lab` ในหน้า Render (= สวิตช์เปิด SSO + ปิด guest)
- [ ] เช็คว่า security rules ยอมให้ผู้ใช้อ่าน collection `member` ไหม ถ้าไม่ → ใส่ `FIREBASE_SERVICE_ACCOUNT`
- [ ] `display name` อยู่ใน Firebase Auth หรือแค่ใน Firestore (กำหนดว่าปุ่มต้องส่ง `name` มาด้วยไหม) — โค้ดเรารองรับทั้งสองแบบแล้ว
- [ ] ผู้ใช้เก่าที่ยืมแบบ guest ไว้ — ประวัติผูกกับรหัสบัตร ไม่ย้ายเข้าบัญชี SSO อัตโนมัติ (ถ้าต้องการ ทำสคริปต์จับคู่ทีหลังได้)

## ทางยืมแบบ guest (ตัดสินใจแล้ว: ปิด)
**เปิด SSO เมื่อไหร่ = ยืมแบบ guest (กรอกชื่อ+รหัสบัตร) ปิดทันที** ทุกคนต้อง login เว็บแลปก่อน

- ผูกเงื่อนไขไว้กับ `FIREBASE_PROJECT_ID` — ตราบใดที่ยังไม่ตั้ง env ระบบยังให้ guest ยืมได้เหมือนเดิม **เว็บจะไม่ตายระหว่างรอเปิดใช้จริง**
- บังคับที่ server (`POST /api/orders` ตอบ 401 ถ้าไม่มีบัญชี) ไม่ใช่แค่ซ่อนปุ่ม
- หน้าเว็บ: กด "ยืม" ทั้งที่ยังไม่ล็อกอิน → ป็อปอัปชวนไปเข้าสู่ระบบที่เว็บแลป (มีปุ่มพาไปให้)
- ช่องรหัสบัตรที่เมนูซ้าย **ยังอยู่** แต่เปลี่ยนคำอธิบายเป็น "เคยยืมไว้ก่อนมีระบบล็อกอิน? ใส่รหัสบัตรเพื่อดูของที่ยืม" — คนที่ยืมไว้ก่อนหน้ายังตามของตัวเองได้ แต่ยืมใหม่ไม่ได้
- อยากเปิดคู่กันชั่วคราวช่วงเปลี่ยนผ่าน: ตั้ง `ALLOW_GUEST=1`

## ผลกระทบต่อข้อมูลเดิม
ไม่มี — requests/transactions อ้างผู้ใช้ด้วย `user_id` อยู่แล้ว คำขอเก่าของ guest ยังอยู่ครบ และถ้าไม่ตั้ง `FIREBASE_PROJECT_ID` ระบบทำงานเหมือนเดิมทุกอย่าง
