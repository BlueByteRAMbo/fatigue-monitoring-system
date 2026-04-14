import { Activity, Moon, Sun, LogOut, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Activity size={22} />
        <span>Fatigue Monitor</span>
      </div>

      <div className="navbar-right">
        <button
          className="btn btn-ghost btn-sm"
          onClick={toggle}
          title="Toggle theme"
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {user && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <User size={14} />
              <span>{user.name}</span>
              <span style={{
                fontSize: '0.7rem', background: 'var(--primary-glow)', color: 'var(--primary)',
                padding: '0.15rem 0.5rem', borderRadius: '99px', fontWeight: 700, textTransform: 'uppercase'
              }}>{user.role}</span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={logout} title="Logout">
              <LogOut size={14} />
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
