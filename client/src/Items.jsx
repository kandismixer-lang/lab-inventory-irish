import React, { useEffect, useState, useRef } from 'react';
import { api, TYPE_LABEL, KIND_LABEL, STATUS_LABEL, CATEGORY_GROUPS, CATEGORY_TYPE, fileToScaledDataURL } from './api.js';
import { Table, Modal, useToast } from './components.jsx';

export const catLabel = (i) => i.category || TYPE_LABEL[i.type];

export default function Items({ me }) {
  const isAdmin = me.role === 'admin';
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(undefined); // undefined=ปิด, null=เพิ่มใหม่, obj=แก้ไข
  const [moving, setMoving] = useState(null);
  const [requesting, setRequesting] = useState(null); // item ที่ staff กำลังขอ
  const [expanded, setExpanded] = useState(null); // id ของ item ที่กางหน่วยย่อยอยู่
  const [showEmpty, setShowEmpty] = useState(false); // แสดงของใช้แล้วทิ้งที่เบิกหมด
  const [cart, setCart] = useState([]);      // ตะกร้า: [{item, qty, note}]
  const [cartOpen, setCartOpen] = useState(false);
  const toast = useToast();
  const addToCart = (item, qty, note) => {
    setCart((p) => {
      const ex = p.find((c) => c.item.id === item.id);
      if (ex) return p.map((c) => c.item.id === item.id ? { ...c, qty: Math.min(item.qty, c.qty + qty), note: note || c.note } : c);
      return [...p, { item, qty, note }];
    });
    setRequesting(null);
    toast('เพิ่มลงตะกร้าแล้ว');
  };
  const timer = useRef();

  const load = (query = q, empty = showEmpty) =>
    api(`/api/items?q=${encodeURIComponent(query)}${empty ? '&includeEmpty=1' : ''}`).then(setItems);
  useEffect(() => { load('', showEmpty); }, []);
  useEffect(() => { load(q, showEmpty); }, [showEmpty]);

  const onSearch = (v) => {
    setQ(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => load(v), 250);
  };

  const refresh = () => { setEditing(undefined); setMoving(null); load(); };

  return (
    <>
      <div className="toolbar">
        <input type="search" placeholder="ค้นหาชื่อ / ที่เก็บ..." value={q} onChange={(e) => onSearch(e.target.value)} />
        {isAdmin && (
          <label className="check-inline" title="ของใช้แล้วทิ้งที่เหลือ 0 จะถูกซ่อนไว้">
            <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />
            แสดงของที่เบิกหมด
          </label>
        )}
        {isAdmin && <button className="btn primary" onClick={() => setEditing(null)}>+ เพิ่มรายการใหม่</button>}
      </div>

      <Summary items={items} />

      <div className="section-title">รายการทั้งหมด</div>
      <table>
        <thead>
          <tr>
            {['รายการ', 'ประเภท', 'มีทั้งหมด', 'ถูกใช้/ยืม', 'คงเหลือ', ''].map((h, i) => <th key={i}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={6} className="muted">— ไม่มีข้อมูล —</td></tr>
          )}
          {items.map((i) => {
            const low = i.type === 'consumable' && i.min_qty > 0 && i.qty <= i.min_qty;
            const outLabel = i.type === 'consumable' ? 'ใช้ไป' : 'ยืม/ไม่อยู่';
            const isOpen = expanded === i.id;
            return (
              <React.Fragment key={i.id}>
                <tr className={isOpen ? 'expanded-parent' : ''}>
                  <td>
                    <strong>{i.name}</strong>
                    {i.tracked ? <span className="hint">📇 track รายตัว</span> : null}
                    <div className="hint">📍 {i.location || '—'}{i.note ? ` · ${i.note}` : ''}</div>
                    {i.image ? <img className="item-thumb" src={i.image} alt={i.name} /> : null}
                  </td>
                  <td><span className={'badge ' + i.type}>{catLabel(i)}</span></td>
                  <td><span className="col-total">{i.total_qty} {i.unit}</span></td>
                  <td>
                    <span className={i.out_qty > 0 ? 'col-out' : 'muted'}>
                      {i.out_qty > 0 ? `${outLabel} ${i.out_qty}` : '—'}
                    </span>
                  </td>
                  <td><span className={low ? 'badge low' : 'col-remain'}>{i.qty} {i.unit}</span></td>
                  <td>
                    <div className="row-actions">
                      {isAdmin ? (
                        <>
                          {i.tracked
                            ? <button className={'btn small info' + (isOpen ? ' active' : '')} onClick={() => setExpanded(isOpen ? null : i.id)}>
                                จัดการหน่วย <span className="caret">{isOpen ? '▲' : '▼'}</span>
                              </button>
                            : <button className="btn small info" onClick={() => setMoving(i)}>เบิก/ยืม/รับเข้า</button>}
                          <button className="btn small edit" onClick={() => setEditing(i)}>แก้ไข</button>
                        </>
                      ) : (
                        <button className="btn small primary" disabled={i.qty <= 0} onClick={() => setRequesting(i)}>
                          {i.type === 'consumable' ? 'ขอเบิก' : 'ขอยืม'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {isOpen && i.tracked && (
                  <tr className="expand-row">
                    <td colSpan={6}>
                      <UnitsPanel item={i} me={me} onChanged={load} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      {editing !== undefined && (
        <ItemForm item={editing} me={me} onClose={() => setEditing(undefined)} onSaved={refresh} />
      )}
      {moving && <MoveForm item={moving} me={me} onClose={() => setMoving(null)} onDone={refresh} />}
      {requesting && <RequestForm item={requesting} onClose={() => setRequesting(null)} onAdd={addToCart} />}
      <CartBar cart={cart} onOpen={() => setCartOpen(true)} />
      {cartOpen && <CartModal cart={cart} setCart={setCart} onClose={() => setCartOpen(false)} onSubmitted={() => setCartOpen(false)} />}
    </>
  );
}

// Staff ขอยืม/ขอเบิก — เลือกจำนวน แล้วเพิ่มลงตะกร้า (ส่งเป็น 1 ออเดอร์ทีเดียว)
export function RequestForm({ item, onClose, onAdd }) {
  const submit = (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    onAdd(item, Math.max(1, parseInt(b.qty, 10) || 1), (b.note || '').trim());
  };
  return (
    <Modal title={(item.type === 'consumable' ? 'ขอเบิก' : 'ขอยืม') + ' — ' + item.name} onClose={onClose}>
      <div className="muted" style={{ marginBottom: 8 }}>
        คงเหลือให้ขอได้ {item.qty} {item.unit}{item.tracked ? ' (Admin จะเลือกหน่วยให้)' : ''}
      </div>
      <form onSubmit={submit}>
        <label>จำนวน ({item.unit})
          <input name="qty" type="number" min="1" max={item.qty} defaultValue="1" required />
        </label>
        {item.tracked && <div className="hint">ของ track รายตัว — Admin จะเลือกหน่วยจริงให้ครบตามจำนวนตอนอนุมัติ</div>}
        <label>เหตุผล/รายละเอียด (ไม่บังคับ)<input name="note" placeholder="เช่น ใช้ทำโปรเจกต์ ..." /></label>
        <button className="btn primary" type="submit" style={{ marginTop: 14, width: '100%' }}>เพิ่มลงตะกร้า</button>
      </form>
    </Modal>
  );
}

// ตะกร้า — แถบลอยล่างจอ + modal ยืนยันส่งเป็น 1 ออเดอร์
function CartBar({ cart, onOpen }) {
  if (cart.length === 0) return null;
  const total = cart.reduce((s, c) => s + c.qty, 0);
  return (
    <div className="cart-bar" onClick={onOpen}>
      <span>🛒 ตะกร้า {cart.length} รายการ · {total} ชิ้น</span>
      <button className="btn small primary" onClick={onOpen}>ดูตะกร้า / ยืมทั้งหมด</button>
    </div>
  );
}

function CartModal({ cart, setCart, onClose, onSubmitted }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const setQty = (id, q) => setCart((p) => p.map((c) => c.item.id === id ? { ...c, qty: Math.max(1, Math.min(c.item.qty, parseInt(q, 10) || 1)) } : c));
  const remove = (id) => setCart((p) => p.filter((c) => c.item.id !== id));
  const submit = async () => {
    if (cart.length === 0) return;
    setBusy(true); setErr('');
    try {
      const r = await api('/api/orders', { method: 'POST', body: { note, items: cart.map((c) => ({ item_id: c.item.id, qty: c.qty, note: c.note })) } });
      setCart([]);
      onSubmitted(r);
      toast(`ส่งออเดอร์แล้ว ${r.lines} รายการ`);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="ตะกร้ายืม/เบิก" onClose={onClose}>
      {cart.length === 0 ? <p className="muted">— ตะกร้าว่าง —</p> : (
        <div className="cart-lines">
          {cart.map((c) => (
            <div key={c.item.id} className="cart-line">
              <div className="cart-line-info">
                <strong>{c.item.name}</strong>
                <span className="badge">{catLabel(c.item)}</span>
                {c.note ? <span className="hint">📝 {c.note}</span> : null}
              </div>
              <input type="number" min="1" max={c.item.qty} value={c.qty} onChange={(e) => setQty(c.item.id, e.target.value)} style={{ width: 70 }} />
              <button className="btn small danger" onClick={() => remove(c.item.id)}>ลบ</button>
            </div>
          ))}
        </div>
      )}
      <label style={{ marginTop: 10 }}>หมายเหตุออเดอร์ (ไม่บังคับ)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น งานแข่ง..." /></label>
      <div className="err">{err}</div>
      <button className="btn primary" disabled={cart.length === 0 || busy} onClick={submit} style={{ marginTop: 12, width: '100%' }}>
        {busy ? 'กำลังส่ง…' : `ยืนยันยืมทั้งหมด (${cart.length} รายการ)`}
      </button>
    </Modal>
  );
}

// ตารางสรุปตามหมวดหมู่ — ด้านบนสุด
function Summary({ items }) {
  const groups = {};
  for (const i of items) {
    const key = catLabel(i);
    const g = (groups[key] ||= { type: i.type, kinds: 0, total: 0, out: 0, remain: 0 });
    g.kinds += 1;
    g.total += i.total_qty;
    g.out += i.out_qty;
    g.remain += i.qty;
  }
  const keys = Object.keys(groups).sort((a, b) => groups[b].kinds - groups[a].kinds);
  if (keys.length === 0) return null;

  return (
    <>
      <div className="section-title">สรุปตามหมวดหมู่</div>
      <Table
        headers={['หมวดหมู่', 'จำนวนชนิด', 'มีทั้งหมด', 'ถูกใช้/ยืม', 'คงเหลือ']}
        rows={keys.map((k) => ({
          key: k,
          cells: [
            <span className={'badge ' + groups[k].type}>{k}</span>,
            `${groups[k].kinds} ชนิด`,
            <span className="col-total">{groups[k].total}</span>,
            <span className={groups[k].out > 0 ? 'col-out' : 'muted'}>{groups[k].out}</span>,
            <span className="col-remain">{groups[k].remain}</span>,
          ],
        }))}
      />
    </>
  );
}

function ItemForm({ item, me, onClose, onSaved }) {
  const toast = useToast();
  const [err, setErr] = useState('');
  const [category, setCategory] = useState(item?.category || 'วัสดุสิ้นเปลือง');
  const [tracked, setTracked] = useState(!!item?.tracked);
  const [locations, setLocations] = useState([]);
  const [location, setLocation] = useState(item?.location || '');
  const type = CATEGORY_TYPE[category] || 'consumable';
  const [img, setImg] = useState('');            // รูปใหม่ (data URL) ถ้าเลือก
  const [imgBusy, setImgBusy] = useState(false);
  const imgRef = useRef();
  const pickImg = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImgBusy(true);
    try { setImg(await fileToScaledDataURL(f)); } finally { setImgBusy(false); }
  };

  // สร้างหน่วยอัตโนมัติตอนเพิ่มรายการใหม่ (track รายตัว)
  const [uprefix, setUprefix] = useState('');
  const [ucount, setUcount] = useState('');
  const [ustart, setUstart] = useState('1');
  const [upad, setUpad] = useState('2');
  const uN = parseInt(ucount, 10) || 0;
  const mkCode = (x) => `${uprefix}${String(x).padStart(Math.max(0, parseInt(upad, 10) || 0), '0')}`;
  const uStartNum = parseInt(ustart, 10) || 0;
  const uPreview = uN > 0
    ? (uN <= 2 ? Array.from({ length: uN }, (_, i) => mkCode(uStartNum + i)).join(', ')
      : `${mkCode(uStartNum)} … ${mkCode(uStartNum + uN - 1)}`)
    : '';

  useEffect(() => { api('/api/locations').then(setLocations); }, []);
  // ถ้าเปลี่ยนหมวดเป็น "ใช้แล้วทิ้ง" ให้เลิก track
  useEffect(() => { if (type !== 'tool') setTracked(false); }, [type]);

  const addLocation = async () => {
    const name = prompt('ชื่อตู้/ที่เก็บใหม่ (เช่น ตู้ D ชั้น 1)');
    if (!name || !name.trim()) return;
    try {
      const loc = await api('/api/locations', { method: 'POST', body: { name: name.trim() } });
      const list = await api('/api/locations');
      setLocations(list);
      setLocation(loc.name);
    } catch (e) { toast(e.message); }
  };

  const submit = async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    b.category = category;
    b.location = location;
    b.tracked = tracked ? 1 : 0;
    if (img) b.image = img;
    try {
      if (item) {
        await api('/api/items/' + item.id, { method: 'PUT', body: b });
      } else {
        const created = await api('/api/items', { method: 'POST', body: b });
        // สร้างหน่วยอัตโนมัติถ้า track รายตัว + ระบุจำนวน
        if (tracked && uN > 0) {
          await api('/api/items/' + created.id + '/units', {
            method: 'POST',
            body: { mode: 'bulk', prefix: uprefix.trim(), start: uStartNum, count: uN, pad: parseInt(upad, 10) || 0 },
          });
        }
      }
      toast('บันทึกแล้ว');
      onSaved();
    } catch (er) { setErr(er.message); }
  };
  const del = async () => {
    if (!confirm('ลบรายการนี้? (ประวัติยังเก็บไว้)')) return;
    await api('/api/items/' + item.id, { method: 'DELETE' });
    toast('ลบแล้ว');
    onSaved();
  };
  return (
    <Modal title={item ? 'แก้ไขรายการ' : 'เพิ่มรายการใหม่'} onClose={onClose}>
      <form onSubmit={submit}>
        <label>ชื่อรายการ<input name="name" required defaultValue={item?.name || ''} /></label>
        <div className="form-row">
          <label>หมวดหมู่
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORY_GROUPS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.cats.map((c) => <option key={c} value={c}>{c}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label>หน่วย<input name="unit" defaultValue={item?.unit || 'ชิ้น'} /></label>
        </div>
        <label>ตู้/ที่เก็บ
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <select value={location} onChange={(e) => setLocation(e.target.value)} style={{ flex: 1, marginTop: 0 }}>
              <option value="">— ไม่ระบุ —</option>
              {locations.map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}
            </select>
            <button type="button" className="btn small info" onClick={addLocation} title="เพิ่มตู้เก็บ">＋ เพิ่มตู้</button>
          </div>
        </label>
        {type === 'tool' && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
            <input type="checkbox" style={{ width: 'auto', margin: 0 }} checked={tracked}
              onChange={(e) => setTracked(e.target.checked)} disabled={!!item?.tracked} />
            <span>Track รายตัว — มีรหัสประจำแต่ละชิ้น (เช่น RPI-01…RPI-20)</span>
          </label>
        )}
        {tracked && item && <div className="hint">ไปกด "จัดการหน่วย" เพื่อเพิ่ม/แก้รหัสหน่วย</div>}
        {tracked && !item && (
          <div style={{ marginTop: 8, padding: '10px 12px', background: '#f1f5ff', borderRadius: 8 }}>
            <div className="hint" style={{ marginTop: 0 }}>สร้างหน่วยอัตโนมัติตอนบันทึก (เว้นจำนวนว่าง = ไปสร้างเองทีหลัง)</div>
            <div className="form-row">
              <label>Prefix รหัส<input value={uprefix} onChange={(e) => setUprefix(e.target.value)} placeholder="เช่น RPI-" /></label>
              <label>จำนวน<input type="number" min="0" max="500" value={ucount} onChange={(e) => setUcount(e.target.value)} placeholder="เช่น 20" /></label>
            </div>
            <div className="form-row">
              <label>เริ่มที่เลข<input type="number" min="0" value={ustart} onChange={(e) => setUstart(e.target.value)} /></label>
              <label>เติมศูนย์ (จำนวนหลัก)<input type="number" min="0" value={upad} onChange={(e) => setUpad(e.target.value)} /></label>
            </div>
            {uPreview && <div className="hint" style={{ marginBottom: 0 }}>ตัวอย่างรหัส: <b>{uPreview}</b> ({uN} ชิ้น)</div>}
          </div>
        )}
        <div className="form-row">
          {!item && !tracked && <label>จำนวนตั้งต้น<input name="qty" type="number" min="0" defaultValue="0" /></label>}
          {!tracked && <label>จุดเตือนของใกล้หมด<input name="min_qty" type="number" min="0" defaultValue={item?.min_qty ?? 0} /></label>}
        </div>
        <label>หมายเหตุ<input name="note" defaultValue={item?.note || ''} /></label>
        <label style={{ marginTop: 4 }}>รูปสินค้า (ไม่บังคับ)</label>
        <input ref={imgRef} type="file" accept="image/*" onChange={pickImg} style={{ display: 'none' }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="btn small info" onClick={() => imgRef.current.click()}>
            📷 {img ? 'เปลี่ยนรูป' : (item?.image ? 'เปลี่ยนรูป' : 'เลือกรูป')}
          </button>
          {imgBusy && <span className="muted">กำลังย่อรูป…</span>}
          {(img || item?.image) && <img className="item-thumb" src={img || item.image} alt="preview" />}
        </div>
        <div className="err">{err}</div>
        <button className="btn primary" type="submit" style={{ marginTop: 14, width: '100%' }}>
          {item ? 'บันทึกการแก้ไข' : 'เพิ่มรายการ'}
        </button>
        {item && me.role === 'admin' && (
          <button type="button" className="btn danger" onClick={del} style={{ marginTop: 8, width: '100%' }}>ลบรายการนี้</button>
        )}
      </form>
    </Modal>
  );
}

function MoveForm({ item, me, onClose, onDone }) {
  const toast = useToast();
  const isTool = item.type === 'tool';
  const [kind, setKind] = useState('add');
  const [err, setErr] = useState('');

  const kinds = ['add', ...(isTool ? ['borrow', 'return'] : ['issue']), ...(me.role === 'admin' ? ['adjust'] : [])];
  const needPerson = kind === 'issue' || kind === 'borrow' || kind === 'return';

  const submit = async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    b.kind = kind;
    try {
      const r = await api('/api/items/' + item.id + '/move', { method: 'POST', body: b });
      toast(`${KIND_LABEL[kind]}สำเร็จ — คงเหลือ ${r.newQty} ${item.unit}`);
      onDone();
    } catch (er) { setErr(er.message); }
  };

  return (
    <Modal title="เคลื่อนไหวสต็อก" onClose={onClose}>
      <div className="muted" style={{ marginBottom: 6 }}>{item.name} — คงเหลือ <strong>{item.qty} {item.unit}</strong></div>
      <div className="movebtns">
        {kinds.map((k) => (
          <button key={k} className={'btn ' + (k === kind ? 'primary' : '')} onClick={() => { setKind(k); setErr(''); }}>
            {KIND_LABEL[k]}{k === 'add' || k === 'return' ? ' (+)' : k === 'adjust' ? '' : ' (−)'}
          </button>
        ))}
      </div>
      <form onSubmit={submit} key={kind}>
        {kind === 'adjust' ? (
          <label>ยอดคงเหลือใหม่<input name="target" type="number" min="0" defaultValue={item.qty} required /></label>
        ) : (
          <label>จำนวน ({item.unit})<input name="qty" type="number" min="1" defaultValue="1" required /></label>
        )}
        {needPerson && (
          <label>{kind === 'return' ? 'คืนโดย' : 'ผู้เบิก/ยืม'}<input name="person" defaultValue={me.fullname || me.username} /></label>
        )}
        <label>หมายเหตุ<input name="note" /></label>
        <div className="err">{err}</div>
        <button className="btn primary" type="submit" style={{ marginTop: 12, width: '100%' }}>ยืนยัน — {KIND_LABEL[kind]}</button>
      </form>
    </Modal>
  );
}

// ปุ่มการกระทำต่อหน่วยย่อย ตามสถานะปัจจุบัน
const UNIT_BTNS = {
  available: [['borrow', 'ยืม'], ['repair', 'ส่งซ่อม'], ['lost', 'แจ้งหาย']],
  borrowed: [['return', 'คืน'], ['repair', 'ส่งซ่อม'], ['lost', 'แจ้งหาย']],
  repair: [['ready', 'ซ่อมเสร็จ'], ['lost', 'แจ้งหาย']],
  lost: [['ready', 'กู้คืน']],
};

function UnitsPanel({ item, me, onChanged }) {
  const toast = useToast();
  const [tab, setTab] = useState('list'); // list | add
  const [units, setUnits] = useState([]);
  const [err, setErr] = useState('');

  const load = () => api(`/api/items/${item.id}/units`).then(setUnits);
  useEffect(() => { load(); }, []);

  const act = async (unit, action) => {
    setErr('');
    let person;
    if (action === 'borrow') {
      person = prompt(`ยืม ${unit.code} — ใครยืม?`, me.fullname || me.username);
      if (person === null) return;
    }
    try {
      await api(`/api/units/${unit.id}/move`, { method: 'POST', body: { action, person } });
      toast(`${unit.code}: ${KIND_LABEL[action]}`);
      load(); onChanged();
    } catch (e) { setErr(e.message); }
  };

  const del = async (unit) => {
    if (!confirm(`เลิกใช้หน่วย ${unit.code}?`)) return;
    await api(`/api/units/${unit.id}`, { method: 'DELETE' });
    toast('เลิกใช้แล้ว'); load(); onChanged();
  };

  const addUnits = async (body) => {
    setErr('');
    try {
      const r = await api(`/api/items/${item.id}/units`, { method: 'POST', body });
      toast(`เพิ่ม ${r.added} หน่วย`);
      setTab('list'); load(); onChanged();
    } catch (e) { setErr(e.message); }
  };

  const counts = units.reduce((a, u) => ((a[u.status] = (a[u.status] || 0) + 1), a), {});

  return (
    <div className="units-panel">
      <div className="muted" style={{ marginBottom: 8 }}>
        ทั้งหมด {units.length} หน่วย · ว่าง {counts.available || 0} · ยืม {counts.borrowed || 0}
        {counts.repair ? ` · ซ่อม ${counts.repair}` : ''}{counts.lost ? ` · หาย ${counts.lost}` : ''}
      </div>
      <div className="subtabs">
        <button className={'btn small' + (tab === 'list' ? ' active' : '')} onClick={() => setTab('list')}>รายการหน่วย</button>
        <button className={'btn small' + (tab === 'add' ? ' active' : '')} onClick={() => setTab('add')}>+ สร้างหน่วย</button>
      </div>
      <div className="err">{err}</div>

      {tab === 'list' ? (
        units.length === 0 ? (
          <p className="muted">ยังไม่มีหน่วย — กด "+ สร้างหน่วย" เพื่อเพิ่ม</p>
        ) : (
          <div className="unit-list">
            {units.map((u) => (
              <div className="unit-row" key={u.id}>
                <span className="code">{u.code}</span>
                <span className={'badge st-' + u.status}>{STATUS_LABEL[u.status]}</span>
                {u.holder && <span className="holder">→ {u.holder}</span>}
                <span className="acts">
                  {(UNIT_BTNS[u.status] || []).map(([a, label]) => (
                    <button key={a} className="btn small" onClick={() => act(u, a)}>{label}</button>
                  ))}
                  {me.role === 'admin' && <button className="btn small danger" onClick={() => del(u)}>ลบ</button>}
                </span>
              </div>
            ))}
          </div>
        )
      ) : (
        <AddUnitsForm unit={item.unit} onBulk={addUnits} />
      )}
    </div>
  );
}

function AddUnitsForm({ unit, onBulk }) {
  const [mode, setMode] = useState('bulk');
  const [prefix, setPrefix] = useState('');
  const [start, setStart] = useState(1);
  const [count, setCount] = useState(10);
  const [pad, setPad] = useState(2);

  const preview = () => {
    const p = Math.max(0, parseInt(pad, 10) || 0);
    const s = parseInt(start, 10) || 0;
    const n = Math.min(parseInt(count, 10) || 0, 3);
    return Array.from({ length: n }, (_, i) => `${prefix}${String(s + i).padStart(p, '0')}`).join(', ');
  };

  return (
    <>
      <div className="subtabs">
        <button className={'btn small' + (mode === 'bulk' ? ' active' : '')} onClick={() => setMode('bulk')}>สร้างหลายชิ้น</button>
        <button className={'btn small' + (mode === 'single' ? ' active' : '')} onClick={() => setMode('single')}>ทีละชิ้น</button>
      </div>
      {mode === 'bulk' ? (
        <form onSubmit={(e) => { e.preventDefault(); onBulk({ mode: 'bulk', prefix, start, count, pad }); }}>
          <label>Prefix (คำนำหน้ารหัส)<input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="เช่น RPI-" /></label>
          <div className="form-row">
            <label>เลขเริ่ม<input type="number" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label>จำนวน<input type="number" min="1" max="500" value={count} onChange={(e) => setCount(e.target.value)} /></label>
            <label>เติม 0 (หลัก)<input type="number" min="0" value={pad} onChange={(e) => setPad(e.target.value)} /></label>
          </div>
          <div className="hint">ตัวอย่างรหัสที่จะสร้าง: {preview() || '—'} …</div>
          <button className="btn primary" type="submit" style={{ marginTop: 12, width: '100%' }}>สร้าง {count} หน่วย</button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); onBulk({ mode: 'single', code: e.target.code.value }); }}>
          <label>รหัสประจำตัว<input name="code" required placeholder="เช่น RPI-21" /></label>
          <button className="btn primary" type="submit" style={{ marginTop: 12, width: '100%' }}>เพิ่ม 1 หน่วย</button>
        </form>
      )}
    </>
  );
}
