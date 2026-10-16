// ================================================================
// SEDEKAH DIGITAL — ADMIN PANEL JS
// ================================================================
import {
  collection, onSnapshot, query, orderBy, limit,
  doc, updateDoc, getDocs, where, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./firebase-config.js";

// ======= CONSTANTS =======
const ADMIN_PIN_KEY = 'admin_pin';
const DEFAULT_PIN = '123456';

const PROGRAMS = [
  { id: 'umum', name: 'Donasi Umum', icon: '🤲' },
  { id: 'yatim', name: 'Beasiswa Yatim', icon: '📚' },
  { id: 'masjid', name: 'Pembangunan Masjid', icon: '🕌' },
  { id: 'pangan', name: 'Bantuan Pangan', icon: '🌾' },
];

const METHOD_ICONS = { qris: '📷 QRIS', transfer: '🏦 Transfer', gopay: '💚 GoPay' };
const STATUS_LABELS = {
  pending: '<span class="badge badge--pending">⏳ Pending</span>',
  verified: '<span class="badge badge--verified">✅ Terverifikasi</span>',
  rejected: '<span class="badge badge--rejected">❌ Ditolak</span>',
};

const formatRupiah = (n) => 'Rp ' + Number(n).toLocaleString('id-ID');
const timeAgo = (date) => {
  const diff = (Date.now() - date) / 1000;
  if (diff < 60) return 'Baru saja';
  if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ======= STATE =======
let allDonations = [];
let currentPage = 1;
const PAGE_SIZE = 15;
let currentVerifyId = null;
let weeklyChart = null;
let methodChart = null;
let filterTimeout = null;

// ======= TOAST =======
function showToast(msg, type = 'info', icon = '💡') {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `<span style="font-size:1.2rem">${icon}</span><span>${msg}</span>`;
  c.prepend(el);
  setTimeout(() => el.remove(), 4000);
}

// ======= AUTH =======
function getStoredPin() {
  return localStorage.getItem(ADMIN_PIN_KEY) || DEFAULT_PIN;
}

document.getElementById('btn-login')?.addEventListener('click', handleLogin);
document.getElementById('admin-pin')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleLogin();
});

function handleLogin() {
  const pin = document.getElementById('admin-pin').value;
  if (pin === getStoredPin()) {
    document.getElementById('login-overlay').classList.add('hidden');
    document.getElementById('admin-app').classList.remove('hidden');
    sessionStorage.setItem('admin_auth', '1');
    initAdminApp();
  } else {
    document.getElementById('login-error').classList.remove('hidden');
    document.getElementById('admin-pin').value = '';
    setTimeout(() => document.getElementById('login-error')?.classList.add('hidden'), 3000);
  }
}

document.getElementById('pin-toggle')?.addEventListener('click', () => {
  const inp = document.getElementById('admin-pin');
  const btn = document.getElementById('pin-toggle');
  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
  else { inp.type = 'password'; btn.textContent = '👁'; }
});

document.getElementById('btn-logout')?.addEventListener('click', () => {
  sessionStorage.removeItem('admin_auth');
  document.getElementById('admin-app').classList.add('hidden');
  document.getElementById('login-overlay').classList.remove('hidden');
  document.getElementById('admin-pin').value = '';
});

// Auto-login jika session masih ada
if (sessionStorage.getItem('admin_auth') === '1') {
  document.getElementById('login-overlay').classList.add('hidden');
  document.getElementById('admin-app').classList.remove('hidden');
  initAdminApp();
}

// ======= SIDEBAR NAVIGATION =======
document.querySelectorAll('.sidebar__link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const page = link.dataset.page;
    navigateTo(page);
    // Close sidebar on mobile
    document.getElementById('sidebar')?.classList.remove('open');
  });
});

document.querySelectorAll('[data-page-link]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo(link.dataset.pageLink);
  });
});

function navigateTo(page) {
  document.querySelectorAll('.sidebar__link').forEach(l => l.classList.toggle('active', l.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `page-${page}`));
  const titles = { dashboard: 'Dashboard', donations: 'Semua Donasi', programs: 'Program', settings: 'Pengaturan' };
  document.getElementById('page-title').textContent = titles[page] || 'Dashboard';
}

// Sidebar toggle
document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
  document.getElementById('sidebar')?.classList.toggle('open');
});

// ======= INIT ADMIN =======
function initAdminApp() {
  loadSettings();
  listenDonations();
  renderPrograms();
  initCharts();
}

// ======= STATUS OVERRIDES (PERSISTENCE FALLBACK) =======
function getStatusOverrides() {
  try {
    return JSON.parse(localStorage.getItem('donation_status_overrides') || '{}');
  } catch (e) {
    return {};
  }
}

function saveStatusOverride(id, status) {
  try {
    const overrides = getStatusOverrides();
    overrides[id] = { status, updatedAt: Date.now() };
    localStorage.setItem('donation_status_overrides', JSON.stringify(overrides));
  } catch (e) {
    console.warn('Gagal menyimpan override status:', e);
  }
}

// ======= LISTEN DONATIONS (REALTIME) =======
function listenDonations() {
  try {
    const q = query(collection(db, 'donations'), orderBy('createdAt', 'desc'), limit(200));
    onSnapshot(q, (snap) => {
      const overrides = getStatusOverrides();
      allDonations = snap.docs.map(d => {
        const data = d.data();
        const override = overrides[d.id];
        return {
          id: d.id,
          ...data,
          status: override?.status || data.status || 'pending',
          verifiedAt: override?.status === 'verified' && !data.verifiedAt
            ? { toDate: () => new Date(override.updatedAt || Date.now()) }
            : data.verifiedAt,
        };
      });
      updateStats();
      renderRecentTable();
      renderAllTable(getFilters());
      updateCharts();

      // Live notification untuk donasi baru
      snap.docChanges().forEach(change => {
        if (change.type === 'added' && allDonations.length > 1) {
          const d = change.doc.data();
          if (d.createdAt && (Date.now() - d.createdAt.toDate()) < 5000) {
            showToast(`💛 Donasi baru ${formatRupiah(d.amount)} dari ${d.name || 'Anonim'}`, 'success', '🔔');
            // Browser notification
            if (Notification.permission === 'granted') {
              new Notification('Sedekah Digital - Donasi Baru! 🎉', {
                body: `${d.name || 'Anonim'} berdonasi ${formatRupiah(d.amount)}`,
                icon: '/icons/icon-192.png',
              });
            }
          }
        }
      });
    }, (err) => {
      console.warn('Firestore snapshot error:', err);
    });
  } catch (err) {
    console.warn('listenDonations error:', err);
  }
}

// ======= STATS =======
function updateStats() {
  const verified = allDonations.filter(d => d.status === 'verified');
  const pending = allDonations.filter(d => d.status === 'pending');

  const total = verified.reduce((s, d) => s + (d.amount || 0), 0);
  const donors = verified.length;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayTotal = verified.filter(d => d.createdAt?.toDate() >= today)
    .reduce((s, d) => s + (d.amount || 0), 0);

  document.getElementById('stat-total-admin').textContent = formatRupiah(total);
  document.getElementById('stat-donors-admin').textContent = donors.toLocaleString('id-ID');
  document.getElementById('stat-today-admin').textContent = formatRupiah(todayTotal);
  document.getElementById('stat-pending-admin').textContent = pending.length;
  document.getElementById('stat-today-change').textContent = `${formatRupiah(todayTotal)} hari ini`;
}

// ======= RECENT TABLE (MENU DASHBOARD) =======
function renderRecentTable() {
  const tbody = document.getElementById('tbody-recent');
  if (!tbody) return;
  const recent = allDonations.slice(0, 8);
  tbody.innerHTML = recent.length === 0
    ? '<tr><td colspan="7" class="table-loading">Belum ada donasi</td></tr>'
    : recent.map(d => `
      <tr>
        <td>${d.createdAt?.toDate ? timeAgo(d.createdAt.toDate()) : '—'}</td>
        <td><strong>${d.name || 'Anonim'}</strong></td>
        <td>${PROGRAMS.find(p => p.id === d.program)?.name || d.program}</td>
        <td><strong style="color:var(--gold-700)">${formatRupiah(d.amount || 0)}</strong></td>
        <td><span class="method-badge">${METHOD_ICONS[d.method] || d.method}</span></td>
        <td>${STATUS_LABELS[d.status] || d.status}</td>
        <td>
          ${d.status === 'pending'
            ? `<button class="btn btn--sm btn--gold" onclick="openVerify('${d.id}')">Verifikasi</button>`
            : `<button class="btn btn--sm btn--ghost" onclick="openVerify('${d.id}')">Detail</button>`}
        </td>
      </tr>`).join('');
}

// ======= ALL DONATIONS TABLE =======
function renderAllTable(filter = {}) {
  const tbody = document.getElementById('tbody-all');
  if (!tbody) return;

  let data = [...allDonations];

  // Filters
  if (filter.search) {
    const s = filter.search.toLowerCase();
    data = data.filter(d => (d.name || '').toLowerCase().includes(s) || d.id.includes(s));
  }
  if (filter.status) data = data.filter(d => d.status === filter.status);
  if (filter.method) data = data.filter(d => d.method === filter.method);

  // Pagination
  const total = data.length;
  const start = (currentPage - 1) * PAGE_SIZE;
  const paginated = data.slice(start, start + PAGE_SIZE);

  tbody.innerHTML = paginated.length === 0
    ? '<tr><td colspan="10" class="table-loading">Tidak ada data</td></tr>'
    : paginated.map(d => `
      <tr>
        <td style="font-family:monospace;font-size:.78rem">${d.id.substr(0, 8).toUpperCase()}</td>
        <td>${d.createdAt?.toDate ? timeAgo(d.createdAt.toDate()) : '—'}</td>
        <td><strong>${d.name || 'Anonim'}</strong></td>
        <td>${PROGRAMS.find(p => p.id === d.program)?.name || d.program}</td>
        <td><strong style="color:var(--gold-700)">${formatRupiah(d.amount || 0)}</strong></td>
        <td style="font-family:monospace">${d.uniqueCode || '—'}</td>
        <td><span class="method-badge">${METHOD_ICONS[d.method] || d.method}</span></td>
        <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${d.message || ''}">${d.message || '—'}</td>
        <td>${STATUS_LABELS[d.status] || d.status}</td>
        <td>
          ${d.status === 'pending'
            ? `<button class="btn btn--sm btn--gold" onclick="openVerify('${d.id}')">Verifikasi</button>`
            : `<button class="btn btn--sm btn--ghost" onclick="openVerify('${d.id}')">Detail</button>`}
        </td>
      </tr>`).join('');

  renderPagination(total);
}

function renderPagination(total) {
  const el = document.getElementById('pagination');
  if (!el) return;
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) { el.innerHTML = ''; return; }
  let html = '';
  for (let i = 1; i <= pages; i++) {
    html += `<button class="page-btn${i === currentPage ? ' active' : ''}" onclick="goPage(${i})">${i}</button>`;
  }
  el.innerHTML = html;
}

window.goPage = (n) => { currentPage = n; renderAllTable(getFilters()); };

function getFilters() {
  return {
    search: document.getElementById('filter-search')?.value || '',
    status: document.getElementById('filter-status')?.value || '',
    method: document.getElementById('filter-method')?.value || '',
  };
}

// Filter listeners
['filter-search', 'filter-status', 'filter-method'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', () => {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => { currentPage = 1; renderAllTable(getFilters()); }, 300);
  });
});

// ======= VERIFY MODAL =======
window.openVerify = (id) => {
  currentVerifyId = id;
  const d = allDonations.find(x => x.id === id);
  if (!d) return;
  document.getElementById('modal-detail').innerHTML = `
    <p><span>ID</span><span style="font-family:monospace">${d.id.substr(0,8).toUpperCase()}</span></p>
    <p><span>Donatur</span><span>${d.name || 'Anonim'}</span></p>
    <p><span>Nominal</span><span style="color:var(--gold-700);font-weight:700">${formatRupiah(d.amount || 0)}</span></p>
    <p><span>Kode Unik</span><span>${d.uniqueCode || '—'}</span></p>
    <p><span>Metode</span><span>${METHOD_ICONS[d.method] || d.method}</span></p>
    <p><span>Program</span><span>${PROGRAMS.find(p => p.id === d.program)?.name || d.program}</span></p>
    <p><span>Pesan</span><span>${d.message || '—'}</span></p>
    <p><span>Status</span><span>${STATUS_LABELS[d.status] || d.status}</span></p>
    <p><span>Waktu</span><span>${d.createdAt?.toDate ? d.createdAt.toDate().toLocaleString('id-ID') : '—'}</span></p>
  `;
  document.getElementById('modal-verify').classList.remove('hidden');
};

document.getElementById('modal-close')?.addEventListener('click', closeModal);
document.getElementById('modal-verify')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-verify')) closeModal();
});

function closeModal() {
  document.getElementById('modal-verify')?.classList.add('hidden');
  currentVerifyId = null;
  const btnOk = document.getElementById('btn-verify-ok');
  const btnReject = document.getElementById('btn-verify-reject');
  if (btnOk) { btnOk.disabled = false; btnOk.textContent = '✅ Verifikasi'; }
  if (btnReject) { btnReject.disabled = false; btnReject.textContent = '❌ Tolak'; }
}

// ======= UPDATE STATUS DONASI (VERIFIKASI & TOLAK) =======
async function updateDonationStatus(newStatus) {
  if (!currentVerifyId) return;
  const targetId = currentVerifyId;
  const btnOk = document.getElementById('btn-verify-ok');
  const btnReject = document.getElementById('btn-verify-reject');

  if (btnOk) { btnOk.disabled = true; btnOk.textContent = '⏳ Memproses...'; }
  if (btnReject) { btnReject.disabled = true; btnReject.textContent = '⏳ Memproses...'; }

  // 1. Coba update ke Firestore (jika rules & koneksi mengizinkan)
  try {
    const updateData = { status: newStatus };
    if (newStatus === 'verified') {
      updateData.verifiedAt = serverTimestamp();
    }
    await updateDoc(doc(db, 'donations', targetId), updateData);
  } catch (err) {
    console.warn('Firestore updateDoc warning (fallback to local state):', err);
  }

  // 2. Sync ke Google Sheets via Apps Script jika URL tersedia
  try {
    await syncStatusToSheets(targetId, newStatus);
  } catch (err) {
    console.warn('Google Sheets sync warning:', err);
  }

  // 3. Update data lokal di allDonations
  const item = allDonations.find(x => x.id === targetId);
  if (item) {
    item.status = newStatus;
    if (newStatus === 'verified') {
      item.verifiedAt = { toDate: () => new Date() };
    }
  }

  // 4. Simpan status override ke localStorage
  saveStatusOverride(targetId, newStatus);

  // 5. Update tampilan dashboard, tabel, statistik, dan grafik secara instan
  updateStats();
  renderRecentTable();
  renderAllTable(getFilters());
  updateCharts();

  // 6. Tutup modal & tampilkan toast
  closeModal();

  if (newStatus === 'verified') {
    showToast('Donasi berhasil diverifikasi ✅', 'success', '✅');
  } else {
    showToast('Donasi berhasil ditolak ❌', 'info', '❌');
  }
}

document.getElementById('btn-verify-ok')?.addEventListener('click', () => updateDonationStatus('verified'));
document.getElementById('btn-verify-reject')?.addEventListener('click', () => updateDonationStatus('rejected'));

// ======= CHARTS =======
function initCharts() {
  // Weekly Chart
  const ctx1 = document.getElementById('chart-weekly')?.getContext('2d');
  if (ctx1) {
    weeklyChart = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: getLast7Days(),
        datasets: [{
          label: 'Donasi',
          data: new Array(7).fill(0),
          backgroundColor: 'rgba(201,168,76,.3)',
          borderColor: 'rgba(201,168,76,1)',
          borderWidth: 2,
          borderRadius: 6,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: {
          callbacks: { label: (ctx) => formatRupiah(ctx.raw) }
        }},
        scales: {
          x: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: 'rgba(255,255,255,.5)', font: { size: 11 } } },
          y: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: 'rgba(255,255,255,.5)', font: { size: 11 }, callback: v => 'Rp ' + (v >= 1000000 ? (v/1000000).toFixed(1)+'jt' : v >= 1000 ? (v/1000)+'rb' : v) } }
        }
      }
    });
  }

  // Doughnut Chart
  const ctx2 = document.getElementById('chart-methods')?.getContext('2d');
  if (ctx2) {
    methodChart = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: ['QRIS', 'Transfer', 'GoPay'],
        datasets: [{
          data: [0, 0, 0],
          backgroundColor: ['rgba(201,168,76,.8)', 'rgba(59,130,246,.8)', 'rgba(34,197,94,.8)'],
          borderColor: ['rgba(201,168,76,1)', 'rgba(59,130,246,1)', 'rgba(34,197,94,1)'],
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,.7)', padding: 12, font: { size: 11 } } }
        },
        cutout: '65%',
      }
    });
  }
}

function updateCharts() {
  if (!weeklyChart || !methodChart) return;

  // Weekly
  const days = getLast7DaysDate();
  const weeklyData = days.map(d => {
    return allDonations
      .filter(x => x.status === 'verified' && isSameDay(x.createdAt?.toDate?.(), d))
      .reduce((s, x) => s + (x.amount || 0), 0);
  });
  weeklyChart.data.datasets[0].data = weeklyData;
  weeklyChart.update();

  // Method
  const counts = { qris: 0, transfer: 0, gopay: 0 };
  allDonations.filter(x => x.status === 'verified').forEach(x => {
    if (counts[x.method] !== undefined) counts[x.method]++;
  });
  methodChart.data.datasets[0].data = [counts.qris, counts.transfer, counts.gopay];
  methodChart.update();
}

function getLast7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' }));
  }
  return days;
}

function getLast7DaysDate() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    d.setHours(0, 0, 0, 0);
    return d;
  });
}

function isSameDay(date, reference) {
  if (!date) return false;
  return date.toDateString() === reference.toDateString();
}

// ======= PROGRAMS ADMIN =======
function renderPrograms() {
  const grid = document.getElementById('programs-admin-grid');
  if (!grid) return;
  const programList = [
    { id: 'umum', name: 'Donasi Umum', icon: '🤲', target: 50000000 },
    { id: 'yatim', name: 'Beasiswa Yatim', icon: '📚', target: 30000000 },
    { id: 'masjid', name: 'Pembangunan Masjid', icon: '🕌', target: 100000000 },
    { id: 'pangan', name: 'Bantuan Pangan', icon: '🌾', target: 20000000 },
  ];

  grid.innerHTML = programList.map(p => {
    const raised = allDonations
      .filter(d => d.program === p.id && d.status === 'verified')
      .reduce((s, d) => s + (d.amount || 0), 0);
    const pct = Math.min(100, Math.round((raised / p.target) * 100));
    return `
    <div class="program-admin-card">
      <div class="program-admin-card__header">
        <span class="program-admin-card__icon">${p.icon}</span>
        <div>
          <div class="program-admin-card__name">${p.name}</div>
          <div class="program-admin-card__raised">${formatRupiah(raised)}</div>
        </div>
      </div>
      <div style="margin:.75rem 0">
        <div style="display:flex;justify-content:space-between;font-size:.78rem;color:rgba(255,255,255,.5);margin-bottom:.4rem">
          <span>${pct}% tercapai</span><span>Target ${formatRupiah(p.target)}</span>
        </div>
        <div style="height:6px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--gold-700),var(--gold-500));border-radius:3px;transition:width 1s ease"></div>
        </div>
      </div>
      <div class="program-admin-card__actions">
        <button class="btn btn--ghost btn--sm">✏️ Edit</button>
      </div>
    </div>`;
  }).join('');
}

// ======= EXPORT =======
document.getElementById('btn-export')?.addEventListener('click', exportToCSV);

function exportToCSV() {
  const headers = ['ID', 'Waktu', 'Nama', 'Program', 'Nominal', 'Kode Unik', 'Metode', 'Pesan', 'Status'];
  const rows = allDonations.map(d => [
    d.id.substr(0,8).toUpperCase(),
    d.createdAt?.toDate?.().toLocaleString('id-ID') || '',
    d.name || 'Anonim',
    PROGRAMS.find(p => p.id === d.program)?.name || d.program,
    d.amount || 0,
    d.uniqueCode || '',
    d.method || '',
    (d.message || '').replace(/,/g, ';'),
    d.status || '',
  ]);

  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sedekah-digital-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Data berhasil diexport ke CSV! 📥', 'success', '✅');
}

// ======= SETTINGS =======
function loadSettings() {
  document.getElementById('org-name').value = localStorage.getItem('org_name') || 'Yayasan Sedekah Digital';
  document.getElementById('monthly-target').value = localStorage.getItem('monthly_target') || '10000000';
  document.getElementById('sheets-id').value = localStorage.getItem('sheets_id') || '';
  document.getElementById('apps-script-url').value = localStorage.getItem('apps_script_url') || '';
  document.getElementById('bca-acc').value = localStorage.getItem('bca_acc') || '1234567890';
  document.getElementById('bni-acc').value = localStorage.getItem('bni_acc') || '0987654321';
  document.getElementById('mandiri-acc').value = localStorage.getItem('mandiri_acc') || '1122334455';
}

document.getElementById('btn-save-settings')?.addEventListener('click', () => {
  localStorage.setItem('org_name', document.getElementById('org-name').value);
  localStorage.setItem('monthly_target', document.getElementById('monthly-target').value);
  localStorage.setItem('sheets_id', document.getElementById('sheets-id').value);
  localStorage.setItem('apps_script_url', document.getElementById('apps-script-url').value);
  showToast('Pengaturan disimpan ✅', 'success', '✅');
});

document.getElementById('btn-save-bank')?.addEventListener('click', () => {
  localStorage.setItem('bca_acc', document.getElementById('bca-acc').value);
  localStorage.setItem('bni_acc', document.getElementById('bni-acc').value);
  localStorage.setItem('mandiri_acc', document.getElementById('mandiri-acc').value);
  showToast('Rekening bank disimpan ✅', 'success', '✅');
});

document.getElementById('btn-change-pin')?.addEventListener('click', () => {
  const curr = document.getElementById('current-pin').value;
  const newPin = document.getElementById('new-pin').value;
  const confirm = document.getElementById('confirm-pin').value;
  if (curr !== getStoredPin()) return showToast('PIN saat ini salah', 'error', '❌');
  if (newPin.length < 4) return showToast('PIN minimal 4 digit', 'error', '❌');
  if (newPin !== confirm) return showToast('Konfirmasi PIN tidak cocok', 'error', '❌');
  localStorage.setItem(ADMIN_PIN_KEY, newPin);
  document.getElementById('current-pin').value = '';
  document.getElementById('new-pin').value = '';
  document.getElementById('confirm-pin').value = '';
  showToast('PIN berhasil diganti ✅', 'success', '✅');
});

// ======= NOTIF PERMISSION =======
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

// ======= SYNC STATUS TO SHEETS =======
async function syncStatusToSheets(docId, status) {
  const url = localStorage.getItem('apps_script_url');
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'updateStatus', docId, status }),
    });
  } catch (e) { console.warn('Sync gagal:', e); }
}
