// Paylaşılan yazdırma yardımcıları — tarayıcı üzerinden (window.print) termal
// fiş boyutunda (58/80mm) çıktı alır. Gerçek ESC/POS/ağ yazıcı entegrasyonu
// için ileride bu dosyadaki `openPrintWindow` çağrıları bir backend
// print-servisi çağrısıyla değiştirilebilir; çağıran kod (PaymentDrawer,
// Tables) bu değişiklikten etkilenmez.

const PAPER_WIDTH_MM = { 58: '58mm', 80: '80mm' };

// Tüm fiş türlerinin ortak stil ve pencere açma mantığı. @page kuralı
// tarayıcının kendi başlık/tarih/URL çıktısını ve varsayılan kenar
// boşluklarını kaldırır — düzensiz/eksik kesilen çıktıların ana sebebi buydu.
function openPrintWindow(title, bodyHtml, { paperWidth = 80 } = {}) {
  const width = PAPER_WIDTH_MM[paperWidth] || PAPER_WIDTH_MM[80];
  const w = window.open('', 'PRINT', 'height=640,width=380');
  if (!w) return false;

  w.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          @page { size: ${width} auto; margin: 2mm; }
          * { font-family: 'Courier New', monospace; color: #000; box-sizing: border-box; }
          body { width: ${width}; margin: 0 auto; font-size: 12px; }
          h2 { font-size: 15px; margin: 0 0 2px; text-align: center; }
          table { width: 100%; border-collapse: collapse; margin: 6px 0; }
          td { padding: 2px 0; vertical-align: top; }
          .hr { border-top: 1px dashed #000; margin: 6px 0; }
          .tot { display: flex; justify-content: space-between; }
          .big { font-size: 16px; font-weight: bold; }
          .huge { font-size: 20px; font-weight: bold; }
          .center { text-align: center; }
          .muted { color: #444; }
        </style>
      </head>
      <body>${bodyHtml}</body>
    </html>
  `);
  w.document.close();
  w.focus();
  // Bazı tarayıcılarda write() sonrası layout'un oturması için bir sonraki
  // event loop turunda yazdır — aksi halde ilk çağrıda boş sayfa basılabiliyor.
  setTimeout(() => {
    w.print();
    w.close();
  }, 50);
  return true;
}

// Müşteri fişi (ödeme ekranı) — ürünler, ekstra/şurup, toplam/ödenen/kalan.
export function printCustomerReceipt({ restaurantName = 'RESTORAN', orderId, tableLabel, rowsHtml, totalAmount, totalPaid, remaining, money }) {
  const body = `
    <h2>${restaurantName}</h2>
    <div class="center">Sipariş #${orderId}${tableLabel ? ' · ' + tableLabel : ''}</div>
    <div class="center muted">${new Date().toLocaleString('tr-TR')}</div>
    <div class="hr"></div><table>${rowsHtml}</table><div class="hr"></div>
    <div class="tot"><span>Toplam</span><span>${money(totalAmount)}</span></div>
    ${totalPaid > 0 ? `<div class="tot"><span>Ödenen</span><span>${money(totalPaid)}</span></div>` : ''}
    <div class="tot big"><span>Kalan</span><span>${money(remaining)}</span></div>
    <div class="hr"></div><div class="center">Teşekkür ederiz!</div>
  `;
  return openPrintWindow(`Fiş #${orderId}`, body, { paperWidth: 80 });
}

// Mutfak/bar fişi — fiyat YOK, sadece adet + ürün adı + ekstra/şurup + not.
// Büyük fontla basılır ki mutfak/bar personeli uzaktan rahat okuyabilsin.
export function printKitchenTicket({ orderId, tableLabel, items, note }) {
  const rows = items
    .map((it) => {
      const optionLines = [
        ...(it.extras || []).map((e) => `<div class="muted">&nbsp;&nbsp;+ ${e.quantity}x ${e.name}</div>`),
        ...(it.syrups || []).map((s) => `<div class="muted">&nbsp;&nbsp;+ ${s.quantity}x ${s.name}</div>`),
      ].join('');
      return `<tr><td colspan="2"><span class="big">${it.quantity}x ${it.name}</span>${optionLines}</td></tr>`;
    })
    .join('');
  const body = `
    <h2>MUTFAK FİŞİ</h2>
    <div class="center huge">${tableLabel || ''}</div>
    <div class="center muted">Sipariş #${orderId} · ${new Date().toLocaleString('tr-TR')}</div>
    <div class="hr"></div><table>${rows}</table><div class="hr"></div>
    ${note ? `<div><strong>Not:</strong> ${note}</div><div class="hr"></div>` : ''}
  `;
  return openPrintWindow(`Mutfak Fişi #${orderId}`, body, { paperWidth: 80 });
}
