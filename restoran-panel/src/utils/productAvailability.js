// Bir ürünün sipariş ekranında satılabilir olup olmadığını belirler.
// IsAvailable=false (manuel "86") VEYA StockCount tanımlıysa ve <= 0 ise
// ürün satılamaz. StockCount tanımsız/null ise stok takip edilmiyor demektir.
export const isProductAvailable = (product) => {
  const manuallyAvailable = product.IsAvailable !== false && product.IsAvailable !== 0;
  const hasStockCount = product.StockCount !== null && product.StockCount !== undefined;
  const inStock = !hasStockCount || Number(product.StockCount) > 0;
  return manuallyAvailable && inStock;
};
