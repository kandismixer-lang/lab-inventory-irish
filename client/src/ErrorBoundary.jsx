import React from 'react';

// กัน "จอขาว" — ถ้า component ไหน error จะโชว์ข้อความแทน
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('App error:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, maxWidth: 700, margin: '40px auto', fontFamily: 'Segoe UI, Tahoma, sans-serif' }}>
          <h2 style={{ color: '#dc2626' }}>เกิดข้อผิดพลาดในหน้าเว็บ</h2>
          <p>ลองรีเฟรชหน้าใหม่ ถ้ายังไม่หายให้ส่งข้อความด้านล่างนี้ให้ผู้ดูแล:</p>
          <pre style={{ background: '#f3f4f6', padding: 14, borderRadius: 8, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {String(this.state.error?.stack || this.state.error)}
          </pre>
          <button onClick={() => location.reload()} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #ccc', cursor: 'pointer' }}>
            รีเฟรชหน้า
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
