import React, { useEffect, useState } from 'react';
import { api, REQ_STATUS } from './api.js';
import { Modal, useToast, useConfirm } from './components.jsx';

const ADMIN_TABS = [
  ['pending', 'รออนุมัติ', 'pending'],
  ['received', 'ถูกยืมอยู่', 'borrowedOrders'],
  ['returned', 'คืนแล้ว'],
  ['', 'ทั้งหมด'],
];
const STAFF_TABS = [
  ['', 'ทั้งหมด'],
  ['pending', 'รออนุมัติ'],
  ['received', 'ถูกยืมอยู่', 'borrowedOrders'],
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

// วันนี้ (YYYY-MM-DD) สำหรับเทียบเกินกำหนด
const today = () => new Date().toLocaleDateString('sv-SE');

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
  const [rejecting, setRejecting] = useState(false);
  const toast = useToast();
  const first = lines[0];
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  // สรุปสถานะรวม
  const byStatus = {};
  lines.forEach((l) => { byStatus[l.status] = (byStatus[l.status] || 0) + 1; });
  const summary = Object.entries(byStatus)
    .map(([s, n]) => `${(REQ_STATUS[s] || { label: s }).label} ${n}`).join(' · ');
  // รายการที่ยังปฏิเสธได้ (pending/approved)
  const rejectable = lines.filter((l) => ['pending', 'approved'].includes(l.status));
  const approvable = lines.filter((l) => l.status === 'pending');
  const isAdmin = me.role === 'admin';
  const [approving, setApproving] = useState(false);

  const rejectAll = async (reason) => {
    try {
      for (const l of rejectable) {
        await api(`/api/requests/${l.id}/reject`, { method: 'POST', body: { reason } });
      }
      setRejecting(false);
      onDone();
    } catch (e) { toast(e.message); }
  };

  // อนุมัติทั้งออเดอร์ — ของ track จัดหน่วยว่างให้อัตโนมัติ, ของเบิก/ไม่ track อนุมัติตรง
  const approveAll = async () => {
    setApproving(true);
    const used = {}; // item_id -> Set(unit_id) กันหยิบหน่วยซ้ำข้ามรายการ
    let ok = 0, skip = 0;
    for (const l of approvable) {
      try {
        let body = {};
        if (l.tracked) {
          const us = await api(`/api/items/${l.item_id}/units`);
          const set = used[l.item_id] || (used[l.item_id] = new Set());
          const free = us.filter((u) => u.status === 'available' && !set.has(u.id)).slice(0, l.qty);
          if (free.length < l.qty) { skip++; continue; } // หน่วยว่างไม่พอ ข้ามไว้ค้าง pending
          free.forEach((u) => set.add(u.id));
          body = { unit_ids: free.map((u) => u.id) };
        }
        await api(`/api/requests/${l.id}/approve`, { method: 'POST', body });
        ok++;
      } catch { skip++; }
    }
    setApproving(false);
    onDone();
    toast(skip ? `อนุมัติ ${ok} รายการ · ข้าม ${skip} (หน่วยไม่พอ/ผิดพลาด)` : `อนุมัติครบ ${ok} รายการ`);
  };

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
        <div className="req-actions" onClick={(e) => e.stopPropagation()}>
          {isAdmin && approvable.length > 0 && (
            <button className="btn small primary" disabled={approving} onClick={approveAll}>
              {approving ? 'กำลังอนุมัติ…' : `✓ อนุมัติทั้งออเดอร์ (${approvable.length})`}
            </button>
          )}
          {isAdmin && rejectable.length > 0 && (
            <button className="btn small danger" onClick={() => setRejecting(true)}>ปฏิเสธทั้งออเดอร์ ({rejectable.length})</button>
          )}
          <button className="btn small info" onClick={() => setOpen((v) => !v)}>{open ? 'ซ่อนรายการ ▲' : 'ดูรายการ ▼'}</button>
        </div>
      </div>
      {open && (
        <div className="order-lines">
          {lines.map((r) => <RequestCard key={r.id} r={r} me={me} onDone={onDone} />)}
        </div>
      )}
      {rejecting && (
        <RejectModal
          title={`ปฏิเสธทั้งออเดอร์ #${first.order_id} (${rejectable.length} รายการ)`}
          onClose={() => setRejecting(false)}
          onSubmit={(b) => rejectAll(b.reason)}
        />
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
  const confirm = useConfirm();
  // อนุมัติ = ตัดสต็อกทันที → ถามยืนยันกันพลาด
  const approve = async (body) => {
    if (!(await confirm({
      title: `อนุมัติ ${r.item_name} ×${r.qty}?`,
      message: `จะตัดออกจากคลังทันที (${r.type === 'consumable' || r.kind === 'issue' ? 'เบิกจบ' : 'ยืม'}) ให้ ${r.person || r.requester_fullname || r.requester_name}`,
    }))) return;
    call('approve', body);
  };
  const toggleUnit = (id) => setPickUnits((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  // โหลดหน่วยว่างเมื่อเป็นคำขอ pending ของ item ที่ track รายตัว (สำหรับ admin เลือกให้ยืม)
  useEffect(() => {
    if (isAdmin && r.status === 'pending' && r.tracked) {
      api(`/api/items/${r.item_id}/units`).then((us) => setUnits(us.filter((u) => u.status === 'available')));
    }
  }, [r.status]);

  // optimistic: ปิด modal ทันที ยิง API เบื้องหลัง แล้วรีเฟรชเมื่อเสร็จ
  const call = (action, body) => {
    setModal(null);
    api(`/api/requests/${r.id}/${action}`, { method: 'POST', body })
      .then(onDone)
      .catch((e) => { toast(e.message); onDone(); });
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
          <span>👤 {r.person || r.requester_fullname || r.requester_name}</span>
          <span className="hint">🕑 {r.created_at}</span>
          {r.approver_name && <span className="hint">✔ โดย {r.approver_name}</span>}
          {r.due_date && (
            <span className={r.status === 'received' && r.due_date < today() ? 'col-out' : 'hint'}>
              📅 คืน {r.due_date}{r.status === 'received' && r.due_date < today() ? ' — เกินกำหนด!' : ''}
            </span>
          )}
          {r.note && <span className="muted">📝 {r.note}</span>}
          {r.reject_reason && <span className="col-out">เหตุผล: {r.reject_reason}</span>}
        </div>
      </div>

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
                  onClick={() => approve({ unit_ids: pickUnits })}>อนุมัติให้ยืม</button>
              </div>
            ) : (
              <button className="btn small primary" onClick={() => approve({})}>อนุมัติ</button>
            )}
            <button className="btn small danger" onClick={() => setModal('reject')}>ปฏิเสธ</button>
          </>
        )}
        {mine && r.status === 'pending' && (
          <button className="btn small" onClick={() => call('cancel')}>ยกเลิก</button>
        )}
        {isAdmin && r.status === 'received' && (
          <button className="btn small u-return" onClick={() => call('return')}>✓ รับของคืนแล้ว</button>
        )}
      </div>

      {modal === 'reject' && <RejectModal onClose={() => setModal(null)} onSubmit={(b) => call('reject', b)} />}
    </div>
  );
}

function RejectModal({ onClose, onSubmit, title }) {
  return (
    <Modal title={title || 'ปฏิเสธคำขอ'} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit({ reason: e.target.reason.value }); }}>
        <label>เหตุผล (ไม่บังคับ)<input name="reason" /></label>
        <button className="btn danger" type="submit" style={{ marginTop: 14, width: '100%' }}>ยืนยันปฏิเสธ</button>
      </form>
    </Modal>
  );
}

