import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ShiftProvider } from './context/ShiftContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Tables from './pages/Tables';
import Reservations from './pages/Reservations';
import CustomerRequests from './pages/CustomerRequests';
import Kds from './pages/Kds';
import Payments from './pages/Payments';
import Products from './pages/Products';
import Users from './pages/Users';
import Stock from './pages/Stock';
import Categories from './pages/Categories';
import Extras from './pages/Extras';
import Syrups from './pages/Syrups';
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
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={<Page><Dashboard /></Page>} />
          <Route path="/orders" element={<Page><Orders /></Page>} />
          <Route path="/tables" element={<Page><Tables /></Page>} />
          <Route path="/reservations" element={<Page><Reservations /></Page>} />
          <Route path="/customer-requests" element={<Page><CustomerRequests /></Page>} />
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
          <Route
            path="/extras"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <Layout><Extras /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/syrups"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <Layout><Syrups /></Layout>
              </ProtectedRoute>
            }
          />
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
        </Routes>
      </BrowserRouter>
      </ShiftProvider>
    </AuthProvider>
  );
}
