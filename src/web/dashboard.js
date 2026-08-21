const db = require('../db/database');

function renderDashboardHtml(data) {
  const wallets = data.wallets;
  const stats = data.summary;
  const transactions = data.transactions;

  return `<!DOCTYPE html>
<html lang="id" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard Monitoring Keuangan & Saldo</title>
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
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    body { font-family: 'Inter', sans-serif; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #0f172a; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
    @media print {
      header, .no-print { display: none !important; }
      body { background: #fff !important; color: #000 !important; }
    }
  </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex flex-col">

  <!-- TOPBAR -->
  <header class="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <i class="fa-solid fa-wallet text-white text-lg"></i>
        </div>
        <div>
          <h1 class="font-bold text-base sm:text-lg leading-tight text-white">MONITORING KEUANGAN & SALDO</h1>
          <p class="text-[11px] text-slate-400">Multi-Wallet Financial Tracker & Cashflow</p>
        </div>
      </div>

      <div class="flex items-center space-x-2">
        <button onclick="exportToCsv()" class="px-3 py-1.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-xs font-semibold text-emerald-300 transition flex items-center space-x-1.5 border border-emerald-800">
          <i class="fa-solid fa-file-excel text-emerald-400"></i>
          <span class="hidden sm:inline">Export CSV</span>
        </button>
        <button onclick="window.print()" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition flex items-center space-x-1.5 border border-slate-700">
          <i class="fa-solid fa-print text-slate-400"></i>
          <span class="hidden sm:inline">Cetak</span>
        </button>
        <button onclick="window.location.reload()" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition flex items-center space-x-1.5 border border-slate-700">
          <i class="fa-solid fa-rotate text-emerald-400"></i>
          <span>Refresh</span>
        </button>
      </div>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 flex-1 w-full">

    <!-- KPI CARDS -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-5 shadow-sm">
        <div class="flex items-center justify-between text-slate-400 text-xs font-medium">
          <span>Total Saldo (Net Worth)</span>
          <i class="fa-solid fa-vault text-blue-400 text-base"></i>
        </div>
        <div class="text-2xl sm:text-3xl font-bold text-white mt-2" id="kpiNetWorth">
          Rp ${(stats.totalBalance || 0).toLocaleString('id-ID')}
        </div>
        <p class="text-[11px] text-slate-500 mt-1">Gabungan seluruh rekening & tunai</p>
      </div>

      <div class="bg-slate-900 border border-rose-950/80 rounded-2xl p-5 shadow-sm">
        <div class="flex items-center justify-between text-rose-400 text-xs font-medium">
          <span>Pengeluaran Bulan Ini</span>
          <i class="fa-solid fa-arrow-trend-down text-base"></i>
        </div>
        <div class="text-2xl sm:text-3xl font-bold text-rose-400 mt-2">
          Rp ${(stats.monthlyExpense || 0).toLocaleString('id-ID')}
        </div>
        <p class="text-[11px] text-rose-500/80 mt-1">Bulan ${new Date().toLocaleString('id-ID', { month: 'long', year: 'numeric' })}</p>
      </div>

      <div class="bg-slate-900 border border-emerald-950/80 rounded-2xl p-5 shadow-sm">
        <div class="flex items-center justify-between text-emerald-400 text-xs font-medium">
          <span>Pemasukan Bulan Ini</span>
          <i class="fa-solid fa-arrow-trend-up text-base"></i>
        </div>
        <div class="text-2xl sm:text-3xl font-bold text-emerald-400 mt-2">
          Rp ${(stats.monthlyIncome || 0).toLocaleString('id-ID')}
        </div>
        <p class="text-[11px] text-emerald-500/80 mt-1">Gaji, bonus & pemasukan lain</p>
      </div>
    </div>

    <!-- WALLETS GRID -->
    <div>
      <h3 class="text-sm font-semibold text-slate-300 mb-3 flex items-center">
        <i class="fa-solid fa-credit-card mr-2 text-indigo-400"></i> Rincian Saldo per Rekening & Dompet
      </h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        ${wallets.map(w => `
          <div class="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 space-y-2 hover:border-slate-700 transition">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-slate-300">${w.name}</span>
              ${w.name.toLowerCase().includes('mandiri') ? '<i class="fa-solid fa-building-columns text-blue-400"></i>' : (w.name.toLowerCase().includes('shopee') ? '<i class="fa-solid fa-bag-shopping text-orange-400"></i>' : '<i class="fa-solid fa-money-bill-wave text-emerald-400"></i>')}
            </div>
            <div class="text-xl font-bold text-white font-mono">
              Rp ${(w.balance || 0).toLocaleString('id-ID')}
            </div>
            <div class="text-[10px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-800/60">
              <span>Terakhir Update</span>
              <span>${w.updated_at || 'Hari ini'}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- CHARTS SECTION -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h3 class="text-sm font-semibold text-slate-300 mb-4 flex items-center">
          <i class="fa-solid fa-chart-pie mr-2 text-emerald-400"></i> Kategori Pengeluaran Bulan Ini
        </h3>
        <div class="h-56 relative flex items-center justify-center">
          <canvas id="categoryChart"></canvas>
        </div>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 lg:col-span-2">
        <h3 class="text-sm font-semibold text-slate-300 mb-4 flex items-center">
          <i class="fa-solid fa-chart-column mr-2 text-indigo-400"></i> Sebaran Saldo Antar Dompet
        </h3>
        <div class="h-56">
          <canvas id="walletChart"></canvas>
        </div>
      </div>
    </div>

    <!-- TRANSACTIONS TABLE -->
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 class="text-base font-semibold text-white">Riwayat Transaksi Keuangan</h3>
          <p class="text-xs text-slate-400">Catatan pengeluaran, pemasukan, dan perpindahan dana</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <input type="text" id="searchInput" oninput="filterTable()" placeholder="Cari catatan / dompet..." class="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 w-44 sm:w-60">
          <select id="typeFilter" onchange="filterTable()" class="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500">
            <option value="ALL">Semua Tipe</option>
            <option value="EXPENSE">🔴 Pengeluaran</option>
            <option value="INCOME">🟢 Pemasukan</option>
            <option value="TRANSFER">🔄 Transfer</option>
          </select>
        </div>
      </div>

      <!-- TABLE -->
      <div class="overflow-x-auto rounded-xl border border-slate-800">
        <table class="w-full text-left text-xs text-slate-300" id="txTable">
          <thead class="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
            <tr>
              <th class="py-3 px-3">No</th>
              <th class="py-3 px-3">Waktu</th>
              <th class="py-3 px-3">Tipe</th>
              <th class="py-3 px-4">Nominal</th>
              <th class="py-3 px-3">Dompet Asal</th>
              <th class="py-3 px-3">Dompet Tujuan</th>
              <th class="py-3 px-3">Kategori</th>
              <th class="py-3 px-4">Keterangan</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/60 font-normal" id="tableBody">
            ${transactions.length === 0 ? `
              <tr>
                <td colspan="8" class="text-center py-8 text-slate-500">Belum ada transaksi yang dicatat. Ketik di Telegram untuk mulai mencatat!</td>
              </tr>
            ` : transactions.map((t, idx) => `
              <tr class="hover:bg-slate-800/40 transition">
                <td class="py-2.5 px-3 text-slate-500 font-mono">${idx + 1}</td>
                <td class="py-2.5 px-3 text-[11px] text-slate-400 font-mono">${t.created_at}</td>
                <td class="py-2.5 px-3">
                  ${t.type === 'EXPENSE'
                    ? '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950 text-rose-400 border border-rose-800">🔴 Keluar</span>'
                    : (t.type === 'INCOME'
                      ? '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">🟢 Masuk</span>'
                      : '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-950 text-indigo-400 border border-indigo-800">🔄 Transfer</span>')
                  }
                </td>
                <td class="py-2.5 px-4 font-semibold font-mono ${t.type === 'EXPENSE' ? 'text-rose-400' : (t.type === 'INCOME' ? 'text-emerald-400' : 'text-indigo-400')}">
                  ${t.type === 'EXPENSE' ? '-' : (t.type === 'INCOME' ? '+' : '')}Rp ${(t.amount || 0).toLocaleString('id-ID')}
                </td>
                <td class="py-2.5 px-3 text-slate-300 font-medium">${t.source_wallet || '-'}</td>
                <td class="py-2.5 px-3 text-slate-300 font-medium">${t.target_wallet || '-'}</td>
                <td class="py-2.5 px-3">
                  <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] border border-slate-700">${t.category || '-'}</span>
                </td>
                <td class="py-2.5 px-4 text-slate-400">${t.description || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

  </main>

  <footer class="border-t border-slate-800/80 bg-slate-900/40 py-4 text-center text-xs text-slate-500">
    <div class="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
      <span>Personal Financial & Multi-Wallet Expense Tracker</span>
      <span class="font-mono text-[11px] text-slate-600">v1.0.0 Stable</span>
    </div>
  </footer>

  <script>
    const categoryData = ${JSON.stringify(stats.categoryStats || [])};
    const walletData = ${JSON.stringify(wallets || [])};
    const txData = ${JSON.stringify(transactions || [])};

    // Category Chart
    const catLabels = categoryData.map(c => c.category);
    const catTotals = categoryData.map(c => c.total);

    new Chart(document.getElementById('categoryChart'), {
      type: 'doughnut',
      data: {
        labels: catLabels.length ? catLabels : ['Belum ada data'],
        datasets: [{
          data: catTotals.length ? catTotals : [1],
          backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'],
          borderColor: '#0f172a',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 } } } }
      }
    });

    // Wallet Chart
    new Chart(document.getElementById('walletChart'), {
      type: 'bar',
      data: {
        labels: walletData.map(w => w.name),
        datasets: [{
          label: 'Saldo (IDR)',
          data: walletData.map(w => w.balance),
          backgroundColor: '#059669',
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
          y: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8' } }
        },
        plugins: { legend: { display: false } }
      }
    });

    function filterTable() {
      const search = document.getElementById('searchInput').value.toLowerCase().trim();
      const type = document.getElementById('typeFilter').value;
      const rows = document.querySelectorAll('#tableBody tr');

      rows.forEach(r => {
        const text = r.innerText.toLowerCase();
        const matchSearch = !search || text.includes(search);
        let matchType = true;
        if (type === 'EXPENSE') matchType = text.includes('keluar');
        if (type === 'INCOME') matchType = text.includes('masuk');
        if (type === 'TRANSFER') matchType = text.includes('transfer');

        r.style.display = (matchSearch && matchType) ? '' : 'none';
      });
    }

    function exportToCsv() {
      if (!txData.length) {
        alert('Belum ada data transaksi untuk diexport.');
        return;
      }
      const headers = ['No,Waktu,Tipe,Nominal,Dompet Asal,Dompet Tujuan,Kategori,Keterangan'];
      const rows = txData.map((t, idx) => [
        idx + 1,
        \`"\${t.created_at}"\`,
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
  </script>
</body>
</html>`;
}

module.exports = {
  renderDashboardHtml
};
