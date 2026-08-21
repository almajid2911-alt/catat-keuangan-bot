const { Markup } = require('telegraf');
const db = require('../db/database');
const { parseFinancialCommand } = require('./parser');
const { syncTransactionToSheet } = require('../services/sheets');

const ALLOWED_USER_IDS = (process.env.ALLOWED_TELEGRAM_IDS || '171053504').split(',').map(s => s.trim());
const WEB_DOMAIN = process.env.WEBHOOK_DOMAIN || 'keuangan.103.93.129.213.sslip.io';

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
      `💡 *Format Cepat Pencatatan Teks:*\n` +
      `• \`keluar 25rb mandiri makan siang\`\n` +
      `• \`beli bensin 50k tunai\`\n` +
      `• \`masuk 1.5jt mandiri gaji\`\n` +
      `• \`transfer 100k mandiri ke shopeepay\`\n\n` +
      `_Pilih menu cepat di bawah ini:_`;

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
    wallets.forEach((w, idx) => {
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

  // /dompet (Kelola dompet)
  bot.command('dompet', async (ctx) => {
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    // /dompet tambah [Nama] [SaldoAwal]
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

    // /dompet set [Nama] [SaldoBaru]
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

  // Callback Query Buttons
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
      `👉 \`bayar listrik 150k shopeepay\``,
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

  // Smart Natural Text Listener
  bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;

    const wallets = db.getWallets();
    const parsed = parseFinancialCommand(text, wallets);

    if (!parsed) {
      return ctx.reply(
        `❓ *Perintah tidak dikenali*\n\n` +
        `💡 *Contoh Format Cepat:*\n` +
        `• \`keluar 25rb mandiri makan siang\`\n` +
        `• \`beli bensin 50k tunai\`\n` +
        `• \`masuk 1jt mandiri gaji\`\n` +
        `• \`transfer 100k mandiri ke shopeepay\``,
        { parse_mode: 'Markdown' }
      );
    }

    try {
      if (parsed.action === 'EXPENSE') {
        const res = db.recordExpense(parsed.wallet, parsed.amount, parsed.category, parsed.description);
        syncTransactionToSheet(res);

        const reply = `✅ *PENGELUARAN DICATAT!*\n━━━━━━━━━━━━━━━━━━━━━━\n` +
          `💸 *Nominal :* \`${formatRupiah(res.amount)}\`\n` +
          `👛 *Dompet  :* ${res.wallet}\n` +
          `🏷️ *Kategori:* ${res.category}\n` +
          `📝 *Catatan :* ${res.description}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `💳 *Sisa Saldo ${res.wallet}:* \`${formatRupiah(res.newBalance)}\``;

        return ctx.reply(reply, { parse_mode: 'Markdown' });
      }

      if (parsed.action === 'INCOME') {
        const res = db.recordIncome(parsed.wallet, parsed.amount, parsed.category, parsed.description);
        syncTransactionToSheet(res);

        const reply = `✅ *PEMASUKAN DICATAT!*\n━━━━━━━━━━━━━━━━━━━━━━\n` +
          `💰 *Nominal :* \`${formatRupiah(res.amount)}\`\n` +
          `👛 *Dompet  :* ${res.wallet}\n` +
          `🏷️ *Kategori:* ${res.category}\n` +
          `📝 *Catatan :* ${res.description}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `💳 *Sisa Saldo ${res.wallet}:* \`${formatRupiah(res.newBalance)}\``;

        return ctx.reply(reply, { parse_mode: 'Markdown' });
      }

      if (parsed.action === 'TRANSFER') {
        const res = db.recordTransfer(parsed.fromWallet, parsed.toWallet, parsed.amount, parsed.description);
        syncTransactionToSheet(res);

        const reply = `✅ *TRANSFER BERHASIL!*\n━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🔄 *Nominal:* \`${formatRupiah(res.amount)}\`\n` +
          `📤 *Dari   :* ${res.fromWallet} (\`${formatRupiah(res.fromNewBalance)}\`)\n` +
          `📥 *Ke     :* ${res.toWallet} (\`${formatRupiah(res.toNewBalance)}\`)\n` +
          `📝 *Catatan:* ${res.description}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━`;

        return ctx.reply(reply, { parse_mode: 'Markdown' });
      }
    } catch (err) {
      return ctx.reply(`⚠️ *Gagal Mencatat:* ${err.message}`, { parse_mode: 'Markdown' });
    }
  });
}

module.exports = {
  setupBotHandlers,
  formatRupiah
};
