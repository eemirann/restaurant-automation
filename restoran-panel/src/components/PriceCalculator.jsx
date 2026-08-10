const money = (n) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);

// Bir seçim grubunun (ör. bir sepet kalemine eklenen ekstralar) toplamını
// hesaplar. `selections`: {[ProductId]: quantity}, `catalogById`: Map<ProductId, {Price}>.
// `InRecipe` işaretli seçenekler (bkz. GET /products/:id/order-options) ücretsizdir —
// zaten seçildiği ürünün Reçetesinde sabit olarak var, sepette ayrıca ücretlendirilmez
// (bkz. controllers/orderController.js'teki backend karşılığı — çifte ücret fix'i).
export function calculateOptionsTotal(selections, catalogById) {
  return Object.entries(selections || {}).reduce((sum, [id, qty]) => {
    const option = catalogById.get(Number(id));
    if (!option) return sum;
    const price = option.InRecipe ? 0 : Number(option.Price);
    return sum + price * qty;
  }, 0);
}

// Bir sepet kaleminin toplam fiyatı: (taban fiyat + tüm opsiyon gruplarının
// toplamı) x adet. `optionGroups`: [{ selections, catalogById }, ...] — ör.
// biri ekstralar, biri şuruplar için, aynı üründe ikisi de olabildiğinden.
export function calculateLineTotal(basePrice, quantity, optionGroups) {
  const base = Number(basePrice) || 0;
  const addons = (optionGroups || []).reduce(
    (sum, group) => sum + calculateOptionsTotal(group.selections, group.catalogById),
    0
  );
  return (base + addons) * (quantity || 1);
}

export default function PriceCalculator({ basePrice, quantity, optionGroups, className }) {
  const total = calculateLineTotal(basePrice, quantity, optionGroups);
  return <span className={className}>{money(total)}</span>;
}
