# 🕌 Sedekah Digital — Platform Donasi PWA

Platform donasi digital berbasis PWA, Firebase Firestore, Google Sheets, dan deploy di Vercel.

## 🚀 Fitur

- 🤲 **Halaman Donasi Publik** — form donasi 3 langkah (isi data → bayar → konfirmasi)
- 📷 **Multi Payment** — QRIS, Transfer Bank (BCA/BNI/Mandiri), GoPay dengan QR dinamis
- 📱 **PWA** — bisa diinstall di Android/iOS, offline-capable
- 🔥 **Firebase Firestore** — realtime data, live feed donatur
- 📊 **Admin Dashboard** — statistik, grafik 7 hari, tabel dengan filter & paginasi
- ✅ **Verifikasi Donasi** — admin bisa verify/tolak transaksi langsung
- 📋 **Google Sheets** — sync otomatis setiap donasi masuk
- 📥 **Export CSV** — export semua data donasi
- 🔔 **Live Notification** — notifikasi browser saat donasi baru masuk
- 🔐 **Admin PIN** — autentikasi sederhana (default: `123456`)

---

## ⚙️ Setup

### 1. Firebase Setup

1. Buka [console.firebase.google.com](https://console.firebase.google.com)
2. Buat project baru → aktifkan **Firestore Database**
3. Copy config ke `js/firebase-config.js`:
   ```js
   const firebaseConfig = {
     apiKey: "xxx",
     authDomain: "xxx.firebaseapp.com",
     projectId: "xxx",
     storageBucket: "xxx.appspot.com",
     messagingSenderId: "xxx",
     appId: "xxx"
   };
   ```
4. Di Firestore, buat collection bernama `donations`
5. Set **Firestore Rules** (Security Rules):
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /donations/{docId} {
         allow read, create: if true;
         allow update, delete: if false; // Admin update via Admin SDK
       }
     }
   }
   ```

---

### 2. Google Apps Script Setup

1. Buka [Google Sheets](https://sheets.google.com) → buat spreadsheet baru
2. Catat **Spreadsheet ID** dari URL: `https://docs.google.com/spreadsheets/d/[ID]/edit`
3. Buka **Extensions → Apps Script**
4. Paste isi file `google-apps-script/Code.gs`
5. Ganti `GANTI_DENGAN_ID_SPREADSHEET_KAMU` dengan ID spreadsheet kamu
6. Klik **Deploy → New Deployment**:
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Copy URL deployment

---

### 3. Konfigurasi di Admin Panel

1. Buka `/admin.html` (PIN default: `123456`)
2. Masuk ke **Pengaturan**
3. Isi:
   - **Google Sheets ID** — ID spreadsheet
   - **Apps Script URL** — URL dari deploy step 6 di atas
   - **Rekening Bank** — nomor rekening asli
4. Klik **Simpan**

---

### 4. QRIS & GoPay

Ganti di `js/app.js`:
```js
const Settings = {
  qrisPayload: 'QRIS_STRING_KAMU', // Dari provider QRIS
  gopayLink: 'https://link.gojek.com/xxx', // Link GoPay kamu
};
```

---

### 5. Deploy ke Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy dari folder sedekah-app
cd sedekah-app
vercel

# Atau connect ke GitHub di vercel.com untuk auto-deploy
```

---

### 6. Jalankan Lokal

```bash
cd sedekah-app
npm install
npm run dev
# Buka http://localhost:3000
```

---

## 📁 Struktur File

```
sedekah-app/
├── index.html              # Halaman donasi publik
├── admin.html              # Admin dashboard
├── manifest.json           # PWA manifest
├── sw.js                   # Service Worker
├── vercel.json             # Konfigurasi Vercel
├── package.json
├── css/
│   ├── style.css           # Styling halaman publik
│   └── admin.css           # Styling admin panel
├── js/
│   ├── firebase-config.js  # Firebase config (WAJIB DIISI)
│   ├── app.js              # Logika halaman donasi
│   └── admin.js            # Logika admin dashboard
├── icons/
│   ├── icon-192.png        # PWA icon
│   └── icon-512.png        # PWA icon
└── google-apps-script/
    └── Code.gs             # Script untuk Google Sheets
```

---

## 🔐 Admin Default

| Setting | Value |
|---------|-------|
| URL Admin | `/admin.html` |
| PIN Default | `123456` |
| Ganti PIN | Settings → Keamanan |

---

## 📊 Struktur Data Firestore

Collection: `donations`

| Field | Type | Keterangan |
|-------|------|-----------|
| `name` | string | Nama donatur |
| `program` | string | ID program (umum/yatim/masjid/pangan) |
| `amount` | number | Nominal donasi |
| `method` | string | qris / transfer / gopay |
| `message` | string | Pesan donatur |
| `uniqueCode` | number | Kode unik 3 digit |
| `status` | string | pending / verified / rejected |
| `createdAt` | timestamp | Waktu donasi |
| `donorId` | string | ID unik donatur |

---

## 🛣️ Roadmap (masa depan)

- [ ] Integrasi Midtrans payment gateway (ganti simulasi)
- [ ] Notifikasi WhatsApp via WA API
- [ ] Export PDF dengan kwitansi
- [ ] Multi admin dengan role berbeda
- [ ] Dashboard statistik per program detail
