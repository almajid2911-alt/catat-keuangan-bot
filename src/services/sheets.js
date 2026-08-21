const fs = require('fs');
const path = require('path');

const WEBAPP_URL = process.env.GOOGLE_SHEET_WEBAPP_URL;

/**
 * Mengirim transaksi baru & update saldo terkini ke Google Sheet (Tab MONITORING KEUANGAN PERSONAL)
 */
async function syncTransactionToSheet(tx, wallets = []) {
  if (!WEBAPP_URL || !WEBAPP_URL.startsWith('http')) {
    console.log('[Google Sheets Note] GOOGLE_SHEET_WEBAPP_URL belum diatur di .env');
    return false;
  }

  try {
    const response = await fetch(WEBAPP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sync_transaction',
        tx: {
          id: tx.id,
          type: tx.type,
          amount: tx.amount,
          source_wallet: tx.source_wallet || tx.wallet || tx.fromWallet || '-',
          target_wallet: tx.target_wallet || tx.toWallet || '-',
          category: tx.category || 'Lain-lain',
          description: tx.description || '-'
        },
        wallets: wallets
      })
    });

    const result = await response.json();
    if (result && result.success) {
      console.log(`✅ [Google Sheets] Transaksi #${tx.id} & Saldo Dompet berhasil dicatat di tab MONITORING KEUANGAN PERSONAL!`);
      return true;
    }
  } catch (e) {
    console.warn('⚠️ [Google Sheets WebApp Error]:', e.message);
  }

  return false;
}

/**
 * Menarik data saldo dompet dari Google Sheet jika user mengedit saldo langsung di Spreadsheet
 */
async function fetchWalletsFromSheet() {
  if (!WEBAPP_URL || !WEBAPP_URL.startsWith('http')) {
    return null;
  }

  try {
    const response = await fetch(WEBAPP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'get_wallets'
      })
    });

    const result = await response.json();
    if (result && result.success && Array.isArray(result.wallets) && result.wallets.length > 0) {
      return result.wallets;
    }
  } catch (e) {
    console.warn('⚠️ [Fetch Wallets From Sheet Error]:', e.message);
  }

  return null;
}

module.exports = {
  syncTransactionToSheet,
  fetchWalletsFromSheet
};
