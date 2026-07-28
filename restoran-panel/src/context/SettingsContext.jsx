import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import client from '../api/client';

const SettingsContext = createContext(null);

const DEFAULTS = { RestaurantName: 'Restoran', ThemeColor: '#FF4713' };

// #RRGGBB -> "R G B" (Tailwind'in rgb(var(--x) / <alpha-value>) beklediği format)
function hexToRgbTriplet(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

function applyThemeColor(hex) {
  document.documentElement.style.setProperty('--color-ember', hexToRgbTriplet(hex));
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await client.get('/settings');
      setSettings(res.data);
      applyThemeColor(res.data.ThemeColor);
    } catch {
      // Ayarlar getirilemezse sessizce varsayılanlarda kal (marka bilgisi kritik değil)
      applyThemeColor(DEFAULTS.ThemeColor);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // Ayarlar sayfası kaydettikten sonra hem context'i hem CSS değişkenini
  // sayfa yenilemeden günceller.
  const updateLocalSettings = (next) => {
    setSettings(next);
    applyThemeColor(next.ThemeColor);
  };

  return (
    <SettingsContext.Provider value={{ ...settings, loaded, refreshSettings: fetchSettings, updateLocalSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
