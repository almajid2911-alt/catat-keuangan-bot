const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'finance.json');

// Default Schema
const defaultData = {
  wallets: [
    { id: 1, name: 'Bank Mandiri', balance: 0, updated_at: new Date().toISOString() },
    { id: 2, name: 'ShopeePay', balance: 0, updated_at: new Date().toISOString() },
    { id: 3, name: 'Uang Tunai', balance: 0, updated_at: new Date().toISOString() }
  ],
  transactions: [],
  categories: [
    'Makanan & Minuman',
    'Transportasi',
    'Belanja Kebutuhan',
    'Tagihan & Listrik',
    'Hiburan',
    'Kesehatan',
    'Pemasukan'
  ]
};

function readDb() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      writeDb(defaultData);
      return defaultData;
    }
    const content = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    return defaultData;
  }
}

function writeDb(data) {
  try {
    const tempPath = `${DB_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, DB_PATH);
  } catch (e) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  }
}

// Helper Functions
function getWallets() {
  const data = readDb();
  return data.wallets || [];
}

function getWalletByName(name) {
  const normalized = name.trim().toLowerCase();
  const all = getWallets();
  return all.find(w => w.name.toLowerCase() === normalized || w.name.toLowerCase().includes(normalized));
}

function addWallet(name, initialBalance = 0) {
  const data = readDb();
  const existing = data.wallets.find(w => w.name.toLowerCase() === name.trim().toLowerCase());
  if (existing) throw new Error(`Dompet "${name}" sudah ada.`);

  const nextId = data.wallets.length ? Math.max(...data.wallets.map(w => w.id)) + 1 : 1;
  const newWallet = {
    id: nextId,
    name: name.trim(),
    balance: Number(initialBalance) || 0,
    updated_at: new Date().toISOString()
  };
  data.wallets.push(newWallet);
  writeDb(data);
  return newWallet;
}

function updateWalletBalance(name, newBalance) {
  const data = readDb();
  const w = data.wallets.find(w => w.name.toLowerCase() === name.trim().toLowerCase() || w.name.toLowerCase().includes(name.trim().toLowerCase()));
  if (!w) throw new Error(`Dompet "${name}" tidak ditemukan.`);

  w.balance = Number(newBalance) || 0;
  w.updated_at = new Date().toISOString();
  writeDb(data);
  return w;
}

function adjustWalletBalance(name, delta) {
  const data = readDb();
  const w = data.wallets.find(w => w.name.toLowerCase() === name.trim().toLowerCase() || w.name.toLowerCase().includes(name.trim().toLowerCase()));
  if (!w) throw new Error(`Dompet "${name}" tidak ditemukan.`);

  const oldBalance = w.balance;
  w.balance = (w.balance || 0) + delta;
  w.updated_at = new Date().toISOString();
  writeDb(data);
  return { wallet: w.name, oldBalance, newBalance: w.balance };
}

function recordExpense(walletName, amount, category = 'Pengeluaran', description = '') {
  const w = getWalletByName(walletName);
  if (!w) throw new Error(`Dompet "${walletName}" tidak ditemukan.`);

  const update = adjustWalletBalance(w.name, -amount);
  const reloaded = readDb();

  const nextId = reloaded.transactions.length ? Math.max(...reloaded.transactions.map(t => t.id)) + 1 : 1;
  const now = new Date();
  const timeStr = now.toLocaleDateString('id-ID', { timeZone: 'Asia/Makassar' }) + ' ' + now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Makassar' });

  const tx = {
    id: nextId,
    type: 'EXPENSE',
    amount: Number(amount),
    source_wallet: w.name,
    target_wallet: null,
    category,
    description,
    created_at: timeStr,
    timestamp: Date.now()
  };

  reloaded.transactions.unshift(tx);
  writeDb(reloaded);

  return {
    ...tx,
    wallet: w.name,
    newBalance: update.newBalance
  };
}

function recordIncome(walletName, amount, category = 'Pemasukan', description = '') {
  const w = getWalletByName(walletName);
  if (!w) throw new Error(`Dompet "${walletName}" tidak ditemukan.`);

  const update = adjustWalletBalance(w.name, amount);
  const reloaded = readDb();

  const nextId = reloaded.transactions.length ? Math.max(...reloaded.transactions.map(t => t.id)) + 1 : 1;
  const now = new Date();
  const timeStr = now.toLocaleDateString('id-ID', { timeZone: 'Asia/Makassar' }) + ' ' + now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Makassar' });

  const tx = {
    id: nextId,
    type: 'INCOME',
    amount: Number(amount),
    source_wallet: null,
    target_wallet: w.name,
    category,
    description,
    created_at: timeStr,
    timestamp: Date.now()
  };

  reloaded.transactions.unshift(tx);
  writeDb(reloaded);

  return {
    ...tx,
    wallet: w.name,
    newBalance: update.newBalance
  };
}

function recordTransfer(fromWalletName, toWalletName, amount, description = '') {
  const wFrom = getWalletByName(fromWalletName);
  const wTo = getWalletByName(toWalletName);

  if (!wFrom) throw new Error(`Dompet asal "${fromWalletName}" tidak ditemukan.`);
  if (!wTo) throw new Error(`Dompet tujuan "${toWalletName}" tidak ditemukan.`);
  if (wFrom.name.toLowerCase() === wTo.name.toLowerCase()) throw new Error('Dompet asal dan tujuan tidak boleh sama.');

  const updateFrom = adjustWalletBalance(wFrom.name, -amount);
  const updateTo = adjustWalletBalance(wTo.name, amount);
  const reloaded = readDb();

  const nextId = reloaded.transactions.length ? Math.max(...reloaded.transactions.map(t => t.id)) + 1 : 1;
  const now = new Date();
  const timeStr = now.toLocaleDateString('id-ID', { timeZone: 'Asia/Makassar' }) + ' ' + now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Makassar' });

  const tx = {
    id: nextId,
    type: 'TRANSFER',
    amount: Number(amount),
    source_wallet: wFrom.name,
    target_wallet: wTo.name,
    category: 'Transfer Antar Dompet',
    description,
    created_at: timeStr,
    timestamp: Date.now()
  };

  reloaded.transactions.unshift(tx);
  writeDb(reloaded);

  return {
    ...tx,
    fromWallet: wFrom.name,
    toWallet: wTo.name,
    fromNewBalance: updateFrom.newBalance,
    toNewBalance: updateTo.newBalance
  };
}

function undoTransaction(txId) {
  const data = readDb();
  const idx = data.transactions.findIndex(t => t.id === Number(txId));
  if (idx === -1) throw new Error('Transaksi tidak ditemukan atau sudah dibatalkan.');

  const tx = data.transactions[idx];

  if (tx.type === 'EXPENSE') {
    adjustWalletBalance(tx.source_wallet, tx.amount);
  } else if (tx.type === 'INCOME') {
    adjustWalletBalance(tx.target_wallet, -tx.amount);
  } else if (tx.type === 'TRANSFER') {
    adjustWalletBalance(tx.source_wallet, tx.amount);
    adjustWalletBalance(tx.target_wallet, -tx.amount);
  }

  const updated = readDb();
  updated.transactions = updated.transactions.filter(t => t.id !== Number(txId));
  writeDb(updated);
  return tx;
}

function getTransactions(limit = 100) {
  const data = readDb();
  return (data.transactions || []).slice(0, limit);
}

function getSummaryStats() {
  const data = readDb();
  const wallets = data.wallets || [];
  const transactions = data.transactions || [];

  const totalBalance = wallets.reduce((acc, w) => acc + (w.balance || 0), 0);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  let monthlyExpense = 0;
  let monthlyIncome = 0;
  const categoryMap = {};

  transactions.forEach(t => {
    const tDate = t.timestamp ? new Date(t.timestamp) : new Date();
    if (tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear) {
      if (t.type === 'EXPENSE') {
        monthlyExpense += t.amount || 0;
        const cat = t.category || 'Lain-lain';
        categoryMap[cat] = (categoryMap[cat] || 0) + (t.amount || 0);
      }
      if (t.type === 'INCOME') {
        monthlyIncome += t.amount || 0;
      }
    }
  });

  const categoryStats = Object.keys(categoryMap).map(k => ({
    category: k,
    total: categoryMap[k]
  })).sort((a, b) => b.total - a.total);

  return {
    totalBalance,
    monthlyExpense,
    monthlyIncome,
    wallets,
    categoryStats
  };
}

module.exports = {
  getWallets,
  getWalletByName,
  addWallet,
  updateWalletBalance,
  adjustWalletBalance,
  recordExpense,
  recordIncome,
  recordTransfer,
  undoTransaction,
  getTransactions,
  getSummaryStats
};
