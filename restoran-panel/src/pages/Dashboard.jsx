import { useAuth } from '../context/AuthContext';

const ROLE_LABELS = {
  Admin: 'Yönetici',
  Cashier: 'Kasiyer',
  Waiter: 'Garson',
};

export default function Dashboard() {
  const { user } = useAuth();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar';

  return (
    <div className="p-10">
      <p className="font-mono text-xs tracking-[0.3em] text-ember uppercase mb-2">
        {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
      <h1 className="font-display text-4xl font-semibold text-ink mb-1">
        {greeting}, {user?.fullName?.split(' ')[0]}
      </h1>
      <p className="text-slate mb-10">
        {ROLE_LABELS[user?.role]} olarak giriş yaptın.
      </p>

      <div className="border border-dashed border-sand rounded-sm p-8 text-center bg-white/50">
        <p className="text-slate font-mono text-sm">
          Bu alana yakında günlük ciro, açık masa sayısı ve bekleyen sipariş özetleri gelecek.
        </p>
      </div>
    </div>
  );
}
