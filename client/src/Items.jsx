import React, { useEffect, useState, useRef, useMemo } from 'react';
import { api, TYPE_LABEL, KIND_LABEL, STATUS_LABEL, CATEGORY_GROUPS, CATEGORY_TYPE, fileToScaledDataURL } from './api.js';
import { Table, Modal, useToast, useConfirm, usePrompt } from './components.jsx';
import { useCart } from './Cart.jsx';

export const catLabel = (i) => i.category || TYPE_LABEL[i.type];

export default function Items({ me, focusItem, onFocused }) {
  // จัดการคลังได้เฉพาะ admin — คนอื่นกดได้แค่ "ขอยืม/ขอเบิก" (ลงตะกร้า) แล้วรออนุมัติ
  const isAdmin = me.role === 'admin';
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(undefined); // undefined=ปิด, null=เพิ่มใหม่, obj=แก้ไข
  const [moving, setMoving] = useState(null);
  const [requesting, setRequesting] = useState(null); // item ที่ staff กำลังขอ
  const [expanded, setExpanded] = useState(null); // id ของ item ที่กางหน่วยย่อยอยู่
  const [showEmpty, setShowEmpty] = useState(false); // แสดงของใช้แล้วทิ้งที่เบิกหมด
  const [detail, setDetail] = useState(null); // item ที่กำลังดูรายละเอียด
  const toast = useToast();
  const { addToCart } = useCart();
  const onAddToCart = (item, qty, note) => { addToCart(item, qty, note); setRequesting(null); };
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

  // ถูกส่งมาจากแดชบอร์ด (กดของในตาราง) — เปิดของตัวนั้นรอให้เลย
  useEffect(() => {
    if (!focusItem || items.length === 0) return;
    const it = items.find((x) => x.id === focusItem);
    if (!it) return;
    if (it.tracked) setExpanded(it.id);   // track รายตัว = กางรายการหน่วย
    else if (isAdmin) setMoving(it);      // ไม่ track = เปิดฟอร์มยืม/คืน/รับเข้า
    else setRequesting(it);               // staff = เปิดฟอร์มขอยืม
    setTimeout(() => {
      document.getElementById('item-' + it.id)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 50);
    onFocused?.();
  }, [focusItem, items]);

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
            {['รายการ', 'ประเภท', 'มีทั้งหมด', 'ถูกใช้/ยืม', 'คงเหลือ'].map((h, i) => <th key={i}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={5} className="muted">— ไม่มีข้อมูล —</td></tr>
          )}
          {items.map((i) => {
            const low = i.type === 'consumable' && i.min_qty > 0 && i.qty <= i.min_qty;
            const outLabel = i.type === 'consumable' ? 'ใช้ไป' : 'ถูกยืม';
            const isOpen = expanded === i.id;
            // ของ track รายตัว: กดที่แถวไหนก็กางดูหน่วย (user เปิดได้เฉพาะตอนมีตัวถูกยืม)
            const rowClickable = !!i.tracked && (isAdmin || i.out_qty > 0);
            return (
              <React.Fragment key={i.id}>
                <tr
                  id={'item-' + i.id}
                  className={(isOpen ? 'expanded-parent' : '') + (rowClickable ? ' row-click' : '')}
                  onClick={rowClickable ? () => setExpanded(isOpen ? null : i.id) : undefined}
                  title={rowClickable ? 'กดที่แถวเพื่อเปิด Stock Check' : undefined}
                >
                  <td>
                    <strong>{i.name}</strong>
                    {i.tracked ? <span className="hint">📇 track รายตัว</span> : null}
                    {i.image ? <img className="item-thumb" src={i.image} alt={i.name} onClick={(e) => { e.stopPropagation(); setDetail(i); }} /> : null}
                    {/* ปุ่มทั้งหมดรวมอยู่ในช่องรายการ — ประหยัดคอลัมน์บนมือถือ */}
                    <div className="row-actions">
                      <button type="button" className="btn small info" onClick={(e) => { e.stopPropagation(); setDetail(i); }}>รายละเอียด</button>
                      {isAdmin ? (
                        <>
                          {i.tracked
                            ? <button className={'btn small info' + (isOpen ? ' active' : '')} onClick={(e) => { e.stopPropagation(); setExpanded(isOpen ? null : i.id); }}>
                                Stock Check <span className="caret">{isOpen ? '▲' : '▼'}</span>
                              </button>
                            : <button className="btn small info" onClick={(e) => { e.stopPropagation(); setMoving(i); }}>เบิก/ยืม/รับเข้า</button>}
                          <button className="btn small edit" onClick={(e) => { e.stopPropagation(); setEditing(i); }}>แก้ไข</button>
                        </>
                      ) : (
                        <>
                          {!!i.tracked && i.out_qty > 0 && (
                            <button className={'btn small info' + (isOpen ? ' active' : '')} onClick={(e) => { e.stopPropagation(); setExpanded(isOpen ? null : i.id); }}>
                              ดูตัวที่ถูกยืม <span className="caret">{isOpen ? '▲' : '▼'}</span>
                            </button>
                          )}
                          <button className="btn small primary" disabled={i.qty <= 0} onClick={(e) => { e.stopPropagation(); setRequesting(i); }}>
                            {i.type === 'consumable' ? 'ขอเบิก' : 'ขอยืม'}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                  <td><span className={'badge ' + i.type}>{catLabel(i)}</span></td>
                  <td><span className="col-total">{i.total_qty} {i.unit}</span></td>
                  <td>
                    <span className={i.out_qty > 0 ? 'col-out' : 'muted'}>
                      {i.out_qty > 0 ? `${outLabel} ${i.out_qty}` : '—'}
                    </span>
                  </td>
                  <td><span className={low ? 'badge low' : 'col-remain'}>{i.qty} {i.unit}</span></td>
                </tr>
                {isOpen && !!i.tracked && (
                  <tr className="expand-row">
                    <td colSpan={5}>
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
      {requesting && <RequestForm item={requesting} onClose={() => setRequesting(null)} onAdd={onAddToCart} />}
      {detail && <DetailModal item={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

// popup รายละเอียด — รูป + ชื่อ + สเปค
function DetailModal({ item, onClose }) {
  return (
    <Modal title={item.name} onClose={onClose}>
      {item.image
        ? <img className="detail-img" src={item.image} alt={item.name} />
        : <div className="detail-noimg">— ไม่มีรูป —</div>}
      <div className="detail-meta">
        <span className={'badge ' + item.type}>{catLabel(item)}</span>
        <span className="hint">📍 {item.location || 'ไม่ระบุที่เก็บ'}</span>
        <span className="col-remain">คงเหลือ {item.qty} {item.unit}</span>
        {!!item.tracked && <span className="hint">📇 track รายตัว</span>}
      </div>
      <div className="detail-head">สเปค / รายละเอียด</div>
      <div className="detail-spec">{(item.spec || '').trim() || '— ยังไม่ได้ใส่ข้อมูล —'}</div>
      {item.note ? <div className="hint" style={{ marginTop: 10 }}>📝 {item.note}</div> : null}
    </Modal>
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
        {!!item.tracked && <div className="hint">ของ track รายตัว — Admin จะเลือกหน่วยจริงให้ครบตามจำนวนตอนอนุมัติ</div>}
        <label>เหตุผล/รายละเอียด (ไม่บังคับ)<input name="note" placeholder="เช่น ใช้ทำโปรเจกต์ ..." /></label>
        <button className="btn primary" type="submit" style={{ marginTop: 14, width: '100%' }}>เพิ่มลงตะกร้า</button>
      </form>
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
  const confirm = useConfirm();
  const promptDlg = usePrompt();
  const [err, setErr] = useState('');
  const [category, setCategory] = useState(item?.category || 'วัสดุสิ้นเปลือง');
  const [tracked, setTracked] = useState(!!item?.tracked);
  const [locations, setLocations] = useState([]);
  const [location, setLocation] = useState(item?.location || '');
  const type = CATEGORY_TYPE[category] || 'consumable';
  const [img, setImg] = useState('');            // รูปใหม่ (data URL) ถ้าเลือก
  const [removeImg, setRemoveImg] = useState(false); // ติ๊กลบรูปเดิม
  const [imgBusy, setImgBusy] = useState(false);
  const imgRef = useRef();
  const pickImg = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImgBusy(true);
    try { setImg(await fileToScaledDataURL(f)); setRemoveImg(false); } finally { setImgBusy(false); }
  };
  const shownImg = removeImg ? '' : (img || item?.image || '');
  const delImg = async () => {
    if (!(await confirm({ title: 'ลบรูปสินค้า?', message: 'รายการนี้จะไม่มีรูปแสดงในตาราง' }))) return;
    setImg('');
    setRemoveImg(true);
    if (imgRef.current) imgRef.current.value = '';
  };

  // สร้างหน่วยอัตโนมัติตอนเพิ่มรายการใหม่ (track รายตัว)
  const [uprefix, setUprefix] = useState('');
  // เปิด track ให้ของเดิม: ตั้งจำนวนเริ่มต้นเท่าที่มีอยู่ (จะได้สร้างรหัสครบ)
  const [ucount, setUcount] = useState(item && !item.tracked ? String(item.qty || '') : '');
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
    const name = await promptDlg({ title: 'เพิ่มตู้/ที่เก็บใหม่', placeholder: 'เช่น ตู้ D ชั้น 1' });
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
    else if (removeImg) b.image = ''; // '' = สั่งลบรูปเดิม
    try {
      if (item) {
        await api('/api/items/' + item.id, { method: 'PUT', body: b });
        // เพิ่งเปิด track รายตัวให้ของเดิม + ระบุจำนวน = สร้างหน่วยให้เลย
        if (tracked && !item.tracked && uN > 0) {
          await api('/api/items/' + item.id + '/units', {
            method: 'POST',
            body: { mode: 'bulk', prefix: uprefix.trim(), start: uStartNum, count: uN, pad: parseInt(upad, 10) || 0 },
          });
        }
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
    if (!(await confirm({ title: 'ลบรายการนี้?', message: 'รายการจะถูกซ่อน (ประวัติ/ข้อมูลยังเก็บไว้)' }))) return;
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
        {tracked && !!item?.tracked && <div className="hint">ไปกด "Stock Check" เพื่อเพิ่ม/แก้รหัสหน่วย</div>}
        {tracked && !item?.tracked && (
          <div style={{ marginTop: 8, padding: '10px 12px', background: '#f1f5ff', borderRadius: 8 }}>
            <div className="hint" style={{ marginTop: 0 }}>
              {item
                ? `เปิด track รายตัว — ของเดิม ${item.qty} ${item.unit} จะถูกแทนด้วยรหัสรายชิ้น (คงเหลือนับจากจำนวนหน่วยที่สร้าง)`
                : 'สร้างหน่วยอัตโนมัติตอนบันทึก (เว้นจำนวนว่าง = ไปสร้างเองทีหลัง)'}
            </div>
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
        <label>สเปค / รายละเอียด (โชว์ในป๊อปอัป "รายละเอียด")
          <textarea name="spec" rows="7" defaultValue={item?.spec || ''}
            placeholder={'ใส่ได้อิสระ เช่น\nCPU: Broadcom BCM2712 quad-core\nRAM: 8GB LPDDR4X\nไฟเลี้ยง: 5V/5A USB-C\nหมายเหตุ: มีพัดลมติดมาด้วย'} />
        </label>
        <label style={{ marginTop: 4 }}>รูปสินค้า (ไม่บังคับ)</label>
        <input ref={imgRef} type="file" accept="image/*" onChange={pickImg} style={{ display: 'none' }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="btn small info" onClick={() => imgRef.current.click()}>
            📷 {shownImg ? 'เปลี่ยนรูป' : 'เลือกรูป'}
          </button>
          {shownImg && <button type="button" className="btn small danger" onClick={delImg}>ลบรูป</button>}
          {imgBusy && <span className="muted">กำลังย่อรูป…</span>}
          {shownImg
            ? <img className="item-thumb" src={shownImg} alt="preview" />
            : (removeImg ? <span className="hint">จะลบรูปเมื่อกดบันทึก</span> : null)}
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
  // tool = ตั้งต้นที่ "ยืม" (first choice), consumable = "เบิก"
  const [kind, setKind] = useState(isTool ? 'borrow' : 'issue');
  const [err, setErr] = useState('');

  // ยืม/เบิก มาก่อน แล้วค่อย คืน/รับเข้า/ปรับยอด
  const kinds = [...(isTool ? ['borrow', 'return'] : ['issue']), 'add', ...(me.role === 'admin' ? ['adjust'] : [])];
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
          <button key={k} className={`btn k-${k}` + (k === kind ? ' active' : '')} onClick={() => { setKind(k); setErr(''); }}>
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
        <button className={`btn k-${kind} active`} type="submit" style={{ marginTop: 12, width: '100%' }}>ยืนยัน — {KIND_LABEL[kind]}</button>
      </form>
    </Modal>
  );
}

// ปุ่มการกระทำต่อหน่วยย่อย ตามสถานะปัจจุบัน
const UNIT_BTNS = {
  available: [['borrow', 'ยืม'], ['repair', 'แจ้งพัง'], ['lost', 'แจ้งหาย']],
  borrowed: [['return', 'คืน'], ['repair', 'แจ้งพัง'], ['lost', 'แจ้งหาย']],
  repair: [['ready', 'ซ่อมเสร็จ'], ['lost', 'แจ้งหาย']],
  lost: [['ready', 'กู้คืน']],
};

function UnitsPanel({ item, me, onChanged }) {
  const isAdmin = me.role === 'admin'; // user เห็นได้แค่ว่าตัวไหนถูกยืม/พัง/หาย — ไม่มีปุ่มจัดการ
  const toast = useToast();
  const confirm = useConfirm();
  const promptDlg = usePrompt();
  const [tab, setTab] = useState('list'); // list | add
  const [units, setUnits] = useState([]);
  const [err, setErr] = useState('');

  const load = () => api(`/api/items/${item.id}/units`).then(setUnits);
  useEffect(() => { load(); }, []);

  const act = async (unit, action) => {
    setErr('');
    let person;
    if (action === 'borrow') {
      person = await promptDlg({ title: `ยืม ${unit.code}`, message: 'ใครยืม?', value: me.fullname || me.username });
      if (person === null) return;
    }
    try {
      await api(`/api/units/${unit.id}/move`, { method: 'POST', body: { action, person } });
      toast(`${unit.code}: ${KIND_LABEL[action]}`);
      load(); onChanged();
    } catch (e) { setErr(e.message); }
  };

  const del = async (unit) => {
    if (!(await confirm({ title: `เลิกใช้หน่วย ${unit.code}?`, message: 'หน่วยนี้จะถูกนำออกจากคลัง (ประวัติยังอยู่)' }))) return;
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
  // user เห็นเฉพาะหน่วยที่ไม่ว่าง (ถูกยืม/พัง/หาย) — ตัวว่างไม่ต้องโชว์
  const shownUnits = isAdmin ? units : units.filter((u) => u.status !== 'available');

  return (
    <div className="units-panel">
      <div className="muted" style={{ marginBottom: 8 }}>
        ทั้งหมด {units.length} หน่วย · ว่าง {counts.available || 0} · ยืม {counts.borrowed || 0}
        {counts.repair ? ` · พัง ${counts.repair}` : ''}{counts.lost ? ` · หาย ${counts.lost}` : ''}
      </div>
      {isAdmin && (
        <div className="subtabs">
          <button className={'btn small' + (tab === 'list' ? ' active' : '')} onClick={() => setTab('list')}>รายการหน่วย</button>
          <button className={'btn small' + (tab === 'add' ? ' active' : '')} onClick={() => setTab('add')}>+ สร้างหน่วย</button>
        </div>
      )}
      <div className="err">{err}</div>

      {tab === 'list' || !isAdmin ? (
        shownUnits.length === 0 ? (
          <p className="muted">{isAdmin ? 'ยังไม่มีหน่วย — กด "+ สร้างหน่วย" เพื่อเพิ่ม' : '— ตอนนี้ไม่มีตัวไหนถูกยืม/พัง/หาย —'}</p>
        ) : (
          <div className="unit-list">
            {shownUnits.map((u) => (
              <div className="unit-row" key={u.id}>
                <span className="code">{u.code}</span>
                <span className={'badge st-' + u.status}>{STATUS_LABEL[u.status]}</span>
                {u.holder && <span className="holder">→ {u.holder}</span>}
                {isAdmin && (
                  <span className="acts">
                    {(UNIT_BTNS[u.status] || []).map(([a, label]) => (
                      <button key={a} className={`btn small u-${a}`} onClick={() => act(u, a)}>{label}</button>
                    ))}
                    <button className="btn small danger" onClick={() => del(u)}>ลบ</button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        <AddUnitsForm unit={item.unit} units={units} onBulk={addUnits} />
      )}
    </div>
  );
}

// อ่านรหัสหน่วยที่มีอยู่ -> เดา prefix + เลขถัดไป + จำนวนหลัก (เพื่อรันเลขต่อให้อัตโนมัติ)
function deriveScheme(units) {
  const parsed = units
    .map((u) => /^(.*?)(\d+)$/.exec(u.code))
    .filter(Boolean)
    .map((m) => ({ prefix: m[1], num: parseInt(m[2], 10), pad: m[2].length }));
  if (!parsed.length) return null;
  // ใช้ prefix ที่พบบ่อยสุด
  const freq = {};
  parsed.forEach((p) => { freq[p.prefix] = (freq[p.prefix] || 0) + 1; });
  const prefix = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0];
  const same = parsed.filter((p) => p.prefix === prefix);
  return {
    prefix,
    next: Math.max(...same.map((p) => p.num)) + 1,
    pad: Math.max(...same.map((p) => p.pad)),
  };
}

function AddUnitsForm({ unit, units, onBulk }) {
  const scheme = useMemo(() => deriveScheme(units), [units]);
  const [mode, setMode] = useState('bulk');
  const [custom, setCustom] = useState(false);
  const [count, setCount] = useState(1);
  // null = ใช้ค่าอัตโนมัติจากรหัสเดิม
  const [pfx, setPfx] = useState(null);
  const [stt, setStt] = useState(null);
  const [pd, setPd] = useState(null);
  const [code, setCode] = useState(null);

  const prefix = pfx ?? scheme?.prefix ?? '';
  const start = stt ?? scheme?.next ?? 1;
  const pad = pd ?? scheme?.pad ?? 2;
  const mk = (n) => `${prefix}${String(n).padStart(Math.max(0, parseInt(pad, 10) || 0), '0')}`;
  const autoCode = scheme ? mk(scheme.next) : '';
  const singleCode = code ?? autoCode;
  const showFields = custom || !scheme; // ยังไม่มีรหัสเดิม = ต้องกรอกเอง

  const n = parseInt(count, 10) || 0;
  const s = parseInt(start, 10) || 0;
  const preview = n > 0
    ? (n <= 3 ? Array.from({ length: n }, (_, i) => mk(s + i)).join(', ')
      : `${mk(s)}, ${mk(s + 1)} … ${mk(s + n - 1)}`)
    : '';

  return (
    <>
      <div className="subtabs">
        <button className={'btn small' + (mode === 'bulk' ? ' active' : '')} onClick={() => setMode('bulk')}>สร้างหลายชิ้น</button>
        <button className={'btn small' + (mode === 'single' ? ' active' : '')} onClick={() => setMode('single')}>ทีละชิ้น</button>
      </div>

      {scheme && (
        <div className="hint" style={{ marginBottom: 8 }}>
          รหัสล่าสุดที่มี: <b>{mk(scheme.next - 1)}</b> — ระบบจะรันต่อให้อัตโนมัติ
        </div>
      )}

      {mode === 'bulk' ? (
        <form onSubmit={(e) => { e.preventDefault(); onBulk({ mode: 'bulk', prefix, start, count, pad }); }}>
          <label>จำนวนที่เพิ่มมา ({unit})
            <input type="number" min="1" max="500" value={count} onChange={(e) => setCount(e.target.value)} autoFocus />
          </label>
          {showFields && (
            <>
              <label>Prefix (คำนำหน้ารหัส)<input value={prefix} onChange={(e) => setPfx(e.target.value)} placeholder="เช่น RPI-" /></label>
              <div className="form-row">
                <label>เลขเริ่ม<input type="number" value={start} onChange={(e) => setStt(e.target.value)} /></label>
                <label>เติม 0 (หลัก)<input type="number" min="0" value={pad} onChange={(e) => setPd(e.target.value)} /></label>
              </div>
            </>
          )}
          <div className="hint">จะสร้าง: <b>{preview || '—'}</b></div>
          {scheme && (
            <label className="check-inline" style={{ marginTop: 8 }}>
              <input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} />
              กำหนด prefix / เลขเริ่มเอง
            </label>
          )}
          <button className="btn primary" type="submit" style={{ marginTop: 12, width: '100%' }}>สร้าง {n} หน่วย</button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); onBulk({ mode: 'single', code: singleCode }); }}>
          <label>รหัสประจำตัว
            <input value={singleCode} onChange={(e) => setCode(e.target.value)} required placeholder="เช่น RPI-21" />
          </label>
          <div className="hint">{scheme ? 'เติมให้อัตโนมัติจากรหัสล่าสุด — แก้ได้' : 'ยังไม่มีรหัสเดิม พิมพ์รหัสแรกเอง'}</div>
          <button className="btn primary" type="submit" style={{ marginTop: 12, width: '100%' }}>เพิ่ม 1 หน่วย — {singleCode || '?'}</button>
        </form>
      )}
    </>
  );
}
