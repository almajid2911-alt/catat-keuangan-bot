/**
 * Smart Natural Text Parser untuk Pencatatan Keuangan dengan Auto-Categorization
 */

const STANDARD_CATEGORIES = [
  'Kebutuhan Rumah Tangga',
  'Tagihan Bulanan',
  'Makanan & Kuliner',
  'Transportasi & Kendaraan',
  'Belanja & Pribadi',
  'Kesehatan & Medis',
  'Hiburan & Lifestyle',
  'Sosial & Sedekah',
  'Operasional Kerja',
  'Lain-lain'
];

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

function detectCategory(description) {
  if (!description) return 'Lain-lain';
  const desc = description.toLowerCase();

  // 1. Kebutuhan Rumah Tangga (Dapur, Pasar, Sembako, Kebersihan)
  if (
    desc.includes('bawang') || desc.includes('beras') || desc.includes('minyak') ||
    desc.includes('telur') || desc.includes('telor') || desc.includes('cabe') ||
    desc.includes('cabai') || desc.includes('sayur') || desc.includes('daging') ||
    desc.includes('ayam') || desc.includes('ikan') || desc.includes('bumbu') ||
    desc.includes('garam') || desc.includes('gula') || desc.includes('sabun') ||
    desc.includes('odol') || desc.includes('shampoo') || desc.includes('deterjen') ||
    desc.includes('pewangi') || desc.includes('tisu') || desc.includes('sembako') ||
    desc.includes('pasar') || desc.includes('galon') || desc.includes('gas elpiji') || desc.includes('gas')
  ) {
    return 'Kebutuhan Rumah Tangga';
  }

  // 2. Tagihan Bulanan (Wifi, Listrik, PDAM, Pulsa, Langganan)
  if (
    desc.includes('indihome') || desc.includes('wifi') || desc.includes('internet') ||
    desc.includes('listrik') || desc.includes('pln') || desc.includes('token') ||
    desc.includes('pdam') || desc.includes('air') || desc.includes('bpjs') ||
    desc.includes('pulsa') || desc.includes('paket data') || desc.includes('kuota') ||
    desc.includes('vps') || desc.includes('domain') || desc.includes('hosting') ||
    desc.includes('cicilan') || desc.includes('sewa') || desc.includes('kontrakan')
  ) {
    return 'Tagihan Bulanan';
  }

  // 3. Makanan & Kuliner (Jajan, Makan di luar, Kafe)
  if (
    desc.includes('makan') || desc.includes('sarapan') || desc.includes('siang') ||
    desc.includes('malam') || desc.includes('bakso') || desc.includes('mie') ||
    desc.includes('nasi') || desc.includes('sate') || desc.includes('geprek') ||
    desc.includes('warteg') || desc.includes('padang') || desc.includes('kopi') ||
    desc.includes('kafe') || desc.includes('cafe') || desc.includes('jajan') ||
    desc.includes('snack') || desc.includes('roti') || desc.includes('gofood') ||
    desc.includes('grabfood') || desc.includes('shopeefood')
  ) {
    return 'Makanan & Kuliner';
  }

  // 4. Transportasi & Kendaraan (Bensin, Parkir, Servis)
  if (
    desc.includes('bensin') || desc.includes('pertalite') || desc.includes('pertamax') ||
    desc.includes('spbu') || desc.includes('solar') || desc.includes('parkir') ||
    desc.includes('tol') || desc.includes('toll') || desc.includes('grab') ||
    desc.includes('gojek') || desc.includes('maxim') || desc.includes('servis') ||
    desc.includes('service') || desc.includes('ganti oli') || desc.includes('oli') ||
    desc.includes('cuci motor') || desc.includes('cuci mobil') || desc.includes('tambal ban')
  ) {
    return 'Transportasi & Kendaraan';
  }

  // 5. Belanja & Fashion / Pribadi
  if (
    desc.includes('baju') || desc.includes('celana') || desc.includes('kaos') ||
    desc.includes('sepatu') || desc.includes('sandal') || desc.includes('jaket') ||
    desc.includes('tas') || desc.includes('shopee') || desc.includes('tokped') ||
    desc.includes('lazada') || desc.includes('skincare') || desc.includes('kosmetik') ||
    desc.includes('parfum') || desc.includes('potong rambut') || desc.includes('barbershop')
  ) {
    return 'Belanja & Pribadi';
  }

  // 6. Kesehatan & Medis
  if (
    desc.includes('obat') || desc.includes('apotek') || desc.includes('apotik') ||
    desc.includes('dokter') || desc.includes('vitamin') || desc.includes('klinik') ||
    desc.includes('rumah sakit') || desc.includes('periksa') || desc.includes('medis')
  ) {
    return 'Kesehatan & Medis';
  }

  // 7. Hiburan & Lifestyle
  if (
    desc.includes('nonton') || desc.includes('bioskop') || desc.includes('cinema') ||
    desc.includes('game') || desc.includes('topup game') || desc.includes('netflix') ||
    desc.includes('spotify') || desc.includes('youtube') || desc.includes('liburan') ||
    desc.includes('hotel') || desc.includes('jalan-jalan')
  ) {
    return 'Hiburan & Lifestyle';
  }

  // 8. Sosial & Sedekah
  if (
    desc.includes('infaq') || desc.includes('infak') || desc.includes('sedekah') ||
    desc.includes('zakat') || desc.includes('masjid') || desc.includes('donasi') ||
    desc.includes('hadiah') || desc.includes('kado') || desc.includes('sumbangan')
  ) {
    return 'Sosial & Sedekah';
  }

  // 9. Operasional Kerja
  if (
    desc.includes('atk') || desc.includes('print') || desc.includes('fotocopy') ||
    desc.includes('materai') || desc.includes('kirim paket') || desc.includes('ongkir') ||
    desc.includes('jne') || desc.includes('jnt') || desc.includes('pos')
  ) {
    return 'Operasional Kerja';
  }

  return 'Lain-lain';
}

function parseFinancialCommand(text, walletList = []) {
  if (!text) return null;
  const raw = text.trim();
  const lower = raw.toLowerCase();

  const walletNames = walletList.map(w => w.name);

  // 1. Pola Transfer
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

  // 2. Pola Pengeluaran
  if (lower.startsWith('keluar ') || lower.startsWith('bayar ') || lower.startsWith('beli ') || lower.startsWith('pengeluaran ')) {
    const parts = raw.split(/\s+/);
    const amount = parseAmount(parts[1]);
    const remaining = parts.slice(2).join(' ');

    let detectedWallet = matchWallet(remaining, walletNames) || 'Uang Tunai';
    let desc = remaining;
    if (detectedWallet) {
      desc = desc.replace(new RegExp(detectedWallet, 'gi'), '').trim();
    }
    if (!desc) desc = 'Pengeluaran Harian';

    const category = detectCategory(desc);

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

  // 3. Pola Pemasukan
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
    if (desc.toLowerCase().includes('bonus') || desc.toLowerCase().includes('insentif')) category = 'Bonus & Insentif';

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
  STANDARD_CATEGORIES,
  parseAmount,
  matchWallet,
  detectCategory,
  parseFinancialCommand
};
