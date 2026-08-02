import React, { useEffect, useState } from 'react';
import { api, REQ_STATUS } from './api.js';
import { useToast, useConfirm } from './components.jsx';

// หน้า "ผู้ยืม" — ลิสต์ชื่อคน กดแล้วกางดูว่ายืม/เบิกอะไรไปบ้าง
export default function People() {
  const [people, setPeople] = useState(null);
  const [open, setOpen] = useState(null); // ชื่อที่กางอยู่
  const [q, setQ] = useState('');
  const toast = useToast();
  const confirm = useConfirm();

  const load = () => api('/api/borrowers').then(setPeople);
  useEffect(() => { load(); }, []);

  const del = async (p) => {
    if (!(await confirm({
      title: `ลบผู้ยืม "${p.name}"?`,
      message: `ลบประวัติคำขอทั้งหมดของคนนี้${p.active > 0 ? ` และคืนของที่ถืออยู่ ${p.active} รายการกลับคลัง` : ''} — ใช้สำหรับล้างข้อมูลทดสอบ`,
    }))) return;
    setPeople((ps) => ps.filter((x) => x.name !== p.name)); // เอาออกจากจอทันที
    if (open === p.name) setOpen(null);
    toast(`ลบ "${p.name}" แล้ว`);
    api('/api/borrowers?name=' + encodeURIComponent(p.name), { method: 'DELETE' }).then(load).catch((e) => { toast(e.message); load(); });
  };

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
            <PersonCard key={p.name} p={p} open={open === p.name} onToggle={() => setOpen(open === p.name ? null : p.name)} onDelete={() => del(p)} />
          ))}
        </div>
      )}
    </>
  );
}

function PersonCard({ p, open, onToggle, onDelete }) {
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
        <div className="req-actions" onClick={(e) => e.stopPropagation()}>
          <button className="btn small info" onClick={onToggle}>{open ? 'ซ่อน ▲' : 'ดูรายการ ▼'}</button>
          <button className="btn small danger" onClick={onDelete} title="ลบผู้ยืม (ล้างข้อมูลทดสอบ)">ลบ</button>
        </div>
      </div>
      {open && (
        <div className="order-lines">
          {rows === null ? <p className="muted" style={{ padding: 10 }}>กำลังโหลด...</p>
            : rows.length === 0 ? <p className="muted" style={{ padding: 10 }}>— ไม่มีของที่ยืม/เบิกอยู่ —</p>
            : rows.map((r) => {
              const st = REQ_STATUS[r.status] || { label: r.status, cls: '' };
              return (
                <div className="req-bar" key={r.id}>
                  <div className="req-info">
                    <div className="req-title">
                      <strong>{r.item_name}</strong>
                      <span className="muted">×{r.qty} {r.unit}</span>
                      {r.unit_codes && <span className="badge st-borrowed">{r.unit_codes}</span>}
                      <span className={'badge ' + st.cls}>{st.label}</span>
                    </div>
                    <div className="req-sub">
                      {r.note && <span className="muted">{r.note}</span>}
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
