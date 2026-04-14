import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, register, loading } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab]           = useState('login');       // 'login' | 'register'
  const [role, setRole]         = useState('student');
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (tab === 'login') {
        const me = await login(email, password);
        navigate(me.role === 'teacher' ? '/teacher' : '/student');
      } else {
        await register(name, email, password, role);
        const me = await login(email, password);
        navigate(me.role === 'teacher' ? '/teacher' : '/student');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="login-page">
      {/* Hero Panel */}
      <div className="login-hero">
        <div className="login-hero-badge">
          <Activity size={14} />
          AI-Powered Monitoring
        </div>
        <h1 className="login-hero-title">
          Real-Time<br />Fatigue Detection<br />for Modern Classrooms
        </h1>
        <p className="login-hero-sub">
          Monitor student engagement and fatigue levels with precision using
          computer vision and machine learning — live, in the browser.
        </p>

        <div style={{ marginTop: '2.5rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          {[
            { icon: '🎥', label: 'Live Webcam Analysis' },
            { icon: '🧠', label: 'Random Forest ML' },
            { icon: '⚡', label: 'Instant Alerts' },
          ].map(f => (
            <div key={f.label} style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>{f.icon}</span> {f.label}
            </div>
          ))}
        </div>
      </div>

      {/* Form Panel */}
      <div className="login-form-panel fade-in">
        <div className="login-box">
          <h2>{tab === 'login' ? 'Welcome back' : 'Create account'}</h2>
          <p>{tab === 'login' ? 'Sign in to your dashboard.' : 'Join as a teacher or student.'}</p>

          <div className="login-tabs">
            <button className={`login-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => { setTab('login'); setError(''); }}>
              Sign In
            </button>
            <button className={`login-tab ${tab === 'register' ? 'active' : ''}`} onClick={() => { setTab('register'); setError(''); }}>
              Register
            </button>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            {tab === 'register' && (
              <>
                <div className="input-group fade-up">
                  <label>Full Name</label>
                  <input className="input" type="text" placeholder="Jane Doe" value={name} onChange={e => setName(e.target.value)} required />
                </div>

                <div className="input-group fade-up">
                  <label>Role</label>
                  <div className="role-selector">
                    {['student', 'teacher'].map(r => (
                      <div key={r} className={`role-option ${role === r ? 'selected' : ''}`} onClick={() => setRole(r)}>
                        <div className="role-icon">{r === 'teacher' ? '👩‍🏫' : '🎓'}</div>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="input-group">
              <label>Email</label>
              <input className="input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
            </div>

            <div className="input-group">
              <label>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  style={{ width: '100%', paddingRight: '2.8rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(s => !s)}
                  style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', display: 'flex' }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && <div className="error-msg">{error}</div>}

            <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
              {loading ? 'Please wait…' : tab === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
