import { useEffect, useState } from 'react';
import client from '../api/client';

const money = (n) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);

const STATUS_LABEL = { Issued: 'Kesildi', Pending: 'Beklemede', Failed: 'Başarısız' };
const STATUS_CLASS = {
  Issued: 'border-moss/40 bg-moss/5 text-moss',
  Pending: 'border-ember/40 bg-ember/5 text-ember',
  Failed: 'border-slate/40 bg-slate/5 text-slate',
};

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchInvoices = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/invoices');
      setInvoices(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Faturalar getirilemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInvoices(); }, []);

  return (
    <div className="p-10">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-[10px] font-bold text-[#FF6B6B] tracking-[0.3em] uppercase mb-2">
            Muhasebe · e-Arşiv
          </p>
          <h1 className="text-4xl font-extrabold text-paper tracking-tight">Faturalar</h1>
        </div>
        <button
          onClick={fetchInvoices}
          className="text-[11px] font-bold uppercase tracking-wide text-slate hover:text-paper
                     border border-hairline rounded-xl px-3 py-2 bg-panel shadow-sm transition-colors"
        >
          ↻ Yenile
        </button>
      </div>

      <div className="border-l-2 border-[#FF6B6B]/60 bg-[#FF6B6B]/5 rounded-r-xl px-4 py-3 mb-6">
        <p className="font-mono text-xs text-paper">
          Henüz gerçek bir e-Arşiv entegratörüne (Foriba, Uyumsoft, Nesbilgi vb.) bağlı değiliz —
          buradaki faturalar <span className="font-semibold">test/mock</span> amaçlıdır, GİB'e
          iletilmemiştir. Gerçek entegratör bağlandığında bu sayfa değişmeden, sadece arka plandaki
          fatura kesme mekanizması gerçek servise geçecek.
        </p>
      </div>

      {error && (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">{error}</p>
      )}

      {loading ? (
        <p className="text-slate font-mono text-sm">Yükleniyor...</p>
      ) : invoices.length === 0 ? (
        <div className="border border-dashed border-hairline rounded-3xl p-10 text-center bg-panel/50">
          <p className="text-slate font-mono text-sm">Henüz kesilmiş bir fatura yok.</p>
        </div>
      ) : (
        <div className="border border-stone-100 rounded-3xl overflow-hidden bg-panel shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-hairline/60 border-b border-hairline text-left font-mono text-[10px] uppercase tracking-widest text-slate">
                <th className="px-5 py-3">Fatura No</th>
                <th className="px-5 py-3">Sipariş / Masa</th>
                <th className="px-5 py-3">Müşteri</th>
                <th className="px-5 py-3">Tutar</th>
                <th className="px-5 py-3">KDV</th>
                <th className="px-5 py-3">Durum</th>
                <th className="px-5 py-3">Tarih</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.InvoicesId} className="border-b border-hairline last:border-b-0 hover:bg-hairline/30">
                  <td className="px-5 py-3 font-mono text-paper">{inv.InvoiceNumber || '—'}</td>
                  <td className="px-5 py-3 font-mono text-slate">
                    #{inv.OrderId}{inv.TableNumber ? ` · Masa ${inv.TableNumber}` : ''}
                  </td>
                  <td className="px-5 py-3 text-paper">{inv.CustomerName || <span className="text-slate">—</span>}</td>
                  <td className="px-5 py-3 font-mono text-paper">{money(inv.Amount)}</td>
                  <td className="px-5 py-3 font-mono text-slate">{money(inv.TaxAmount)}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center border rounded-sm px-2 py-1 text-xs font-mono uppercase tracking-wide ${STATUS_CLASS[inv.Status] || ''}`}>
                      {STATUS_LABEL[inv.Status] || inv.Status}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-slate text-xs">
                    {inv.CreatedAt ? new Date(inv.CreatedAt).toLocaleString('tr-TR') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
