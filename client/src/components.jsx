import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

// ---------- Toast ----------
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);
  const toast = useCallback((m) => {
    setMsg(m);
    setShow(true);
    clearTimeout(window._toastT);
    window._toastT = setTimeout(() => setShow(false), 2200);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className={'toast' + (show ? ' show' : '')}>{msg}</div>
    </ToastCtx.Provider>
  );
}

// ---------- Confirm / Prompt (modal สวย แทน confirm()/prompt() เนทีฟ) ----------
const DialogCtx = createContext({ confirm: async () => false, prompt: async () => null });
export const useConfirm = () => useContext(DialogCtx).confirm;
export const usePrompt = () => useContext(DialogCtx).prompt;

export function DialogProvider({ children }) {
  const [dlg, setDlg] = useState(null); // { kind, title, message, danger, value, resolve, okText }
  const close = (result) => { dlg?.resolve(result); setDlg(null); };
  const api = useRef({});
  api.current.confirm = (opts) => new Promise((resolve) =>
    setDlg({ kind: 'confirm', okText: 'ยืนยัน', danger: true, ...normalize(opts), resolve }));
  api.current.prompt = (opts) => new Promise((resolve) =>
    setDlg({ kind: 'prompt', okText: 'ตกลง', value: '', ...normalize(opts), resolve }));

  return (
    <DialogCtx.Provider value={{ confirm: (o) => api.current.confirm(o), prompt: (o) => api.current.prompt(o) }}>
      {children}
      {dlg && (
        <Modal title={dlg.title} onClose={() => close(dlg.kind === 'prompt' ? null : false)}>
          {dlg.message && <p style={{ margin: '0 0 12px', color: 'var(--muted)' }}>{dlg.message}</p>}
          {dlg.kind === 'prompt' && (
            <input autoFocus value={dlg.value} onChange={(e) => setDlg((d) => ({ ...d, value: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') close(dlg.value); }} placeholder={dlg.placeholder || ''} />
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn" style={{ flex: 1 }} onClick={() => close(dlg.kind === 'prompt' ? null : false)}>ยกเลิก</button>
            <button className={'btn ' + (dlg.danger ? 'danger' : 'primary')} style={{ flex: 1 }}
              onClick={() => close(dlg.kind === 'prompt' ? dlg.value : true)}>{dlg.okText}</button>
          </div>
        </Modal>
      )}
    </DialogCtx.Provider>
  );
}
// รับได้ทั้ง string หรือ object
function normalize(opts) { return typeof opts === 'string' ? { title: opts } : (opts || {}); }

// ---------- Modal ----------
export function Modal({ title, onClose, children }) {
  // ปิดเฉพาะตอน "กดเริ่ม" บนพื้นหลังจริง — กันปิดพลาดตอนลากเลือกข้อความในฟอร์มแล้วปล่อยเมาส์นอกกล่อง
  const downOnBackdrop = useRef(false);
  // render ผ่าน portal ไป body — หลุดจาก ancestor ที่มี transform (hover-lift)
  // ไม่งั้น position:fixed จะยึดกับ card ที่ transform ทำให้ backdrop ไม่คลุมเต็มจอ + กระพริบ
  return createPortal(
    <div
      className="modal"
      onMouseDown={(e) => { downOnBackdrop.current = e.target.classList.contains('modal'); }}
      onMouseUp={(e) => { if (downOnBackdrop.current && e.target.classList.contains('modal')) onClose(); downOnBackdrop.current = false; }}
    >
      <div className="modal-box card">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn small" onClick={onClose}>✕</button>
        </div>
        <div>{children}</div>
      </div>
    </div>,
    document.body
  );
}

// ---------- Table ----------
export function Table({ headers, rows }) {
  return (
    <table>
      <thead>
        <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={headers.length} className="muted">— ไม่มีข้อมูล —</td></tr>
        ) : (
          rows.map((r, i) => (
            <tr key={r.key ?? i}>{r.cells.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))
        )}
      </tbody>
    </table>
  );
}
