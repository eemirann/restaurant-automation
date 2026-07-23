import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

// Backend rol değerleri (DB/API kontratı) -> ekranda gösterilen Türkçe etiketler
const ROLE_LABELS = {
  Admin: 'Yönetici',
  Cashier: 'Kasiyer',
  Waiter: 'Garson',
};

// Yeni kullanıcı / rol değiştirme seçeneklerinde kullanılan sıra
const ROLE_OPTIONS = ['Waiter', 'Cashier', 'Admin'];

const FILTERS = [
  { value: '', label: 'Tümü' },
  { value: 'active', label: 'Aktif' },
  { value: 'inactive', label: 'Pasif' },
];

const dateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const isActive = (u) => u.IsActive !== false && u.IsActive !== 0;

export default function Users() {
  const { user } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [actionError, setActionError] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [managingUser, setManagingUser] = useState(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/users');
      setUsers(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Kullanıcılar getirilemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const deactivateUser = async (userId) => {
    if (!window.confirm('Bu kullanıcıyı pasife almak istediğinize emin misiniz? Pasif kullanıcı giriş yapamaz.')) return;
    setActionError('');
    try {
      await client.patch(`/users/${userId}/deactivate`);
      fetchUsers();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Kullanıcı pasife alınamadı.');
    }
  };

  const reactivateUser = async (userId) => {
    setActionError('');
    try {
      await client.patch(`/users/${userId}/reactivate`);
      fetchUsers();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Kullanıcı aktifleştirilemedi.');
    }
  };

  const visibleUsers = users.filter((u) => {
    if (filter === 'active') return isActive(u);
    if (filter === 'inactive') return !isActive(u);
    return true;
  });

  const activeCount = users.filter(isActive).length;
  const inactiveCount = users.length - activeCount;

  return (
    <div className="p-10">
      {/* Başlık */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="font-mono text-xs tracking-[0.3em] text-ember uppercase mb-2">
            Yönetim · Personel
          </p>
          <h1 className="font-display text-3xl font-semibold text-ink">Kullanıcılar</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchUsers}
            className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember
                       border border-sand rounded-sm px-3 py-2 transition-colors"
          >
            ↻ Yenile
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="font-mono text-xs uppercase tracking-wide text-cream bg-ember
                       hover:bg-ember/90 rounded-sm px-4 py-2 transition-colors"
          >
            + Yeni Kullanıcı
          </button>
        </div>
      </div>

      {/* Durum özeti */}
      <div className="flex flex-wrap gap-6 mb-6 font-mono text-xs text-slate">
        <span><span className="text-ink font-semibold">{users.length}</span> toplam</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block bg-moss" />
          {activeCount} aktif
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block bg-slate" />
          {inactiveCount} pasif
        </span>
      </div>

      {/* Filtre sekmeleri */}
      <div className="flex gap-1 mb-6 border-b border-sand">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`font-mono text-xs uppercase tracking-wide px-4 py-2.5 border-b-2 transition-colors ${
              filter === f.value
                ? 'border-ember text-ink font-semibold'
                : 'border-transparent text-slate hover:text-ink'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {(error || actionError) && (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">
          {error || actionError}
        </p>
      )}

      {loading ? (
        <p className="text-slate font-mono text-sm">Yükleniyor...</p>
      ) : visibleUsers.length === 0 ? (
        <div className="border border-dashed border-sand rounded-sm p-10 text-center bg-white/50">
          <p className="text-slate font-mono text-sm">Gösterilecek kullanıcı bulunamadı.</p>
        </div>
      ) : (
        <div className="border border-sand rounded-sm overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cream/60 border-b border-sand text-left font-mono text-[10px] uppercase tracking-widest text-slate">
                <th className="px-5 py-3">Kullanıcı</th>
                <th className="px-5 py-3">Kullanıcı Adı</th>
                <th className="px-5 py-3">Rol</th>
                <th className="px-5 py-3">Durum</th>
                <th className="px-5 py-3">Oluşturuldu</th>
                <th className="px-5 py-3 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((u) => {
                const active = isActive(u);
                const isSelf = user?.userId === u.UserId;
                return (
                  <tr key={u.UserId} className="border-b border-sand last:border-b-0 hover:bg-cream/30">
                    <td className="px-5 py-3">
                      <p className="text-ink font-medium">
                        {u.FullName}
                        {isSelf && (
                          <span className="ml-2 font-mono text-[10px] uppercase tracking-wide text-ember">(sen)</span>
                        )}
                      </p>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate">{u.UserName}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center border border-sand rounded-sm px-2 py-1 text-xs font-mono uppercase tracking-wide text-ink bg-cream/40">
                        {ROLE_LABELS[u.Role] || u.Role}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 border rounded-sm px-2 py-1 text-xs font-mono uppercase tracking-wide ${
                          active ? 'border-moss/40 bg-moss/5' : 'border-slate/30 bg-slate/5'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-moss' : 'bg-slate'}`} />
                        {active ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate">{dateTime(u.CreatedAt)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2 flex-wrap">
                        <button
                          onClick={() => setManagingUser(u)}
                          className="font-mono text-[11px] uppercase tracking-wide text-slate hover:text-ember border border-sand rounded-sm px-2.5 py-1.5 transition-colors"
                        >
                          Yönet
                        </button>
                        {active ? (
                          <button
                            onClick={() => deactivateUser(u.UserId)}
                            disabled={isSelf}
                            title={isSelf ? 'Kendi hesabınızı pasife alamazsınız' : undefined}
                            className="font-mono text-[11px] uppercase tracking-wide text-ember hover:text-ember/80 border border-ember/40 rounded-sm px-2.5 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Pasife Al
                          </button>
                        ) : (
                          <button
                            onClick={() => reactivateUser(u.UserId)}
                            className="font-mono text-[11px] uppercase tracking-wide text-moss hover:text-moss/80 border border-moss/40 rounded-sm px-2.5 py-1.5 transition-colors"
                          >
                            Aktif Et
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            fetchUsers();
          }}
        />
      )}

      {managingUser && (
        <ManageUserModal
          user={managingUser}
          onClose={() => setManagingUser(null)}
          onSaved={() => {
            setManagingUser(null);
            fetchUsers();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Yeni kullanıcı oluşturma (POST /auth/register — sadece Admin)
// ============================================================
function CreateUserModal({ onClose, onCreated }) {
  const [fullName, setFullName] = useState('');
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Waiter');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!fullName.trim()) {
      setError('Ad soyad zorunludur.');
      return;
    }
    if (!userName.trim()) {
      setError('Kullanıcı adı zorunludur.');
      return;
    }
    if (password.length < 6) {
      setError('Şifre en az 6 karakter olmalı.');
      return;
    }

    setSubmitting(true);
    try {
      await client.post('/auth/register', {
        FullName: fullName.trim(),
        UserName: userName.trim(),
        Password: password,
        Role: role,
      });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.message || 'Kullanıcı oluşturulamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center px-4 z-50" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-sm border border-sand w-full max-w-md max-h-[85vh] overflow-auto shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-sand flex items-start justify-between">
          <div>
            <p className="font-mono text-xs tracking-[0.2em] text-ember uppercase mb-1">Personel</p>
            <h2 className="font-display text-xl font-semibold text-ink">Yeni Kullanıcı</h2>
          </div>
          <button type="button" onClick={onClose} className="font-mono text-xs text-slate hover:text-ink">
            Kapat ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Ad Soyad</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoFocus
              className="w-full border border-sand rounded-sm px-3 py-2.5 font-body text-ink
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Kullanıcı Adı</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              autoComplete="off"
              className="w-full border border-sand rounded-sm px-3 py-2.5 font-body text-ink
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              placeholder="ör. garson1"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Şifre</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full border border-sand rounded-sm px-3 py-2.5 font-body text-ink
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
                placeholder="En az 6 karakter"
              />
            </div>
            <div className="flex-1">
              <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Rol</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full border border-sand rounded-sm px-3 py-2.5 font-body text-ink
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{error}</p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-sand flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ink
                       border border-sand rounded-sm px-4 py-2.5 transition-colors"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="font-mono text-xs uppercase tracking-wide text-cream bg-ember
                       hover:bg-ember/90 disabled:opacity-50 rounded-sm px-4 py-2.5 transition-colors"
          >
            {submitting ? 'Oluşturuluyor...' : 'Oluştur'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ============================================================
// Kullanıcı yönetimi — rol değiştir + şifre sıfırla
// (PATCH /users/:id/role, PATCH /users/:id/reset-password)
// ============================================================
function ManageUserModal({ user, onClose, onSaved }) {
  const [role, setRole] = useState(user.Role);
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleMsg, setRoleMsg] = useState('');
  const [roleError, setRoleError] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState('');

  const saveRole = async () => {
    setRoleMsg('');
    setRoleError('');
    if (role === user.Role) {
      setRoleError('Rol zaten bu değerde.');
      return;
    }
    setRoleSaving(true);
    try {
      await client.patch(`/users/${user.UserId}/role`, { Role: role });
      setRoleMsg('Rol güncellendi.');
    } catch (err) {
      setRoleError(err.response?.data?.error || 'Rol güncellenemedi.');
    } finally {
      setRoleSaving(false);
    }
  };

  const savePassword = async () => {
    setPwMsg('');
    setPwError('');
    if (newPassword.length < 6) {
      setPwError('Yeni şifre en az 6 karakter olmalı.');
      return;
    }
    setPwSaving(true);
    try {
      await client.patch(`/users/${user.UserId}/reset-password`, { NewPassword: newPassword });
      setPwMsg('Şifre sıfırlandı.');
      setNewPassword('');
    } catch (err) {
      setPwError(err.response?.data?.error || 'Şifre sıfırlanamadı.');
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center px-4 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-sm border border-sand w-full max-w-md max-h-[85vh] overflow-auto shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-sand flex items-start justify-between">
          <div>
            <p className="font-mono text-xs tracking-[0.2em] text-ember uppercase mb-1">Yönet</p>
            <h2 className="font-display text-xl font-semibold text-ink">{user.FullName}</h2>
            <p className="font-mono text-xs text-slate mt-0.5">{user.UserName}</p>
          </div>
          <button onClick={onClose} className="font-mono text-xs text-slate hover:text-ink">
            Kapat ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Rol değiştir */}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-2">Rol</p>
            <div className="flex gap-2">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="flex-1 border border-sand rounded-sm px-3 py-2.5 font-body text-ink
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={saveRole}
                disabled={roleSaving}
                className="font-mono text-xs uppercase tracking-wide text-cream bg-ink
                           hover:bg-ink/90 disabled:opacity-50 rounded-sm px-4 py-2.5 transition-colors shrink-0"
              >
                {roleSaving ? '...' : 'Kaydet'}
              </button>
            </div>
            {roleError && <p className="text-ember text-xs font-medium border-l-2 border-ember pl-3 mt-2">{roleError}</p>}
            {roleMsg && <p className="text-moss text-xs font-medium border-l-2 border-moss pl-3 mt-2">{roleMsg}</p>}
          </div>

          <div className="border-t border-sand" />

          {/* Şifre sıfırla */}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-2">Şifre Sıfırla</p>
            <div className="flex gap-2">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Yeni şifre (en az 6 karakter)"
                className="flex-1 border border-sand rounded-sm px-3 py-2.5 font-body text-ink
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              />
              <button
                type="button"
                onClick={savePassword}
                disabled={pwSaving}
                className="font-mono text-xs uppercase tracking-wide text-cream bg-ink
                           hover:bg-ink/90 disabled:opacity-50 rounded-sm px-4 py-2.5 transition-colors shrink-0"
              >
                {pwSaving ? '...' : 'Sıfırla'}
              </button>
            </div>
            {pwError && <p className="text-ember text-xs font-medium border-l-2 border-ember pl-3 mt-2">{pwError}</p>}
            {pwMsg && <p className="text-moss text-xs font-medium border-l-2 border-moss pl-3 mt-2">{pwMsg}</p>}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-sand flex justify-end">
          <button
            type="button"
            onClick={onSaved}
            className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ink
                       border border-sand rounded-sm px-4 py-2.5 transition-colors"
          >
            Kapat ve Yenile
          </button>
        </div>
      </div>
    </div>
  );
}
