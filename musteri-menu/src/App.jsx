import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MenuApp from './pages/MenuApp';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/:qrToken" element={<MenuApp />} />
        <Route path="*" element={<InvalidLink />} />
      </Routes>
    </BrowserRouter>
  );
}

function InvalidLink() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 text-center bg-charcoal font-body">
      <div>
        <p className="text-5xl mb-4">📷</p>
        <h1 className="font-display text-xl font-semibold text-paper mb-2">QR Kod Gerekli</h1>
        <p className="text-slate text-sm">Menüyü görüntülemek için masanızdaki QR kodu okutun.</p>
      </div>
    </div>
  );
}
