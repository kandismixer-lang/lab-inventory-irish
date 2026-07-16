# Lab Inventory System — Wayfinder Map

label: wayfinder:map
status: open

## Destination

Spec ระบบคลังของห้องแลป/เวิร์กช็อป ครบพอส่งให้ Opus 4.8 build ได้ทันที — ระบุ domain model (ของ, จำนวน, ตำแหน่งเก็บ, ประวัติเพิ่ม/เบิก/ยืม-คืน พร้อมวันที่), ระบบ user หลายคน, tech stack, และแผน deploy บน VPS

## Notes

- บริบท: ห้องแลป/เวิร์กช็อป — มีทั้งเครื่องมือ (ยืม-คืน) และวัสดุสิ้นเปลือง (เบิกแล้วหมด)
- Platform: web app; deploy บน VPS ที่ผู้ใช้มีอยู่
- สเกลเล็ก: <10 user, ของหลักร้อยชิ้น — เน้นเรียบง่าย ดูแลน้อย
- หลังบ้านต้อง: add ของ (ชื่อ, จำนวน, ที่เก็บ), กดเพิ่มเมื่อซื้อ, กดลดเมื่อยืม/เบิก, log วันที่ทุกรายการ
- Skills ที่ควรใช้: /grilling, /domain-modeling สำหรับ ticket ตัดสินใจ; /prototype สำหรับ UI
- ภาษาสื่อสารในเซสชัน: ไทย (caveman mode)

## Decisions so far

<!-- one line per closed ticket -->

## Not yet specified

- Barcode/QR label ติดของ + สแกนตอนเบิก — รอผล domain model ว่าคุ้มไหมกับสเกลนี้
- แจ้งเตือนยืมเกินกำหนด / ของใกล้หมด (low-stock threshold) — รอ domain model
- Import ของที่มีอยู่แล้วเข้าระบบ (มี list เดิมไหม รูปแบบไหน) — รอ grilling domain
- Backup ข้อมูล — รอตัดสินใจ stack/DB

## Out of scope

- การ build และ deploy จริง — map นี้จบที่ spec ส่งต่อ Opus 4.8
- ระบบจัดซื้อ/สั่งของอัตโนมัติ (purchase order)
- จัดหา hardware เช่น barcode scanner

## Tickets

| id | title | type | status | blocked by |
|----|-------|------|--------|------------|
| [001](tickets/001-grilling-domain-model.md) | Grilling: domain model ของ + ตำแหน่งเก็บ + transaction | grilling (HITL) | open | — |
| [002](tickets/002-grilling-user-auth.md) | Grilling: ระบบ user + สิทธิ์ + วิธี login | grilling (HITL) | open | — |
| [003](tickets/003-grilling-stack-deploy.md) | Grilling: เลือก stack + แผน deploy บน VPS | grilling (HITL) | open | — |
| [004](tickets/004-prototype-ui.md) | Prototype: UI หน้าคลัง + flow เบิก/ยืม/เพิ่มของ | prototype (HITL) | open | 001 |
| [005](tickets/005-task-assemble-spec.md) | Task: ประกอบ spec ฉบับสมบูรณ์ส่ง Opus 4.8 | task (AFK) | open | 001, 002, 003, 004 |
