const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SPREADSHEET_ID = process.env.SPREADSHEET_FINANCE_ID;
const WEBAPP_URL = process.env.GOOGLE_SHEET_WEBAPP_URL;
const CRED_PATH = path.resolve(process.env.GOOGLE_CREDENTIALS_PATH || 'credentials.json');

async function syncTransactionToSheet(tx) {
  // Opsi 1: Google Apps Script Web App URL
  if (WEBAPP_URL && WEBAPP_URL.startsWith('http')) {
    try {
      await fetch(WEBAPP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'record_transaction',
          ...tx
        })
      });
      console.log(`[Google Sheets] Transaksi #${tx.id} tersinkronisasi via Web App.`);
      return true;
    } catch (e) {
      console.warn('[Google Sheets Web App Error]:', e.message);
    }
  }

  // Opsi 2: Google Service Account
  if (SPREADSHEET_ID && fs.existsSync(CRED_PATH)) {
    try {
      const auth = new google.auth.GoogleAuth({
        keyFile: CRED_PATH,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
      const sheets = google.sheets({ version: 'v4', auth });
      const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' });

      const row = [
        now,
        tx.type,
        tx.amount,
        tx.source_wallet || tx.wallet || tx.fromWallet || '-',
        tx.target_wallet || tx.toWallet || '-',
        tx.category || '-',
        tx.description || '-'
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'TRANSAKSI!A:G',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [row] }
      });
      console.log(`[Google Sheets] Transaksi #${tx.id} berhasil dicatat ke Spreadsheet!`);
      return true;
    } catch (err) {
      console.warn('[Google Sheets Service Account Error]:', err.message);
    }
  }

  return false;
}

module.exports = {
  syncTransactionToSheet
};
