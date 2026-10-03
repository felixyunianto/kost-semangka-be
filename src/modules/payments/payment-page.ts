import { formatRupiah } from "src/common/helpers/format-currency";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderPaymentPage(data: {
  status: string;
  occupantName: string;
  propertyName: string;
  roomName: string;
  invoiceNumber: string;
  period: string;
  amount: string | number;
  dueDate: string;
  qrCode?: string | null;
  vaNumber?: string | null;
  bankName?: string | null;
  expiredAt?: string | null;
}) {
  const isPaid = data.status === "PAID";

  const formattedAmount = formatRupiah(data.amount);

  let paymentContent = "";

  if (isPaid) {
    paymentContent = `
      <div class="success-box">
        <div class="success-icon">✓</div>
        <h2>Pembayaran Berhasil</h2>
        <p>Tagihan ini sudah lunas. Terima kasih!</p>
      </div>
    `;
  } else if (data.vaNumber) {
    paymentContent = `
      <div class="payment-card">
        <span class="badge">Virtual Account ${escapeHtml(data.bankName || "BCA")}</span>
        <p class="instruction">Silakan transfer melalui m-BCA, ATM, atau internet banking ke nomor berikut:</p>
        
        <div class="va-container">
          <div id="vaNumberText" class="va-number">${escapeHtml(data.vaNumber)}</div>
          <button type="button" class="copy-btn" onclick="copyVaNumber()">Salin Nomor VA</button>
        </div>

        <div class="amount-box">
          <small>Total Tagihan</small>
          <div class="amount-value">${escapeHtml(formattedAmount)}</div>
        </div>

        ${
          data.expiredAt
            ? `<p class="muted">Berlaku sampai: <strong>${escapeHtml(data.expiredAt)}</strong></p>`
            : ""
        }
      </div>
    `;
  } else if (data.qrCode) {
    paymentContent = `
      <div class="payment-card">
        <span class="badge">QRIS Instant Payment</span>
        <p class="instruction">Scan QR di bawah menggunakan m-banking atau e-wallet:</p>
        
        <div class="qr-wrapper">
          <img src="${escapeHtml(data.qrCode)}" alt="QRIS Code" width="220" height="220" />
        </div>

        <div class="amount-box">
          <small>Total Tagihan</small>
          <div class="amount-value">${escapeHtml(formattedAmount)}</div>
        </div>

        ${
          data.expiredAt
            ? `<p class="muted">QR berlaku sampai: <strong>${escapeHtml(data.expiredAt)}</strong></p>`
            : ""
        }
      </div>
    `;
  } else {
    paymentContent = `<p class="error-text">Metode pembayaran belum tersedia. Silakan refresh halaman ini.</p>`;
  }

  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pembayaran ${escapeHtml(data.invoiceNumber)}</title>
    <style>
      :root {
        --primary: #4f46e5;
        --primary-hover: #4338ca;
        --bg-color: #f8fafc;
        --card-bg: #ffffff;
        --text-main: #1e293b;
        --text-muted: #64748b;
        --border-color: #e2e8f0;
      }
      * { box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background-color: var(--bg-color);
        color: var(--text-main);
        max-width: 520px; /* Diperluas dari 440px agar lebih lega */
        margin: 0 auto;
        padding: 24px 16px;
      }
      .container {
        background: var(--card-bg);
        border-radius: 16px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
        padding: 28px;
        margin-bottom: 20px;
      }
      h1 { font-size: 22px; margin-top: 0; margin-bottom: 4px; color: var(--text-main); text-align: center; }
      .subtitle { text-align: center; font-size: 14px; color: var(--text-muted); margin-bottom: 24px; }
      
      .info-list {
        background: #f1f5f9;
        border-radius: 10px;
        padding: 16px;
        font-size: 14px;
        margin-bottom: 24px;
      }
      .info-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 10px;
      }
      .info-row:last-child { margin-bottom: 0; }
      .info-label { color: var(--text-muted); }
      .info-value { font-weight: 600; text-align: right; }

      .payment-card { text-align: center; }
      .badge {
        display: inline-block;
        background: #e0e7ff;
        color: var(--primary);
        font-size: 12px;
        font-weight: 700;
        padding: 4px 10px;
        border-radius: 20px;
        margin-bottom: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .instruction { font-size: 14px; color: var(--text-muted); margin-bottom: 16px; }
      
      .qr-wrapper {
        background: #fff;
        border: 2px dashed var(--border-color);
        display: inline-block;
        padding: 10px;
        border-radius: 12px;
        margin-bottom: 16px;
      }
      .qr-wrapper img { display: block; border-radius: 8px; }

      /* CONTAINER VA: Dibuat ke bawah (stacking) agar nomor VA tampil penuh tanpa terpotong */
      .va-container {
        background: #f8fafc;
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 20px;
        text-align: center;
      }
      .va-number { 
        font-size: 22px; 
        font-weight: 700; 
        letter-spacing: 1px; 
        color: var(--primary); 
        word-break: break-all; /* Memastikan nomor panjang turun baris dengan aman jika layar terlalu kecil */
        margin-bottom: 12px;
      }
      .copy-btn {
        display: block;
        width: 100%;
        background: var(--primary);
        color: white;
        border: none;
        padding: 10px 16px;
        font-size: 14px;
        font-weight: 600;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.2s;
      }
      .copy-btn:hover { background: var(--primary-hover); }

      .amount-box { margin-bottom: 16px; }
      .amount-box small { color: var(--text-muted); font-size: 12px; display: block; }
      .amount-value { font-size: 24px; font-weight: 700; color: var(--text-main); }

      .muted { font-size: 12px; color: var(--text-muted); margin-top: 12px; }
      
      .success-box { text-align: center; padding: 20px 0; }
      .success-icon {
        width: 50px; height: 50px; background: #22c55e; color: white;
        font-size: 28px; line-height: 50px; border-radius: 50%; margin: 0 auto 12px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Tagihan Kost</h1>
      <div class="subtitle">Halo, <strong>${escapeHtml(data.occupantName)}</strong></div>

      <div class="info-list">
        <div class="info-row">
          <span class="info-label">Properti / Kamar</span>
          <span class="info-value">${escapeHtml(data.propertyName)} - ${escapeHtml(data.roomName)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">No. Invoice</span>
          <span class="info-value">${escapeHtml(data.invoiceNumber)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Periode</span>
          <span class="info-value">${escapeHtml(data.period)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Jatuh Tempo</span>
          <span class="info-value">${escapeHtml(data.dueDate)}</span>
        </div>
      </div>

      ${paymentContent}
    </div>

    <script>
      function copyVaNumber() {
        const vaText = document.getElementById("vaNumberText").innerText.trim();
        navigator.clipboard.writeText(vaText).then(() => {
          const btn = document.querySelector(".copy-btn");
          btn.innerText = "Berhasil Disalin!";
          setTimeout(() => { btn.innerText = "Salin Nomor VA"; }, 2000);
        }).catch(err => {
          alert("Gagal menyalin teks.");
        });
      }
    </script>
  </body>
</html>`;
}
