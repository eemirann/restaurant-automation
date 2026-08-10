import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ShiftProvider } from './context/ShiftContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import DesktopBridge from './components/DesktopBridge';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Tables from './pages/Tables';
import Reservations from './pages/Reservations';
import CustomerRequests from './pages/CustomerRequests';
import Customers from './pages/Customers';
import Kds from './pages/Kds';
import Payments from './pages/Payments';
import Products from './pages/Products';
import Users from './pages/Users';
import Stock from './pages/Stock';
import Categories from './pages/Categories';
import Settings from './pages/Settings';
import StockMovements from './pages/StockMovements';
import Reports from './pages/Reports';
import Recipes from './pages/Recipes';
import Shifts from './pages/Shifts';
import ActiveShifts from './pages/ActiveShifts';
import Audit from './pages/Audit';
import Invoices from './pages/Invoices';
import Campaigns from './pages/Campaigns';

function Page({ children }) {
  return (
    <ProtectedRoute>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ShiftProvider>
      {/* Masaüstü (Tauri) kabuğu: tarayıcıda hiçbir etkisi yoktur */}
      <DesktopBridge />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={<Page><Dashboard /></Page>} />
          <Route path="/orders" element={<Page><Orders /></Page>} />
          <Route path="/tables" element={<Page><Tables /></Page>} />
          <Route path="/reservations" element={<Page><Reservations /></Page>} />
          <Route path="/customer-requests" element={<Page><CustomerRequests /></Page>} />
          <Route
            path="/customers"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Cashier']}>
                <Layout><Customers /></Layout>
              </ProtectedRoute>
            }
          />
          <Route path="/kds" element={<Page><Kds /></Page>} />
          <Route path="/shifts" element={<Page><Shifts /></Page>} />
          <Route
            path="/active-shifts"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <Layout><ActiveShifts /></Layout>
              </ProtectedRoute>
            }
          />
          <Route path="/payments" element={<Page><Payments /></Page>} />

          <Route
            path="/reports"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Cashier']}>
                <Layout><Reports /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/products"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <Layout><Products /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <Layout><Users /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/stock"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <Layout><Stock /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/recipes"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <Layout><Recipes /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/categories"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <Layout><Categories /></Layout>
              </ProtectedRoute>
            }
          />
          {/* Ekstralar/Şuruplar ayrı sayfaları kaldırıldı, Stok sayfasına
              taşındı — eski linkleri (favori/yer imi) yönlendir. */}
          <Route path="/extras" element={<Navigate to="/stock" replace />} />
          <Route path="/syrups" element={<Navigate to="/stock" replace />} />
          <Route
            path="/settings"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <Layout><Settings /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/audit"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <Layout><Audit /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/invoices"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <Layout><Invoices /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/campaigns"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <Layout><Campaigns /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/stock-movements"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <Layout><StockMovements /></Layout>
              </ProtectedRoute>
            }
          />

          {/* Bilinmeyen adres -> panele yönlendir. Aksi halde eşleşmeyen bir
              yol (ör. masaüstü kabuğunun '/index.html' yüklemesi) hiçbir şey
              render etmez ve BEYAZ EKRAN olarak görünür. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </ShiftProvider>
    </AuthProvider>
  );
}
