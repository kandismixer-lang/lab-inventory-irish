# ระบบคลังห้องแลป (Lab Inventory)

ระบบเบิกจ่าย/ยืม-คืน ของห้องแลป/เวิร์กช็อป สเกลเล็ก (<10 คน, ของหลักร้อยชิ้น)
เรียบง่าย ดูแลน้อย

**Stack:** Node.js + Express + SQLite (ในตัวของ Node) เป็น backend, **React (Vite)** เป็น frontend

## ความสามารถ

- **2 ประเภทของ**: วัสดุสิ้นเปลือง (เบิกแล้วหมด) และ เครื่องมือ (ยืม-คืน)
- **เพิ่มของ**: ชื่อ, ประเภท, หน่วย, ที่เก็บ, จำนวนตั้งต้น, จุดเตือนของใกล้หมด
- **เคลื่อนไหวสต็อก**: รับเข้า (ซื้อมา) / เบิก / ยืม / คืน / ปรับยอด — บันทึกวันเวลา + ผู้ทำ + ผู้เบิกทุกครั้ง
- **แดชบอร์ด**: ยอดรวม, ของใกล้หมด, สถานะเครื่องมือ, ความเคลื่อนไหวล่าสุด
- **ประวัติทั้งหมด**: log ทุกรายการย้อนหลัง
- **ผู้ใช้หลายคน**: login ด้วย username/password, สิทธิ์ `admin` / `staff`
- **ระบบขออนุมัติ (workflow)**: Staff กดขอยืม/ขอเบิก (เลือกแค่ชนิดของ) → Admin อนุมัติ+เลือกหน่วยจริง → Admin ส่งมอบ (แนบรูปได้, ของถูกตัดจากคลังตอนนี้) → Staff ยืนยันรับ (แนบรูปได้) → ถูกยืม → คืน
  - สิทธิ์: **Admin** เพิ่ม/แก้ไข/สร้างหน่วย/อนุมัติ/ส่งมอบ · **Staff** ขอยืม + ยืนยันรับ + คืน เท่านั้น
  - แนบรูปหลักฐาน 2 จุด (ตอนส่งมอบ / ตอนรับ) — ถ่ายจากมือถือได้ ระบบย่อรูปให้อัตโนมัติ
  - แท็บ "คำขอ" มี badge เตือนจำนวนที่รอดำเนินการ
- **Track รายตัว** (สำหรับเครื่องมือ): ของ 1 ชนิดมีหน่วยย่อยรายตัว มีรหัสประจำ (เช่น RPI-01…RPI-20)
  - ปุ่ม "สร้างหลายชิ้น" — กรอก prefix + เลขเริ่ม + จำนวน สร้างรหัสทีเดียวหลายตัว
  - แต่ละตัวมีสถานะ: ว่าง / ถูกยืม (รู้ว่าใครถือ) / ส่งซ่อม / หาย
  - หน้าคลังโชว์ "ว่าง 17/20", แดชบอร์ดโชว์ตัวที่ไม่อยู่ในคลังว่าอยู่กับใคร

## โครงสร้าง

```
server.js          API + auth (Express) — backend
db.js              schema + SQLite
scripts/init-db.js สร้าง admin + ข้อมูลตัวอย่าง
client/            โค้ด React (Vite) — แก้ UI ที่นี่
  src/App.jsx        หน้าหลัก + login + แท็บ
  src/Items.jsx      หน้ารายการของ + ฟอร์มเบิก/ยืม/เพิ่ม
  src/Dashboard.jsx  แดชบอร์ด
  src/Log.jsx        ประวัติทั้งหมด
  src/Users.jsx      จัดการผู้ใช้
public/            React ที่ build แล้ว (Express เสิร์ฟจากที่นี่ — อย่าแก้มือ)
data/inventory.db  ฐานข้อมูล (สร้างอัตโนมัติ)
```

## รันบนเครื่อง (dev)

**วิธีง่าย** — build React แล้วให้ Express เสิร์ฟ (เปิดหน้าเดียวจบ):

```bash
npm install                       # backend deps
cd client && npm install && cd .. # frontend deps
npm run init-db                   # สร้าง admin + ข้อมูลตัวอย่าง (ครั้งแรกครั้งเดียว)
npm run build                     # build React -> public/
npm start                         # เปิด http://localhost:3000
```

**วิธีพัฒนา UI (hot-reload)** — เปิด 2 terminal:

```bash
# terminal 1: backend
npm start                 # http://localhost:3000

# terminal 2: React dev server (auto-reload ตอนแก้โค้ด client/)
cd client && npm run dev  # เปิด http://localhost:5173  (proxy /api ไป backend อัตโนมัติ)
```

แก้ไฟล์ใน `client/src/` แล้วหน้าเว็บที่ :5173 จะรีเฟรชเอง พอพอใจแล้วค่อย `npm run build`

บัญชีเริ่มต้น: **admin / admin1234** — เข้าไปแล้วกด "เปลี่ยนรหัส" ทันที

## Deploy บน VPS

ต้องมี **Node.js เวอร์ชัน 22.5 ขึ้นไป** (ใช้โมดูล `node:sqlite` ในตัว)

```bash
# บน VPS
git clone <repo> lab-inventory && cd lab-inventory   # หรือ copy โฟลเดอร์ขึ้นไป
npm install --omit=dev
cd client && npm install && npm run build && cd ..   # build React -> public/
SESSION_SECRET="สุ่มค่ายาวๆ" ADMIN_PASS="รหัสที่ต้องการ" npm run init-db
```

> ทางเลือก: จะ build React บนเครื่องตัวเองแล้ว copy เฉพาะโฟลเดอร์ `public/` ขึ้น VPS ก็ได้ (VPS ไม่ต้องลง client deps)

รันแบบถาวรด้วย **pm2** (แนะนำ):

```bash
npm install -g pm2
PORT=3000 SESSION_SECRET="สุ่มค่ายาวๆ" pm2 start server.js --name inventory
pm2 save && pm2 startup      # ให้รันเองหลัง reboot
```

แล้วตั้ง reverse proxy (Nginx) ให้โดเมนชี้มาที่ `127.0.0.1:3000` + ติด HTTPS ด้วย certbot

### ตัวอย่าง Nginx

```nginx
server {
  server_name inventory.example.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
  }
}
```

## ตัวแปรสภาพแวดล้อม (env)

| ตัวแปร | ค่าเริ่มต้น | คำอธิบาย |
|--------|-----------|----------|
| `PORT` | 3000 | พอร์ตที่เปิด |
| `DB_PATH` | `./data/inventory.db` | ตำแหน่งไฟล์ฐานข้อมูล |
| `SESSION_SECRET` | (ค่า dev) | **ต้องเปลี่ยน** ตอน production — กุญแจเซ็น cookie |
| `ADMIN_USER` / `ADMIN_PASS` | admin / admin1234 | บัญชี admin ที่ `init-db` สร้าง |

## Backup

ข้อมูลทั้งหมดอยู่ในโฟลเดอร์ `data/` — สำรองแค่ copy โฟลเดอร์นี้ก็พอ
(ตั้ง cron คัดลอก `data/` ไปเก็บที่อื่นทุกวันได้เลย):

```bash
0 2 * * *  cp -r /path/to/lab-inventory/data /backup/inventory-$(date +\%F)
```
