const { Markup } = require('telegraf');
const db = require('../db/database');
const { parseFinancialCommand, parseAmount } = require('./parser');
const { syncTransactionToSheet } = require('../services/sheets');
const { analyzeReceiptPhoto } = require('../services/vision');

const ALLOWED_USER_IDS = (process.env.ALLOWED_TELEGRAM_IDS || '171053504').split(',').map(s => s.trim());
const WEB_DOMAIN = process.env.WEBHOOK_DOMAIN || 'keuangan.103.93.129.213.sslip.io';

// In-Memory Draft Transactions Storage
const pendingDrafts = new Map();

function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount || 0);
}

function isAuthorized(ctx) {
  const userId = String(ctx.from?.id || '');
  if (!ALLOWED_USER_IDS.length || ALLOWED_USER_IDS.includes('*')) return true;
  return ALLOWED_USER_IDS.includes(userId);
}

function createDraftId() {
  return 'df_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

function setupBotHandlers(bot) {
  // Middleware Auth Guard
  bot.use(async (ctx, next) => {
    if (!isAuthorized(ctx)) {
      return ctx.reply('⛔ *Akses Ditolak*\n_Bot pencatatan keuangan ini dikunci secara privat untuk pemilik akun._', { parse_mode: 'Markdown' });
    }
    return next();
  });

  // /start & /help
  bot.command(['start', 'help', 'menu'], async (ctx) => {
    const stats = db.getSummaryStats();
    const text = `💰 *ASISTEN CATAT KEUANGAN PERSONAL*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💳 *Total Saldo (Net Worth):* \`${formatRupiah(stats.totalBalance)}\`\n` +
      `📉 *Pengeluaran Bulan Ini :* \`${formatRupiah(stats.monthlyExpense)}\`\n` +
      `📈 *Pemasukan Bulan Ini   :* \`${formatRupiah(stats.monthlyIncome)}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📸 *Fitur Scan Nota AI:* Cukup kirim **foto struk/nota belanja**, AI akan membaca total nominal dan rinciannya otomatis!\n\n` +
      `💡 *Format Cepat Pesan Teks:*\n` +
      `• \`keluar 25rb mandiri makan siang\`\n` +
      `• \`beli bensin 50k tunai\`\n` +
      `• \`masuk 1.5jt mandiri gaji\`\n` +
      `• \`transfer 100k mandiri ke shopeepay\`\n\n` +
      `_Setiap transaksi akan meminta konfirmasi Anda terlebih dahulu sebelum disimpan._`;

    const frequent = db.getFrequentExpenses(4);
    let freqButtons = [];
    if (frequent && frequent.length > 0) {
      freqButtons = frequent.map((f, idx) => [
        Markup.button.callback(`⚡ ${f.description} (${formatRupiah(f.amount)})`, `quick_freq_${idx}`)
      ]);
    }

    const baseButtons = [
      [
        Markup.button.callback('💳 Cek Saldo Dompet', 'action_saldo'),
        Markup.button.callback('📊 Rekap Keuangan', 'action_rekap')
      ],
      [
        Markup.button.callback('📉 Catat Pengeluaran', 'action_keluar_help'),
        Markup.button.callback('📈 Catat Pemasukan', 'action_masuk_help')
      ],
      [
        Markup.button.callback('🔄 Pindah Dana / Transfer', 'action_transfer_help'),
        Markup.button.callback('👛 Kelola Dompet', 'action_dompet')
      ],
      [
        Markup.button.url('🌐 Buka Web Dashboard', `http://${WEB_DOMAIN}`)
      ]
    ];

    const keyboard = Markup.inlineKeyboard([...freqButtons, ...baseButtons]);

    await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
  });

  // /saldo
  bot.command('saldo', async (ctx) => {
    const wallets = db.getWallets();
    const stats = db.getSummaryStats();

    let text = `💳 *STATUS SALDO SELURUH DOMPET*\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    wallets.forEach((w) => {
      let icon = '👛';
      if (w.name.toLowerCase().includes('mandiri')) icon = '🏦';
      else if (w.name.toLowerCase().includes('shopee')) icon = '🛒';
      else if (w.name.toLowerCase().includes('tunai') || w.name.toLowerCase().includes('cash')) icon = '💵';
      
      text += `${icon} *${w.name}*: \`${formatRupiah(w.balance)}\`\n`;
    });

    text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `💰 *TOTAL KEKAYAAN:* \`${formatRupiah(stats.totalBalance)}\``;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🔄 Transfer Antar Dompet', 'action_transfer_help'),
        Markup.button.callback('📊 Rekap Bulanan', 'action_rekap')
      ],
      [
        Markup.button.url('🌐 Buka Web Dashboard', `http://${WEB_DOMAIN}`)
      ]
    ]);

    await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
  });

  // /rekap
  bot.command('rekap', async (ctx) => {
    const stats = db.getSummaryStats();
    const net = stats.monthlyIncome - stats.monthlyExpense;

    let text = `📊 *REKAP KEUANGAN BULAN INI*\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📈 *Pemasukan   :* \`${formatRupiah(stats.monthlyIncome)}\`\n`;
    text += `📉 *Pengeluaran :* \`${formatRupiah(stats.monthlyExpense)}\`\n`;
    text += `💵 *Sisa Cashflow :* \`${formatRupiah(net)}\` ${net >= 0 ? '🟢 Surplus' : '🔴 Defisit'}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `🏷️ *Pengeluaran per Kategori:*\n`;

    if (stats.categoryStats.length === 0) {
      text += `_Belum ada pengeluaran yang dicatat bulan ini._\n`;
    } else {
      stats.categoryStats.forEach(c => {
        text += `• *${c.category}*: \`${formatRupiah(c.total)}\`\n`;
      });
    }

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('🌐 Detail Lengkap di Web Dashboard', `http://${WEB_DOMAIN}`)]
    ]);

    await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
  });

  // /undo (Membatalkan transaksi terakhir)
  bot.command('undo', async (ctx) => {
    const txs = db.getTransactions(1);
    if (!txs.length) {
      return ctx.reply('⚠️ Belum ada transaksi yang bisa dibatalkan.');
    }
    const last = txs[0];
    try {
      db.undoTransaction(last.id);
      return ctx.reply(
        `↩️ *TRANSAKSI BERHASIL DIBATALKAN & SALDO DIKEMBALIKAN!*\n━━━━━━━━━━━━━━━━━━━━━━\n` +
        `ID: #${last.id} | ${last.type} | \`${formatRupiah(last.amount)}\`\n` +
        `Keterangan: ${last.description || '-'}`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      return ctx.reply(`❌ Gagal membatalkan transaksi: ${e.message}`);
    }
  });

  // /dompet (Kelola dompet)
  bot.command('dompet', async (ctx) => {
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    // /dompet tambah [Nama] [SaldoAwal]
    if (parts.length >= 3 && parts[1].toLowerCase() === 'tambah') {
      const name = parts[2];
      const initial = parseAmount(parts.slice(3).join(' ')) || 0;
      try {
        db.addWallet(name, initial);
        syncTransactionToSheet({ id: Date.now(), type: 'ADD_WALLET', amount: initial, description: `Tambah Dompet ${name}` }, db.getWallets());
        return ctx.reply(`✅ Dompet *${name}* berhasil ditambahkan dengan saldo awal \`${formatRupiah(initial)}\`!`, { parse_mode: 'Markdown' });
      } catch (e) {
        return ctx.reply(`❌ Gagal menambah dompet: ${e.message}`);
      }
    }

    // /dompet set [Nama] [SaldoBaru] (Mendukung 3jt / 500k / 1500000)
    if (parts.length >= 3 && (parts[1].toLowerCase() === 'set' || parts[1].toLowerCase() === 'ubah')) {
      const rawArgs = parts.slice(2).join(' ');
      const amount = parseAmount(parts[parts.length - 1]);
      const walletNameRaw = parts.slice(2, parts.length - 1).join(' ') || parts[2];
      const targetWallet = db.getWalletByName(walletNameRaw) || db.getWalletByName(parts[2]);

      if (!targetWallet) {
        return ctx.reply(`❌ Dompet "${walletNameRaw}" tidak ditemukan. Gunakan nama dompet yang sesuai (misal: Mandiri, ShopeePay, Tunai, BCA).`);
      }

      try {
        db.updateWalletBalance(targetWallet.name, amount);
        syncTransactionToSheet({ id: Date.now(), type: 'SET_BALANCE', amount, wallet: targetWallet.name, description: `Ubah Saldo Manual` }, db.getWallets());
        return ctx.reply(`✅ Saldo dompet *${targetWallet.name}* berhasil diubah menjadi \`${formatRupiah(amount)}\`!`, { parse_mode: 'Markdown' });
      } catch (e) {
        return ctx.reply(`❌ Gagal update saldo: ${e.message}`);
      }
    }

    const wallets = db.getWallets();
    let msg = `👛 *PANDUAN KELOLA & EDIT SALDO DOMPET*\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    wallets.forEach(w => {
      msg += `• *${w.name}*: \`${formatRupiah(w.balance)}\`\n`;
    });
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💡 *Cara Mengubah / Edit Saldo Dompet:*\n` +
      `👉 \`/dompet set Mandiri 3jt\`\n` +
      `👉 \`/dompet set BCA 500k\`\n` +
      `👉 \`/dompet set ShopeePay 1.5jt\`\n` +
      `👉 \`/dompet set Tunai 250000\`\n\n` +
      `➕ *Cara Tambah Dompet Baru:*\n` +
      `👉 \`/dompet tambah DANA 100k\`\n\n` +
      `🔄 *Tarik Saldo Terkini dari Google Sheet:*\n` +
      `👉 Ketik \`/syncsheet\``;

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  // /setsaldo [Nama] [Nominal] (Shortcut langsung)
  bot.command(['setsaldo', 'set'], async (ctx) => {
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);
    if (parts.length < 3) {
      return ctx.reply('💡 *Format:* `/set <NamaDompet> <Nominal>`\nContoh: `/set Mandiri 3jt` atau `/set BCA 500000`', { parse_mode: 'Markdown' });
    }
    const amount = parseAmount(parts[parts.length - 1]);
    const walletNameRaw = parts.slice(1, parts.length - 1).join(' ');
    const targetWallet = db.getWalletByName(walletNameRaw);

    if (!targetWallet) {
      return ctx.reply(`❌ Dompet "${walletNameRaw}" tidak ditemukan. Cek daftar dompet dengan command /saldo`);
    }

    try {
      db.updateWalletBalance(targetWallet.name, amount);
      syncTransactionToSheet({ id: Date.now(), type: 'SET_BALANCE', amount, wallet: targetWallet.name, description: 'Ubah Saldo Manual' }, db.getWallets());
      return ctx.reply(`✅ Saldo dompet *${targetWallet.name}* berhasil diubah menjadi \`${formatRupiah(amount)}\`!`, { parse_mode: 'Markdown' });
    } catch (e) {
      return ctx.reply(`❌ Gagal update saldo: ${e.message}`);
    }
  });

  // /syncsheet (Tarik saldo yang diedit langsung di Google Sheet)
  bot.command(['syncsheet', 'tariksheet', 'tarik'], async (ctx) => {
    const waiting = await ctx.reply('⏳ *Sedang memeriksa dan menarik data dari Google Sheet...*', { parse_mode: 'Markdown' });
    try {
      const { fetchWalletsFromSheet } = require('../services/sheets');
      const sheetWallets = await fetchWalletsFromSheet();

      if (!sheetWallets || !sheetWallets.length) {
        return ctx.telegram.editMessageText(
          ctx.chat.id,
          waiting.message_id,
          null,
          '⚠️ *Google Apps Script Web App belum terhubung.*\n_Ikuti panduan setup Web App Google Script untuk mengaktifkan sinkronisasi otomatis._',
          { parse_mode: 'Markdown' }
        );
      }

      let updatedList = [];
      for (const sw of sheetWallets) {
        try {
          const local = db.getWalletByName(sw.name);
          if (local) {
            db.updateWalletBalance(local.name, sw.balance);
            updatedList.push(`• *${local.name}*: \`${formatRupiah(sw.balance)}\``);
          } else {
            db.addWallet(sw.name, sw.balance);
            updatedList.push(`• *${sw.name}* (Baru): \`${formatRupiah(sw.balance)}\``);
          }
        } catch (err) {}
      }

      const msg = `✅ *SINKRONISASI SALDO GOOGLE SHEET BERHASIL!*\n━━━━━━━━━━━━━━━━━━━━━━\n` +
        updatedList.join('\n') + '\n━━━━━━━━━━━━━━━━━━━━━━\n' +
        `_Data lokal bot telah diperbarui sesuai isi Google Sheet Anda._`;

      await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, msg, { parse_mode: 'Markdown' });
    } catch (err) {
      await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, `❌ Gagal sinkronisasi: ${err.message}`, { parse_mode: 'Markdown' });
    }
  });

  // /cari [keyword/kategori] [bulan] [tahun]
  bot.command(['cari', 'search', 'filter'], async (ctx) => {
    const rawText = ctx.message.text.trim();
    const parts = rawText.split(/\s+/).slice(1);

    if (!parts.length) {
      return ctx.reply(
        `🔍 *PANDUAN PENCARIAN TRANSAKSI*\n━━━━━━━━━━━━━━━━━━━━━━\n` +
        `💡 *Format Pencarian Fleksibel:*\n` +
        `• \`/cari bensin\` (Cari seluruh pengeluaran bensin)\n` +
        `• \`/cari indihome 08 2026\` (Cari di bulan & tahun tertentu)\n` +
        `• \`/cari Rumah Tangga\` (Cari berdasarkan kategori)\n` +
        `• \`/cari 08-2026\` (Cari semua transaksi Agustus 2026)`,
        { parse_mode: 'Markdown' }
      );
    }

    let month = null;
    let year = null;
    let keywords = [];

    const monthNames = {
      jan: 1, januari: 1, feb: 2, februari: 2, mar: 3, maret: 3,
      apr: 4, april: 4, mei: 5, may: 5, jun: 6, juni: 6,
      jul: 7, juli: 7, agu: 8, agustus: 8, aug: 8, sep: 9, september: 9,
      okt: 10, oktober: 10, oct: 10, nov: 11, november: 11, des: 12, desember: 12, dec: 12
    };

    for (const p of parts) {
      const lower = p.toLowerCase();
      // Format MM-YYYY or YYYY-MM
      if (/^\d{1,2}-\d{4}$/.test(lower)) {
        const [m, y] = lower.split('-');
        month = parseInt(m, 10);
        year = parseInt(y, 10);
        continue;
      }
      // 4 digit year
      if (/^20\d{2}$/.test(lower)) {
        year = parseInt(lower, 10);
        continue;
      }
      // Month name
      if (monthNames[lower]) {
        month = monthNames[lower];
        continue;
      }
      // 1-2 digit month if alone
      if (/^(0?[1-9]|1[0-2])$/.test(lower) && month === null) {
        month = parseInt(lower, 10);
        continue;
      }
      keywords.push(p);
    }

    const searchKeyword = keywords.join(' ');
    const res = db.searchTransactions({ keyword: searchKeyword, month, year, limit: 30 });

    if (!res.count) {
      let filterDesc = searchKeyword ? `kata kunci "*${searchKeyword}*"` : 'kriteria tersebut';
      if (month && year) filterDesc += ` pada bulan ${month}/${year}`;
      return ctx.reply(`🔍 *Tidak Ditemukan:*\nTidak ada transaksi yang cocok dengan ${filterDesc}.`, { parse_mode: 'Markdown' });
    }

    let periodLabel = 'Semua Waktu';
    if (month && year) periodLabel = `Bulan ${month} / ${year}`;
    else if (year) periodLabel = `Tahun ${year}`;
    else if (month) periodLabel = `Bulan ${month}`;

    let reply = `🔍 *HASIL PENCARIAN TRANSAKSI*\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (searchKeyword) reply += `🔑 *Kata Kunci:* \`${searchKeyword}\`\n`;
    reply += `📅 *Periode   :* ${periodLabel}\n`;
    reply += `📊 *Ditemukan :* ${res.count} transaksi\n`;
    if (res.totalExpense > 0) reply += `📉 *Total Keluar:* \`${formatRupiah(res.totalExpense)}\`\n`;
    if (res.totalIncome > 0) reply += `📈 *Total Masuk :* \`${formatRupiah(res.totalIncome)}\`\n`;
    reply += `━━━━━━━━━━━━━━━━━━━━━━\n`;

    res.transactions.slice(0, 15).forEach((t, i) => {
      const icon = t.type === 'EXPENSE' ? '🔴' : (t.type === 'INCOME' ? '🟢' : '🔄');
      reply += `${i + 1}. ${icon} \`${formatRupiah(t.amount)}\` [${t.source_wallet || t.target_wallet || '-'}]\n`;
      reply += `   └ _${t.description}_ (${t.category}) • ${t.created_at || ''}\n`;
    });

    if (res.count > 15) {
      reply += `\n_...dan ${res.count - 15} transaksi lainnya (lihat lengkap di Web Dashboard)._\n`;
    }

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('🌐 Buka Web Dashboard', `http://${WEB_DOMAIN}`)]
    ]);

    await ctx.reply(reply, { parse_mode: 'Markdown', ...keyboard });
  });

  // Action: Quick Bills Shortcuts
  const billKeywords = [
    { code: 'quick_bill_indihome', name: 'IndiHome / Wifi', amount: 350000, cat: 'Tagihan Bulanan', desc: 'Tagihan IndiHome' },
    { code: 'quick_bill_listrik',  name: 'Listrik PLN',      amount: 200000, cat: 'Tagihan Bulanan', desc: 'Tagihan Listrik PLN' },
    { code: 'quick_bill_pdam',     name: 'Air PDAM',         amount: 100000, cat: 'Tagihan Bulanan', desc: 'Tagihan Air PDAM' },
    { code: 'quick_bill_bpjs',     name: 'BPJS Kesehatan',    amount: 150000, cat: 'Tagihan Bulanan', desc: 'Tagihan BPJS Kesehatan' }
  ];

  billKeywords.forEach(b => {
    bot.action(b.code, async (ctx) => {
      await ctx.answerCbQuery();
      const draftId = createDraftId();
      const wallets = db.getWallets();

      pendingDrafts.set(draftId, {
        action: 'EXPENSE',
        amount: b.amount,
        wallet: wallets[0]?.name || 'Bank Mandiri',
        category: b.cat,
        description: b.desc,
        created_at: Date.now()
      });

      const confirmText = `🔔 *KONFIRMASI BAYAR TAGIHAN BULANAN*\n━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🏢 *Tagihan  :* ${b.name}\n` +
        `💸 *Nominal  :* \`${formatRupiah(b.amount)}\`\n` +
        `👛 *Dompet   :* ${wallets[0]?.name || 'Bank Mandiri'}\n` +
        `🏷️ *Kategori :* ${b.cat}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `_Klik Simpan Sekarang untuk mencatat pembayaran:_`;

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Simpan Sekarang', `save_draft_${draftId}`),
          Markup.button.callback('❌ Batalkan', `cancel_draft_${draftId}`)
        ],
        [
          Markup.button.callback('👛 Ganti Dompet', `choose_wal_${draftId}`)
        ]
      ]);

      await ctx.reply(confirmText, { parse_mode: 'Markdown', ...keyboard });
    });
  });

  // /web
  bot.command('web', async (ctx) => {
    await ctx.reply(`🌐 *Web Dashboard Keuangan:* http://${WEB_DOMAIN}`, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.url('Buka Dashboard', `http://${WEB_DOMAIN}`)]])
    });
  });

  // ----------------------------------------------------------------------
  // PHOTO LISTENER — SCAN NOTA BELANJA MENGGUNAKAN AI VISION
  // ----------------------------------------------------------------------
  bot.on(['photo', 'document'], async (ctx) => {
    let photoObj = null;
    if (ctx.message.photo && ctx.message.photo.length > 0) {
      photoObj = ctx.message.photo[ctx.message.photo.length - 1];
    }

    if (!photoObj) return;

    const waitingMsg = await ctx.reply('🔍 *Sedang menganalisis foto nota dengan AI Vision...*\n_Mohon tunggu sebentar, AI sedang membaca total dan rincian belanja._', { parse_mode: 'Markdown' });

    try {
      const fileLink = await ctx.telegram.getFileLink(photoObj.file_id);
      const aiResult = await analyzeReceiptPhoto(fileLink.href);

      if (!aiResult || !aiResult.total || aiResult.total <= 0) {
        return ctx.telegram.editMessageText(
          ctx.chat.id,
          waitingMsg.message_id,
          null,
          '⚠️ *AI tidak dapat mendeteksi total tagihan pada nota ini.*\n_Silakan ketik manual pengeluaran (misal: `keluar 25rb mandiri belanja`)._',
          { parse_mode: 'Markdown' }
        );
      }

      const draftId = createDraftId();
      const wallets = db.getWallets();

      pendingDrafts.set(draftId, {
        action: 'EXPENSE',
        amount: aiResult.total,
        wallet: wallets[0]?.name || 'Bank Mandiri',
        category: aiResult.category || 'Belanja Kebutuhan',
        description: `${aiResult.merchant}: ${aiResult.notes}`,
        items: aiResult.items,
        created_at: Date.now()
      });

      let draftText = `🧾 *HASIL SCAN NOTA (AI VISION)*\n━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🏬 *Toko/Merchant :* ${aiResult.merchant}\n` +
        `💸 *Total Tagihan  :* \`${formatRupiah(aiResult.total)}\`\n` +
        `🏷️ *Kategori       :* ${aiResult.category}\n` +
        `📝 *Rincian Barang :* ${aiResult.notes}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👉 *Pilih dompet yang digunakan untuk membayar:*`;

      const walletButtons = wallets.map(w => [
        Markup.button.callback(`👛 Pakai ${w.name}`, `set_wallet_${draftId}_${encodeURIComponent(w.name)}`)
      ]);

      walletButtons.push([
        Markup.button.callback('❌ Batalkan Transaksi', `cancel_draft_${draftId}`)
      ]);

      await ctx.telegram.deleteMessage(ctx.chat.id, waitingMsg.message_id).catch(() => {});
      await ctx.reply(draftText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(walletButtons)
      });

    } catch (err) {
      console.error('Vision Error:', err);
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        waitingMsg.message_id,
        null,
        `⚠️ *Gagal memproses foto nota:* ${err.message}`,
        { parse_mode: 'Markdown' }
      );
    }
  });

  // ----------------------------------------------------------------------
  // TEXT LISTENER — SMART NATURAL TEXT WITH 2-STEP CONFIRMATION
  // ----------------------------------------------------------------------
  bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;

    const wallets = db.getWallets();

    // 1. Deteksi Multi-line Batch Entry (Sekali kirim banyak baris)
    if (text.includes('\n')) {
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const batchItems = [];

      for (const line of lines) {
        const itemParsed = parseFinancialCommand(line, wallets);
        if (itemParsed) {
          batchItems.push(itemParsed);
        }
      }

      if (batchItems.length > 1) {
        const batchId = createDraftId();
        pendingDrafts.set(batchId, {
          isBatch: true,
          items: batchItems,
          created_at: Date.now()
        });

        let totalExp = 0;
        let totalInc = 0;
        let batchMsg = `📝 *KONFIRMASI CATAT BATCH (${batchItems.length} TRANSAKSI)*\n━━━━━━━━━━━━━━━━━━━━━━\n`;

        batchItems.forEach((it, idx) => {
          if (it.action === 'EXPENSE') {
            totalExp += it.amount;
            batchMsg += `${idx + 1}. 🔴 *Keluar* \`${formatRupiah(it.amount)}\` [${it.wallet}]\n   └ _${it.description}_ (${it.category})\n`;
          } else if (it.action === 'INCOME') {
            totalInc += it.amount;
            batchMsg += `${idx + 1}. 🟢 *Masuk* \`${formatRupiah(it.amount)}\` [${it.wallet}]\n   └ _${it.description}_\n`;
          } else if (it.action === 'TRANSFER') {
            batchMsg += `${idx + 1}. 🔄 *Transfer* \`${formatRupiah(it.amount)}\` [${it.fromWallet} ➔ ${it.toWallet}]\n   └ _${it.description}_\n`;
          }
        });

        batchMsg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        if (totalExp > 0) batchMsg += `📉 Total Keluar: \`${formatRupiah(totalExp)}\`\n`;
        if (totalInc > 0) batchMsg += `📈 Total Masuk : \`${formatRupiah(totalInc)}\`\n`;
        batchMsg += `_Apakah seluruh daftar transaksi di atas ingin disimpan sekaligus?_`;

        const keyboard = Markup.inlineKeyboard([
          [
            Markup.button.callback(`✅ Simpan Semua (${batchItems.length} Transaksi)`, `save_batch_${batchId}`),
            Markup.button.callback('❌ Batalkan Semua', `cancel_draft_${batchId}`)
          ]
        ]);

        return ctx.reply(batchMsg, { parse_mode: 'Markdown', ...keyboard });
      }
    }

    const parsed = parseFinancialCommand(text, wallets);

    if (!parsed) {
      return ctx.reply(
        `❓ *Format belum dikenali*\n\n` +
        `💡 *Contoh Format Cepat:*\n` +
        `• \`keluar 25rb mandiri makan siang\`\n` +
        `• \`beli bensin 50k tunai\`\n` +
        `• \`masuk 1jt mandiri gaji\`\n` +
        `• \`transfer 100k mandiri ke shopeepay\`\n\n` +
        `📝 *Atau kirim banyak baris sekaligus:*\\n` +
        `\`keluar 15rb tunai beli bawang\\nkeluar 50rb mandiri bensin\`\n\n` +
        `📸 Atau kirim **Foto Struk / Nota Belanja**!`,
        { parse_mode: 'Markdown' }
      );
    }

    const draftId = createDraftId();
    pendingDrafts.set(draftId, {
      ...parsed,
      created_at: Date.now()
    });

    if (parsed.action === 'EXPENSE') {
      const confirmText = `📝 *KONFIRMASI PENGELUARAN*\n━━━━━━━━━━━━━━━━━━━━━━\n` +
        `💸 *Nominal  :* \`${formatRupiah(parsed.amount)}\`\n` +
        `👛 *Dompet   :* ${parsed.wallet}\n` +
        `🏷️ *Kategori :* *${parsed.category}*\n` +
        `📝 *Catatan  :* ${parsed.description}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `_Apakah data transaksi di atas sudah benar?_`;

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Simpan Sekarang', `save_draft_${draftId}`),
          Markup.button.callback('❌ Batalkan', `cancel_draft_${draftId}`)
        ],
        [
          Markup.button.callback('🏷️ Ganti Kategori', `choose_cat_${draftId}`),
          Markup.button.callback('👛 Ganti Dompet', `choose_wal_${draftId}`)
        ]
      ]);

      return ctx.reply(confirmText, { parse_mode: 'Markdown', ...keyboard });
    }

    if (parsed.action === 'INCOME') {
      const confirmText = `📝 *KONFIRMASI PEMASUKAN*\n━━━━━━━━━━━━━━━━━━━━━━\n` +
        `💰 *Nominal  :* \`${formatRupiah(parsed.amount)}\`\n` +
        `👛 *Dompet   :* ${parsed.wallet}\n` +
        `🏷️ *Kategori :* ${parsed.category}\n` +
        `📝 *Catatan  :* ${parsed.description}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `_Apakah data transaksi di atas sudah benar?_`;

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Simpan Sekarang', `save_draft_${draftId}`),
          Markup.button.callback('❌ Batalkan', `cancel_draft_${draftId}`)
        ]
      ]);

      return ctx.reply(confirmText, { parse_mode: 'Markdown', ...keyboard });
    }

    if (parsed.action === 'TRANSFER') {
      const confirmText = `📝 *KONFIRMASI TRANSFER ANTAR DOMPET*\n━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔄 *Nominal     :* \`${formatRupiah(parsed.amount)}\`\n` +
        `📤 *Dari Dompet :* ${parsed.fromWallet}\n` +
        `📥 *Ke Dompet   :* ${parsed.toWallet}\n` +
        `📝 *Catatan     :* ${parsed.description}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `_Apakah data perpindahan dana di atas sudah benar?_`;

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Eksekusi Transfer', `save_draft_${draftId}`),
          Markup.button.callback('❌ Batalkan', `cancel_draft_${draftId}`)
        ]
      ]);

      return ctx.reply(confirmText, { parse_mode: 'Markdown', ...keyboard });
    }
  });

  // ----------------------------------------------------------------------
  // CALLBACK QUERY HANDLERS (KONFIRMASI, PILIH DOMPET, BATAL, UNDO)
  // ----------------------------------------------------------------------

  // Buka menu ganti kategori
  bot.action(/^choose_cat_(df_[a-z0-9]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const draftId = ctx.match[1];
    const draft = pendingDrafts.get(draftId);
    if (!draft) return ctx.reply('⚠️ Transaksi sudah kedaluwarsa.');

    const categories = [
      ['🛒 Kebutuhan Rumah Tangga', '💡 Tagihan Bulanan'],
      ['🍲 Makanan & Kuliner', '⛽ Transportasi & Kendaraan'],
      ['🛍️ Belanja & Pribadi', '💊 Kesehatan & Medis'],
      ['🎮 Hiburan & Lifestyle', '🤲 Sosial & Sedekah'],
      ['💼 Operasional Kerja', '📦 Lain-lain']
    ];

    const buttons = categories.map(row => row.map(cat => {
      const cleanCat = cat.replace(/^[^\s]+\s+/, '');
      return Markup.button.callback(cat, `set_cat_${draftId}_${encodeURIComponent(cleanCat)}`);
    }));

    buttons.push([Markup.button.callback('⬅️ Kembali ke Konfirmasi', `back_confirm_${draftId}`)]);

    await ctx.editMessageText(
      `🏷️ *PILIH KATEGORI PENGELUARAN*\n━━━━━━━━━━━━━━━━━━━━━━\n_Pilih kategori yang paling sesuai untuk transaksi **${draft.description}**:_`,
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
    );
  });

  // Set kategori yang dipilih
  bot.action(/^set_cat_(df_[a-z0-9]+)_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const draftId = ctx.match[1];
    const newCat = decodeURIComponent(ctx.match[2]);
    const draft = pendingDrafts.get(draftId);
    if (!draft) return ctx.reply('⚠️ Transaksi sudah kedaluwarsa.');

    draft.category = newCat;
    pendingDrafts.set(draftId, draft);

    const confirmText = `📝 *KONFIRMASI PENGELUARAN*\n━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💸 *Nominal  :* \`${formatRupiah(draft.amount)}\`\n` +
      `👛 *Dompet   :* ${draft.wallet}\n` +
      `🏷️ *Kategori :* *${draft.category}* ✅\n` +
      `📝 *Catatan  :* ${draft.description}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `_Apakah data transaksi di atas sudah benar?_`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Simpan Sekarang', `save_draft_${draftId}`),
        Markup.button.callback('❌ Batalkan', `cancel_draft_${draftId}`)
      ],
      [
        Markup.button.callback('🏷️ Ganti Kategori', `choose_cat_${draftId}`),
        Markup.button.callback('👛 Ganti Dompet', `choose_wal_${draftId}`)
      ]
    ]);

    await ctx.editMessageText(confirmText, { parse_mode: 'Markdown', ...keyboard });
  });

  // Buka menu ganti dompet
  bot.action(/^choose_wal_(df_[a-z0-9]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const draftId = ctx.match[1];
    const draft = pendingDrafts.get(draftId);
    if (!draft) return ctx.reply('⚠️ Transaksi sudah kedaluwarsa.');

    const wallets = db.getWallets();
    const buttons = wallets.map(w => [
      Markup.button.callback(`👛 ${w.name} (Saldo: ${formatRupiah(w.balance)})`, `set_wal_sel_${draftId}_${encodeURIComponent(w.name)}`)
    ]);
    buttons.push([Markup.button.callback('⬅️ Kembali ke Konfirmasi', `back_confirm_${draftId}`)]);

    await ctx.editMessageText(
      `👛 *PILIH DOMPET PEMBAYARAN*\n━━━━━━━━━━━━━━━━━━━━━━\n_Pilih dompet yang digunakan untuk transaksi ini:_`,
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
    );
  });

  // Set dompet yang dipilih (Bisa dari scan nota atau dari ganti dompet)
  bot.action(/^(?:set_wal_sel|set_wallet)_(df_[a-z0-9]+)_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const draftId = ctx.match[1];
    const newWal = decodeURIComponent(ctx.match[2]);
    const draft = pendingDrafts.get(draftId);
    if (!draft) return ctx.reply('⚠️ Transaksi sudah kedaluwarsa.');

    draft.wallet = newWal;
    pendingDrafts.set(draftId, draft);

    const confirmText = `📝 *KONFIRMASI PENGELUARAN*\n━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💸 *Nominal  :* \`${formatRupiah(draft.amount)}\`\n` +
      `👛 *Dompet   :* *${draft.wallet}* ✅\n` +
      `🏷️ *Kategori :* *${draft.category}*\n` +
      `📝 *Catatan  :* ${draft.description}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `_Apakah data transaksi di atas sudah benar?_`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Simpan Sekarang', `save_draft_${draftId}`),
        Markup.button.callback('❌ Batalkan', `cancel_draft_${draftId}`)
      ],
      [
        Markup.button.callback('🏷️ Ganti Kategori', `choose_cat_${draftId}`),
        Markup.button.callback('👛 Ganti Dompet', `choose_wal_${draftId}`)
      ]
    ]);

    await ctx.editMessageText(confirmText, { parse_mode: 'Markdown', ...keyboard });
  });

  // Tombol Kembali ke Konfirmasi
  bot.action(/^back_confirm_(df_[a-z0-9]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const draftId = ctx.match[1];
    const draft = pendingDrafts.get(draftId);
    if (!draft) return ctx.reply('⚠️ Transaksi sudah kedaluwarsa.');

    const confirmText = `📝 *KONFIRMASI PENGELUARAN*\n━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💸 *Nominal  :* \`${formatRupiah(draft.amount)}\`\n` +
      `👛 *Dompet   :* *${draft.wallet}*\n` +
      `🏷️ *Kategori :* *${draft.category}*\n` +
      `📝 *Catatan  :* ${draft.description}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `_Apakah data transaksi di atas sudah benar?_`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Simpan Sekarang', `save_draft_${draftId}`),
        Markup.button.callback('❌ Batalkan', `cancel_draft_${draftId}`)
      ],
      [
        Markup.button.callback('🏷️ Ganti Kategori', `choose_cat_${draftId}`),
        Markup.button.callback('👛 Ganti Dompet', `choose_wal_${draftId}`)
      ]
    ]);

    await ctx.editMessageText(confirmText, { parse_mode: 'Markdown', ...keyboard });
  });

  // Simpan Batch Transaksi Sekaligus
  bot.action(/^save_batch_(df_[a-z0-9]+)$/, async (ctx) => {
    await ctx.answerCbQuery('Menyimpan seluruh transaksi batch...');
    const batchId = ctx.match[1];
    const draft = pendingDrafts.get(batchId);

    if (!draft || !draft.items) {
      return ctx.reply('⚠️ Transaksi batch ini sudah kedaluwarsa atau sudah diproses.');
    }

    try {
      let savedCount = 0;
      let totalAmount = 0;

      for (const item of draft.items) {
        if (item.action === 'EXPENSE') {
          const res = db.recordExpense(item.wallet, item.amount, item.category, item.description);
          syncTransactionToSheet(res);
          savedCount++;
          totalAmount += item.amount;
        } else if (item.action === 'INCOME') {
          const res = db.recordIncome(item.wallet, item.amount, item.category, item.description);
          syncTransactionToSheet(res);
          savedCount++;
        } else if (item.action === 'TRANSFER') {
          const res = db.recordTransfer(item.fromWallet, item.toWallet, item.amount, item.description);
          syncTransactionToSheet(res);
          savedCount++;
        }
      }

      pendingDrafts.delete(batchId);

      const stats = db.getSummaryStats();
      const reply = `✅ *BERHASIL MENYIMPAN ${savedCount} TRANSAKSI SEKALIGUS!*\n━━━━━━━━━━━━━━━━━━━━━━\n` +
        `💳 *Total Saldo Sekarang:* \`${formatRupiah(stats.totalBalance)}\`\n` +
        `📉 *Pengeluaran Bulan Ini:* \`${formatRupiah(stats.monthlyExpense)}\`\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `_Seluruh data telah tercatat di database & Google Sheet!_`;

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('💳 Cek Saldo', 'action_saldo'),
          Markup.button.url('🌐 Buka Dashboard', `http://${WEB_DOMAIN}`)
        ]
      ]);

      await ctx.editMessageText(reply, { parse_mode: 'Markdown', ...keyboard });

    } catch (err) {
      await ctx.reply(`❌ *Gagal Menyimpan Batch:* ${err.message}`, { parse_mode: 'Markdown' });
    }
  });

  // Simpan Draft Transaksi
  bot.action(/^save_draft_(df_[a-z0-9]+)$/, async (ctx) => {
    await ctx.answerCbQuery('Menyimpan transaksi...');
    const draftId = ctx.match[1];
    const draft = pendingDrafts.get(draftId);

    if (!draft) {
      return ctx.reply('⚠️ Transaksi ini sudah kedaluwarsa atau sudah diproses sebelumnya.');
    }

    try {
      let reply = '';
      let savedId = null;

      if (draft.action === 'EXPENSE') {
        const res = db.recordExpense(draft.wallet, draft.amount, draft.category, draft.description);
        syncTransactionToSheet(res, db.getWallets());
        savedId = res.id;

        reply = `✅ *PENGELUARAN BERHASIL DISIMPAN!*\n━━━━━━━━━━━━━━━━━━━━━━\n` +
          `💸 *Nominal :* \`${formatRupiah(res.amount)}\`\n` +
          `👛 *Dompet  :* ${res.wallet}\n` +
          `🏷️ *Kategori:* ${res.category}\n` +
          `📝 *Catatan :* ${res.description}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `💳 *Sisa Saldo ${res.wallet}:* \`${formatRupiah(res.newBalance)}\``;
      } else if (draft.action === 'INCOME') {
        const res = db.recordIncome(draft.wallet, draft.amount, draft.category, draft.description);
        syncTransactionToSheet(res, db.getWallets());
        savedId = res.id;

        reply = `✅ *PEMASUKAN BERHASIL DISIMPAN!*\n━━━━━━━━━━━━━━━━━━━━━━\n` +
          `💰 *Nominal :* \`${formatRupiah(res.amount)}\`\n` +
          `👛 *Dompet  :* ${res.wallet}\n` +
          `🏷️ *Kategori:* ${res.category}\n` +
          `📝 *Catatan :* ${res.description}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `💳 *Sisa Saldo ${res.wallet}:* \`${formatRupiah(res.newBalance)}\``;
      } else if (draft.action === 'TRANSFER') {
        const res = db.recordTransfer(draft.fromWallet, draft.toWallet, draft.amount, draft.description);
        syncTransactionToSheet(res, db.getWallets());
        savedId = res.id;

        reply = `✅ *TRANSFER BERHASIL DIEKSEKUSI!*\n━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🔄 *Nominal:* \`${formatRupiah(res.amount)}\`\n` +
          `📤 *Dari   :* ${res.fromWallet} (\`${formatRupiah(res.fromNewBalance)}\`)\n` +
          `📥 *Ke     :* ${res.toWallet} (\`${formatRupiah(res.toNewBalance)}\`)\n` +
          `📝 *Catatan:* ${res.description}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━`;
      }

      pendingDrafts.delete(draftId);

      const actionButtons = [
        [
          Markup.button.callback('↩️ Batalkan (Undo)', `undo_tx_${savedId}`),
          Markup.button.url('🌐 Cek Dashboard', `http://${WEB_DOMAIN}`)
        ]
      ];

      await ctx.editMessageText(reply, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(actionButtons)
      });

    } catch (err) {
      await ctx.reply(`❌ *Gagal Menyimpan:* ${err.message}`, { parse_mode: 'Markdown' });
    }
  });

  // Batalkan Draft
  bot.action(/^cancel_draft_(df_[a-z0-9]+)$/, async (ctx) => {
    await ctx.answerCbQuery('Transaksi dibatalkan.');
    const draftId = ctx.match[1];
    pendingDrafts.delete(draftId);
    await ctx.editMessageText('❌ *Pencatatan transaksi dibatalkan.* Saldo dompet Anda tidak berubah.', { parse_mode: 'Markdown' });
  });

  // Undo Transaksi via Button
  bot.action(/^undo_tx_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery('Membatalkan transaksi...');
    const txId = ctx.match[1];
    try {
      const undone = db.undoTransaction(txId);
      await ctx.editMessageText(
        `↩️ *TRANSAKSI #${txId} TELAH DIBATALKAN!*\n━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Nominal \`${formatRupiah(undone.amount)}\` telah dikembalikan ke saldo dompet seperti semula.`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      await ctx.reply(`⚠️ Gagal undo: ${e.message}`);
    }
  });

  // Action buttons
  bot.action('action_saldo', async (ctx) => {
    await ctx.answerCbQuery();
    const stats = db.getSummaryStats();
    let text = `💳 *STATUS SALDO DOMPET*\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    stats.wallets.forEach(w => {
      text += `• *${w.name}*: \`${formatRupiah(w.balance)}\`\n`;
    });
    text += `━━━━━━━━━━━━━━━━━━━━━━\n💰 *Total Net Worth:* \`${formatRupiah(stats.totalBalance)}\``;
    await ctx.reply(text, { parse_mode: 'Markdown' });
  });

  bot.action('action_rekap', async (ctx) => {
    await ctx.answerCbQuery();
    const stats = db.getSummaryStats();
    let text = `📊 *REKAP PENGELUARAN BULAN INI*\n━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📉 Total Keluar: \`${formatRupiah(stats.monthlyExpense)}\`\n` +
      `📈 Total Masuk: \`${formatRupiah(stats.monthlyIncome)}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━━`;
    await ctx.reply(text, { parse_mode: 'Markdown' });
  });

  bot.action(/^quick_freq_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const idx = parseInt(ctx.match[1], 10);
    const frequent = db.getFrequentExpenses(10);
    const item = frequent[idx];

    if (!item) {
      return ctx.reply('⚠️ Template transaksi favorit tidak ditemukan.');
    }

    const draftId = createDraftId();
    pendingDrafts.set(draftId, {
      action: 'EXPENSE',
      amount: item.amount,
      wallet: item.wallet,
      category: item.category,
      description: item.description,
      created_at: Date.now()
    });

    const confirmText = `⚡ *KONFIRMASI PENGELUARAN CEPAT (FAVORIT)*\n━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💸 *Nominal  :* \`${formatRupiah(item.amount)}\`\n` +
      `👛 *Dompet   :* ${item.wallet}\n` +
      `🏷️ *Kategori :* ${item.category}\n` +
      `📝 *Catatan  :* ${item.description}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `_Klik **Simpan Sekarang** untuk mengeksekusi tanpa perlu mengetik ulang:_`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Simpan Sekarang', `save_draft_${draftId}`),
        Markup.button.callback('❌ Batalkan', `cancel_draft_${draftId}`)
      ]
    ]);

    await ctx.reply(confirmText, { parse_mode: 'Markdown', ...keyboard });
  });

  bot.action('action_keluar_help', async (ctx) => {
    await ctx.answerCbQuery();
    const frequent = db.getFrequentExpenses(6);
    let buttons = [];
    if (frequent && frequent.length > 0) {
      buttons = frequent.map((f, i) => [
        Markup.button.callback(`⚡ ${f.description} (${formatRupiah(f.amount)})`, `quick_freq_${i}`)
      ]);
    }

    await ctx.reply(
      `📉 *Cara Mencatat Pengeluaran:*\n\n` +
      `1️⃣ *Ketik langsung:* \`keluar 25rb mandiri makan bakso\`\n` +
      `2️⃣ *Kirim Foto Struk/Nota:* AI akan membaca otomatis!\n` +
      `3️⃣ *Pilih pengeluaran sering Anda di bawah ini:*`,
      {
        parse_mode: 'Markdown',
        ...(buttons.length ? Markup.inlineKeyboard(buttons) : {})
      }
    );
  });

  bot.action('action_masuk_help', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `📈 *Cara Mencatat Pemasukan:*\n\n` +
      `Ketik pesan teks langsung:\n` +
      `👉 \`masuk 2.5jt mandiri gaji\`\n` +
      `👉 \`topup 100k shopeepay\`\n` +
      `👉 \`masuk 50rb tunai bonus\``,
      { parse_mode: 'Markdown' }
    );
  });

  bot.action('action_transfer_help', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `🔄 *Cara Pindah Dana / Transfer Antar Dompet:*\n\n` +
      `Ketik pesan teks langsung:\n` +
      `👉 \`transfer 100k mandiri ke shopeepay\`\n` +
      `👉 \`pindah 50rb tunai ke mandiri\``,
      { parse_mode: 'Markdown' }
    );
  });

  bot.action('action_dompet', async (ctx) => {
    await ctx.answerCbQuery();
    const wallets = db.getWallets();
    let msg = `👛 *Daftar Dompet Anda:*\n`;
    wallets.forEach(w => { msg += `• *${w.name}*: \`${formatRupiah(w.balance)}\`\n`; });
    msg += `\n_Gunakan command /dompet tambah [Nama] [Saldo] untuk menambah dompet baru._`;
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  });
}

module.exports = {
  setupBotHandlers,
  formatRupiah
};
