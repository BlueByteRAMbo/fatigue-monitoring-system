import { LineChart, Line, YAxis, ResponsiveContainer } from 'recharts';

export default function StudentCard({ student }) {
  const { user_name, fatigue_level, ear_score, blink_rate, history } = student;
  
  // Convert full name to initial
  const initial = user_name ? user_name.charAt(0).toUpperCase() : '?';

  return (
    <div className={`student-card ${fatigue_level}`}>
      <div className="card-header">
        <div className="avatar">{initial}</div>
        <div className="student-info">
          <h3>{user_name}</h3>
          <span className={`badge ${fatigue_level}`}>
            STATE: {fatigue_level}
          </span>
        </div>
      </div>
      
      <div className="metrics-row">
        <div className="metric">
          <span className="metric-label">Avg EAR Score</span>
          <span className="metric-value">
            {ear_score ? ear_score.toFixed(3) : '--'}
          </span>
        </div>
        
        <div className="metric" style={{textAlign: 'right'}}>
          <span className="metric-label">Blink Rate</span>
          <span className="metric-value">
            {blink_rate ? blink_rate.toFixed(1) : '0'} /min
          </span>
        </div>
      </div>

      <div className="chart-container">
        {history && history.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history}>
              <YAxis domain={[0.1, 0.4]} hide />
              <Line 
                type="monotone" 
                dataKey="ear" 
                stroke={fatigue_level === 'high' ? '#ef4444' : '#3b82f6'} 
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)'}}>
            Collecting baseline geometry...
          </div>
        )}
      </div>
    </div>
  );
}
