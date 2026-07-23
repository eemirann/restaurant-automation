import { io } from 'socket.io-client';
import { API_ORIGIN } from './client';

let socket = null;

// Tek bir soket bağlantısı: sayfalar arası paylaşılır, her sayfa kendi
// açıp kapatmaz. Token yoksa (henüz login olunmamışsa) bağlanmaz.
export function getSocket() {
  if (socket) return socket;

  const token = localStorage.getItem('token');
  if (!token) return null;

  socket = io(API_ORIGIN, {
    auth: { token },
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
