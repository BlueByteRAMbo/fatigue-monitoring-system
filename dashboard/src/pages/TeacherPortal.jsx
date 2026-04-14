import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LiveDashboard from '../components/LiveDashboard';
import { useToast } from '../hooks/useToast';
import ToastContainer from '../components/ToastContainer';
import { format } from 'date-fns';
import { Download, FileText, Plus, Calendar, Copy, Check, Play, Square, Users } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';

export default function TeacherPortal() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();

  const [meetings, setMeetings]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [activeMeeting, setActive]  = useState(null);   // currently live-monitored meeting
  const [creating, setCreating]     = useState(false);
  const [newTitle, setNewTitle]     = useState('');
  const [showForm, setShowForm]     = useState(false);
  const [copiedId, setCopiedId]     = useState(null);
  const [activeTab, setActiveTab]   = useState('sessions'); // 'sessions' or 'attendance'
  const [selectedAttendance, setSelectedAttendance] = useState(null); // for attendance tab
  const [attendanceData, setAttendanceData] = useState([]);
  const [attLoading, setAttLoading] = useState(false);
  const [activeCounts, setActiveCounts] = useState({}); // meeting_id -> count

  const { toasts, addToast, removeToast } = useToast();

  const fetchMeetings = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/meetings/');
      const data = await res.json();
      setMeetings(Array.isArray(data) ? data : []);
    } catch (e) {
      addToast('error', 'Fetch Error', 'Failed to load meetings list.', 6000);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMeetings(); }, []);

  // Polling for meeting status and active counts
  useEffect(() => {
    const id = setInterval(fetchMeetings, 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const activeOnes = meetings.filter(m => !m.ended_at);
    if (activeOnes.length === 0) return;

    const pollCounts = async () => {
      const results = {};
      for (const m of activeOnes) {
        try {
          const res = await authFetch(`/meetings/${m.id}/active-count`);
          const data = await res.json();
          results[m.id] = data.active_count;
        } catch (e) { console.error(e); }
      }
      setActiveCounts(results);
    };

    pollCounts();
    const id = setInterval(pollCounts, 15000);
    return () => clearInterval(id);
  }, [meetings]);

  const fetchAttendance = async (meetingId) => {
    if (!meetingId) return;
    setSelectedAttendance(meetingId);
    setAttLoading(true);
    try {
      const res = await authFetch(`/meetings/${meetingId}/attendance`);
      const data = await res.json();
      setAttendanceData(data);
    } catch (e) {
      addToast('error', 'Failed to Load', 'Could not fetch attendance data.', 5000);
    } finally {
      setAttLoading(false);
    }
  };

  const createMeeting = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await authFetch('/meetings/', {
        method: 'POST',
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (!res.ok) throw new Error('Failed to create meeting');
      addToast('success', 'Meeting Created', `"${newTitle}" is live. Share the join code.`, 5000);
      setNewTitle('');
      setShowForm(false);
      await fetchMeetings();
    } catch (e) {
      addToast('error', 'Error', e.message, 6000);
    } finally {
      setCreating(false);
    }
  };

  const endMeeting = async (meetingId) => {
    try {
      await authFetch(`/meetings/${meetingId}/end`, { method: 'POST' });
      addToast('info', 'Meeting Ended', 'The session has been closed.', 4000);
      await fetchMeetings();
    } catch (e) {
      addToast('error', 'Error', 'Could not end meeting.', 6000);
    }
  };

  const exportCSV = async (meetingId) => {
    try {
      const res = await authFetch(`/meetings/${meetingId}/fatigue`);
      const logs = await res.json();
      if (!logs.length) {
        addToast('info', 'No Data', 'There are no fatigue logs to export for this meeting.', 4000);
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
      a.download = `fatigue_logs_meeting_${meetingId}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      addToast('success', 'Export Ready', 'CSV downloaded successfully.', 3000);
    } catch (e) {
      addToast('error', 'Export Failed', e.message, 5000);
    }
  };

  const exportAttendanceCSV = () => {
    if (!attendanceData.length) return;
    const headers = ['student_name', 'email', 'sessions_count', 'first_joined', 'total_minutes', 'status'];
    const csvStr = [
      headers.join(','),
      ...attendanceData.map(d => [
        `"${d.name}"`, d.email, d.sessions.length, d.first_seen, d.total_minutes, 
        d.sessions.some(s => !s.left_at) ? 'Present' : 'Left'
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvStr], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_meeting_${selectedAttendance}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    addToast('success', 'Export Ready', 'Attendance CSV downloaded successfully.', 3000);
  };

  const copyCode = (code, id) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (activeMeeting) {
    return (
      <>
        <Navbar />
        <div className="page">
          <LiveDashboard meetingId={activeMeeting.id} onLeave={() => setActive(null)} />
        </div>
      </>
    );
  }

  const activeMeetings = meetings.filter(m => !m.ended_at);
  const pastMeetings   = meetings.filter(m => !!m.ended_at);

  return (
    <>
      <Navbar />
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <div className="page fade-up">
        {/* Hero */}
        <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Teacher Portal</h1>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              Manage your classrooms and monitor student fatigue in real-time.
            </p>
          </div>
          
          <div className="tab-switcher" style={{ display: 'flex', background: 'var(--surface-muted)', padding: '0.25rem', borderRadius: '8px', gap: '0.25rem' }}>
            <button 
              className={`btn btn-sm ${activeTab === 'sessions' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('sessions')}
            >
              Sessions
            </button>
            <button 
              className={`btn btn-sm ${activeTab === 'attendance' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => {
                setActiveTab('attendance');
                if (!selectedAttendance && meetings.length > 0) {
                  fetchAttendance(meetings[0].id);
                }
              }}
            >
              Attendance
            </button>
          </div>
        </div>

        {activeTab === 'sessions' ? (
          <>

        {/* Create Meeting */}
        <div style={{ marginBottom: '2rem' }}>
          {!showForm ? (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={16} /> New Meeting
            </button>
          ) : (
            <div className="card" style={{ padding: '1.25rem', maxWidth: 480 }}>
              <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Create New Meeting</h3>
              <form onSubmit={createMeeting} style={{ display: 'flex', gap: '0.75rem' }}>
                <input
                  className="input"
                  style={{ flex: 1 }}
                  placeholder="Classroom title (e.g. Math Period 3)"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  autoFocus
                  required
                />
                <button className="btn btn-primary" type="submit" disabled={creating}>
                  {creating ? '…' : 'Create'}
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>Cancel</button>
              </form>
            </div>
          )}
        </div>

        {/* Active Meetings */}
        <div style={{ marginBottom: '2rem' }}>
          <div className="section-title">Active Sessions ({activeMeetings.length})</div>
          {loading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading…</div>
          ) : activeMeetings.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <Calendar size={36} />
                <h3>No active sessions</h3>
                <p>Create a new meeting above to start monitoring your class.</p>
              </div>
            </div>
          ) : (
            <div className="card">
              {activeMeetings.map(m => (
                <div key={m.id} className="meeting-row">
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: '0.3rem' }}>{m.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="meeting-code">{m.join_code}</span>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '0.2rem 0.5rem' }}
                        onClick={() => copyCode(m.join_code, m.id)}
                        title="Copy code"
                      >
                        {copiedId === m.id ? <Check size={12} color="var(--low)" /> : <Copy size={12} />}
                      </button>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {m.started_at ? format(new Date(m.started_at), 'MMM d, h:mm a') : ''}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: '0.5rem' }}>
                        <div style={{ 
                          width: 18, height: 18, borderRadius: '50%', backgroundColor: (activeCounts[m.id] || 0) > 0 ? 'var(--primary)' : 'var(--bg-secondary)',
                          color: '#fff', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          {activeCounts[m.id] || 0}
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>live students</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => setActive(m)}>
                      <Play size={13} /> Monitor
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => endMeeting(m.id)}>
                      <Square size={12} /> End
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Past Meetings */}
        {pastMeetings.length > 0 && (
          <div>
            <div className="section-title">Past Sessions ({pastMeetings.length})</div>
            <div className="card">
              {pastMeetings.map(m => (
                <div key={m.id} className="meeting-row" style={{ opacity: 0.75 }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{m.title}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Ended {m.ended_at ? format(new Date(m.ended_at), 'MMM d, h:mm a') : '—'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => exportCSV(m.id)} title="Download CSV Logs">
                      <Download size={14} />
                    </button>
                    <span className="badge badge-low">Ended</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    ) : (
          <div className="attendance-view fade-in">
            <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Attendance Records</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Detailed session participation by student</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <select 
                    className="input" 
                    style={{ minWidth: '240px' }}
                    value={selectedAttendance || ''}
                    onChange={(e) => fetchAttendance(e.target.value)}
                  >
                    {meetings.map(m => (
                      <option key={m.id} value={m.id}>{m.title} ({m.join_code})</option>
                    ))}
                  </select>
                  <button className="btn btn-primary btn-sm" onClick={exportAttendanceCSV} disabled={!attendanceData.length}>
                    <Download size={14} /> Export CSV
                  </button>
                </div>
              </div>

              {attLoading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Loading attendance data...</div>
              ) : attendanceData.length === 0 ? (
                <div className="empty-state">
                  <Users size={36} />
                  <h3>No attendance data</h3>
                  <p>Wait for students to join this meeting to see records.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                        <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>Student Name</th>
                        <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>Email</th>
                        <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>Sessions</th>
                        <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>First Joined</th>
                        <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>Total Time</th>
                        <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendanceData.map(d => (
                        <AttendanceRow key={d.user_id} data={d} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function AttendanceRow({ data }) {
  const [expanded, setExpanded] = useState(false);
  const isPresent = data.sessions.some(s => !s.left_at);

  return (
    <>
      <tr 
        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: expanded ? 'var(--bg-secondary)' : 'transparent' }} 
        onClick={() => setExpanded(!expanded)}
      >
        <td style={{ padding: '1rem', fontWeight: 600 }}>{data.name}</td>
        <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{data.email}</td>
        <td style={{ padding: '1rem' }}>{data.sessions.length} sessions</td>
        <td style={{ padding: '1rem', whiteSpace: 'nowrap' }}>{format(new Date(data.first_seen), 'h:mm a')}</td>
        <td style={{ padding: '1rem' }}>{data.total_minutes} min</td>
        <td style={{ padding: '1rem' }}>
          {isPresent ? (
            <span className="badge badge-low">Present</span>
          ) : (
            <span className="badge" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>Left</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan="6" style={{ padding: '1rem 2rem', background: 'var(--bg-secondary)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Timeline</div>
              {data.sessions.map((s, i) => {
                const start = format(new Date(s.joined_at), 'h:mm:ss a');
                const end = s.left_at ? format(new Date(s.left_at), 'h:mm:ss a') : 'ongoing';
                const duration = s.left_at 
                  ? `${Math.round((new Date(s.left_at) - new Date(s.joined_at)) / 60000)} min`
                  : '—';
                return (
                  <div key={i} style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem' }}>
                    <div style={{ color: 'var(--primary)', fontWeight: 600 }}>Session {i+1}:</div>
                    <div>{start} → {end} ({duration})</div>
                  </div>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
