const db = require('../db/database');

function renderDashboardHtml(data) {
  const wallets = data.wallets || [];
  const stats = data.summary || {};
  const transactions = data.transactions || [];

  return `<!DOCTYPE html>
<html lang="id" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard Monitoring Keuangan & Multi-Dompet</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: {
              50: '#ecfdf5',
              500: '#10b981',
              600: '#059669',
              900: '#064e3b'
            }
          }
        }
      }
    }
  </script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
    body { font-family: 'Plus Jakarta Sans', sans-serif; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #090d16; }
    ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #334155; }
    @media print {
      header, .no-print, .filter-bar { display: none !important; }
      body { background: #fff !important; color: #000 !important; }
    }
  </style>
</head>
<body class="bg-[#0b0f19] text-slate-100 min-h-screen flex flex-col antialiased selection:bg-emerald-500/30 selection:text-emerald-300">

  <!-- TOPBAR -->
  <header class="border-b border-slate-800/80 bg-[#0f172a]/80 backdrop-blur-md sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <i class="fa-solid fa-vault text-white text-lg"></i>
        </div>
        <div>
          <div class="flex items-center space-x-2">
            <h1 class="font-bold text-base sm:text-lg leading-tight text-white tracking-tight">MONITORING KEUANGAN</h1>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">24/7 Live</span>
          </div>
          <p class="text-[11px] text-slate-400 font-medium">Smart Multi-Wallet & Cashflow Analytics</p>
        </div>
      </div>

      <div class="flex items-center space-x-2">
        <button onclick="exportToCsv()" class="px-3.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-semibold text-emerald-400 transition flex items-center space-x-1.5 border border-emerald-500/20">
          <i class="fa-solid fa-file-arrow-down text-emerald-400"></i>
          <span class="hidden sm:inline">Export CSV</span>
        </button>
        <button onclick="window.location.reload()" class="px-3.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-xs font-medium text-slate-300 transition flex items-center space-x-1.5 border border-slate-700/80">
          <i class="fa-solid fa-arrows-rotate text-teal-400"></i>
          <span>Refresh</span>
        </button>
      </div>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 flex-1 w-full">

    <!-- GLOBAL KPI STATS -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Total Net Worth -->
      <div class="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800/80 rounded-2xl p-5 shadow-sm relative overflow-hidden group hover:border-slate-700 transition">
        <div class="flex items-center justify-between text-slate-400 text-xs font-medium">
          <span>Total Saldo (Net Worth)</span>
          <div class="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
            <i class="fa-solid fa-building-columns"></i>
          </div>
        </div>
        <div class="text-2xl sm:text-3xl font-extrabold text-white mt-2 tracking-tight" id="kpiTotalBalance">
          Rp ${(stats.totalBalance || 0).toLocaleString('id-ID')}
        </div>
        <div class="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
          <span>10 Dompet Aktif</span>
          <span class="text-emerald-400 font-medium">Google Sheet Synced</span>
        </div>
      </div>

      <!-- Pengeluaran Bulan Ini -->
      <div class="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-rose-950/60 rounded-2xl p-5 shadow-sm relative overflow-hidden group hover:border-rose-900/60 transition">
        <div class="flex items-center justify-between text-rose-400 text-xs font-medium">
          <span id="kpiExpenseLabel">Pengeluaran</span>
          <div class="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400">
            <i class="fa-solid fa-arrow-trend-down"></i>
          </div>
        </div>
        <div class="text-2xl sm:text-3xl font-extrabold text-rose-400 mt-2 tracking-tight" id="kpiExpenseVal">
          Rp ${(stats.monthlyExpense || 0).toLocaleString('id-ID')}
        </div>
        <p class="text-[11px] text-slate-400 mt-1" id="kpiExpenseDesc">Total keluar tercatat</p>
      </div>

      <!-- Pemasukan Bulan Ini -->
      <div class="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-emerald-950/60 rounded-2xl p-5 shadow-sm relative overflow-hidden group hover:border-emerald-900/60 transition">
        <div class="flex items-center justify-between text-emerald-400 text-xs font-medium">
          <span id="kpiIncomeLabel">Pemasukan</span>
          <div class="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
            <i class="fa-solid fa-arrow-trend-up"></i>
          </div>
        </div>
        <div class="text-2xl sm:text-3xl font-extrabold text-emerald-400 mt-2 tracking-tight" id="kpiIncomeVal">
          Rp ${(stats.monthlyIncome || 0).toLocaleString('id-ID')}
        </div>
        <p class="text-[11px] text-slate-400 mt-1" id="kpiIncomeDesc">Gaji & Pemasukan lain</p>
      </div>

      <!-- Net Cashflow -->
      <div class="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800/80 rounded-2xl p-5 shadow-sm relative overflow-hidden group hover:border-slate-700 transition">
        <div class="flex items-center justify-between text-slate-400 text-xs font-medium">
          <span>Net Cashflow</span>
          <div class="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400">
            <i class="fa-solid fa-scale-balanced"></i>
          </div>
        </div>
        <div class="text-2xl sm:text-3xl font-extrabold mt-2 tracking-tight ${((stats.monthlyIncome || 0) - (stats.monthlyExpense || 0)) >= 0 ? 'text-teal-400' : 'text-rose-400'}" id="kpiCashflowVal">
          Rp ${(((stats.monthlyIncome || 0) - (stats.monthlyExpense || 0))).toLocaleString('id-ID')}
        </div>
        <p class="text-[11px] text-slate-400 mt-1">Selisih Masuk vs Keluar</p>
      </div>
    </div>

    <!-- WALLETS GRID SECTION -->
    <div class="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <i class="fa-solid fa-credit-card text-emerald-400 text-sm"></i>
          <h3 class="text-sm font-bold text-white tracking-tight">Daftar Saldo per Rekening & Dompet</h3>
        </div>
        <span class="text-xs text-slate-400 font-mono">${wallets.length} Dompet</span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
        ${wallets.map(w => {
          let icon = 'fa-wallet';
          let iconColor = 'text-slate-400';
          let bgGradient = 'from-slate-900 to-slate-950';
          const nameLower = (w.name || '').toLowerCase();

          if (nameLower.includes('mandiri')) { icon = 'fa-building-columns'; iconColor = 'text-blue-400'; }
          else if (nameLower.includes('bni')) { icon = 'fa-building-columns'; iconColor = 'text-teal-400'; }
          else if (nameLower.includes('bri')) { icon = 'fa-building-columns'; iconColor = 'text-blue-500'; }
          else if (nameLower.includes('neo')) { icon = 'fa-vault'; iconColor = 'text-amber-400'; }
          else if (nameLower.includes('shopee')) { icon = 'fa-bag-shopping'; iconColor = 'text-orange-400'; }
          else if (nameLower.includes('gopay')) { icon = 'fa-wallet'; iconColor = 'text-cyan-400'; }
          else if (nameLower.includes('tunai') || nameLower.includes('cash')) { icon = 'fa-money-bill-wave'; iconColor = 'text-emerald-400'; }
          else if (nameLower.includes('isteri') || nameLower.includes('istri')) { icon = 'fa-heart'; iconColor = 'text-pink-400'; }

          return `
            <div class="bg-gradient-to-br ${bgGradient} border border-slate-800 rounded-xl p-3.5 space-y-2 hover:border-emerald-500/40 transition group">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-300 truncate">${w.name}</span>
                <i class="fa-solid ${icon} ${iconColor} text-sm"></i>
              </div>
              <div class="text-lg font-bold text-white font-mono tracking-tight">
                Rp ${(w.balance || 0).toLocaleString('id-ID')}
              </div>
              <div class="text-[10px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-800/60 font-mono">
                <span>Status</span>
                <span class="text-emerald-500">Aktif</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- FILTER BAR INTERAKTIF -->
    <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 filter-bar shadow-sm">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <!-- Quick Date Range Pills -->
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-xs font-semibold text-slate-400 mr-2 flex items-center">
            <i class="fa-solid fa-calendar-days text-teal-400 mr-1.5"></i> Rentang:
          </span>
          <button onclick="setDateRange('today')" id="btnRange_today" class="range-btn px-3 py-1 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition">Hari Ini</button>
          <button onclick="setDateRange('7days')" id="btnRange_7days" class="range-btn px-3 py-1 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition">7 Hari Terakhir</button>
          <button onclick="setDateRange('thisMonth')" id="btnRange_thisMonth" class="range-btn px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Bulan Ini</button>
          <button onclick="setDateRange('all')" id="btnRange_all" class="range-btn px-3 py-1 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition">Semua</button>
        </div>

        <!-- Custom Date Pickers -->
        <div class="flex flex-wrap items-center gap-2">
          <div class="flex items-center space-x-1.5">
            <span class="text-xs text-slate-400">Dari:</span>
            <input type="date" id="startDate" onchange="applyCustomFilter()" class="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500">
          </div>
          <div class="flex items-center space-x-1.5">
            <span class="text-xs text-slate-400">Sampai:</span>
            <input type="date" id="endDate" onchange="applyCustomFilter()" class="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500">
          </div>
        </div>
      </div>

      <!-- Secondary Filters & Search -->
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-slate-800/80">
        <!-- Search Keyword -->
        <div class="relative">
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-slate-500 text-xs"></i>
          <input type="text" id="searchInput" oninput="applyCustomFilter()" placeholder="Cari catatan / toko..." class="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500">
        </div>

        <!-- Wallet Filter -->
        <select id="walletFilter" onchange="applyCustomFilter()" class="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500">
          <option value="ALL">Semua Dompet / Rekening</option>
          ${wallets.map(w => `<option value="${w.name}">${w.name}</option>`).join('')}
        </select>

        <!-- Category Filter -->
        <select id="categoryFilter" onchange="applyCustomFilter()" class="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500">
          <option value="ALL">Semua Kategori</option>
          <option value="Makanan & Minuman">Makanan & Minuman</option>
          <option value="Kebutuhan Rumah Tangga">Kebutuhan Rumah Tangga</option>
          <option value="Transportasi & Bensin">Transportasi & Bensin</option>
          <option value="Tagihan Bulanan">Tagihan Bulanan</option>
          <option value="Pribadi & Gaya Hidup">Pribadi & Gaya Hidup</option>
          <option value="Keluarga & Anak">Keluarga & Anak</option>
          <option value="Kesehatan">Kesehatan</option>
          <option value="Transfer Antar Dompet">Transfer Antar Dompet</option>
          <option value="Pemasukan & Gaji">Pemasukan & Gaji</option>
        </select>

        <!-- Type Filter -->
        <select id="typeFilter" onchange="applyCustomFilter()" class="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500">
          <option value="ALL">Semua Tipe Transaksi</option>
          <option value="EXPENSE">🔴 Pengeluaran Saja</option>
          <option value="INCOME">🟢 Pemasukan Saja</option>
          <option value="TRANSFER">🔄 Transfer Antar Dompet</option>
        </select>
      </div>
    </div>

    <!-- CHARTS SECTION -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Doughnut Chart Kategori -->
      <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-bold text-slate-200 flex items-center">
            <i class="fa-solid fa-chart-pie mr-2 text-emerald-400"></i> Proporsi Kategori Pengeluaran
          </h3>
          <span class="text-[10px] text-slate-500 font-mono" id="chartCatSub">Filtered</span>
        </div>
        <div class="h-60 relative flex items-center justify-center">
          <canvas id="categoryChart"></canvas>
        </div>
      </div>

      <!-- Bar Chart Saldo & Tren -->
      <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-sm lg:col-span-2 space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-bold text-slate-200 flex items-center">
            <i class="fa-solid fa-chart-column mr-2 text-teal-400"></i> Sebaran Saldo Real-Time
          </h3>
          <span class="text-[10px] text-slate-500 font-mono">10 Dompet</span>
        </div>
        <div class="h-60">
          <canvas id="walletChart"></canvas>
        </div>
      </div>
    </div>

    <!-- DATA TABLE SECTION -->
    <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 class="text-sm font-bold text-white tracking-tight">Daftar Rincian Riwayat Transaksi</h3>
          <p class="text-xs text-slate-400">Menampilkan transaksi hasil filter</p>
        </div>
        <div class="flex items-center space-x-2 text-xs font-mono text-slate-400">
          <span id="filteredCount">0</span> transaksi ditemukan | Total: <span class="text-white font-bold" id="filteredTotal">Rp 0</span>
        </div>
      </div>

      <!-- TABLE -->
      <div class="overflow-x-auto rounded-xl border border-slate-800">
        <table class="w-full text-left text-xs text-slate-300" id="txTable">
          <thead class="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
            <tr>
              <th class="py-3 px-3">No</th>
              <th class="py-3 px-3">Waktu (WITA)</th>
              <th class="py-3 px-3">Tipe</th>
              <th class="py-3 px-4 text-right">Nominal</th>
              <th class="py-3 px-3">Dompet Asal</th>
              <th class="py-3 px-3">Dompet Tujuan</th>
              <th class="py-3 px-3">Kategori</th>
              <th class="py-3 px-4">Keterangan / Catatan</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/60 font-normal" id="tableBody">
            <!-- Rendered by JS -->
          </tbody>
        </table>
      </div>
    </div>

  </main>

  <footer class="border-t border-slate-800/80 bg-[#090d16] py-5 text-center text-xs text-slate-500">
    <div class="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
      <div class="flex items-center space-x-2">
        <span>Personal Multi-Wallet Financial Tracker</span>
        <span>•</span>
        <span class="text-emerald-500">Connected to Google Sheets & Telegram Bot</span>
      </div>
      <span class="font-mono text-[11px] text-slate-600">v2.0 Enhanced</span>
    </div>
  </footer>

  <script>
    const rawWallets = ${JSON.stringify(wallets || [])};
    const rawTransactions = ${JSON.stringify(transactions || [])};

    let categoryChartInstance = null;
    let walletChartInstance = null;
    let currentFilterMode = 'thisMonth';

    function initCharts() {
      // Wallet Bar Chart
      const ctxWallet = document.getElementById('walletChart');
      if (ctxWallet) {
        walletChartInstance = new Chart(ctxWallet, {
          type: 'bar',
          data: {
            labels: rawWallets.map(w => w.name),
            datasets: [{
              label: 'Saldo (IDR)',
              data: rawWallets.map(w => w.balance),
              backgroundColor: rawWallets.map(w => {
                const n = (w.name || '').toLowerCase();
                if (n.includes('mandiri')) return '#3b82f6';
                if (n.includes('neo')) return '#f59e0b';
                if (n.includes('shopee')) return '#f97316';
                if (n.includes('tunai')) return '#10b981';
                if (n.includes('isteri')) return '#ec4899';
                return '#059669';
              }),
              borderRadius: 8
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } },
              y: { 
                grid: { color: '#1e293b' }, 
                ticks: { 
                  color: '#94a3b8',
                  font: { size: 10 },
                  callback: function(v) { return 'Rp ' + (v / 1000000).toFixed(1) + 'M'; }
                } 
              }
            },
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: function(c) { return ' Saldo: Rp ' + c.raw.toLocaleString('id-ID'); }
                }
              }
            }
          }
        });
      }
    }

    function renderCategoryChart(catMap) {
      const labels = Object.keys(catMap);
      const values = Object.values(catMap);

      const ctxCat = document.getElementById('categoryChart');
      if (!ctxCat) return;

      if (categoryChartInstance) {
        categoryChartInstance.destroy();
      }

      categoryChartInstance = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
          labels: labels.length ? labels : ['Tidak Ada Pengeluaran'],
          datasets: [{
            data: values.length ? values : [1],
            backgroundColor: values.length ? [
              '#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', 
              '#06b6d4', '#f43f5e', '#a855f7', '#64748b'
            ] : ['#1e293b'],
            borderColor: '#0f172a',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { 
              position: 'bottom', 
              labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 10, padding: 8 } 
            },
            tooltip: {
              callbacks: {
                label: function(c) {
                  if (!values.length) return ' Rp 0';
                  return ' ' + c.label + ': Rp ' + c.raw.toLocaleString('id-ID');
                }
              }
            }
          }
        }
      });
    }

    function setDateRange(mode) {
      currentFilterMode = mode;
      document.querySelectorAll('.range-btn').forEach(b => {
        b.className = 'range-btn px-3 py-1 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition';
      });
      const activeBtn = document.getElementById('btnRange_' + mode);
      if (activeBtn) {
        activeBtn.className = 'range-btn px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
      }

      const now = new Date();
      const startInput = document.getElementById('startDate');
      const endInput = document.getElementById('endDate');

      if (mode === 'today') {
        const todayStr = now.toISOString().slice(0, 10);
        startInput.value = todayStr;
        endInput.value = todayStr;
      } else if (mode === '7days') {
        const past = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
        startInput.value = past.toISOString().slice(0, 10);
        endInput.value = now.toISOString().slice(0, 10);
      } else if (mode === 'thisMonth') {
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        startInput.value = \`\${y}-\${m}-01\`;
        endInput.value = now.toISOString().slice(0, 10);
      } else if (mode === 'all') {
        startInput.value = '';
        endInput.value = '';
      }

      applyCustomFilter();
    }

    function applyCustomFilter() {
      const search = document.getElementById('searchInput').value.toLowerCase().trim();
      const selectedWallet = document.getElementById('walletFilter').value;
      const selectedCat = document.getElementById('categoryFilter').value;
      const selectedType = document.getElementById('typeFilter').value;

      const startDateVal = document.getElementById('startDate').value;
      const endDateVal = document.getElementById('endDate').value;

      let expTotal = 0;
      let incTotal = 0;
      const categoryMap = {};

      const filtered = rawTransactions.filter(t => {
        // Date parse
        const tDate = t.timestamp ? new Date(t.timestamp) : new Date();
        const tDateStr = tDate.toISOString().slice(0, 10);

        if (startDateVal && tDateStr < startDateVal) return false;
        if (endDateVal && tDateStr > endDateVal) return false;

        // Wallet
        if (selectedWallet !== 'ALL') {
          const wMatch = (t.source_wallet === selectedWallet) || (t.target_wallet === selectedWallet);
          if (!wMatch) return false;
        }

        // Category
        if (selectedCat !== 'ALL') {
          if ((t.category || '').toLowerCase() !== selectedCat.toLowerCase()) return false;
        }

        // Type
        if (selectedType !== 'ALL') {
          if (t.type !== selectedType) return false;
        }

        // Search
        if (search) {
          const textFull = \`\${t.description || ''} \${t.category || ''} \${t.source_wallet || ''} \${t.target_wallet || ''} \${t.amount || ''}\`.toLowerCase();
          if (!textFull.includes(search)) return false;
        }

        return true;
      });

      // Recalculate KPI & Category Breakdown
      filtered.forEach(t => {
        if (t.type === 'EXPENSE') {
          expTotal += (t.amount || 0);
          const cat = t.category || 'Lain-lain';
          categoryMap[cat] = (categoryMap[cat] || 0) + (t.amount || 0);
        } else if (t.type === 'INCOME') {
          incTotal += (t.amount || 0);
        }
      });

      // Update KPIs
      document.getElementById('kpiExpenseVal').innerText = 'Rp ' + expTotal.toLocaleString('id-ID');
      document.getElementById('kpiIncomeVal').innerText = 'Rp ' + incTotal.toLocaleString('id-ID');
      const net = incTotal - expTotal;
      const kpiCashflow = document.getElementById('kpiCashflowVal');
      kpiCashflow.innerText = (net >= 0 ? '+' : '') + 'Rp ' + net.toLocaleString('id-ID');
      kpiCashflow.className = 'text-2xl sm:text-3xl font-extrabold mt-2 tracking-tight ' + (net >= 0 ? 'text-teal-400' : 'text-rose-400');

      document.getElementById('filteredCount').innerText = filtered.length;
      document.getElementById('filteredTotal').innerText = 'Rp ' + (expTotal + incTotal).toLocaleString('id-ID');

      renderCategoryChart(categoryMap);
      renderTableRows(filtered);
    }

    function renderTableRows(rows) {
      const tbody = document.getElementById('tableBody');
      if (!tbody) return;

      if (!rows.length) {
        tbody.innerHTML = \`
          <tr>
            <td colspan="8" class="text-center py-10 text-slate-500">
              <i class="fa-solid fa-inbox text-3xl mb-2 block opacity-40"></i>
              Tidak ada transaksi yang cocok dengan kriteria filter saat ini.
            </td>
          </tr>
        \`;
        return;
      }

      tbody.innerHTML = rows.map((t, idx) => {
        let typeBadge = '';
        let amountColor = 'text-slate-300';
        let amountPrefix = '';

        if (t.type === 'EXPENSE') {
          typeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950 text-rose-400 border border-rose-800/80">🔴 Keluar</span>';
          amountColor = 'text-rose-400';
          amountPrefix = '-';
        } else if (t.type === 'INCOME') {
          typeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/80">🟢 Masuk</span>';
          amountColor = 'text-emerald-400';
          amountPrefix = '+';
        } else {
          typeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-950 text-indigo-400 border border-indigo-800/80">🔄 Transfer</span>';
          amountColor = 'text-indigo-400';
        }

        return \`
          <tr class="hover:bg-slate-800/40 transition">
            <td class="py-2.5 px-3 text-slate-500 font-mono">\${idx + 1}</td>
            <td class="py-2.5 px-3 text-[11px] text-slate-400 font-mono">\${t.created_at || '-'}</td>
            <td class="py-2.5 px-3">\${typeBadge}</td>
            <td class="py-2.5 px-4 font-bold font-mono text-right \${amountColor}">
              \${amountPrefix}Rp \${(t.amount || 0).toLocaleString('id-ID')}
            </td>
            <td class="py-2.5 px-3 text-slate-300 font-medium">\${t.source_wallet || '-'}</td>
            <td class="py-2.5 px-3 text-slate-300 font-medium">\${t.target_wallet || '-'}</td>
            <td class="py-2.5 px-3">
              <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] border border-slate-700">\${t.category || '-'}</span>
            </td>
            <td class="py-2.5 px-4 text-slate-300">\${t.description || '-'}</td>
          </tr>
        \`;
      }).join('');
    }

    function exportToCsv() {
      if (!rawTransactions.length) {
        alert('Belum ada data transaksi untuk diexport.');
        return;
      }
      const headers = ['No,Waktu,Tipe,Nominal,Dompet Asal,Dompet Tujuan,Kategori,Keterangan'];
      const rows = rawTransactions.map((t, idx) => [
        idx + 1,
        \`"\${t.created_at || ''}"\`,
        \`"\${t.type}"\`,
        t.amount,
        \`"\${t.source_wallet || ''}"\`,
        \`"\${t.target_wallet || ''}"\`,
        \`"\${t.category || ''}"\`,
        \`"\${(t.description || '').replace(/"/g, '""')}"\`
      ].join(','));

      const csvContent = headers.concat(rows).join('\\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = \`Rekap_Keuangan_\${new Date().toISOString().slice(0, 10)}.csv\`;
      a.click();
    }

    window.addEventListener('DOMContentLoaded', () => {
      initCharts();
      setDateRange('thisMonth');
    });
  </script>
</body>
</html>`;
}

module.exports = {
  renderDashboardHtml
};
