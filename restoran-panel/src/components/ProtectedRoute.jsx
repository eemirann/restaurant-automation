import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// allowedRoles verilmezse, sadece giriş yapmış olmak yeterli.
// Verilirse, kullanıcının rolü listede olmalı.
export default function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center font-body">
        <div className="text-center">
          <p className="font-display text-2xl text-ink mb-2">Erişim yok</p>
          <p className="text-slate">Bu sayfayı görüntüleme yetkin bulunmuyor.</p>
        </div>
      </div>
    );
  }

  return children;
}
