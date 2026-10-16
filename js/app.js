// ================================================================
// SEDEKAH DIGITAL — MAIN APP (Donor Side)
// ================================================================
import {
  collection, addDoc, onSnapshot, query,
  orderBy, limit, serverTimestamp, getDocs, where, Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./firebase-config.js";

// ======= SETTINGS (dari localStorage / default) =======
const Settings = {
  orgName: localStorage.getItem('org_name') || 'Yayasan Sedekah Digital',
  bcaAcc: localStorage.getItem('bca_acc') || '1234567890',
  bniAcc: localStorage.getItem('bni_acc') || '0987654321',
  mandiriAcc: localStorage.getItem('mandiri_acc') || '1122334455',
  qrisPayload: 'https://qris.id/sedekah-digital', // Ganti dengan QRIS payload asli
  gopayLink: 'https://link.gojek.com/sedekahdigital', // Ganti dengan link GoPay asli
};

// ======= PROGRAMS DATA =======
const PROGRAMS = [
  { id: 'umum', name: 'Donasi Umum', icon: '🤲', category: 'Umum', desc: 'Donasi bebas untuk kebutuhan yayasan', target: 50000000, color: '#c9a84c' },
  { id: 'yatim', name: 'Beasiswa Anak Yatim', icon: '📚', category: 'Pendidikan', desc: 'Wujudkan mimpi anak-anak yatim melalui beasiswa pendidikan', target: 30000000, color: '#3b82f6' },
  { id: 'masjid', name: 'Pembangunan Masjid', icon: '🕌', category: 'Infrastruktur', desc: 'Bantu selesaikan pembangunan masjid untuk jamaah', target: 100000000, color: '#22c55e' },
  { id: 'pangan', name: 'Bantuan Pangan', icon: '🌾', category: 'Sosial', desc: 'Paket sembako untuk keluarga kurang mampu', target: 20000000, color: '#ef4444' },
];

// ======= STATE =======
let selectedAmount = 0;
let selectedMethod = 'qris';
let selectedProgram = 'umum';
let currentDonationId = null;
let uniqueCode = 0;
let programTotals = {};

// ======= UTILS =======
const formatRupiah = (n) => 'Rp ' + Number(n).toLocaleString('id-ID');
const getInitial = (name) => (name || 'A').trim()[0].toUpperCase();
const generateId = () => Math.random().toString(36).substr(2, 9).toUpperCase();
const getUniqueCode = () => Math.floor(Math.random() * 899) + 100; // 100-999

// ======= TOAST =======
function showToast(msg, type = 'info', icon = '💡') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `<span style="font-size:1.2rem">${icon}</span><span>${msg}</span>`;
  container.prepend(el);
  setTimeout(() => el.remove(), 4000);
}

// ======= HEADER SCROLL =======
window.addEventListener('scroll', () => {
  const h = document.getElementById('main-header');
  if (h) h.classList.toggle('scrolled', window.scrollY > 50);
});

// ======= HAMBURGER =======
document.getElementById('hamburger')?.addEventListener('click', () => {
  document.getElementById('nav-mobile')?.classList.toggle('open');
});

// ======= SMOOTH SCROLL FOR NAV LINKS =======
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('nav-mobile')?.classList.remove('open');
    }
  });
});

// ======= PROGRAMS RENDER =======
async function renderPrograms() {
  const grid = document.getElementById('programs-grid');
  if (!grid) return;

  // Ambil total donasi per program
  const snap = await getDocs(query(
    collection(db, 'donations'),
    where('status', '==', 'verified')
  ));
  snap.docs.forEach(d => {
    const prog = d.data().program || 'umum';
    programTotals[prog] = (programTotals[prog] || 0) + (d.data().amount || 0);
  });

  grid.innerHTML = PROGRAMS.map(p => {
    const raised = programTotals[p.id] || 0;
    const pct = Math.min(100, Math.round((raised / p.target) * 100));
    return `
    <div class="program-card" onclick="document.getElementById('program-select').value='${p.id}';document.getElementById('donasi').scrollIntoView({behavior:'smooth'})">
      <div class="program-card__img" style="background:linear-gradient(135deg,${p.color}22,${p.color}44)">
        <span style="font-size:3.5rem;position:relative;z-index:1">${p.icon}</span>
      </div>
      <div class="program-card__body">
        <span class="program-card__category">${p.category}</span>
        <h3 class="program-card__title">${p.name}</h3>
        <p class="program-card__desc">${p.desc}</p>
        <div class="program-card__progress">
          <div class="progress-labels">
            <span>${formatRupiah(raised)}</span>
            <span>${pct}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-bar__fill" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="program-card__footer">
          <span class="program-card__raised">${formatRupiah(raised)}</span>
          <span class="program-card__target">Target ${formatRupiah(p.target)}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ======= DONATION FORM =======
// Amount buttons
document.querySelectorAll('.amount-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedAmount = parseInt(btn.dataset.amount);
    document.getElementById('custom-amount').value = '';
  });
});

document.getElementById('custom-amount')?.addEventListener('input', e => {
  document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
  selectedAmount = parseInt(e.target.value) || 0;
});

// Payment method buttons
document.querySelectorAll('.payment-method').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.payment-method').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedMethod = btn.dataset.method;
  });
});

// Program select
document.getElementById('program-select')?.addEventListener('change', e => {
  selectedProgram = e.target.value;
});

// ======= STEP 1 → 2 =======
document.getElementById('btn-next-step')?.addEventListener('click', () => {
  const name = document.getElementById('donor-name').value.trim();
  const prog = document.getElementById('program-select').value;
  const customAmt = parseInt(document.getElementById('custom-amount').value) || 0;
  const amt = selectedAmount || customAmt;

  if (!amt || amt < 1000) {
    showToast('Masukkan nominal donasi minimal Rp 1.000', 'error', '❌');
    return;
  }

  selectedProgram = prog;
  uniqueCode = getUniqueCode();

  // Isi summary
  const progData = PROGRAMS.find(p => p.id === prog) || PROGRAMS[0];
  document.getElementById('summary-program').textContent = progData.name;
  document.getElementById('summary-amount').textContent = formatRupiah(amt);
  const methodNames = { qris: 'QRIS', transfer: 'Transfer Bank', gopay: 'GoPay' };
  document.getElementById('summary-method').textContent = methodNames[selectedMethod] || selectedMethod;
  document.getElementById('summary-code').textContent = uniqueCode;

  // Transfer info
  document.getElementById('unique-code-transfer').textContent = uniqueCode;
  document.getElementById('transfer-total').textContent = formatRupiah(amt + uniqueCode);
  document.getElementById('bca-number').textContent = Settings.bcaAcc.replace(/(\d{4})(\d{3})(\d{3})/, '$1-$2-$3');
  document.getElementById('bni-number').textContent = Settings.bniAcc.replace(/(\d{4})(\d{3})(\d{3})/, '$1-$2-$3');
  document.getElementById('mandiri-number').textContent = Settings.mandiriAcc.replace(/(\d{4})(\d{3})(\d{3})/, '$1-$2-$3');

  // Show/hide panels
  document.getElementById('panel-qris').classList.add('hidden');
  document.getElementById('panel-transfer').classList.add('hidden');
  document.getElementById('panel-gopay').classList.add('hidden');
  document.getElementById(`panel-${selectedMethod}`)?.classList.remove('hidden');

  // Generate QR
  if (selectedMethod === 'qris') {
    const container = document.getElementById('qr-code-container');
    container.innerHTML = '';
    new QRCode(container, {
      text: Settings.qrisPayload + `?amount=${amt}&ref=${uniqueCode}`,
      width: 200,
      height: 200,
      colorDark: '#0a3d3d',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
  } else if (selectedMethod === 'gopay') {
    const container = document.getElementById('qr-gopay-container');
    container.innerHTML = '';
    new QRCode(container, {
      text: Settings.gopayLink + `?amount=${amt}&ref=${uniqueCode}`,
      width: 200,
      height: 200,
      colorDark: '#00b140',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
  }

  // Go to step 2
  document.getElementById('step-1').classList.remove('active');
  document.getElementById('step-2').classList.add('active');
  document.getElementById('donasi').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// Step 2 → 1
document.getElementById('btn-back')?.addEventListener('click', () => {
  document.getElementById('step-2').classList.remove('active');
  document.getElementById('step-1').classList.add('active');
});

// Copy buttons
document.querySelectorAll('.btn-copy').forEach(btn => {
  btn.addEventListener('click', () => {
    navigator.clipboard.writeText(btn.dataset.copy).then(() => {
      btn.textContent = '✅';
      setTimeout(() => { btn.textContent = '📋'; }, 1500);
      showToast('Nomor rekening disalin!', 'success', '📋');
    });
  });
});

// ======= CONFIRM PAYMENT =======
document.getElementById('btn-confirm-payment')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-confirm-payment');
  btn.disabled = true;
  btn.textContent = '⏳ Menyimpan...';

  const name = document.getElementById('donor-name').value.trim() || 'Anonim';
  const message = document.getElementById('donor-message').value.trim();
  const customAmt = parseInt(document.getElementById('custom-amount').value) || 0;
  const amt = selectedAmount || customAmt;

  try {
    const docRef = await addDoc(collection(db, 'donations'), {
      name,
      program: selectedProgram,
      amount: amt,
      method: selectedMethod,
      message,
      uniqueCode,
      status: 'pending',
      createdAt: serverTimestamp(),
      donorId: generateId(),
    });

    currentDonationId = docRef.id;

    // Juga sync ke Google Sheets via Apps Script
    await syncToSheets({
      name, program: selectedProgram, amount: amt,
      method: selectedMethod, message, uniqueCode,
      status: 'pending', donorId: docRef.id,
    });

    // Tampilkan step 3
    const progData = PROGRAMS.find(p => p.id === selectedProgram) || PROGRAMS[0];
    document.getElementById('success-detail').innerHTML = `
      <p style="display:flex;justify-content:space-between;padding:.4rem 0;border-bottom:1px solid rgba(255,255,255,.06)">
        <span style="color:rgba(255,255,255,.5)">Donatur</span><strong>${name}</strong>
      </p>
      <p style="display:flex;justify-content:space-between;padding:.4rem 0;border-bottom:1px solid rgba(255,255,255,.06)">
        <span style="color:rgba(255,255,255,.5)">Program</span><strong>${progData.name}</strong>
      </p>
      <p style="display:flex;justify-content:space-between;padding:.4rem 0;border-bottom:1px solid rgba(255,255,255,.06)">
        <span style="color:rgba(255,255,255,.5)">Nominal</span><strong style="color:var(--gold-700)">${formatRupiah(amt)}</strong>
      </p>
      <p style="display:flex;justify-content:space-between;padding:.4rem 0">
        <span style="color:rgba(255,255,255,.5)">ID Donasi</span><strong style="font-family:monospace;font-size:.85rem">${docRef.id.substr(0,8).toUpperCase()}</strong>
      </p>
    `;

    document.getElementById('step-2').classList.remove('active');
    document.getElementById('step-3').classList.add('active');
    document.getElementById('donasi').scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Donasi tercatat! JazakAllahu khairan 🙏', 'success', '💛');

  } catch (err) {
    console.error(err);
    showToast('Gagal menyimpan donasi. Coba lagi.', 'error', '❌');
    btn.disabled = false;
    btn.textContent = '✅ Saya Sudah Bayar';
  }
});

// ======= DONATE AGAIN =======
document.getElementById('btn-donate-again')?.addEventListener('click', () => {
  document.getElementById('step-3').classList.remove('active');
  document.getElementById('step-1').classList.add('active');
  document.getElementById('donor-name').value = '';
  document.getElementById('donor-message').value = '';
  document.getElementById('custom-amount').value = '';
  document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.payment-method').forEach((b, i) => b.classList.toggle('active', i === 0));
  selectedAmount = 0;
  selectedMethod = 'qris';
});

// ======= SYNC TO GOOGLE SHEETS =======
async function syncToSheets(data) {
  const url = localStorage.getItem('apps_script_url');
  if (!url) return; // Belum dikonfigurasi
  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addDonation', ...data }),
    });
  } catch (e) {
    console.warn('Sync ke Sheets gagal:', e);
  }
}

// ======= REALTIME STATS =======
function listenStats() {
  const q = query(collection(db, 'donations'), where('status', '==', 'verified'));
  onSnapshot(q, (snap) => {
    let total = 0, count = 0, todayTotal = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    snap.docs.forEach(d => {
      const data = d.data();
      total += data.amount || 0;
      count++;
      if (data.createdAt?.toDate() >= today) {
        todayTotal += data.amount || 0;
      }
    });

    animateNumber('stat-total', total, true);
    animateNumber('stat-count', count, false);
    animateNumber('stat-today', todayTotal, true);
  });
}

function animateNumber(id, target, isRupiah) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = 0;
  const duration = 1000;
  const startTime = performance.now();
  const update = (now) => {
    const pct = Math.min(1, (now - startTime) / duration);
    const val = Math.floor(pct * target);
    el.textContent = isRupiah ? formatRupiah(val) : val.toLocaleString('id-ID');
    if (pct < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

// ======= RECENT DONATIONS FEED =======
function getStatusOverrides() {
  try { return JSON.parse(localStorage.getItem('donation_status_overrides') || '{}'); } catch (e) { return {}; }
}

function listenRecentDonations() {
  const feed = document.getElementById('donations-feed');
  if (!feed) return;
  try {
    const q = query(collection(db, 'donations'), orderBy('createdAt', 'desc'), limit(10));
    onSnapshot(q, (snap) => {
      const overrides = getStatusOverrides();
      feed.innerHTML = '';
      if (snap.empty) {
        feed.innerHTML = '<div class="feed-empty">Belum ada donasi. Jadilah yang pertama! 🌟</div>';
        return;
      }
      snap.docs.forEach(docSnap => {
        const d = docSnap.data();
        const effectiveStatus = overrides[docSnap.id]?.status || d.status;
        const item = createFeedItem({ ...d, status: effectiveStatus });
        feed.appendChild(item);
      });
    }, (err) => console.warn('listenRecentDonations error:', err));
  } catch (err) {
    console.warn('listenRecentDonations error:', err);
  }
}

function createFeedItem(data, isNew = false) {
  const el = document.createElement('div');
  el.className = `feed-item${isNew ? ' feed-item__new' : ''}`;
  if (isNew) setTimeout(() => el.classList.remove('feed-item__new'), 3000);
  const time = data.createdAt?.toDate ? timeAgo(data.createdAt.toDate()) : 'Baru saja';
  const progData = PROGRAMS.find(p => p.id === data.program) || PROGRAMS[0];
  const statusIcon = { verified: '✅', pending: '⏳', rejected: '❌' }[data.status] || '⏳';
  el.innerHTML = `
    <div class="feed-item__avatar">${data.name ? getInitial(data.name) : '🤲'}</div>
    <div class="feed-item__body">
      <div class="feed-item__name">${data.name || 'Donatur Anonim'} ${statusIcon}</div>
      <div class="feed-item__meta">${progData.icon} ${progData.name} · ${time}</div>
    </div>
    <div class="feed-item__amount">${formatRupiah(data.amount || 0)}</div>
  `;
  return el;
}

function timeAgo(date) {
  const diff = (Date.now() - date) / 1000;
  if (diff < 60) return 'Baru saja';
  if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  return `${Math.floor(diff / 86400)} hari lalu`;
}

// ======= PWA INSTALL =======
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('install-banner')?.classList.remove('hidden');
});

document.getElementById('btn-install')?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') showToast('Sedekah Digital berhasil diinstall! 📱', 'success', '✅');
  deferredPrompt = null;
  document.getElementById('install-banner')?.classList.add('hidden');
});

document.getElementById('btn-dismiss')?.addEventListener('click', () => {
  document.getElementById('install-banner')?.classList.add('hidden');
});

// ======= INIT =======
(async function init() {
  try {
    renderPrograms();
    listenStats();
    listenRecentDonations();
  } catch (err) {
    console.error('Init error:', err);
    showToast('Gagal memuat data. Periksa koneksi internet.', 'error', '❌');
  }
})();
