import React, { useEffect, useState, useRef } from 'react';
import { api, REQ_STATUS, fileToScaledDataURL } from './api.js';
import { Modal, useToast } from './components.jsx';

const ADMIN_TABS = [
  ['pending', 'รออนุมัติ', 'pending'],
  ['approved', 'รอส่งมอบ', 'toHand'],
  ['handed', 'รอผู้ยืมยืนยัน', 'handed'],
  ['received', 'ถูกยืมอยู่'],
  ['', 'ทั้งหมด'],
];
const STAFF_TABS = [
  ['', 'ทั้งหมด'],
  ['active', 'กำลังดำเนินการ'],
];

export default function Requests({ me }) {
  const isAdmin = me.role === 'admin';
  const [tab, setTab] = useState(isAdmin ? 'pending' : '');
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const toast = useToast();

  const load = () => {
    let url = '/api/requests';
    if (tab && tab !== 'active') url += '?status=' + tab;
    api(url).then((data) => {
      if (tab === 'active') data = data.filter((r) => ['pending', 'approved', 'handed'].includes(r.status));
      setRows(data);
    });
    api('/api/requests/counts').then(setCounts).catch(() => {});
  };
  useEffect(() => { load(); }, [tab]);

  const tabs = isAdmin ? ADMIN_TABS : STAFF_TABS;

  return (
    <>
      <div className="section-title">คำขอยืม/เบิก</div>
      <div className="subtabs wrap">
        {tabs.map(([k, label, countKey]) => {
          const n = countKey ? counts[countKey] : 0;
          return (
            <button key={k} className={'btn small' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>
              {label}{n > 0 && <span className="tab-count">{n}</span>}
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="muted">— ไม่มีคำขอ —</p>
      ) : (
        <div className="req-list">
          {groupByOrder(rows).map((g) => (
            g.orderId == null
              ? <RequestCard key={'r' + g.lines[0].id} r={g.lines[0]} me={me} onDone={() => { load(); toast('อัปเดตแล้ว'); }} />
              : <OrderCard key={'o' + g.orderId} lines={g.lines} me={me} onDone={() => { load(); toast('อัปเดตแล้ว'); }} />
          ))}
        </div>
      )}
    </>
  );
}

// จัดกลุ่มคำขอตาม order_id (คงลำดับตามที่ backend ส่งมา, ใหม่สุดก่อน)
function groupByOrder(rows) {
  const out = [];
  const idx = {};
  for (const r of rows) {
    if (r.order_id == null) { out.push({ orderId: null, lines: [r] }); continue; }
    if (idx[r.order_id] == null) { idx[r.order_id] = out.length; out.push({ orderId: r.order_id, lines: [] }); }
    out[idx[r.order_id]].lines.push(r);
  }
  return out;
}

// การ์ดออเดอร์ = สรุป 1 ใบ กดกางดูรายการข้างใน
function OrderCard({ lines, me, onDone }) {
  const [open, setOpen] = useState(false);
  const first = lines[0];
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  // สรุปสถานะรวม
  const byStatus = {};
  lines.forEach((l) => { byStatus[l.status] = (byStatus[l.status] || 0) + 1; });
  const summary = Object.entries(byStatus)
    .map(([s, n]) => `${(REQ_STATUS[s] || { label: s }).label} ${n}`).join(' · ');
  return (
    <div className="order-card card">
      <div className="order-head" onClick={() => setOpen((v) => !v)}>
        <div className="req-info">
          <div className="req-title">
            <span className="badge st-handed">ออเดอร์ #{first.order_id}</span>
            <strong>{lines.length} รายการ · {totalQty} ชิ้น</strong>
          </div>
          <div className="req-sub">
            <span>👤 {first.requester_fullname || first.requester_name}</span>
            <span className="hint">🕑 {first.created_at}</span>
            <span className="muted">{summary}</span>
          </div>
        </div>
        <button className="btn small info">{open ? 'ซ่อนรายการ ▲' : 'ดูรายการ ▼'}</button>
      </div>
      {open && (
        <div className="order-lines">
          {lines.map((r) => <RequestCard key={r.id} r={r} me={me} onDone={onDone} />)}
        </div>
      )}
    </div>
  );
}

function RequestCard({ r, me, onDone }) {
  const isAdmin = me.role === 'admin';
  const mine = r.requester_id === me.id;
  const st = REQ_STATUS[r.status] || { label: r.status, cls: '' };
  const [modal, setModal] = useState(null); // 'handover' | 'receive' | 'reject'
  const [units, setUnits] = useState([]);   // หน่วยว่างของ item นี้ (pending + tracked)
  const [pickUnits, setPickUnits] = useState([]); // เลือกได้หลายหน่วย
  const toast = useToast();
  const toggleUnit = (id) => setPickUnits((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  // โหลดหน่วยว่างเมื่อเป็นคำขอ pending ของ item ที่ track รายตัว (สำหรับ admin เลือกให้ยืม)
  useEffect(() => {
    if (isAdmin && r.status === 'pending' && r.tracked) {
      api(`/api/items/${r.item_id}/units`).then((us) => setUnits(us.filter((u) => u.status === 'available')));
    }
  }, [r.status]);

  const call = async (action, body) => {
    try {
      await api(`/api/requests/${r.id}/${action}`, { method: 'POST', body });
      setModal(null);
      onDone();
    } catch (e) { toast(e.message); }
  };

  return (
    <div className="req-bar card">
      <div className="req-info">
        <div className="req-title">
          <strong>{r.item_name}</strong>
          <span className="muted">×{r.qty} {r.item_unit}</span>
          {(r.unit_codes || r.unit_code) && <span className="badge st-borrowed">{r.unit_codes || r.unit_code}</span>}
          <span className={'badge ' + st.cls}>{st.label}</span>
        </div>
        <div className="req-sub">
          <span>👤 {r.requester_fullname || r.requester_name}</span>
          <span className="hint">🕑 {r.created_at}</span>
          {r.approver_name && <span className="hint">✔ โดย {r.approver_name}</span>}
          {r.note && <span className="muted">📝 {r.note}</span>}
          {r.reject_reason && <span className="col-out">เหตุผล: {r.reject_reason}</span>}
        </div>
      </div>

      {(r.image_handover || r.image_receive) && (
        <div className="req-imgs">
          {r.image_handover && <ImgThumb src={r.image_handover} label="ส่งมอบ" />}
          {r.image_receive && <ImgThumb src={r.image_receive} label="รับ" />}
        </div>
      )}

      <div className="req-actions">
        {/* Admin: อนุมัติคำขอ pending */}
        {isAdmin && r.status === 'pending' && (
          <>
            {r.tracked ? (
              <div className="unit-pick">
                <div className="hint" style={{ margin: '0 0 4px' }}>
                  เลือกหน่วยให้ครบ {r.qty} ชิ้น (ว่าง {units.length}) — เลือกแล้ว {pickUnits.length}
                </div>
                <div className="unit-chips">
                  {units.map((u) => {
                    const on = pickUnits.includes(u.id);
                    const full = !on && pickUnits.length >= r.qty; // ครบจำนวนที่ขอแล้ว ห้ามติ๊กเพิ่ม
                    return (
                      <label key={u.id} className={'unit-chip' + (on ? ' on' : '') + (full ? ' disabled' : '')}>
                        <input type="checkbox" checked={on} disabled={full} onChange={() => toggleUnit(u.id)} />
                        {u.code}
                      </label>
                    );
                  })}
                </div>
                <button className="btn small primary" disabled={pickUnits.length !== r.qty}
                  onClick={() => call('approve', { unit_ids: pickUnits })}>อนุมัติให้ยืม</button>
              </div>
            ) : (
              <button className="btn small primary" onClick={() => call('approve', {})}>อนุมัติ</button>
            )}
            <button className="btn small danger" onClick={() => setModal('reject')}>ปฏิเสธ</button>
          </>
        )}
        {isAdmin && r.status === 'approved' && (
          <>
            <button className="btn small info" onClick={() => setModal('handover')}>ส่งมอบ + รูป</button>
            <button className="btn small danger" onClick={() => setModal('reject')}>ปฏิเสธ</button>
          </>
        )}
        {mine && r.status === 'pending' && (
          <button className="btn small" onClick={() => call('cancel')}>ยกเลิก</button>
        )}
        {mine && r.status === 'handed' && (
          <button className="btn small primary" onClick={() => setModal('receive')}>ยืนยันรับ + รูป</button>
        )}
        {r.status === 'received' && (mine || isAdmin) && (
          <button className="btn small" onClick={() => call('return')}>คืนของ</button>
        )}
      </div>

      {modal === 'reject' && <RejectModal onClose={() => setModal(null)} onSubmit={(b) => call('reject', b)} />}
      {modal === 'handover' && <ImageModal title="ส่งมอบของ" note="ถ่าย/แนบรูปตอนส่งมอบ (ไม่บังคับ)" onClose={() => setModal(null)} onSubmit={(img) => call('handover', { image: img })} />}
      {modal === 'receive' && <ImageModal title="ยืนยันรับของ" note="ถ่าย/แนบรูปตอนรับ (ไม่บังคับ)" onClose={() => setModal(null)} onSubmit={(img) => call('receive', { image: img })} />}
    </div>
  );
}

function ImgThumb({ src, label }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <figure className="thumb" onClick={() => setOpen(true)}>
        <img src={src} alt={label} />
        <figcaption>{label}</figcaption>
      </figure>
      {open && (
        <div className="modal" onClick={() => setOpen(false)}>
          <img className="img-full" src={src} alt={label} />
        </div>
      )}
    </>
  );
}

function RejectModal({ onClose, onSubmit }) {
  return (
    <Modal title="ปฏิเสธคำขอ" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit({ reason: e.target.reason.value }); }}>
        <label>เหตุผล (ไม่บังคับ)<input name="reason" /></label>
        <button className="btn danger" type="submit" style={{ marginTop: 14, width: '100%' }}>ยืนยันปฏิเสธ</button>
      </form>
    </Modal>
  );
}

// ถ่าย/เลือกรูป แล้วส่ง
function ImageModal({ title, note, onClose, onSubmit }) {
  const [img, setImg] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();

  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try { setImg(await fileToScaledDataURL(file)); } finally { setBusy(false); }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted">{note}</p>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={pick} style={{ display: 'none' }} />
      <button className="btn info" type="button" onClick={() => fileRef.current.click()} style={{ width: '100%' }}>
        📷 {img ? 'เปลี่ยนรูป' : 'ถ่าย / เลือกรูป'}
      </button>
      {busy && <p className="muted">กำลังประมวลผลรูป…</p>}
      {img && <img className="img-preview" src={img} alt="preview" />}
      <button className="btn primary" type="button" onClick={() => onSubmit(img)} style={{ marginTop: 12, width: '100%' }}>
        ยืนยัน{img ? ' (พร้อมรูป)' : ' (ไม่แนบรูป)'}
      </button>
    </Modal>
  );
}
