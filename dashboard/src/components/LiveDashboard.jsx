import { useState, useEffect, useRef, useCallback } from 'react';
import { LineChart, Line, YAxis, ResponsiveContainer } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../hooks/useToast';
import ToastContainer from './ToastContainer';
import { Users, ArrowLeft, Clock, Grid, List, X, Download, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

const WS_URL = 'ws://127.0.0.1:8000/ws/meeting';
const HIGH_FATIGUE_THRESHOLD_MS = 10000; // 10 seconds

export default function LiveDashboard({ meetingId, onLeave }) {
  const { user } = useAuth();
  const { toasts, addToast, removeToast } = useToast();
  const [students, setStudents]   = useState({});
  const [connected, setConnected] = useState(false);
  const [viewMode, setViewMode]   = useState('cards'); // 'cards' or 'heatmap'
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [alertHistory, setAlertHistory] = useState([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const wsRef = useRef(null);
  const { authFetch } = useAuth();

  // Track per-student continuous high-fatigue start time
  const highFatigueTimers = useRef({});
  // Track which students already fired a toast this session
  const alertedStudents = useRef(new Set());
  // Track face lost frames
  const faceLostCounters = useRef({});

  const checkFatigueAlert = useCallback((data) => {
    const sid = data.user_id;

    // Sustained High Fatigue Alert
    if (data.fatigue_level === 'high') {
      if (!highFatigueTimers.current[sid]) {
        highFatigueTimers.current[sid] = Date.now();
      } else {
        const elapsed = Date.now() - highFatigueTimers.current[sid];
        if (elapsed >= HIGH_FATIGUE_THRESHOLD_MS && !alertedStudents.current.has(sid)) {
          alertedStudents.current.add(sid);
          addToast('error',
            '⚠️ Attention Required!',
            `${data.user_name} has been in HIGH FATIGUE for over 10 seconds!`,
            10000
          );
          setAlertHistory(prev => [{
            id: Date.now(),
            student_name: data.user_name,
            fatigue_level: data.fatigue_level,
            type: 'high_fatigue',
            timestamp: new Date().toISOString(),
          }, ...prev].slice(0, 50));
        }
      }
    } else {
      delete highFatigueTimers.current[sid];
      alertedStudents.current.delete(sid);
    }

    // Face Lost Alert (3+ frames)
    if (data.face_detected === false) {
      faceLostCounters.current[sid] = (faceLostCounters.current[sid] || 0) + 1;
      if (faceLostCounters.current[sid] === 3) {
        setAlertHistory(prev => [{
          id: Date.now(),
          student_name: data.user_name,
          fatigue_level: 'unknown',
          type: 'face_lost',
          timestamp: new Date().toISOString(),
        }, ...prev].slice(0, 50));
      }
    } else {
      faceLostCounters.current[sid] = 0;
    }
  }, [addToast]);

  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/${meetingId}`);
    wsRef.current = ws;

    ws.onopen    = () => setConnected(true);
    ws.onclose   = () => setConnected(false);
    ws.onerror   = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        checkFatigueAlert(data);
        setStudents(prev => {
          const history = [...(prev[data.user_id]?.history || []),
            { 
              time: new Date(data.timestamp).toLocaleTimeString(), 
              ear: data.ear_score,
              blink: data.blink_rate,
              confidence: data.confidence,
              face_detected: data.face_detected,
              head_pose: data.head_pose
            }
          ].slice(-30);

          const studentData = { ...data, history };
          if (selectedStudent?.user_id === data.user_id) {
             setSelectedStudent(studentData);
          }
          return { ...prev, [data.user_id]: studentData };
        });
      } catch (e) { console.error(e); }
    };

    return () => ws.close();
  }, [meetingId, checkFatigueAlert, selectedStudent?.user_id]);

  const exportCSV = async () => {
    try {
      const res = await authFetch(`/meetings/${meetingId}/fatigue`);
      const logs = await res.json();
      if (!logs.length) {
        addToast('info', 'No Data', 'There are no fatigue logs to export yet.', 4000);
        return;
      }

      const headers = ['id', 'user_id', 'fatigue_level', 'ear_score', 'blink_rate', 'head_pose', 'recorded_at'];
      const csvStr = [
        headers.join(','),
        ...logs.map(l => [
          l.id, l.user_id, l.fatigue_level, l.ear_score, l.blink_rate, `"${l.head_pose||''}"`, l.recorded_at
        ].join(','))
      ].join('\n');

      const blob = new Blob([csvStr], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `live_fatigue_logs_meeting_${meetingId}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      addToast('success', 'Export Ready', 'CSV downloaded successfully.', 3000);
    } catch (e) {
      addToast('error', 'Export Failed', e.message, 5000);
    }
  };

  const studentList = Object.values(students);
  const highCount   = studentList.filter(s => s.fatigue_level === 'high').length;
  const medCount    = studentList.filter(s => s.fatigue_level === 'medium').length;

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={onLeave}>
          <ArrowLeft size={14} /> Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Live Monitoring — Class #{meetingId}</h1>
            <div className={`live-pill ${connected ? 'live' : 'offline'}`}>
              <div className="live-dot" />
              {connected ? 'LIVE' : 'OFFLINE'}
            </div>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Real-time fatigue analysis via AI webcam capture
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={exportCSV} title="Export CSV Data">
            <Download size={14} /> Export
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setViewMode(viewMode === 'cards' ? 'heatmap' : 'cards')}>
            {viewMode === 'cards' ? <Grid size={14} /> : <List size={14} />}
            {viewMode === 'cards' ? ' Heatmap View' : ' Card View'}
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="stats-bar">
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--primary)' }}>{studentList.length}</div>
          <div className="stat-label">Students Active</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--low)' }}>
            {studentList.filter(s => s.fatigue_level === 'low').length}
          </div>
          <div className="stat-label">Alert · Low</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--med)' }}>{medCount}</div>
          <div className="stat-label">Alert · Medium</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--high)' }}>{highCount}</div>
          <div className="stat-label">Alert · High</div>
        </div>
      </div>

      {/* Alert History Toggle */}
      <div style={{ marginBottom: '1.5rem' }}>
        <button 
          className="btn btn-ghost btn-sm" 
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-secondary)', padding: '0.5rem 1rem' }}
          onClick={() => setShowAlerts(!showAlerts)}
        >
           <AlertTriangle size={14} color={alertHistory.length > 0 ? 'var(--high)' : 'var(--text-muted)'} />
           Alert History ({alertHistory.length})
        </button>
        {showAlerts && (
          <div className="card fade-in" style={{ marginTop: '0.5rem', maxHeight: '200px', overflowY: 'auto', padding: '0.5rem' }}>
            {alertHistory.length === 0 ? (
              <p style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>No alerts recorded yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {alertHistory.map(h => (
                  <div key={h.id} style={{ 
                    display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', 
                    borderLeft: `3px solid ${h.type === 'high_fatigue' ? 'var(--high)' : 'var(--med)'}`,
                    background: 'var(--surface-muted)', borderRadius: '4px'
                  }}>
                    <div>
                      <span style={{ fontWeight: 700, marginRight: '0.5rem' }}>{h.student_name}</span>
                      <span style={{ fontSize: '0.85rem' }}>{h.type === 'high_fatigue' ? 'Sustained high fatigue detected' : 'Face not detected for 15s'}</span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{format(new Date(h.timestamp), 'h:mm:ss a')}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Student Grid */}
      {studentList.length === 0 ? (
        <div className="empty-state fade-up">
          <Users size={48} />
          <h3>Waiting for students to join…</h3>
          <p>Students will appear here automatically the moment their Chrome Extension activates.</p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="students-grid fade-up">
          {studentList.map(s => <StudentCard key={s.user_id} student={s} onClick={() => setSelectedStudent(s)} />)}
        </div>
      ) : (
        <div className="heatmap-grid fade-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 80px)', gap: '10px' }}>
          {studentList.map(s => <HeatmapCell key={s.user_id} student={s} onClick={() => setSelectedStudent(s)} />)}
        </div>
      )}

      {selectedStudent && (
        <StudentDetailPanel 
          student={selectedStudent} 
          onClose={() => setSelectedStudent(null)} 
        />
      )}
    </>
  );
}

function HeatmapCell({ student, onClick }) {
  const { user_name, fatigue_level, face_detected } = student;
  const initials = user_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const color = face_detected === false ? '#64748b' : 
                fatigue_level === 'high' ? 'var(--high)' : 
                fatigue_level === 'medium' ? 'var(--med)' : 'var(--low)';

  return (
    <div 
      onClick={onClick}
      className={`heatmap-cell ${fatigue_level === 'high' ? 'pulse' : ''}`}
      style={{ 
        width: 80, height: 80, background: color, borderRadius: 8, cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        position: 'relative', color: '#fff', border: '2px solid rgba(255,255,255,0.1)'
      }}
    >
      <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{initials}</div>
      <div style={{ fontSize: '0.6rem', opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', width: '90%', textAlign: 'center' }}>{user_name}</div>
      {face_detected === false && (
        <div style={{ position: 'absolute', top: 4, right: 4 }}>
          <AlertTriangle size={12} color="#fff" />
        </div>
      )}
    </div>
  );
}

function StudentDetailPanel({ student, onClose }) {
  const { user_name, fatigue_level, ear_score, blink_rate, history, face_detected, confidence } = student;
  const level = fatigue_level || 'low';
  
  const lastPose = history && history.length > 0 ? history[history.length-1].head_pose : null;
  const parsePose = (str) => {
    if (!str) return 'N/A';
    return str.split(',').map(s => Number(s).toFixed(1)).join(', ');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000 }}>
       <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
       <div className="card" style={{ 
         position: 'absolute', top: 0, right: 0, bottom: 0, width: 360, 
         borderRadius: 0, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem',
         boxShadow: '-10px 0 30px rgba(0,0,0,0.3)', animation: 'slide-in-right 0.3s ease-out'
       }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>{user_name}</h2>
              <span className={`badge badge-${level === 'medium' ? 'med' : level}`} style={{ marginTop: '0.25rem' }}>
                {level} fatigue
              </span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={20} /></button>
          </div>

          <div className="stats-bar" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', background: 'none', padding: 0 }}>
             <div className="stat-card" style={{ padding: '0.75rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Current EAR</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{ear_score ? ear_score.toFixed(3) : '—'}</div>
             </div>
             <div className="stat-card" style={{ padding: '0.75rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Blink Rate</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{blink_rate ? blink_rate.toFixed(1) : '0'}</div>
             </div>
             <div className="stat-card" style={{ padding: '0.75rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Confidence</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{confidence ? Math.round(confidence * 100) : 0}%</div>
             </div>
             <div className="stat-card" style={{ padding: '0.75rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Samples</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{history?.length ?? 0}</div>
             </div>
          </div>

          <div className="stat-card" style={{ padding: '0.75rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Head Pose (P, Y, R)</div>
            <div style={{ fontWeight: 600 }}>{parsePose(lastPose)}</div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>EAR History Chart</div>
            <div style={{ height: 180, background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history}>
                  <YAxis domain={[0.05, 0.45]} hide />
                  <Line 
                    type="monotone" 
                    dataKey="ear" 
                    stroke="var(--primary)" 
                    strokeWidth={2} 
                    dot={false} 
                    isAnimationActive={false} 
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              <Clock size={12} />
              Last Update: {history && history.length > 0 ? history[history.length-1].time : 'N/A'}
            </div>
          </div>
       </div>
    </div>
  );
}

function StudentCard({ student, onClick }) {
  const { user_name, fatigue_level, ear_score, blink_rate, history, face_detected } = student;
  const initial = user_name?.charAt(0)?.toUpperCase() ?? '?';
  const level   = face_detected === false ? 'unknown' : (fatigue_level || 'low');

  return (
    <div className={`student-card ${level} fade-in`} onClick={onClick} style={{ cursor: 'pointer' }}>
      <div className="card-header">
        <div className="avatar" style={{ background: face_detected === false ? 'var(--text-muted)' : undefined }}>{initial}</div>
        <div className="student-info">
          <h3>{user_name}</h3>
          {face_detected === false ? (
            <span className="badge badge-med">
              <AlertTriangle size={10} style={{ marginRight: '4px' }} />
              Face lost
            </span>
          ) : (
            <span className={`badge badge-${level === 'medium' ? 'med' : level}`}>
              <span className="badge-dot" />
              {level} fatigue
            </span>
          )}
        </div>
      </div>

      <div className="metrics-row">
        <div>
          <div className="metric-label">Avg EAR</div>
          <div className="metric-value">{ear_score ? ear_score.toFixed(3) : '—'}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="metric-label">Blinks/min</div>
          <div className="metric-value">{blink_rate ? blink_rate.toFixed(1) : '0'}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="metric-label">Samples</div>
          <div className="metric-value">{history?.length ?? 0}</div>
        </div>
      </div>

      <div className="chart-container">
        {history?.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history}>
              <YAxis domain={[0.05, 0.45]} hide />
              <Line
                type="monotone"
                dataKey="ear"
                stroke={level === 'high' ? 'var(--high)' : level === 'medium' ? 'var(--med)' : 'var(--primary)'}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '0.75rem', color: 'var(--text-muted)', gap: '0.4rem' }}>
            <Clock size={12} /> Collecting baseline…
          </div>
        )}
      </div>
    </div>
  );
}
