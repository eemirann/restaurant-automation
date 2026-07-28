// Ürün adına göre uygun bir emoji seç (resmi olmayan ürünler için placeholder).
const PRODUCT_EMOJI_RULES = [
  [/(latte|cappuccino|mocha|espresso|americano|kahve|coffee|filtre|flat white|cortado)/, '☕'],
  [/(çay|tea|bitki|ıhlamur|nane)/, '🍵'],
  [/(frappe|frappuccino|milkshake|shake|smoothie|buzlu|ice|soğuk)/, '🥤'],
  [/(kola|cola|gazoz|soda|meşrubat|fanta|sprite)/, '🥤'],
  [/(su|water|maden)/, '💧'],
  [/(portakal|orange|meyve suyu|juice|limonata|nar)/, '🧃'],
  [/(çikolata|chocolate|kakao)/, '🍫'],
  [/(cheesecake|pasta|kek|cake|tatlı|dessert|sufle|brownie|tiramisu|magnolia)/, '🍰'],
  [/(dondurma|ice cream|gelato)/, '🍦'],
  [/(kurabiye|cookie|bisküvi)/, '🍪'],
  [/(kruvasan|croissant|poğaça|açma|simit|börek|pizza|toast|tost|sandviç|sandwich|burger|hamburger)/, '🥪'],
  [/(çorba|soup)/, '🍲'],
  [/(salata|salad)/, '🥗'],
  [/(makarna|pasta|spagetti|noodle)/, '🍝'],
  [/(patates|fries|kızartma)/, '🍟'],
  [/(tavuk|chicken|et |steak|köfte|kebap|kebab|döner)/, '🍖'],
  [/(balık|fish|somon)/, '🐟'],
  [/(kahvaltı|breakfast|yumurta|omlet|menemen)/, '🍳'],
  [/(bira|beer|şarap|wine|kokteyl|cocktail)/, '🍸'],
];

export const productEmoji = (name) => {
  const n = (name || '').toLocaleLowerCase('tr-TR');
  for (const [rx, emoji] of PRODUCT_EMOJI_RULES) {
    if (rx.test(n)) return emoji;
  }
  return '🍴';
};
