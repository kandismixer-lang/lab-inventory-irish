# PRODUCT.md — ระบบคลัง IRiSH LAB

## What
ระบบ Inventory เบิกจ่าย/ยืม-คืน ของห้องแลป/เวิร์กช็อป IRiSH Lab (Intelligent Robot & Industrial System Hub) สเกลเล็ก (<10 คน). ภาษา: ไทย.

## Register
product — design SERVES the tool. เครื่องมือใช้งานจริงทุกวัน ไม่ใช่หน้าโชว์. ความชัด/สแกนง่าย/เร็ว มาก่อนความหวือหวา.

## Platform
web (React + Vite SPA, Express + libsql/SQLite backend, deploy Render + Turso).

## Users
admin (จัดการของ/อนุมัติ/ส่งมอบ) + staff (ยืม-เบิกผ่านตะกร้า/ยืนยันรับ/คืน). ใช้บนคอมเป็นหลัก, มือถือรองรับ.

## Design direction
Dark tech theme อ้างอิงเว็บจริง irish-tech.com:
- พื้นเกือบดำอมน้ำเงิน, accent cyan + primary ฟ้า, Space Grotesk display
- hairline-first (เส้น 1px ไม่ใช่กล่องหนา), pill buttons, motion เนียน (fade/hover-lift/nav underline glow)

## Hard constraints
- **ห้ามเปลี่ยนระบบ/logic/โครง JSX** — งาน design แตะแค่ CSS (สี/layout/typography/motion) เท่านั้น
- คงความหมายสีข้อมูลในตาราง: total=ฟ้า, ใช้/ยืม=แดง, คงเหลือ=เขียว
