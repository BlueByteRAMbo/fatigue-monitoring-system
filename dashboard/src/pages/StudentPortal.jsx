import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { BookOpen, TrendingUp, Clock, ChevronRight, X, RefreshCw, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import ToastContainer from '../components/ToastContainer';
import { format } from 'date-fns';
import { useRef } from 'react';
import BreakNudge from '../components/BreakNudge';

const LEVEL_COLOR = { low: 'var(--low)', medium: 'var(--med)', high: 'var(--high)' };

export default function StudentPortal() {
  const { authFetch, user } = useAuth();

  const [meetings, setMeetings]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState(null);  // selected meeting object
  const [logs, setLogs]             = useState([]);
  const [logsLoading, setLogsLoad]  = useState(false);
  const [liveStatus, setLiveStatus] = useState(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryMeeting, setSummaryMeeting] = useState(null);
  const { toasts, addToast, removeToast } = useToast();
  const prevMeetings = useRef([]);

  const [highFatigueStart, setHighFatigueStart] = useState(null);
  const [showBreakNudge, setShowBreakNudge]     = useState(false);

  const fetchMeetings = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/meetings/');
      const data = await res.json();
      const newMeetings = Array.isArray(data) ? data : [];
      
      newMeetings.forEach(m => {
        const prev = prevMeetings.current.find(p => p.id === m.id);
        if (prev && !prev.ended_at && m.ended_at) {
          setSummaryMeeting(m);
          setShowSummaryModal(true);
          addToast('info', 'Session Ended', `"${m.title}" has been ended by the teacher.`, 8000);
        }
      });
      prevMeetings.current = newMeetings;
      setMeetings(newMeetings);
    } catch { 
      addToast('error', 'Connection Error', 'Could not reach the server.', 6000);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchMeetings(); }, []);

  useEffect(() => {
    const id = setInterval(fetchMeetings, 15000);
    return () => clearInterval(id);
  }, []);

  // Live Status WebSocket polling
  useEffect(() => {
    const activeMeeting = meetings.find(m => !m.ended_at);
    if (!activeMeeting) {
      setLiveStatus(null);
      setHighFatigueStart(null);
      return;
    }

    const ws = new WebSocket(`ws://127.0.0.1:8000/ws/student/${user.id}`);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLiveStatus(data);
        
        // Break Check: 5 mins of 'high'
        if (data.fatigue_level === 'high') {
          setHighFatigueStart(prev => prev || Date.now());
        } else {
          setHighFatigueStart(null);
        }
      } catch (e) { console.error(e); }
    };
    return () => ws.close();
  }, [meetings, user.id]);

  useEffect(() => {
    if (highFatigueStart) {
      const elapsed = (Date.now() - highFatigueStart) / 1000;
      if (elapsed > 300) { // 5 minutes
         setShowBreakNudge(true);
      }
    }
  }, [highFatigueStart, liveStatus]);

  const openMeeting = async (meeting) => {
    setSelected(meeting);
    setLogs([]);
    setLogsLoad(true);
    try {
      const res = await authFetch(`/meetings/${meeting.id}/fatigue/${user.id}`);
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch { addToast('error', 'Failed to Load', 'Could not fetch fatigue history for this session.', 5000); }
    finally { setLogsLoad(false); }
  };

  const stats = (() => {
    if (!logs.length) return null;
    const count  = logs.length;
    const avgEar = logs.reduce((s, l) => s + (l.ear_score || 0), 0) / count;
    const dist   = { low: 0, medium: 0, high: 0 };
    logs.forEach(l => { if (dist[l.fatigue_level] !== undefined) dist[l.fatigue_level]++; });

    const severity = count > 0
      ? Math.round(((dist.low * 0 + dist.medium * 1 + dist.high * 2) / (count * 2)) * 100)
      : 0;
    const severityLabel = severity <= 33 ? 'Well Rested' : severity <= 66 ? 'Moderate Fatigue' : 'High Fatigue';
    const severityColor = severity <= 33 ? 'var(--low)' : severity <= 66 ? 'var(--med)' : 'var(--high)';

    return { count, avgEar, dist, severity, severityLabel, severityColor };
  })();

  const parsePose = (str) => {
    if (!str) return { pitch: null, yaw: null, roll: null };
    const [p, y, r] = str.split(',').map(Number);
    return { pitch: +p.toFixed(1), yaw: +y.toFixed(1), roll: +r.toFixed(1) };
  };

  const chartData = logs.map((l, i) => ({
    t: i + 1,
    ear: l.ear_score ? +l.ear_score.toFixed(3) : null,
    blink: l.blink_rate ? +l.blink_rate.toFixed(1) : null,
    ...parsePose(l.head_pose),
    level: l.fatigue_level,
  }));

  return (
    <>
      <Navbar />
      <div className="page fade-up">
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>My Sessions</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.35rem' }}>View your fatigue history and performance analytics.</p>
        </div>

        <ToastContainer toasts={toasts} removeToast={removeToast} />


        <div style={{ display: 'grid', gridTemplateColumns: selected ? '320px 1fr' : '1fr', gap: '1.5rem', alignItems: 'start' }}>
          {/* Meeting List */}
          <div className="card">
            {/* CHANGE 2: refresh button added to header */}
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              Sessions Joined ({meetings.length})
              <button
                className="btn btn-ghost btn-sm"
                onClick={fetchMeetings}
                disabled={loading}
                title="Refresh sessions"
                style={{ padding: '0.2rem 0.4rem' }}
              >
                <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              </button>
            </div>
            {loading ? (
              <div style={{ padding: '2rem', color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.9rem' }}>Loading…</div>
            ) : meetings.length === 0 ? (
              <div className="empty-state">
                <BookOpen size={36} />
                <h3>No sessions yet</h3>
                <p>Join a class session using your Chrome Extension to see history here.</p>
              </div>
            ) : meetings.map(m => (
              <div
                key={m.id}
                className="meeting-row"
                style={{ cursor: 'pointer', background: selected?.id === m.id ? 'var(--primary-glow)' : undefined, borderLeft: selected?.id === m.id ? '3px solid var(--primary)' : '3px solid transparent' }}
                onClick={() => openMeeting(m)}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{m.title}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Clock size={11} />
                    {m.started_at ? format(new Date(m.started_at), 'MMM d, h:mm a') : '—'}
                  </div>
                  {!m.ended_at && (
                    <div style={{ marginTop: '0.5rem' }}>
                       {!liveStatus ? (
                         <span className="badge" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)', padding: '0.15rem 0.4rem', fontSize: '0.65rem' }}>Extension not active</span>
                       ) : liveStatus.face_detected === false ? (
                         <span className="badge badge-med" style={{ padding: '0.15rem 0.4rem', fontSize: '0.65rem' }}>⚠ Face not detected</span>
                       ) : (
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                           <span className={`badge badge-${liveStatus.fatigue_level} ${liveStatus.fatigue_level === 'high' ? 'pulse' : ''}`} style={{ padding: '0.15rem 0.4rem', fontSize: '0.65rem', alignSelf: 'flex-start' }}>
                              ● {liveStatus.fatigue_level === 'low' ? 'Low Fatigue' : liveStatus.fatigue_level === 'medium' ? 'Moderate Fatigue' : 'High Fatigue — Stay alert!'}
                           </span>
                           <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '4px' }}>Model confidence: {Math.round(liveStatus.confidence * 100)}%</span>
                         </div>
                       )}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {m.ended_at
                    ? <span className="badge badge-low" style={{ fontSize: '0.65rem' }}>Ended</span>
                    : <span className="badge badge-med" style={{ fontSize: '0.65rem' }}>Active</span>}
                  <ChevronRight size={14} color="var(--text-muted)" />
                </div>
              </div>
            ))}
          </div>

          {/* Analytics Panel */}
          {selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} className="fade-in">
              <div className="card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>{selected.title}</h2>
                      <button 
                        className="btn btn-ghost btn-sm" 
                        onClick={() => openMeeting(selected)}
                        title="Refresh session logs"
                        style={{ padding: '2px' }}
                      >
                        <RefreshCw size={14} className={logsLoading ? 'spin' : ''} />
                      </button>
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                      {selected.started_at ? format(new Date(selected.started_at), 'MMMM d, yyyy · h:mm a') : ''}
                    </p>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}><X size={14} /></button>
                </div>

                {/* Stat Cards */}
                {stats && (
                  <div className="stats-bar" style={{ marginBottom: 0 }}>
                    <div className="stat-card">
                      <div className="stat-value" style={{ color: stats.severityColor }}>{stats.severity}</div>
                      <div className="stat-label" style={{ color: stats.severityColor }}>{stats.severityLabel}</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value" style={{ color: 'var(--primary)' }}>{stats.count}</div>
                      <div className="stat-label">Frames</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value" style={{ color: 'var(--low)' }}>{stats.avgEar.toFixed(3)}</div>
                      <div className="stat-label">Avg EAR</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value" style={{ color: 'var(--med)' }}>{stats.dist.medium}</div>
                      <div className="stat-label">Medium</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value" style={{ color: 'var(--high)' }}>{stats.dist.high}</div>
                      <div className="stat-label">High</div>
                    </div>
                  </div>
                )}
              </div>

              {/* EAR Chart */}
              {logsLoading ? (
                <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading analytics…</div>
              ) : chartData.length > 1 ? (
                <div className="card" style={{ padding: '1.25rem' }}>
                  <div className="section-title" style={{ marginBottom: '1rem' }}>Eye Aspect Ratio Over Session</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="t" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} label={{ value: 'Frame', position: 'insideBottom', fill: 'var(--text-muted)', fontSize: 11 }} />
                      <YAxis domain={[0.05, 0.45]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.8rem' }}
                        labelStyle={{ color: 'var(--text-muted)' }}
                        itemStyle={{ color: 'var(--primary)' }}
                      />
                      <Line type="monotone" dataKey="ear" stroke="var(--primary)" strokeWidth={2} dot={false} name="EAR Score" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="card">
                  <div className="empty-state">
                    <TrendingUp size={36} />
                    <h3>No data for this session</h3>
                    <p>The extension needs to be active and sending frames for data to appear.</p>
                  </div>
                </div>
              )}

              {/* Fatigue Level Distribution Bar */}
              {stats && (
                <div className="card" style={{ padding: '1.25rem' }}>
                  <div className="section-title" style={{ marginBottom: '1rem' }}>Fatigue Distribution</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {['low', 'medium', 'high'].map(lvl => {
                      const pct = stats.count > 0 ? Math.round((stats.dist[lvl] / stats.count) * 100) : 0;
                      return (
                        <div key={lvl}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.35rem' }}>
                            <span style={{ fontWeight: 600, textTransform: 'capitalize', color: LEVEL_COLOR[lvl] }}>{lvl}</span>
                            <span style={{ color: 'var(--text-muted)' }}>{stats.dist[lvl]} frames ({pct}%)</span>
                          </div>
                          <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: LEVEL_COLOR[lvl], borderRadius: 4, transition: 'width 0.6s ease' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Blink Rate Chart */}
              {!logsLoading && chartData.some(d => d.blink !== null) && (
                <div className="card" style={{ padding: '1.25rem' }}>
                  <div className="section-title" style={{ marginBottom: '1rem' }}>Blink Rate Over Session (Blinks/min)</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="t" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                      <YAxis domain={[0, 40]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.8rem' }}
                      />
                      <Line type="monotone" dataKey="blink" stroke="var(--med)" strokeWidth={2} dot={false} name="Blink Rate" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Head Pose Chart */}
              {!logsLoading && chartData.some(d => d.pitch !== null) && (
                <div className="card" style={{ padding: '1.25rem' }}>
                  <div className="section-title" style={{ marginBottom: '1rem' }}>Head Pose Over Session</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="t" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                      <YAxis domain={[-40, 40]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.8rem' }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="pitch" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="yaw" stroke="var(--med)" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="roll" stroke="var(--text-muted)" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Summary Modal */}
      {showSummaryModal && summaryMeeting && (
        <SummaryModal 
          meeting={summaryMeeting} 
          user={user} 
          authFetch={authFetch} 
          onClose={() => setShowSummaryModal(false)} 
        />
      )}
      {showBreakNudge && (
        <BreakNudge onDismiss={() => {
          setShowBreakNudge(false);
          setHighFatigueStart(null); // Reset timer on dismiss
        }} />
      )}
    </>
  );
}

function SummaryModal({ meeting, user, authFetch, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSummaryData = async () => {
      try {
        const res = await authFetch(`/meetings/${meeting.id}/fatigue/${user.id}`);
        const data = await res.json();
        setLogs(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchSummaryData();
  }, [meeting.id, user.id, authFetch]);

  if (loading) return null;

  const count = logs.length;
  const dist = { low: 0, medium: 0, high: 0 };
  let avgEar = 0;
  logs.forEach(l => {
    if (dist[l.fatigue_level] !== undefined) dist[l.fatigue_level]++;
    avgEar += (l.ear_score || 0);
  });
  avgEar = count > 0 ? avgEar / count : 0;

  const severity = count > 0
    ? Math.round(((dist.low * 0 + dist.medium * 1 + dist.high * 2) / (count * 2)) * 100)
    : 0;
  const severityLabel = severity <= 33 ? 'Well Rested' : severity <= 66 ? 'Moderate Fatigue' : 'High Fatigue';
  const severityColor = severity <= 33 ? 'var(--low)' : severity <= 66 ? 'var(--med)' : 'var(--high)';

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
      <div className="card fade-up" style={{ maxWidth: '500px', width: '100%', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: severityColor + '20', color: severityColor, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            {severity <= 33 ? <CheckCircle size={32} /> : severity <= 66 ? <Info size={32} /> : <AlertCircle size={32} />}
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Session Summary</h2>
          <p style={{ color: 'var(--text-muted)' }}>{meeting.title} ended at {format(new Date(meeting.ended_at), 'h:mm a')}</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="stat-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>{count}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Frames</div>
          </div>
          <div className="stat-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--low)' }}>{avgEar.toFixed(3)}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Avg EAR</div>
          </div>
        </div>

        <div className="stat-card" style={{ padding: '1rem', textAlign: 'center' }}>
           <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Fatigue Severity Score</div>
           <div style={{ fontSize: '2.5rem', fontWeight: 900, color: severityColor }}>{severity}</div>
           <div style={{ fontWeight: 700, color: severityColor }}>{severityLabel}</div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            <span>Fatigue Distribution</span>
          </div>
          <div style={{ height: 12, display: 'flex', borderRadius: 6, overflow: 'hidden' }}>
            {['low', 'medium', 'high'].map(l => {
              const pct = count > 0 ? (dist[l] / count) * 100 : 0;
              return <div key={l} style={{ width: `${pct}%`, background: LEVEL_COLOR[l] }} title={`${l}: ${Math.round(pct)}%`} />;
            })}
          </div>
        </div>

        <button className="btn btn-primary" onClick={onClose} style={{ marginTop: '0.5rem' }}>Close</button>
      </div>
    </div>
  );
}