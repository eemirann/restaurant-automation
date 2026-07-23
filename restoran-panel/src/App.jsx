import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Tables from './pages/Tables';
import Payments from './pages/Payments';
import Products from './pages/Products';
import Users from './pages/Users';
import Stock from './pages/Stock';
import StockMovements from './pages/StockMovements';

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
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={<Page><Dashboard /></Page>} />
          <Route path="/orders" element={<Page><Orders /></Page>} />
          <Route path="/tables" element={<Page><Tables /></Page>} />
          <Route path="/payments" element={<Page><Payments /></Page>} />

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
            path="/stock-movements"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <Layout><StockMovements /></Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
