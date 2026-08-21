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

    const keyboard = Markup.inlineKeyboard([
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
    ]);

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

    if (parts.length >= 3 && parts[1].toLowerCase() === 'tambah') {
      const name = parts[2];
      const initial = parseFloat(parts[3] || '0');
      try {
        db.addWallet(name, initial);
        return ctx.reply(`✅ Dompet *${name}* berhasil ditambahkan dengan saldo awal \`${formatRupiah(initial)}\`!`, { parse_mode: 'Markdown' });
      } catch (e) {
        return ctx.reply(`❌ Gagal menambah dompet: ${e.message}`);
      }
    }

    if (parts.length >= 4 && parts[1].toLowerCase() === 'set') {
      const name = parts[2];
      const newBal = parseFloat(parts[3]);
      try {
        db.updateWalletBalance(name, newBal);
        return ctx.reply(`✅ Saldo dompet *${name}* berhasil diubah menjadi \`${formatRupiah(newBal)}\`!`, { parse_mode: 'Markdown' });
      } catch (e) {
        return ctx.reply(`❌ Gagal update saldo: ${e.message}`);
      }
    }

    const wallets = db.getWallets();
    let msg = `👛 *PANDUAN KELOLA DOMPET*\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    wallets.forEach(w => {
      msg += `• *${w.name}*: \`${formatRupiah(w.balance)}\`\n`;
    });
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💡 *Command Tambah / Ubah Saldo:*\n` +
      `• \`/dompet tambah BCA 500000\`\n` +
      `• \`/dompet set Mandiri 1500000\``;

    await ctx.reply(msg, { parse_mode: 'Markdown' });
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
    const parsed = parseFinancialCommand(text, wallets);

    if (!parsed) {
      return ctx.reply(
        `❓ *Format belum dikenali*\n\n` +
        `💡 *Contoh Format Cepat:*\n` +
        `• \`keluar 25rb mandiri makan siang\`\n` +
        `• \`beli bensin 50k tunai\`\n` +
        `• \`masuk 1jt mandiri gaji\`\n` +
        `• \`transfer 100k mandiri ke shopeepay\`\n\n` +
        `📸 Atau cukup kirim **Foto Struk / Nota Belanja**!`,
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

  // Pilih dompet dari scan nota
  bot.action(/^set_wallet_(df_[a-z0-9]+)_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const draftId = ctx.match[1];
    const chosenWallet = decodeURIComponent(ctx.match[2]);

    const draft = pendingDrafts.get(draftId);
    if (!draft) {
      return ctx.reply('⚠️ Transaksi ini sudah kedaluwarsa atau sudah diproses.');
    }

    draft.wallet = chosenWallet;
    pendingDrafts.set(draftId, draft);

    const confirmText = `📝 *KONFIRMASI SIMPAN TRANSAKSI NOTA*\n━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💸 *Nominal  :* \`${formatRupiah(draft.amount)}\`\n` +
      `👛 *Dompet   :* ${draft.wallet}\n` +
      `🏷️ *Kategori :* ${draft.category}\n` +
      `📝 *Catatan  :* ${draft.description}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `_Klik **Simpan Sekarang** untuk memotong saldo ${draft.wallet}:_`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Simpan Sekarang', `save_draft_${draftId}`),
        Markup.button.callback('❌ Batalkan', `cancel_draft_${draftId}`)
      ]
    ]);

    await ctx.editMessageText(confirmText, { parse_mode: 'Markdown', ...keyboard });
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
        syncTransactionToSheet(res);
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
        syncTransactionToSheet(res);
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
        syncTransactionToSheet(res);
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

  bot.action('action_keluar_help', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `📉 *Cara Mencatat Pengeluaran:*\n\n` +
      `Ketik pesan teks langsung:\n` +
      `👉 \`keluar 25rb mandiri makan bakso\`\n` +
      `👉 \`beli bensin 50k tunai\`\n` +
      `👉 \`bayar listrik 150k shopeepay\`\n\n` +
      `📸 Atau **Kirim Foto Struk/Nota** belanja Anda!`,
      { parse_mode: 'Markdown' }
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
