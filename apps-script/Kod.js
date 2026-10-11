// Eğitici Balık — kayıt sunucusu (Google Apps Script)
// Her hesap = tabloda bir sekme. Düzen:
//   A1:B4  → PIN, Son kayıt (gün.ay.yıl saat:dakika), Oturum kodu, Ayarlar kodu
//   Ayarlar: sıra eşiği (0 = Tümü) - tema - mouse kilidi - sınıf puan eşiği - sıralama   (ör. 5-0-0-10-3)
//   Satır 6 → sınıf adları (her sınıf kendi bloğunda: 3 sütun + 1 boş sütun, soldan sağa)
//   Satır 7 → Sınıf-Ad | Puan | Model   (her blokta)
//   Satır 8+ → öğrenciler. KALIN yazılan ad = Sırayla Rastgele'de bu turda seçilmiş öğrenci
// Eski düzendeki (PIN F1'de) hesaplar ilk erişimde otomatik bu düzene taşınır.

const ID = '1wvjuO6eA1Ngsmzj2rCqqqvUM8fpE4le8E5yB2GL-064';
const ANA = 'Sayfa1';
const BLOK = 4;            // sınıf başına sütun sayısı (3 veri + 1 boşluk)
const ILK_SATIR = 8;       // öğrencilerin başladığı satır
const MAKS_SINIF = 50, MAKS_OGRENCI = 500;

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
function ad_(a) {
  return String(a || '').trim().toLowerCase().replace(/[\[\]*?:\/\\]/g, '').slice(0, 50);
}
const duz_ = v => String(v === undefined || v === null ? '' : v).replace(/^'/, '');
const tarih_ = () => Utilities.formatDate(new Date(), 'Europe/Istanbul', 'dd.MM.yyyy HH:mm');

// Sekmeyi yalnızca gereken boyuta getirir (boş ızgara hücreleri tablonun 10 milyon hücre sınırını yer)
function boyut_(s, satir, sutun) {
  const r = s.getMaxRows(), c = s.getMaxColumns();
  if (r < satir) s.insertRowsAfter(r, satir - r); else if (r > satir) s.deleteRows(satir + 1, r - satir);
  if (c < sutun) s.insertColumnsAfter(c, sutun - c); else if (c > sutun) s.deleteColumns(sutun + 1, c - sutun);
}

// rows: [[ad, puan, model, sınıf, seçildi], ...], names: sınıf sırası  →  [{ad, rows:[[ad,puan,model,seçildi],...]}]
function grupla_(rows, names) {
  const sira = [];
  (names || []).forEach(n => { n = duz_(n).trim().slice(0, 20); if (n && sira.indexOf(n) < 0) sira.push(n); });
  const ilk = sira[0] || 'Sınıf 1';
  const harita = {};
  (rows || []).forEach(r => {
    const ad = duz_(r[0]);
    if (!ad.trim()) return;
    const sn = duz_(r[3]).trim().slice(0, 20) || ilk;
    if (sira.indexOf(sn) < 0) sira.push(sn);
    (harita[sn] = harita[sn] || []).push([ad, Number(r[1]) || 0, Number(r[2]) || 0, r[4] ? 1 : 0]);
  });
  if (!sira.length) sira.push('Sınıf 1');
  return sira.slice(0, MAKS_SINIF).map(ad => ({ ad: ad, rows: (harita[ad] || []).slice(0, MAKS_OGRENCI) }));
}

// Sekmenin tamamını yazar. Kalınlık her sınıf için tek seferde (toplu) verilir.
function yaz_(s, pin, tok, ayar, siniflar) {
  const enCok = siniflar.reduce((m, c) => Math.max(m, c.rows.length), 0);
  s.clear();
  boyut_(s, Math.max(20, ILK_SATIR + enCok + 10), Math.max(8, siniflar.length * BLOK + 1));
  s.getRange(1, 1, 4, 2).setValues([['PIN', "'" + pin], ['Son kayıt', "'" + tarih_()], ['Oturum', tok], ['Ayarlar', "'" + ayar]]);
  siniflar.forEach((c, k) => {
    const c0 = 1 + k * BLOK, n = c.rows.length;
    s.getRange(6, c0).setValue("'" + c.ad).setFontWeight('bold');
    s.getRange(7, c0, 1, 3).setValues([['Sınıf-Ad', 'Puan', 'Model']]).setFontWeight('bold');
    if (!n) return;
    s.getRange(ILK_SATIR, c0, n, 3).setValues(c.rows.map(r => ["'" + r[0], r[1], r[2]]));
    if (c.rows.some(r => r[3])) s.getRange(ILK_SATIR, c0, n, 1).setFontWeights(c.rows.map(r => [r[3] ? 'bold' : 'normal']));
  });
}

// Sekmeden okur → {sinif:[ad], rows:[[ad,puan,model,sınıf,seçildi]]}
function oku_(s) {
  const sonSutun = s.getLastColumn(), sonSatir = s.getLastRow();
  const baslik = sonSutun ? s.getRange(6, 1, 1, sonSutun).getValues()[0] : [];
  const sinif = [], rows = [];
  const n = sonSatir - (ILK_SATIR - 1);
  for (let c = 0; c < sonSutun; c += BLOK) {
    const ad = String(baslik[c] === undefined ? '' : baslik[c]).trim();
    if (!ad) break;
    sinif.push(ad);
    if (n <= 0) continue;
    const r = s.getRange(ILK_SATIR, c + 1, n, 3);
    const kalin = r.offset(0, 0, n, 1).getFontWeights();
    r.getValues().forEach((v, i) => {
      if (String(v[0]).trim()) rows.push([v[0], v[1], v[2], ad, kalin[i][0] === 'bold' ? 1 : 0]);
    });
  }
  return { sinif: sinif, rows: rows };
}

// Eski düzenden (PIN F1'de, öğrenciler A2:D) yeni düzene taşır
function tasi_(s) {
  const pin = String(s.getRange(1, 6).getValue());
  const tok = String(s.getRange(3, 6).getValue() || '');
  let sinif = [];
  try { sinif = JSON.parse(String(s.getRange(4, 6).getValue() || '[]')); } catch (x) { sinif = []; }
  const n = s.getLastRow() - 1;
  const rows = n > 0 ? s.getRange(2, 1, n, 4).getValues() : [];
  yaz_(s, pin, tok, '', grupla_(rows, sinif));
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);
    const ad = ad_(d.ad), pin = String(d.pin || '');
    if (!ad || ad === ANA.toLowerCase()) return out_({ ok: false, hata: 'ad' });
    if (!/^\d{4}$/.test(pin)) return out_({ ok: false, hata: 'pin' });

    const ss = SpreadsheetApp.openById(ID);
    let s = ss.getSheetByName(ad);

    if (d.islem === 'olustur') {
      if (s) return out_({ ok: false, hata: 'var' });
      s = ss.insertSheet(ad);
      const tok = Utilities.getUuid();
      yaz_(s, pin, tok, '', [{ ad: 'Sınıf 1', rows: [] }]);
      return out_({ ok: true, tok: tok });
    }

    if (!s) return out_({ ok: false, hata: 'yok' });
    // Eski düzen (PIN F1'de) → yeni düzene taşı. Yalnızca F1'deki PIN doğruysa taşınır (başka sekmelere dokunulmaz).
    if (String(s.getRange(1, 1).getValue()) !== 'PIN') {
      if (String(s.getRange(1, 6).getValue()) !== pin) return out_({ ok: false, hata: 'pin' });
      tasi_(s);
    }
    if (String(s.getRange(1, 2).getValue()) !== pin) return out_({ ok: false, hata: 'pin' });

    // Tek oturum: her giriş yeni kod üretir, eski kodla gelen bilgisayar 'oturum' hatası alır (atılır)
    if (d.islem === 'giris') {
      const tok = Utilities.getUuid();
      s.getRange(3, 2).setValue(tok);
      return out_({ ok: true, tok: tok });
    }
    const cur = String(s.getRange(3, 2).getValue() || '');
    if (d.tok !== undefined && cur && String(d.tok) !== cur) return out_({ ok: false, hata: 'oturum' });
    const ayar = String(s.getRange(4, 2).getValue() || '').trim();

    if (d.islem === 'oku') {
      const o = oku_(s);
      return out_({ ok: true, sinif: o.sinif, rows: o.rows, ayar: ayar });
    }
    if (d.islem === 'yaz') {
      // Ayar göndermeyen eski uygulama sürümü tablodaki ayarı silmesin
      yaz_(s, pin, cur, d.ayar === undefined ? ayar : String(d.ayar).replace(/[^\d-]/g, '').slice(0, 40), grupla_(d.rows, d.sinif));
      return out_({ ok: true });
    }
    return out_({ ok: false, hata: 'islem' });
  } finally { lock.releaseLock(); }
}
