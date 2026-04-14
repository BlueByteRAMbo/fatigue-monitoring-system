import { useEffect, useState, useRef } from 'react';
import StudentCard from './StudentCard';

const WS_URL = 'ws://127.0.0.1:8000/ws/meeting';

export default function TeacherDashboard({ meetingId, onLeave }) {
  const [students, setStudents] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    // Determine the WS connection
    const ws = new WebSocket(`${WS_URL}/${meetingId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      console.log('Connected to WebSocket Server');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Data structure matching the FastAPI backend payload
        // { user_id, user_name, fatigue_level, ear_score, blink_rate, timestamp }
        
        setStudents(prev => {
          const studentHistory = prev[data.user_id]?.history || [];
          // Keep maximum last 30 data points for the sparkline chart
          const newHistory = [...studentHistory, { 
            time: new Date(data.timestamp).toLocaleTimeString(), 
            ear: data.ear_score 
          }].slice(-30);

          return {
            ...prev,
            [data.user_id]: {
              ...data,
              history: newHistory
            }
          };
        });
        
      } catch (e) {
        console.error("Failed to parse socket data", e);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log('Disconnected from server');
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [meetingId]);

  return (
    <div className="dashboard-container">
      <header className="header">
        <h1>
          Dashboard: Class {meetingId}
          {isConnected ? (
            <span className="live-indicator"><div className="live-dot"></div> LIVE</span>
          ) : (
            <span className="live-indicator" style={{color: 'var(--text-muted)', background: 'transparent'}}>OFFLINE</span>
          )}
        </h1>
        <button 
          onClick={onLeave}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--text-main)',
            padding: '8px 16px',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          End Monitoring
        </button>
      </header>

      {Object.values(students).length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '4rem' }}>
          <h2>Waiting for students to join...</h2>
          <p>Once students start their client extensions, they will appear here instantly.</p>
        </div>
      ) : (
        <div className="students-grid">
          {Object.values(students).map(student => (
            <StudentCard key={student.user_id} student={student} />
          ))}
        </div>
      )}
    </div>
  );
}
