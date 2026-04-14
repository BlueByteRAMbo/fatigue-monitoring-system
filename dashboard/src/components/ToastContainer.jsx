import { AlertTriangle, CheckCircle, Info, X } from 'lucide-react';

const icons = {
  error:   <AlertTriangle size={18} color="var(--high)" />,
  warn:    <AlertTriangle size={18} color="var(--med)" />,
  success: <CheckCircle  size={18} color="var(--low)" />,
  info:    <Info         size={18} color="var(--primary)" />,
};

export default function ToastContainer({ toasts, removeToast }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`toast toast-${t.type}`}
          onClick={() => removeToast(t.id)}
        >
          <span className="toast-icon">{icons[t.type] || icons.info}</span>
          <div className="toast-body">
            <div className="toast-title">{t.title}</div>
            {t.message && <div className="toast-msg">{t.message}</div>}
          </div>
          <X size={14} color="var(--text-muted)" style={{ marginTop: 2 }} />
        </div>
      ))}
    </div>
  );
}
