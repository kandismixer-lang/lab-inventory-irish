# DESIGN.md — IRiSH Lab dark theme

Tokens อยู่ที่ `client/src/styles.css` (`:root`). แก้ธีมที่นี่ที่เดียว.

## Color (dark)
| token | value | ใช้ |
|---|---|---|
| `--bg` | `#0a0a12` | พื้นหน้า (มี radial glow cyan/ฟ้าจาง) |
| `--card` / `--card-2` | `#11111a` / `#14141d` | การ์ด / surface ยก |
| `--line` / `--line-strong` | `#1f1f2b` / `#2b2b3a` | hairline / เน้น |
| `--text` / `--muted` | `#fafafa` / `#a8a8b8` | ตัวอักษร / รอง |
| `--accent` | `#22d3ee` (cyan) | active/link/focus/hover CTA |
| `--primary` | `#60a5fa` (ฟ้า) | ปุ่มหลัก (ตัวอักษรเข้ม `--on-primary`) |
| `--danger`/`--ok`/`--warn` | `#f87171`/`#4ade80`/`#fbbf24` | state บนพื้นมืด |

Data ในตาราง: `.col-total` ฟ้า · `.col-out` แดง · `.col-remain` เขียว.

## Type
Space Grotesk (display: หัวข้อ/แบรนด์/ตัวเลข) · Inter (body, รองรับไทย) · IBM Plex Mono (label ตาราง/รหัสหน่วย).

## Motion
fade-in-up (เนื้อหา/modal), hover-lift + cyan glow (card/stat/req), nav underline เรืองแสง, backdrop blur topbar. เคารพ `prefers-reduced-motion`.

## Shape
radius: card 14px · input/chip 8px · ปุ่ม/badge pill. hairline-first ไม่มีเงาหนัก (เงาเฉพาะ modal/cart/glow hover).

## กติกา
แก้ธีม = แก้ token/สไตล์ใน styles.css เท่านั้น. ห้ามแตะ logic/JSX. คลาสทั้งหมดคงเดิม.
