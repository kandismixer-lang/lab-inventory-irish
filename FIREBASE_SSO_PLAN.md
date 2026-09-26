# แผนรวม Login กับเว็บแลปหลัก (Firebase SSO)

> สถานะ: **วางแผนแล้ว ยังไม่ลงมือ** · อัปเดต 2026-09-26

## เป้าหมาย
- ผู้ยืมต้อง **login ที่เว็บแลปหลักก่อน** แล้วกดเข้ามาเว็บยืมของ (ระบบนี้) ได้ทันที ไม่ต้อง login ซ้ำ
- ชื่อผู้ยืมถูก **เติมอัตโนมัติ** จากข้อมูล user ของเว็บหลัก แทนการกรอกชื่อ/รหัสบัตรเอง
- admin ของเรายัง login ด้วย username/รหัสผ่านเดิมได้ (สำรองไว้กรณี Firebase ล่ม)

## ข้อมูลที่รู้แล้ว
| หัวข้อ | ค่า |
|---|---|
| Firebase projectId | `irish-lab` |
| ข้อมูล user ในฐานข้อมูลเว็บหลัก | display name, วันเกิด, ประเทศ, email, วันที่สมัคร, firebase_uid, id, province, role, update |
| ที่เราจะใช้ | `firebase_uid` (ใช้ระบุตัวคน), `display name` (ชื่อตอนยืม), `email`, อาจใช้ `role` |
| ที่จะไม่เก็บ | วันเกิด, ประเทศ, province (ไม่จำเป็น และเป็นข้อมูลส่วนตัว) |

## ยังต้องถาม / เช็ก
- [ ] **display name มากับ token ไหม**: ดูใน Firebase Console → Authentication → Users ว่าในตารางมีชื่อคนหรือไม่ (กรณี A/B ด้านล่าง)
- [ ] ค่าของ `role` ในเว็บหลักมีอะไรบ้าง และจะให้ role ไหนเป็น admin ที่เว็บเรา
- [ ] login แบบไหน: Google หรือ email/password (ดูที่คอลัมน์ Providers)
- [ ] โดเมนของเว็บหลัก
- [ ] ทีมเว็บหลักยอมเพิ่มปุ่ม "ไปเว็บยืมของ" ไหม
- [ ] จะ **ปิดการยืมแบบ guest** (กรอกชื่อ+รหัสบัตร) เลยไหม หรือเก็บไว้คู่กัน

## สถาปัตยกรรม
ทั้งสองเว็บอยู่คนละโดเมน Firebase จำการ login แยกตามโดเมน เว็บเราจึงมองไม่เห็นว่าผู้ใช้ login เว็บหลักไว้แล้ว ต้องให้เว็บหลัก **ส่ง ID token** มาให้เรา

```
[เว็บหลัก] ผู้ใช้ login Firebase อยู่แล้ว
   │ กดปุ่ม "ยืมของ" → user.getIdToken()
   ▼ form POST { token, name? } ไปที่ https://<เว็บเรา>/auth/firebase
[server เรา]
   │ firebase-admin verifyIdToken(token)  ← ต้องมี projectId ไม่ต้องใช้ service account
   │ ได้ uid, email, (name)
   │ หา user ด้วย firebase_uid ถ้าไม่มีก็สร้างใหม่ (role = staff)
   │ อัปเดตชื่อทุกครั้งที่ login
   │ req.session.uid = user.id
   ▼ redirect → หน้ารายการของ (ฟอร์มยืมเติมชื่อให้เอง)
```

- **กรณี A:** display name อยู่ใน Firebase Auth ด้วย ใช้ claim `name` จาก token ได้เลย
- **กรณี B:** ชื่ออยู่แค่ในฐานข้อมูลเว็บหลัก ให้ปุ่มฝั่งเขาส่ง `name` มาพร้อม token ฝั่งเราเชื่อชื่อนี้เพราะ token ยืนยันตัวตนแล้ว
- โค้ดฝั่งเรารองรับทั้งสองกรณี โดยใช้ claim `name` ถ้ามี ถ้าไม่มีใช้ `name` จากฟอร์ม ถ้าไม่มีทั้งคู่ใช้ส่วนหน้า @ ของ email

### กติกาความปลอดภัย
- **ห้ามส่ง token ทาง URL query** เพราะจะไปค้างใน log และประวัติเบราว์เซอร์ ให้ใช้ form POST
- token หมดอายุใน 1 ชม. และตรวจลายเซ็นกับ Google ทุกครั้ง
- ตรวจ `aud`/`iss` = `irish-lab` (firebase-admin ทำให้เอง)
- อายุ session ฝั่งเรา: พิจารณาลดเหลือ ~1 วัน เพื่อให้คนที่ถูกลบออกจากเว็บหลักหลุดไปเอง
- ห้ามรับ role จากฟอร์มตรงๆ ถ้าจะใช้ role ต้องมาจาก custom claim ใน token เท่านั้น

## แผนงาน (ประมาณ 1–2 วัน)
| ขั้น | งาน | ไฟล์ |
|---|---|---|
| 1 | เพิ่มคอลัมน์ `firebase_uid TEXT UNIQUE` และ `email` ในตาราง users (migration แบบ ALTER ถ้ายังไม่มี) | `db.js` |
| 2 | `npm i firebase-admin` แล้วเพิ่ม `POST /auth/firebase` สำหรับตรวจ token → หาหรือสร้างผู้ใช้ → ตั้ง session → redirect | `server.js` |
| 3 | ผู้ใช้ที่มาจาก Firebase ได้ role `staff` (ขอยืมได้อย่างเดียว) ส่วน admin login แบบเดิม | `server.js` |
| 4 | ฟอร์มยืม: ถ้า login แล้วให้ซ่อนช่องชื่อ/รหัสบัตร แล้วใช้ข้อมูลบัญชีแทน | `client/src/Items.jsx` |
| 5 | (ถ้าตัดสินใจปิด guest) เปลี่ยนหน้าแรกเป็นปุ่ม "เข้าสู่ระบบผ่านเว็บแลป" และตัดโค้ด guest_key/card | `server.js`, `client/src/App.jsx` |
| 6 | เพิ่มตัวแปรใน `.env`: `FIREBASE_PROJECT_ID=irish-lab`, `MAIN_SITE_URL=...` และตั้งค่า cookie/CORS | `server.js`, `.env` |
| 7 | ส่งโค้ดปุ่มให้ทีมเว็บหลัก (ดูด้านล่าง) | — |
| 8 | ให้ agent tester ทดสอบตั้งแต่ login ผ่าน token → ยืม → อนุมัติ → คืน แล้วให้ qa ตรวจช่องโหว่ | — |

### โค้ดปุ่มสำหรับเว็บหลัก (ร่าง)
```js
async function goToBorrowSite() {
  const user = firebase.auth().currentUser; // หรือ getAuth().currentUser (SDK v9)
  if (!user) return alert('กรุณา login ก่อน');
  const token = await user.getIdToken();
  const f = document.createElement('form');
  f.method = 'POST';
  f.action = 'https://<เว็บยืมของ>/auth/firebase';
  for (const [k, v] of Object.entries({ token, name: user.displayName || '' /* กรณี B: ใส่ชื่อจากฐานข้อมูล */ })) {
    const i = document.createElement('input');
    i.type = 'hidden'; i.name = k; i.value = v;
    f.appendChild(i);
  }
  document.body.appendChild(f);
  f.submit();
}
```

## ผลกระทบต่อข้อมูลเดิม
- ตาราง requests/transactions อ้างถึงผู้ใช้ด้วย `user_id` อยู่แล้ว จึง **ไม่ต้องย้ายข้อมูล**
- คำขอเก่าของ guest ยังอยู่ครบ
- โค้ดเบิก/ยืม/คืน/อนุมัติ **ไม่ต้องแตะ**

## ความเสี่ยง
| ความเสี่ยง | วิธีรับมือ |
|---|---|
| ผู้ใช้เปลี่ยนชื่อในเว็บหลัก | อ้างอิงด้วย `firebase_uid` และอัปเดตชื่อทุกครั้งที่ login |
| Firebase หรือเว็บหลักล่ม | admin ยัง login แบบรหัสผ่านได้ |
| ผู้ใช้ถูกลบจากเว็บหลักแต่ session เราค้าง | ลดอายุ session ลง |
| ปลอม `name` ในฟอร์ม (กรณี B) | คนปลอมต้องมี token ที่ถูกต้องของตัวเองก่อน และประวัติผูกกับ uid จริงเสมอ |
