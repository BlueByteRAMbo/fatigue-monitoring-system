import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Login from './pages/Login';
import TeacherPortal from './pages/TeacherPortal';
import StudentPortal from './pages/StudentPortal';

function PrivateRoute({ children, role }) {
  const { user, token } = useAuth();
  if (!token || !user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={user.role === 'teacher' ? '/teacher' : '/student'} replace />;
  return children;
}

function RootRedirect() {
  const { user, token } = useAuth();
  if (!token || !user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'teacher' ? '/teacher' : '/student'} replace />;
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/teacher" element={
          <PrivateRoute role="teacher"><TeacherPortal /></PrivateRoute>
        } />
        <Route path="/student" element={
          <PrivateRoute role="student"><StudentPortal /></PrivateRoute>
        } />
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ThemeProvider>
  );
}
