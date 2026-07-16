# ระบบคลัง IRiSH LAB — คู่มือสำหรับ Claude

ระบบ Inventory เบิกจ่าย/ยืม-คืน ของห้องแลป/เวิร์กช็อป สเกลเล็ก (<10 คน) ภาษาสื่อสาร: **ไทย**

## Stack
- **Backend:** Node.js + Express + SQLite (โมดูล `node:sqlite` ในตัว Node 22.5+ — ไม่ต้อง build native) — [server.js](server.js), [db.js](db.js)
- **Frontend:** React (Vite) — โฟลเดอร์ [client/](client/) build ออกไปที่ `public/` ให้ Express เสิร์ฟ
- **DB ไฟล์เดียว:** `data/inventory.db` (โหมด WAL — backup ต้อง copy `.db` + `-wal` + `-shm` หรือหยุด server ก่อน)

## วิธีรัน
```bash
# backend (พอร์ต 3000 = แอปจริงที่ build แล้ว)
npm start
# พัฒนา UI (hot-reload พอร์ต 5173, proxy /api ไป 3000)
cd client && npm run dev
# แก้ client เสร็จต้อง build ก่อนถึงจะเห็นผลที่ :3000
cd client && npm run build
```
**สำคัญ:** แก้ไฟล์ใน `client/src/` แล้วต้อง `npm run build` เสมอ ถึงจะมีผลที่ :3000

## บัญชีทดสอบ
- admin: `admin` / `admin1234`
- staff: `staff1` / `staff123`

## โครงสร้าง client/src
- `App.jsx` — auth + แท็บ (แดชบอร์ด/รายการของ/คำขอ/ประวัติ*/ผู้ใช้*) *=admin เท่านั้น + badge คำขอ
- `Items.jsx` — หน้ารายการของ: ตารางสรุป, list, accordion จัดการหน่วยย่อย, ฟอร์มเพิ่ม/แก้, RequestForm (staff ขอยืม)
- `Requests.jsx` — หน้าคำขอ (workflow) การ์ดแถบยาว + dropdown เลือกหน่วยในตัว
- `Dashboard.jsx`, `Log.jsx`, `Users.jsx`, `components.jsx` (Modal/Table/Toast), `api.js`, `ErrorBoundary.jsx`

## Domain model
- **items**: มี `type` (tool=ยืม-คืน / consumable=เบิกหมด) + `category` (หมวดย่อย 7 แบบ) + `tracked` (track รายตัว)
  - หมวดใช้แล้วคืน→tool: เครื่องมือ, บอร์ด, หุ่นยนต์, สาย USB (ไม่ตัด)
  - หมวดใช้แล้วทิ้ง→consumable: สายไฟ, วัสดุสิ้นเปลือง, สาย USB (ใช้ตัด)
- **units**: หน่วยย่อยรายตัว (code + status: available/borrowed/repair/lost) สำหรับ item ที่ `tracked=1`
- **transactions**: ประวัติทุกการเคลื่อนไหว (add/issue/borrow/return/repair/ready/lost)
- **requests**: workflow ขออนุมัติ — pending→approved→handed→received→(returned) / rejected / cancelled
- **locations**: ตู้/ที่เก็บ (dropdown + เพิ่มได้)

## กติกาสำคัญ
- **สิทธิ์:** admin = เพิ่ม/แก้/สร้างหน่วย/อนุมัติ/ส่งมอบ · staff = ขอยืม + ยืนยันรับ + คืน เท่านั้น (บังคับที่ server)
- **workflow ขอยืม:** staff ขอ (เลือกแค่ชนิดของ) → admin อนุมัติ+เลือกหน่วยจริง (dropdown ในการ์ด) → ส่งมอบ (ตัดสต็อก+แนบรูป) → staff ยืนยันรับ (แนบรูป) → ถูกยืม → คืน
- **แนบรูป:** ถ่ายจากมือถือได้ ย่ออัตโนมัติเป็น JPEG ~1280px เก็บเป็น data URL ใน DB
- **ของ consumable เบิกจนเหลือ 0 หายจากหน้ารายการของ** (ข้อมูล/ประวัติยังอยู่ครบ) — admin ติ๊ก "แสดงของที่เบิกหมด" เพื่อดู/เติมสต็อก
- responsive คอม/มือถือแล้ว

## ค่าสีในตาราง
มีทั้งหมด=น้ำเงิน, ถูกใช้/ยืม=แดง, คงเหลือ=เขียว

## ข้อควรระวังตอน dev
- ทดสอบ API ด้วย **node fetch** ไม่ใช่ curl — curl บน Windows ส่งภาษาไทยใน body เพี้ยน (mojibake) ทำให้ข้อมูลทดสอบเสีย
- cookie-session ส่ง 2 cookie (sess + sess.sig) เวลาเทสต์ต้องเก็บทั้งคู่: `headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')`

## ยังไม่ได้ทำ / ค้างไว้
- Barcode/QR, แจ้งเตือนอีเมล/เกินกำหนด, import ของเดิม (CSV), สคริปต์ backup อัตโนมัติ
- มีข้อมูลทดสอบปนอยู่ (ชื่อบางอันเพี้ยนจาก curl) — รอถามผู้ใช้ว่าจะล้างไหม

## หมายเหตุ
ผู้ใช้ติดตั้ง skill `/caveman` (โหมดสื่อสารสั้น) ไว้ที่ `~/.claude/skills/caveman/` — ไม่ได้ลง hooks
