// restoran-panel/src/components/PriceCalculator.jsx ile aynı mantık —
// ayrı bir proje olduğu için kod paylaşılmıyor, küçük olduğu için kopyalandı.

export function calculateOptionsTotal(selections, catalogById) {
  return Object.entries(selections || {}).reduce((sum, [id, qty]) => {
    const option = catalogById.get(Number(id));
    return sum + (option ? Number(option.Price) * qty : 0);
  }, 0);
}

export function calculateLineTotal(basePrice, quantity, optionGroups) {
  const base = Number(basePrice) || 0;
  const addons = (optionGroups || []).reduce(
    (sum, group) => sum + calculateOptionsTotal(group.selections, group.catalogById),
    0
  );
  return (base + addons) * (quantity || 1);
}

export const money = (n) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);
