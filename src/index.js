require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');
const cors = require('cors');
const db = require('./db/database');
const { setupBotHandlers } = require('./bot/handlers');
const { renderDashboardHtml } = require('./web/dashboard');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8318227403:AAFv7NeIIKekaJfD0vfj9rgHWSVusSy2g-s';
const PORT = process.env.PORT || 3000;

console.log('=============================================');
console.log('🚀 CATAT KEUANGAN BOT ENGINE STARTING...');
console.log('=============================================');

// 1. Inisialisasi Express Web Server
const app = express();
app.use(cors());
app.use(express.json());

// Endpoint Web Dashboard
app.get(['/', '/dashboard', '/saldo'], (req, res) => {
  try {
    const wallets = db.getWallets();
    const summary = db.getSummaryStats();
    const transactions = db.getTransactions(200);
    const html = renderDashboardHtml({ wallets, summary, transactions });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).send(`<h3>Gagal memuat dashboard: ${err.message}</h3>`);
  }
});

// Endpoint REST API JSON
app.get('/api/data', (req, res) => {
  try {
    const wallets = db.getWallets();
    const summary = db.getSummaryStats();
    const transactions = db.getTransactions(100);
    res.json({ success: true, wallets, summary, transactions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Inisialisasi Telegraf Bot
let bot = null;
if (BOT_TOKEN) {
  bot = new Telegraf(BOT_TOKEN, {
    telegram: { timeout: 60000 }
  });

  setupBotHandlers(bot);

  // Global Error Handler
  bot.catch((err, ctx) => {
    console.error('🔥 [Bot Error]:', err.message);
  });
}

// 3. Start Server & Long Polling
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`✅ [Web Server] Live on http://0.0.0.0:${PORT}`);

  if (bot) {
    try {
      await bot.telegram.deleteWebhook({ drop_pending_updates: false });
      bot.launch({
        dropPendingUpdates: false,
        allowedUpdates: ['message', 'callback_query']
      });
      console.log('✅ [Telegram Bot] Long Polling started 24/7!');

      // Register Command Popups
      await bot.telegram.setMyCommands([
        { command: 'start',    description: '🏠 Menu Utama & Bantuan' },
        { command: 'saldo',    description: '💳 Cek Saldo Seluruh Dompet' },
        { command: 'rekap',    description: '📊 Rekap Pengeluaran Bulan Ini' },
        { command: 'dompet',   description: '👛 Kelola & Tambah Dompet' },
        { command: 'web',      description: '🌐 Buka Link Web Dashboard' }
      ]).catch(() => {});
      console.log('✅ [Telegram] Bot command popup menu registered!');
    } catch (err) {
      console.warn('⚠️ [Bot Launch Error]:', err.message);
    }
  }
});

// Anti-crash
process.on('uncaughtException', (err) => console.error('🔥 [Uncaught Exception]:', err.message));
process.on('unhandledRejection', (reason) => console.error('⚠️ [Unhandled Rejection]:', reason));
process.once('SIGINT', () => { bot?.stop('SIGINT'); process.exit(0); });
process.once('SIGTERM', () => { bot?.stop('SIGTERM'); process.exit(0); });
