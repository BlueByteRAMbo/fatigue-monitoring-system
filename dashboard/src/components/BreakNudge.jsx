import React from 'react';
import { Coffee, RotateCcw, Droplets, Wind, X } from 'lucide-react';

export default function BreakNudge({ onDismiss }) {
  return (
    <div className="card fade-in" style={{
      position: 'fixed',
      bottom: '1.5rem',
      right: '1.5rem',
      width: '320px',
      zIndex: 2100,
      background: 'var(--surface)',
      border: '1px solid var(--high)',
      boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
      padding: '1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ 
          background: 'var(--high)', 
          color: '#fff', 
          width: '32px', 
          height: '32px', 
          borderRadius: '8px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center' 
        }}>
          <Coffee size={18} />
        </div>
        <button onClick={onDismiss} className="btn-ghost" style={{ padding: '4px' }}><X size={16} /></button>
      </div>

      <div>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.25rem' }}>Time for a Break</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          You've been showing high fatigue levels for over 5 minutes. 
          A short break can restore your focus and protect your well-being.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
          <Droplets size={16} color="var(--primary)" style={{ marginBottom: '4px' }} />
          <div style={{ fontSize: '0.65rem', fontWeight: 700 }}>Hydrate</div>
        </div>
        <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
          <Wind size={16} color="var(--low)" style={{ marginBottom: '4px' }} />
          <div style={{ fontSize: '0.65rem', fontWeight: 700 }}>Breathe</div>
        </div>
        <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
          <RotateCcw size={16} color="var(--med)" style={{ marginBottom: '4px' }} />
          <div style={{ fontSize: '0.65rem', fontWeight: 700 }}>Stretch</div>
        </div>
        <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
           <img src="https://img.icons8.com/ios-glyphs/30/null/eye.png" width="16" style={{ marginBottom: '4px', opacity: 0.6 }} />
           <div style={{ fontSize: '0.65rem', fontWeight: 700 }}>Look Away</div>
        </div>
      </div>

      <button className="btn btn-primary btn-sm" onClick={onDismiss} style={{ width: '100%', marginTop: '0.5rem' }}>
        Got it, taking a break!
      </button>
    </div>
  );
}
