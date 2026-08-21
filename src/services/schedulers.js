const cron = require('node-cron');
const { Markup } = require('telegraf');
const db = require('../db/database');

const TIMEZONE = process.env.TZ || 'Asia/Makassar';
const ALLOWED_IDS = (process.env.ALLOWED_TELEGRAM_IDS || '171053504').split(',').map(s => s.trim());
const WEB_DOMAIN = process.env.WEBHOOK_DOMAIN || 'keuangan.103.93.129.213.sslip.io';

function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount || 0);
}

function setupSchedulers(bot) {
  if (!bot) return;

  // 1. REKAP HARIAN OTOMATIS MALAM HARI (Setiap jam 21:00 WITA)
  cron.schedule('0 21 * * *', async () => {
    console.log('[Scheduler] Running Daily Financial Digest (21:00 WITA)...');
    try {
      const daily = db.getDailySummary();
      const stats = db.getSummaryStats();

      let msg = `🌙 *REKAP KEUANGAN HARI INI*\n`;
      msg += `📅 _Tanggal: ${daily.dateStr}_\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `📉 *Pengeluaran Hari Ini :* \`${formatRupiah(daily.todayExpense)}\` (${daily.txCount} transaksi)\n`;
      msg += `📈 *Pemasukan Hari Ini   :* \`${formatRupiah(daily.todayIncome)}\`\n`;

      if (daily.topExpense) {
        msg += `🏆 *Pengeluaran Terbesar :* ${daily.topExpense.description} (\`${formatRupiah(daily.topExpense.amount)}\`)\n`;
      }

      msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `💰 *Total Kekayaan (Net Worth):* \`${formatRupiah(stats.totalBalance)}\`\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;

      if (daily.todayExpense === 0) {
        msg += `✨ _Hebat! Hari ini Anda tidak ada pengeluaran sama sekali._ 👍`;
      } else {
        msg += `💡 _Pengeluaran harian Anda tercatat rapi di Google Sheet & Database._`;
      }

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('💳 Cek Saldo Dompet', 'action_saldo'),
          Markup.button.url('🌐 Buka Web Dashboard', `http://${WEB_DOMAIN}`)
        ]
      ]);

      for (const chatId of ALLOWED_IDS) {
        await bot.telegram.sendMessage(chatId, msg, { parse_mode: 'Markdown', ...keyboard }).catch(e => console.warn(`Gagal kirim rekap harian ke ${chatId}:`, e.message));
      }
    } catch (err) {
      console.error('[Scheduler Error] Daily Digest:', err.message);
    }
  }, { timezone: TIMEZONE });

  // 2. PENGINGAT TAGIHAN BULANAN TANGGAL 5 (Jam 08:00 WITA)
  cron.schedule('0 8 5 * *', async () => {
    console.log('[Scheduler] Running Monthly Bills Reminder (Tanggal 5 - 08:00 WITA)...');
    try {
      let msg = `🔔 *PENGINGAT TAGIHAN BULANAN (TANGGAL 5)*\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `Halo! Hari ini adalah *Tanggal 5*, batas waktu untuk membayar seluruh tagihan rutin bulanan Anda:\n\n`;
      msg += `1. 🌐 *IndiHome / Internet Wifi*\n`;
      msg += `2. 💡 *Listrik PLN (Token / Pascabayar)*\n`;
      msg += `3. 💧 *Air PDAM*\n`;
      msg += `4. 🏥 *BPJS Kesehatan*\n`;
      msg += `5. 📱 *Pulsa & Paket Data Bulanan*\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `_Klik tombol cepat di bawah untuk langsung mencatat pembayaran:_`;

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('⚡ Catat Bayar IndiHome', 'quick_bill_indihome'),
          Markup.button.callback('⚡ Catat Bayar Listrik', 'quick_bill_listrik')
        ],
        [
          Markup.button.callback('⚡ Catat Bayar PDAM', 'quick_bill_pdam'),
          Markup.button.callback('⚡ Catat Bayar BPJS', 'quick_bill_bpjs')
        ],
        [
          Markup.button.callback('💳 Cek Saldo Dompet Dulu', 'action_saldo')
        ]
      ]);

      for (const chatId of ALLOWED_IDS) {
        await bot.telegram.sendMessage(chatId, msg, { parse_mode: 'Markdown', ...keyboard }).catch(e => console.warn(`Gagal kirim tagihan ke ${chatId}:`, e.message));
      }
    } catch (err) {
      console.error('[Scheduler Error] Monthly Bills:', err.message);
    }
  }, { timezone: TIMEZONE });

  // 3. H-1 PENGINGAT TAGIHAN BULANAN TANGGAL 4 MALAM (Jam 20:00 WITA)
  cron.schedule('0 20 4 * *', async () => {
    console.log('[Scheduler] Running Monthly Bills Pre-Reminder (Tanggal 4 - 20:00 WITA)...');
    try {
      let msg = `⏰ *PENGINGAT H-1: PEMBAYARAN TAGIHAN BULANAN BESOK!*\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `Besok adalah *Tanggal 5*, jadwal rutin pembayaran tagihan bulanan (IndiHome, Listrik PLN, PDAM, BPJS, dsb).\n\n`;
      msg += `Pastikan saldo di rekening atau e-wallet Anda sudah mencukupi. 👍`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('💳 Cek Kesiapan Saldo', 'action_saldo')]
      ]);

      for (const chatId of ALLOWED_IDS) {
        await bot.telegram.sendMessage(chatId, msg, { parse_mode: 'Markdown', ...keyboard }).catch(e => console.warn(`Gagal kirim pre-reminder ke ${chatId}:`, e.message));
      }
    } catch (err) {
      console.error('[Scheduler Error] Pre-Bills:', err.message);
    }
  }, { timezone: TIMEZONE });

  console.log(`✅ [Schedulers] Auto Rekap Harian (21:00 WITA) & Pengingat Tagihan Tanggal 5 aktif!`);
}

module.exports = {
  setupSchedulers
};
