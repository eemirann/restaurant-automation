// Masa bölümleri (Salon/Teras/Bahçe/VIP/Bar) için paylaşılan yardımcılar —
// Tables.jsx (masa formu + bölüm sekmeleri) ve Settings.jsx (Masa Alanları
// sekmesi, bkz. components/TableAreasManager.jsx) tarafından ortak kullanılır.

// İlk kurulumda gelen 5 İngilizce anahtar için Türkçe çeviri — admin'in
// sonradan eklediği bölümler (ör. "Kış Bahçesi") olduğu gibi gösterilir.
export const LEGACY_AREA_LABELS = { Salon: 'Salon', Terrace: 'Teras', Garden: 'Bahçe', VIP: 'VIP', Bar: 'Bar' };
export const DEFAULT_AREA = 'Salon';
export const areaLabelOf = (key) => LEGACY_AREA_LABELS[key] || key;
