import React, { createContext, useContext, useState, useCallback } from 'react';

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

// ---------- Modal ----------
export function Modal({ title, onClose, children }) {
  return (
    <div className="modal" onClick={(e) => e.target.classList.contains('modal') && onClose()}>
      <div className="modal-box card">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn small" onClick={onClose}>✕</button>
        </div>
        <div>{children}</div>
      </div>
    </div>
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
