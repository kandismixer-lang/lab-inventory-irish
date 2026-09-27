# ขอแก้เมนู "Equipment Loan" ให้ส่ง Firebase ID token มาที่ระบบคลัง

ส่งให้: ทีมพัฒนาเว็บ irish-tech.com · ติดต่อกลับ: เจ้าของระบบคลัง IRiSH Lab

## สรุปสั้น
ตอนนี้เมนู **Equipment Loan** เป็นลิงก์ธรรมดา `<a href="https://lab-inventory-t9oe.onrender.com">`
ขอเปลี่ยนเป็น**ปุ่มที่ส่ง Firebase ID token** มาให้ระบบคลัง เพื่อให้คนที่ login เว็บแลปอยู่แล้ว
เข้าไปยืมของได้เลยโดยไม่ต้อง login ซ้ำ และชื่อผู้ยืมถูกเติมให้อัตโนมัติ

ฝั่งระบบคลังทำเสร็จและ deploy รอไว้แล้ว **เหลือแค่ส่วนนี้ที่เดียว**

## ปลายทาง

```
POST https://lab-inventory-t9oe.onrender.com/auth/firebase
Content-Type: application/x-www-form-urlencoded
```

| ฟิลด์ | จำเป็น | ค่า |
|---|---|---|
| `token` | ✅ | ผลของ `user.getIdToken()` |
| `name` | แล้วแต่ | ชื่อที่จะใช้แสดงเป็นผู้ยืม — ถ้า `displayName` ว่าง ขอเป็นชื่อจากเอกสาร users ใน Firestore |
| `next` | ไม่ | path ที่จะให้เปิดหลังเข้าระบบ เช่น `/requests` (ไม่ใส่ = หน้าแรก) |

ระบบคลังจะตรวจลายเซ็น token กับ Google ทุกครั้ง แล้ว redirect เข้าเว็บคลังให้เอง
ไม่ต้องรอ response หรือจัดการอะไรต่อ

> ⚠️ **ต้องเป็น form POST เท่านั้น** อย่าส่ง token ทาง URL (`?token=...`) เพราะจะค้างอยู่ใน
> log เซิร์ฟเวอร์และประวัติเบราว์เซอร์ · และอย่าใช้ `fetch()` เพราะต้องเป็นการเปลี่ยนหน้าจริง
> เพื่อให้ cookie ของระบบคลังถูกตั้ง

## โค้ด (Next.js / React)

```jsx
'use client';
import { useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

const BORROW_SITE = 'https://lab-inventory-t9oe.onrender.com/auth/firebase';

export default function EquipmentLoanButton() {
  const [user, setUser] = useState(null);
  // ต้องรอ onAuthStateChanged — ตอนเพิ่งโหลดหน้า currentUser ยังเป็น null แม้ login ค้างไว้
  useEffect(() => onAuthStateChanged(getAuth(), setUser), []);

  const go = async () => {
    if (!user) return alert('Please sign in first / กรุณาเข้าสู่ระบบก่อน');

    const f = document.createElement('form');
    f.method = 'POST';
    f.action = BORROW_SITE;
    const fields = {
      token: await user.getIdToken(),
      name: user.displayName || '',   // ถ้าว่าง ใส่ชื่อจากเอกสาร users ใน Firestore แทน
    };
    for (const [k, v] of Object.entries(fields)) {
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

## ข้อควรรู้
- **ไม่ต้องตั้ง CORS** อะไรเพิ่ม (เป็น form POST แบบเปลี่ยนหน้า ไม่ใช่ fetch)
- ระบบคลังยอมรับคำขอจาก `https://irish-tech.com` และ `https://www.irish-tech.com` อยู่แล้ว
  ถ้าจะยิงจากโดเมนอื่น (staging/preview) แจ้งมาเพื่อเพิ่มรายชื่อให้
- ระบบคลังอยู่บน Render free tier — ถ้าไม่มีคนใช้นานเซิร์ฟเวอร์จะหลับ
  ครั้งแรกอาจรอ 30–50 วินาที (token อายุ 1 ชม. ไม่หมดก่อนแน่นอน)
- อยากให้เปิดแท็บใหม่: ใส่ `f.target = '_blank'` ก่อน `f.submit()`
- ถ้าโดเมนระบบคลังเปลี่ยนในอนาคต จะแจ้งให้แก้ `BORROW_SITE`

## ขอรบกวนยืนยัน 2 เรื่อง

**1. สิทธิ์อ่าน collection `member`**
ระบบคลังใช้ collection `member` เป็นตัวตัดสินว่าใครเป็นผู้ดูแลคลัง (คนใน `member` = admin, ที่เหลือ = ผู้ยืมทั่วไป)
ตอน login ระบบคลังจะอ่าน `member` **ในนามของผู้ใช้คนนั้นเอง** (ใช้ ID token ของเขา)

- ถ้า security rules ยอมให้ผู้ใช้ที่ login แล้วอ่าน `member` ได้ → ไม่ต้องทำอะไรเพิ่ม
- ถ้าไม่ยอม → ขอ service account key (Firebase Console → Project settings → Service accounts) เพื่อให้ระบบคลังอ่านได้โดยตรง

ขอทราบด้วยว่าเอกสารใน `member` ระบุตัวคนด้วยอะไร (รหัสเอกสารเป็น uid / เป็นอีเมล / หรือเก็บไว้ในฟิลด์ชื่ออะไร)
— ปัจจุบันระบบคลังลองให้อัตโนมัติทั้ง 4 แบบ แต่ถ้าทราบแน่ชัดจะตั้งค่าให้ตรงได้

**2. ใครแก้ `member` ได้บ้าง**
เนื่องจาก `member` กลายเป็นตัวกำหนดสิทธิ์ผู้ดูแลคลัง (เห็นข้อมูลผู้ยืมทุกคน จัดการคลังได้ทั้งหมด)
ขอให้ยืนยันว่า write rules ของ collection นี้จำกัดเฉพาะผู้ดูแล ไม่ใช่ผู้ใช้ที่ login แล้วทั่วไป

## หลังแก้เสร็จ
แจ้งกลับมาด้วย ฝั่งระบบคลังจะเปลี่ยนเป็น**บังคับ login** (คนที่ยังไม่เข้าสู่ระบบจะไม่เห็นข้อมูลคลังเลย)
ตอนนี้ยังเปิดให้ใช้งานแบบไม่ล็อกอินคู่กันไว้ชั่วคราว เพื่อไม่ให้ใครใช้งานไม่ได้ระหว่างรอ

## ทดสอบก่อนแก้จริงได้
เปิด irish-tech.com ตอน login อยู่ → DevTools (F12) → Console → วางโค้ดนี้
จะได้ผลเหมือนปุ่มจริงทุกประการ:

```js
(async () => {
  const { getAuth } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
  const u = getAuth().currentUser;
  if (!u) return console.error('ยังไม่ได้ login');
  const f = document.createElement('form');
  f.method = 'POST';
  f.action = 'https://lab-inventory-t9oe.onrender.com/auth/firebase';
  for (const [k, v] of Object.entries({ token: await u.getIdToken(), name: u.displayName || '' })) {
    const i = document.createElement('input');
    i.type = 'hidden'; i.name = k; i.value = v;
    f.appendChild(i);
  }
  document.body.appendChild(f); f.submit();
})();
```

เข้ามาแล้วถ้าเมนูซ้ายขึ้นชื่อจริง (ไม่ใช่ "ผู้เยี่ยมชม") = ใช้งานได้ครบวง
