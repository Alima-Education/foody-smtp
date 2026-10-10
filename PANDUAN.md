# Mengenal Konsep: Kirim Email dan Verifikasi OTP

Panduan ini **tanpa coding**. Tujuannya satu: kamu paham *apa yang terjadi* dan *kenapa dibuat begitu* waktu kita memverifikasi email lewat kode OTP. Setelah paham konsepnya, baru kita ngoding (panduan teknisnya ada di `PANDUAN-IMPLEMENTASI.md`).

---

## 1. Masalah yang mau diselesaikan

Kamu bikin aplikasi, lalu ada orang mendaftar dengan email `budi@gmail.com`.

> Bagaimana kita tahu **yang daftar benar-benar Budi**, bukan orang iseng yang mengetik email Budi?

Jawabannya: kita kirim **kode rahasia** ke email itu. Kalau orangnya bisa menyebutkan kode itu balik, berarti dia memang bisa membuka inbox Budi. Kode itulah yang disebut **OTP** (*One-Time Password*, kata sandi sekali pakai).

**Analogi:** seperti kurir yang bilang "paketnya saya titip, tolong sebutkan 6 digit kode yang saya kirim ke HP kamu". Kalau kamu bisa menyebutkannya, berarti kamu memang pemilik HP itu.

## 2. Cerita lengkapnya

```
 Budi                    Aplikasi kita                   Inbox Budi
  │                           │                              │
  │ 1. "Aku mau daftar,       │                              │
  │     emailku budi@..."     │                              │
  │──────────────────────────▶│                              │
  │                           │ 2. buat kode acak "482913"   │
  │                           │    simpan (versi diacak)     │
  │                           │                              │
  │                           │ 3. kirim email ───────────────▶
  │                           │                              │
  │ 4. Budi buka inbox, lihat kode 482913                    │
  │                           │                              │
  │ 5. "Kodenya 482913"       │                              │
  │──────────────────────────▶│                              │
  │                           │ 6. cocokkan, hapus kodenya   │
  │ 7. "Oke, terverifikasi!"  │                              │
  │◀──────────────────────────│                              │
```

Hanya ada dua pekerjaan besar:
1. **Minta kode** (langkah 1–3)
2. **Cek kode** (langkah 5–7)

## 3. Siapa yang mengirim emailnya?

Email tidak dikirim "langsung dari aplikasi". Aplikasi kita **menitipkan** surat ke kantor pos email, lalu kantor pos itu yang mengantar.

```
 Aplikasi kita ──▶ Server SMTP (kantor pos) ──▶ Inbox Budi
                   misal: Gmail
```

- **SMTP** = aturan/bahasa yang dipakai untuk mengirim email. Seperti aturan standar pengiriman surat.
- Kita **tidak membangun kantor pos sendiri**. Terlalu rumit dan emailnya bakal dianggap spam. Kita cukup punya satu akun di kantor pos yang sudah ada (misalnya Gmail).
- Aplikasi kita ibarat orang yang datang ke kantor pos membawa kartu anggota (username + password), lalu bilang "tolong kirim surat ini".

### Apa itu akun "no-reply"?

Akun khusus untuk **mengirim saja**. Penerima tidak diharapkan membalas. Contoh: `no-reply@namaapp.com`. Kita bikin akun terpisah supaya email pribadi kita tidak terpakai dan tidak berisiko kalau passwordnya bocor.

## 4. Seperti apa kode OTP yang baik?

Kode OTP kelihatan sepele, tapi kalau dibuat asal-asalan gampang dibobol. Ada 6 aturan:

| Aturan | Artinya | Kalau dilanggar |
|---|---|---|
| **Acak betulan** | Tidak bisa ditebak pola-nya | Penyerang menebak kode berikutnya |
| **Ada masa berlaku** | Misal 5 menit, lewat itu hangus | Kode lama yang bocor bisa dipakai kapan saja |
| **Sekali pakai** | Setelah dipakai langsung dihapus | Kode yang sama dipakai berkali-kali |
| **Batas percobaan** | Misal salah 5 kali, kode hangus | Penyerang mencoba semua kemungkinan (000000–999999) sampai tembus |
| **Jeda minta ulang** | Misal tunggu 60 detik | Orang iseng membanjiri inbox seseorang dengan email |
| **Disimpan dalam bentuk diacak** | Lihat bagian 5 | Kalau data bocor, semua kode ikut bocor |

**Soal batas percobaan**, ini penting: kode 6 digit cuma punya 1 juta kemungkinan. Tanpa batas, komputer bisa mencoba semuanya dalam hitungan menit. Dengan batas 5 kali, peluang menebak jadi 5 banding 1.000.000.

## 5. Kenapa kode tidak disimpan apa adanya?

Bayangkan kita simpan kode `482913` di database, lalu database itu bocor. Penyerang tinggal baca kodenya.

Solusinya: simpan **versi acak yang tidak bisa dibalik** (disebut *hash*).

```
482913  ──[mesin pengacak + kunci rahasia]──▶  9f3a7c...e41b
```

- Mesin ini **searah**: dari `482913` bisa jadi `9f3a...`, tapi dari `9f3a...` tidak bisa kembali ke `482913`.
- Saat Budi mengetik kode, kita acak lagi dengan cara yang sama, lalu **bandingkan hasil acaknya**.
- Kalau hasilnya sama, berarti kodenya benar. Kita tidak pernah perlu menyimpan kode aslinya.

**Analogi:** sidik jari. Kita simpan sidik jarinya, bukan orangnya. Kalau ada yang datang, kita cocokkan sidik jarinya.

> Ini juga alasan kenapa password di aplikasi mana pun tidak boleh disimpan polos. Konsepnya sama.

## 6. Gambaran pembagian tugas (kenapa dibuat "modular")

Kita pecah program jadi beberapa bagian kecil, masing-masing **satu tugas**, seperti bagian-bagian di restoran:

```
┌─────────────────────────────────────────────┐
│  PELAYAN  (HTTP)                            │
│  Menerima permintaan dari luar, cek apakah  │
│  boleh masuk, lalu meneruskan ke dapur.     │
└──────────────────┬──────────────────────────┘
                   ▼
┌─────────────────────────────────────────────┐
│  KOKI  (OTP Service)                        │
│  Otak-nya. Tahu aturan: buat kode, cek      │
│  masa berlaku, hitung percobaan.            │
└────────┬────────────────────┬───────────────┘
         ▼                    ▼
┌─────────────────┐   ┌──────────────────────┐
│ KURIR (Mailer)  │   │ LEMARI (Store)       │
│ Mengantar email │   │ Menyimpan kode       │
└─────────────────┘   └──────────────────────┘
```

**Keuntungannya:** setiap bagian bisa diganti tanpa mengganggu yang lain.

| Mau ganti | Yang berubah | Yang tidak disentuh |
|---|---|---|
| Gmail → penyedia email lain | Kurir | Koki, Lemari, Pelayan |
| Simpan di memori → database | Lemari | Koki, Kurir, Pelayan |
| Web → aplikasi mobile | Pelayan | Koki, Kurir, Lemari |

Koki **tidak peduli** kurirnya naik motor atau mobil. Dia cuma bilang "antar ini", dan itu sudah cukup. Prinsip ini dikenal dengan istilah *interface*, tapi untuk sekarang cukup paham analoginya.

**Bonus:** saat menguji koki, kita bisa pakai **kurir bohongan** yang tidak benar-benar mengirim email. Jadi pengujian tidak perlu internet dan tidak spam inbox siapa pun.

## 7. Keamanan: pelajaran dari "apa yang bisa salah"

Cara terbaik memahami keamanan: bayangkan kamu penjahatnya.

| Serangan | Cara kita mencegah |
|---|---|
| Menebak kode satu per satu | Batas percobaan |
| Memakai kode yang sudah bocor kemarin | Masa berlaku + sekali pakai |
| Membuat server kita jadi mesin spam | Wajib kunci API + jeda minta ulang + batas request per IP |
| Mencuri password akun email dari kode | Password disimpan di file rahasia `.env`, tidak masuk ke kode, tidak di-commit |
| Mencuri kode dari database | Kode disimpan dalam bentuk acak |
| Mencuri kode dari file log | Kode OTP tidak pernah dicatat di log |
| Memakai kode untuk tujuan lain | Kode terikat ke email **dan** tujuan (login, reset password, dst.) |

Satu pelajaran besar: **tidak ada satu pengaman yang cukup**. Kita pasang beberapa lapis, jadi kalau satu lapis jebol, masih ada lapis lainnya.

## 8. Dua hal yang sering membingungkan pemula

**"Kenapa pakai App Password, bukan password Gmail saya?"**
App Password adalah password khusus untuk satu aplikasi. Kalau bocor, kamu cukup mencabut yang itu saja tanpa mengganti password Gmail utama. Seperti kunci cadangan yang bisa kamu buang sendiri.

**"Kenapa email kadang masuk spam?"**
Penyedia email curiga pada pengirim baru. Akun yang masih baru, belum punya reputasi, sering masuk spam dulu. Semakin sering dipakai dan ditandai "bukan spam", semakin dipercaya.

## 9. Batasan versi belajar ini

Versi sederhana ini bagus untuk memahami konsep, tapi belum siap untuk dipakai besar-besaran:

- **Kode disimpan di memori**, jadi hilang kalau program dimatikan.
- **Gmail ada batas ±500 email per hari.**
- **Belum menangani banyak server sekaligus.**

Itu bukan kesalahan. Itu pilihan sadar supaya belajar tidak ribet dulu. Cara memperbaikinya ada di tugas lanjutan panduan teknis.

## 10. Cek pemahamanmu

Jawab dengan kata-katamu sendiri, tanpa melihat materi:

1. Apa bedanya **OTP** dengan password biasa?
2. Kenapa kita tidak membuat server email sendiri?
3. Kenapa kode OTP harus punya masa berlaku **dan** batas percobaan? Bukankah salah satunya cukup?
4. Kalau database kita bocor, kenapa penyerang tetap tidak bisa memakai kode OTP yang ada?
5. Kalau besok kita ganti dari Gmail ke penyedia email lain, bagian mana saja yang harus diubah? Kenapa?
6. Bayangkan kamu penjahat dan tidak ada batas jeda minta ulang. Apa yang bisa kamu lakukan ke orang yang tidak kamu sukai?

**Diskusi kelas:** apakah OTP lewat email lebih aman atau kurang aman dibanding OTP lewat SMS? Argumen apa yang bisa kamu berikan untuk masing-masing?

## 11. Kosakata singkat

| Istilah | Arti sederhana |
|---|---|
| **OTP** | Kode rahasia sekali pakai untuk membuktikan identitas |
| **SMTP** | Aturan standar untuk mengirim email |
| **Server SMTP** | "Kantor pos" yang mengantarkan email kita |
| **No-reply** | Akun email khusus mengirim, bukan untuk dibalas |
| **Hash** | Versi acak searah dari suatu data |
| **TTL / masa berlaku** | Berapa lama sesuatu boleh dipakai sebelum hangus |
| **Rate limit** | Pembatasan seberapa sering sesuatu boleh diminta |
| **API** | Pintu yang dibuka aplikasi supaya bisa dipanggil program lain |
| **API key** | "Kartu akses" untuk memakai API itu |
| **Modular** | Dipecah jadi bagian-bagian kecil dengan satu tugas masing-masing |
| **`.env`** | File rahasia berisi pengaturan dan password, jangan pernah dibagikan |

---

## Setelah paham konsep, langkah berikutnya

Kalau semua pertanyaan di bagian 10 sudah bisa kamu jawab, lanjut ke **`PANDUAN-IMPLEMENTASI.md`** untuk membangunnya langkah demi langkah dengan TypeScript.

---

# Implementasi di Frontend (HTML + JS Native)

Kamu tidak perlu membuat server. Sudah ada **service OTP** yang mengirim email dan mengecek kode. Tugasmu: bikin halaman web (HTML + JavaScript native) yang **memanggil service itu**.

Aturan yang dijaga service (kamu tidak perlu membuatnya, tapi harus tahu supaya tampilanmu masuk akal):

- Kode berlaku **5 menit**
- **Sekali pakai**
- Salah **5 kali** → kode hangus, harus minta baru
- Minta ulang harus menunggu **60 detik**

## Yang kamu butuhkan dari guru

| Info | Contoh | Dipakai untuk |
|---|---|---|
| Alamat service | `http://localhost:3001` | `baseUrl` |
| API key | `a1b2c3...` | `apiKey` |
| Alamat halamanmu didaftarkan di service | `http://127.0.0.1:5500` | izin CORS |

> **Jalankan halamanmu lewat Live Server** (VS Code), jangan klik dua kali file `.html`. Kalau dibuka sebagai `file://`, browser akan memblokir panggilan ke service.
>
> Alamat harus **persis sama** dengan yang didaftarkan. `localhost:5500` dan `127.0.0.1:5500` dianggap berbeda. Kalau tidak cocok, di Console browser muncul error **CORS**.

## Kontrak API

Semua panggilan: `POST`, body JSON, header `x-api-key`.

**Minta kode** `POST {baseUrl}/otp/request`
```json
{ "email": "budi@gmail.com", "purpose": "login" }
```

**Cek kode** `POST {baseUrl}/otp/verify`
```json
{ "email": "budi@gmail.com", "code": "482913", "purpose": "login" }
```

| Status | Isi respons | Artinya | Tampilkan ke user |
|---|---|---|---|
| `200` | `{ ok: true }` | Berhasil | Lanjut ke langkah berikutnya |
| `400` | `{ error }` | Input salah bentuk | Pesan dari `error` |
| `401` | `{ error }` | API key salah | (bug-mu) cek `config.js` |
| `422` | `code: "INVALID"` | Kode salah | "Kode salah" |
| `422` | `code: "EXPIRED"` | Kedaluwarsa / tidak ada | "Kode kedaluwarsa, kirim ulang" |
| `422` | `code: "TOO_MANY_ATTEMPTS"` | Salah terlalu sering | "Kirim ulang kode" |
| `429` | `code: "COOLDOWN"`, `retryAfterSeconds` | Minta ulang terlalu cepat | "Tunggu N detik" |
| `429` | tanpa `code` | Terlalu banyak request | "Coba lagi sebentar" |
| `502` | `{ error }` | Email gagal terkirim | "Gagal kirim email, coba lagi" |

`purpose` itu label tujuan (`login`, `daftar`, `reset`, ...). Kode untuk satu tujuan tidak berlaku untuk tujuan lain. **Pakai nilai yang sama** di `request` dan `verify`.

## Langkah implementasi

Struktur folder:

```
otp-demo/
├── index.html
├── config.js
├── otp-api.js     # bicara dengan service (bagian yang bisa dipakai ulang)
└── app.js         # urusan tampilan
```

### 1. `config.js`

```js
const OTP_CONFIG = {
  baseUrl: 'http://localhost:3001',
  apiKey: 'ISI_DARI_GURU',
  purpose: 'login',
};
```

### 2. `otp-api.js`

Satu fungsi yang menangani semua panggilan. Hasilnya **selalu objek**, tidak pernah melempar error, jadi tampilan tinggal mengecek `ok`.

```js
async function otpCall(path, body) {
  let res;
  try {
    res = await fetch(`${OTP_CONFIG.baseUrl}/otp/${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': OTP_CONFIG.apiKey,
      },
      body: JSON.stringify({ ...body, purpose: OTP_CONFIG.purpose }),
    });
  } catch {
    // server mati, salah alamat, atau diblokir CORS
    return { ok: false, code: 'NETWORK', status: 0 };
  }
  const data = await res.json().catch(() => ({}));
  return { ...data, ok: res.ok && data.ok === true, status: res.status };
}

const requestOtp = (email) => otpCall('request', { email });
const verifyOtp = (email, code) => otpCall('verify', { email, code });

function otpErrorMessage(r) {
  if (r.code === 'NETWORK') return 'Server OTP tidak bisa dihubungi.';
  if (r.status === 401) return 'API key salah, cek config.js.';
  if (r.code === 'COOLDOWN') return `Tunggu ${r.retryAfterSeconds} detik sebelum minta kode lagi.`;
  if (r.status === 429) return 'Terlalu banyak permintaan, coba lagi sebentar.';
  if (r.code === 'INVALID') return 'Kode salah.';
  if (r.code === 'EXPIRED') return 'Kode kedaluwarsa. Kirim ulang kode.';
  if (r.code === 'TOO_MANY_ATTEMPTS') return 'Terlalu banyak salah. Kirim ulang kode.';
  if (r.status === 502) return 'Email gagal terkirim, coba lagi.';
  if (r.status === 400) return r.error ?? 'Input tidak valid.';
  return 'Terjadi kesalahan.';
}
```

### 3. `index.html`

```html
<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Verifikasi Email</title>
</head>
<body>
  <h1>Verifikasi Email</h1>

  <form id="form-email">
    <label>Email <input id="email" type="email" required autocomplete="email"></label>
    <button id="btn-send">Kirim kode</button>
  </form>

  <form id="form-code" hidden>
    <label>Kode 6 digit
      <input id="code" inputmode="numeric" maxlength="6" pattern="\d{6}" required autocomplete="one-time-code">
    </label>
    <button id="btn-verify">Verifikasi</button>
    <button id="btn-resend" type="button">Kirim ulang</button>
  </form>

  <p id="status" role="status"></p>
  <section id="success" hidden><h2>Email terverifikasi ✅</h2></section>

  <script src="config.js"></script>
  <script src="otp-api.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

### 4. `app.js`

```js
const $ = (id) => document.getElementById(id);
let currentEmail = '';
let timer;

function setStatus(text) {
  $('status').textContent = text; // textContent, bukan innerHTML
}

function startCountdown(seconds) {
  clearInterval(timer);
  const btn = $('btn-resend');
  let left = seconds;
  btn.disabled = true;
  btn.textContent = `Kirim ulang (${left})`;
  timer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(timer);
      btn.disabled = false;
      btn.textContent = 'Kirim ulang';
    } else {
      btn.textContent = `Kirim ulang (${left})`;
    }
  }, 1000);
}

async function sendCode(email) {
  $('btn-send').disabled = true;
  setStatus('Mengirim kode...');
  const r = await requestOtp(email);
  $('btn-send').disabled = false;

  if (r.code === 'COOLDOWN') startCountdown(r.retryAfterSeconds);
  if (!r.ok) return setStatus(otpErrorMessage(r));

  currentEmail = email;
  $('form-code').hidden = false;
  $('code').value = '';
  $('code').focus();
  startCountdown(60);
  setStatus(`Kode dikirim ke ${email}. Cek inbox (dan folder spam).`);
}

$('form-email').addEventListener('submit', (e) => {
  e.preventDefault();
  sendCode($('email').value.trim());
});

$('btn-resend').addEventListener('click', () => sendCode(currentEmail));

$('form-code').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('btn-verify').disabled = true;
  const r = await verifyOtp(currentEmail, $('code').value.trim());
  $('btn-verify').disabled = false;

  if (!r.ok) return setStatus(otpErrorMessage(r));

  setStatus('');
  $('form-email').hidden = true;
  $('form-code').hidden = true;
  $('success').hidden = false;
});
```

### 5. Coba

Buka lewat Live Server, lalu uji semuanya:

- [ ] Email benar → kode masuk inbox
- [ ] Kode benar → muncul "terverifikasi"
- [ ] Kode salah → pesan "Kode salah"
- [ ] Salah 5 kali → minta kirim ulang
- [ ] Klik "Kirim ulang" sebelum 60 detik → tombol terkunci dengan hitung mundur
- [ ] Pakai kode yang sama dua kali → kedaluwarsa
- [ ] Matikan service → muncul "tidak bisa dihubungi", halaman tidak rusak

## Batasan yang harus kamu pahami

Halaman HTML+JS hanya berjalan di browser user, dan user **bisa mengubah apa pun** di browsernya (lewat DevTools).

1. **API key kelihatan.** Siapa pun bisa "View Source" dan melihatnya. Untuk latihan ini tidak masalah, tapi **jangan pakai key yang sama untuk hal serius**, dan jangan upload `config.js` berisi key ke repo publik.
2. **"Terverifikasi" di frontend itu hanya tampilan.** Orang bisa membuka DevTools dan memunculkan section `success` tanpa kode apa pun. OTP baru benar-benar melindungi sesuatu kalau **server-mu sendiri** yang mengecek hasilnya sebelum memberi akses (data, akun, dsb.). Untuk belajar alurnya: cukup. Untuk aplikasi sungguhan: butuh backend.

---

# Untuk Claude

> Bagian ini ditulis untuk Claude. **Murid:** salin isinya ke file `CLAUDE.md` di root project-mu supaya Claude selalu membacanya.

## Konteks
Project ini adalah frontend **HTML + JavaScript native** (tanpa framework, tanpa bundler, tanpa npm). Fitur yang dibuat: verifikasi email dengan OTP lewat **service OTP yang sudah ada** (jangan dibuat ulang, jangan diubah).

## Kontrak service (sumber kebenaran)
- `POST {baseUrl}/otp/request` body `{ email, purpose }`
- `POST {baseUrl}/otp/verify` body `{ email, code, purpose }` (`code` = string 6 digit)
- Header wajib: `content-type: application/json` dan `x-api-key`
- Sukses: `200 { ok: true }`. Gagal: `{ ok: false, error, code? }`
- Kode status: `400` input salah, `401` API key salah, `422` verifikasi gagal (`code`: `INVALID` / `EXPIRED` / `TOO_MANY_ATTEMPTS`), `429` jeda atau rate limit (`code: "COOLDOWN"` + `retryAfterSeconds` untuk jeda), `502` email gagal terkirim
- Aturan di sisi service: kode berlaku 5 menit, sekali pakai, maksimal 5 salah, jeda minta ulang 60 detik. Frontend tidak boleh mencoba menggantikan aturan ini.
- `purpose` harus **sama** antara `request` dan `verify`.

## Aturan implementasi
1. Tetap pakai HTML + JS native: `fetch`, `async/await`, `<script src>` biasa. **Jangan** menambah framework, TypeScript, bundler, atau library untuk fitur ini.
2. Pisahkan: `config.js` (baseUrl, apiKey, purpose), `otp-api.js` (semua `fetch` ke service), `app.js` (DOM/tampilan). Kode di `app.js` tidak boleh memanggil `fetch` langsung.
3. Fungsi API **tidak melempar error**. Selalu kembalikan objek `{ ok, status, code?, error? }`. Kegagalan jaringan (termasuk CORS) dikembalikan sebagai `code: "NETWORK"`.
4. Tangani **setiap** status di tabel kontrak dengan pesan Bahasa Indonesia yang jelas untuk user. Pakai `code` untuk membedakan 422 dan 429, bukan mencocokkan teks `error`.
5. Tampilkan pesan dengan `textContent`, **bukan** `innerHTML` (hindari XSS).
6. Nonaktifkan tombol saat request berjalan (cegah klik ganda). Tombol "Kirim ulang" dikunci dengan hitung mundur; untuk `COOLDOWN` pakai `retryAfterSeconds`.
7. Input kode: `inputmode="numeric"`, `maxlength="6"`, `autocomplete="one-time-code"`. Validasi 6 digit di sisi klien hanya untuk kenyamanan, service tetap yang memutuskan.
8. **Jangan** menyimpan kode OTP di `localStorage`/`sessionStorage`/cookie, dan jangan `console.log` kode atau API key.
9. Jangan men-commit API key asli. `config.js` berisi placeholder `ISI_DARI_GURU` kecuali murid sudah mengisinya secara lokal.
10. Jangan "memperbaiki" error CORS dengan trik di frontend (proxy publik, `mode: 'no-cors'`). Itu bukan masalah kode: penyebabnya hampir selalu alamat halaman tidak cocok dengan yang didaftarkan di service. Beri tahu murid untuk memeriksa alamat Live Server-nya dan memberi tahu gurunya.

## Hal yang harus dijelaskan Claude ke murid
- Setiap kali murid menjalankan sesuatu, jelaskan **apa yang dilakukan dan kenapa** dalam bahasa sederhana. Murid sedang belajar konsep, bukan sekadar mencari kode jadi.
- Sampaikan dua batasan di atas (API key terlihat di browser, dan "terverifikasi" di frontend hanya tampilan) kalau murid bertanya soal keamanan, atau kalau ia akan memakai hasil verifikasi untuk melindungi data sungguhan.

## Definisi selesai
Seluruh checklist di langkah "Coba" lolos, dan tidak ada error merah di Console browser pada alur normal maupun saat service dimatikan.

## Contoh prompt untuk murid
```
Baca CLAUDE.md. Tambahkan verifikasi email OTP ke halaman pendaftaran
di register.html. Setelah kode benar, aktifkan tombol "Daftar".
Jelaskan setiap perubahan yang kamu buat.
```
