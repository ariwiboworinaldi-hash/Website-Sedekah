// ================================================================
// GOOGLE APPS SCRIPT — Sedekah Digital
// Deploy ini sebagai Web App (Execute as: Me, Access: Anyone)
// URL yang didapat ditaruh di Settings admin panel
// ================================================================

const SPREADSHEET_ID = 'GANTI_DENGAN_ID_SPREADSHEET_KAMU';
const SHEET_NAME = 'Donasi';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    if (action === 'addDonation') {
      return addDonation(data);
    } else if (action === 'updateStatus') {
      return updateStatus(data);
    }

    return createResponse({ success: false, message: 'Unknown action' });
  } catch (err) {
    return createResponse({ success: false, error: err.message });
  }
}

function doGet(e) {
  return createResponse({ status: 'Sedekah Digital Apps Script OK', time: new Date().toISOString() });
}

function addDonation(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);

  // Buat sheet jika belum ada
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Header
    sheet.getRange(1, 1, 1, 11).setValues([[
      'ID Donasi', 'Waktu', 'Nama Donatur', 'Program', 'Nominal (Rp)',
      'Kode Unik', 'Metode', 'Pesan', 'Status', 'Kode Firestore', 'Diupdate'
    ]]);
    // Format header
    const headerRange = sheet.getRange(1, 1, 1, 11);
    headerRange.setBackground('#0a3d3d').setFontColor('#c9a84c').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, 11, [120, 160, 160, 150, 120, 100, 100, 200, 100, 150, 150]);
  }

  const now = new Date();
  const rowData = [
    data.donorId || generateId(),
    Utilities.formatDate(now, 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss'),
    data.name || 'Anonim',
    data.program || 'umum',
    data.amount || 0,
    data.uniqueCode || '',
    data.method || '',
    data.message || '',
    data.status || 'pending',
    data.firestoreId || '',
    Utilities.formatDate(now, 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss'),
  ];

  sheet.appendRow(rowData);

  // Format nominal sebagai currency
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, 5).setNumberFormat('"Rp "#,##0');

  // Warna baris berdasarkan status
  colorRowByStatus(sheet, lastRow, data.status);

  return createResponse({ success: true, row: lastRow });
}

function updateStatus(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return createResponse({ success: false, message: 'Sheet not found' });

  // Cari baris berdasarkan ID
  const docId = data.docId;
  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (values[i][9] === docId || values[i][0] === docId) {
      const row = i + 1;
      sheet.getRange(row, 9).setValue(data.status);
      sheet.getRange(row, 11).setValue(
        Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss')
      );
      colorRowByStatus(sheet, row, data.status);
      return createResponse({ success: true, updated: row });
    }
  }

  return createResponse({ success: false, message: 'Row not found' });
}

function colorRowByStatus(sheet, row, status) {
  const colors = {
    pending: '#fff8e1',
    verified: '#e8f5e9',
    rejected: '#ffebee',
  };
  const color = colors[status] || '#ffffff';
  sheet.getRange(row, 1, 1, 11).setBackground(color);
}

function generateId() {
  return Math.random().toString(36).substr(2, 9).toUpperCase();
}

function createResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== FUNGSI TRIGGER OTOMATIS =====
// Jalankan ini dari menu "Run > setupTrigger" untuk auto-sync harian
function setupTrigger() {
  ScriptApp.newTrigger('dailySummary')
    .timeBased()
    .everyDays(1)
    .atHour(20)
    .create();
  Logger.log('Trigger harian berhasil dibuat');
}

// Kirim summary harian via email (opsional)
function dailySummary() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const values = sheet.getDataRange().getValues();
  let todayDonations = 0;
  let todayAmount = 0;
  let pendingCount = 0;

  for (let i = 1; i < values.length; i++) {
    const rowDate = new Date(values[i][1]);
    if (rowDate >= today) {
      todayDonations++;
      todayAmount += parseFloat(values[i][4]) || 0;
    }
    if (values[i][8] === 'pending') pendingCount++;
  }

  Logger.log(`Summary Hari ini: ${todayDonations} donasi, Rp ${todayAmount.toLocaleString()}, ${pendingCount} pending`);

  // Uncomment untuk kirim email:
  // GmailApp.sendEmail(
  //   'admin@example.com',
  //   `[Sedekah Digital] Summary ${Utilities.formatDate(today, 'Asia/Jakarta', 'dd/MM/yyyy')}`,
  //   `Donasi hari ini: ${todayDonations} transaksi\n` +
  //   `Total: Rp ${todayAmount.toLocaleString()}\n` +
  //   `Menunggu verifikasi: ${pendingCount} transaksi`
  // );
}
