/**
 * Smart Natural Text Parser untuk Pencatatan Keuangan
 */

function parseAmount(str) {
  if (!str) return 0;
  let clean = str.toLowerCase().replace(/,/g, '.').trim();

  // Handle 'jt' / 'juta' (e.g. 1.5jt, 2juta)
  if (clean.includes('jt') || clean.includes('juta')) {
    const num = parseFloat(clean.replace(/jt|juta/g, '').trim());
    return isNaN(num) ? 0 : Math.round(num * 1000000);
  }

  // Handle 'rb' / 'k' / 'ribu' (e.g. 50k, 25rb, 10ribu)
  if (clean.includes('k') || clean.includes('rb') || clean.includes('ribu')) {
    const num = parseFloat(clean.replace(/k|rb|ribu/g, '').trim());
    return isNaN(num) ? 0 : Math.round(num * 1000);
  }

  // Pure digits (e.g. 25000, 25.000)
  const directDigits = clean.replace(/\./g, '');
  const num = parseFloat(directDigits);
  return isNaN(num) ? 0 : num;
}

function matchWallet(text, availableWallets = ['mandiri', 'shopeepay', 'tunai']) {
  const lower = text.toLowerCase();
  for (const w of availableWallets) {
    const wLower = w.toLowerCase();
    if (lower.includes(wLower)) return w;
  }
  if (lower.includes('cash') || lower.includes('dompet')) return 'Uang Tunai';
  if (lower.includes('shopee') || lower.includes('spay')) return 'ShopeePay';
  if (lower.includes('mandiri') || lower.includes('livin')) return 'Bank Mandiri';
  return null;
}

function parseFinancialCommand(text, walletList = []) {
  if (!text) return null;
  const raw = text.trim();
  const lower = raw.toLowerCase();

  const walletNames = walletList.map(w => w.name);

  // 1. Pola Transfer: "transfer 100k mandiri ke shopeepay [ket]" atau "pindah 50rb tunai ke mandiri"
  const transferMatch = lower.match(/^(?:transfer|pindah|tf|trf)\s+([0-9.,]+[a-z]*)\s+(.+?)\s+ke\s+(.+)$/i);
  if (transferMatch) {
    const amount = parseAmount(transferMatch[1]);
    const sourceRaw = transferMatch[2].trim();
    const targetAndNote = transferMatch[3].trim().split(/\s+(.+)/);
    const targetRaw = targetAndNote[0];
    const desc = targetAndNote[1] || 'Transfer Antar Dompet';

    const fromW = matchWallet(sourceRaw, walletNames);
    const toW = matchWallet(targetRaw, walletNames);

    if (amount > 0 && fromW && toW) {
      return {
        action: 'TRANSFER',
        amount,
        fromWallet: fromW,
        toWallet: toW,
        description: desc
      };
    }
  }

  // 2. Pola Pengeluaran: "keluar 25000 mandiri makan bakso" atau "beli bensin 50k tunai"
  if (lower.startsWith('keluar ') || lower.startsWith('bayar ') || lower.startsWith('beli ') || lower.startsWith('pengeluaran ')) {
    const parts = raw.split(/\s+/);
    // parts[0] = keluar/beli
    // parts[1] = nominal (25000 / 50k / 25rb)
    const amount = parseAmount(parts[1]);
    const remaining = parts.slice(2).join(' ');

    let detectedWallet = matchWallet(remaining, walletNames) || 'Uang Tunai';
    let desc = remaining;
    if (detectedWallet) {
      // Hapus nama dompet dari deskripsi
      desc = desc.replace(new RegExp(detectedWallet, 'gi'), '').trim();
    }
    if (!desc) desc = 'Pengeluaran Harian';

    let category = 'Pengeluaran';
    const descLower = desc.toLowerCase();
    if (descLower.includes('makan') || descLower.includes('kopi') || descLower.includes('nasi') || descLower.includes('bakso') || descLower.includes('minum')) {
      category = 'Makanan & Minuman';
    } else if (descLower.includes('bensin') || descLower.includes('parkir') || descLower.includes('toll') || descLower.includes('grab') || descLower.includes('gojek')) {
      category = 'Transportasi';
    } else if (descLower.includes('belanja') || descLower.includes('shopee') || descLower.includes('tokped') || descLower.includes('baju')) {
      category = 'Belanja';
    } else if (descLower.includes('listrik') || descLower.includes('pulsa') || descLower.includes('paket') || descLower.includes('wifi') || descLower.includes('air')) {
      category = 'Tagihan';
    }

    if (amount > 0) {
      return {
        action: 'EXPENSE',
        amount,
        wallet: detectedWallet,
        category,
        description: desc
      };
    }
  }

  // 3. Pola Pemasukan: "masuk 500rb mandiri gaji" atau "topup 100k shopeepay"
  if (lower.startsWith('masuk ') || lower.startsWith('terima ') || lower.startsWith('pemasukan ') || lower.startsWith('topup ') || lower.startsWith('gaji ')) {
    const parts = raw.split(/\s+/);
    const amount = parseAmount(parts[1]);
    const remaining = parts.slice(2).join(' ');

    let detectedWallet = matchWallet(remaining, walletNames) || 'Bank Mandiri';
    let desc = remaining;
    if (detectedWallet) {
      desc = desc.replace(new RegExp(detectedWallet, 'gi'), '').trim();
    }
    if (!desc) desc = 'Pemasukan / Topup';

    let category = 'Pemasukan';
    if (desc.toLowerCase().includes('gaji')) category = 'Gaji & Pendapatan';
    if (desc.toLowerCase().includes('bonus')) category = 'Bonus & Insentif';

    if (amount > 0) {
      return {
        action: 'INCOME',
        amount,
        wallet: detectedWallet,
        category,
        description: desc
      };
    }
  }

  return null;
}

module.exports = {
  parseAmount,
  matchWallet,
  parseFinancialCommand
};
