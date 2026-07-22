import React, { useEffect, useState } from 'react';
import { api, REQ_STATUS } from './api.js';

// หน้า "ผู้ยืม" — ลิสต์ชื่อคน กดแล้วกางดูว่ายืม/เบิกอะไรไปบ้าง
export default function People() {
  const [people, setPeople] = useState(null);
  const [open, setOpen] = useState(null); // ชื่อที่กางอยู่
  const [q, setQ] = useState('');

  useEffect(() => { api('/api/borrowers').then(setPeople); }, []);
  if (!people) return <p className="muted">กำลังโหลด...</p>;

  const kw = q.trim().toLowerCase();
  const list = kw ? people.filter((p) => (p.name || '').toLowerCase().includes(kw)) : people;

  return (
    <>
      <div className="section-title">👥 ผู้ยืม</div>
      <div className="hint" style={{ marginBottom: 8 }}>กดที่ชื่อเพื่อดูว่าคนนั้นยืม/เบิกอะไรไปบ้าง</div>
      {people.length > 8 && (
        <input type="search" className="stock-search" placeholder="ค้นหาชื่อ…" value={q} onChange={(e) => setQ(e.target.value)} />
      )}
      {list.length === 0 ? (
        <p className="muted">— ยังไม่มีผู้ยืม —</p>
      ) : (
        <div className="req-list">
          {list.map((p) => (
            <PersonCard key={p.name} p={p} open={open === p.name} onToggle={() => setOpen(open === p.name ? null : p.name)} />
          ))}
        </div>
      )}
    </>
  );
}

function PersonCard({ p, open, onToggle }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (open && rows === null)
      api('/api/borrowers/history?name=' + encodeURIComponent(p.name)).then((data) =>
        // เห็นเฉพาะที่ยืมอยู่ + เบิกไป (consumable) — ซ่อนคืนแล้ว/ปฏิเสธ/ยกเลิก
        setRows(data.filter((r) => r.kind === 'issue' || (r.status !== 'returned' && r.status !== 'rejected' && r.status !== 'cancelled')))
      );
  }, [open]);

  return (
    <div className="order-card card">
      <div className="order-head" onClick={onToggle}>
        <div className="req-info">
          <div className="req-title">
            <span className="badge st-borrowed">👤</span>
            <strong>{p.name}</strong>
          </div>
          <div className="req-sub">
            {p.active > 0 && <span className="col-out">กำลังยืม {p.active} รายการ</span>}
            <span className="muted">ทั้งหมด {p.total} ครั้ง</span>
            <span className="hint">🕑 ล่าสุด {p.last_at}</span>
          </div>
        </div>
        <button className="btn small info" onClick={(e) => { e.stopPropagation(); onToggle(); }}>{open ? 'ซ่อน ▲' : 'ดูรายการ ▼'}</button>
      </div>
      {open && (
        <div className="order-lines">
          {rows === null ? <p className="muted" style={{ padding: 10 }}>กำลังโหลด...</p>
            : rows.length === 0 ? <p className="muted" style={{ padding: 10 }}>— ไม่มีของที่ยืม/เบิกอยู่ —</p>
            : rows.map((r) => {
              const st = REQ_STATUS[r.status] || { label: r.status, cls: '' };
              return (
                <div className="req-bar card" key={r.id}>
                  <div className="req-info">
                    <div className="req-title">
                      <strong>{r.item_name}</strong>
                      <span className="muted">×{r.qty} {r.unit}</span>
                      {r.unit_codes && <span className="badge st-borrowed">{r.unit_codes}</span>}
                      <span className={'badge ' + st.cls}>{st.label}</span>
                    </div>
                    <div className="req-sub">
                      <span className="hint">🕑 {r.created_at}</span>
                      {r.due_date && <span className="hint">📅 คืน {r.due_date}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
