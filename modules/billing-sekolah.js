/**
 * Project: Billing Sekolah (sub-modul dari billing.js)
 * Description: Pembuatan tagihan/invoice KELAS dengan alur 1-langkah.
 *              Invoice = jumlah_siswa x jumlah_pertemuan x tarif_per_sesi.
 *              TIDAK ada fase "deklarasi kontrak" tsb — form langsung terbitkan invoice.
 *              Dokumen: Invoice A4 standar institusi + Kwitansi resmi Indonesia.
 * Dipanggil oleh billing.js saat mode "Sekolah" aktif.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { supabaseUrl, supabaseKey } from '../assets/js/config.js';

const supabase = createClient(supabaseUrl, supabaseKey);

// --- STATE ---
let activeSchoolId = null;
let activeClassId = null;
let classesCache = [];
let schoolsCache = [];
let editingId = null;
let editingContract = null;   // snapshot kontrak yg sedang diedit
let styleInjected = false;
let teachersCache = [];       // [{id, name, role}] utk dropdown penanda tangan (Hormat Kami / Penerima Pembayaran)
let signerId = '';
let signerName = '';

/* ======================================================
   KONFIGURASI PENERBIT (KOP INVOICE) & PEMBAYARAN
   Sesuaikan data resmi Robopanda di sini.
   Logo diambil dari index.html (brand kanonik Robopanda).
   ====================================================== */
const ISSUER = {
    name: 'Robopanda',
    tagline: 'Robotic Education & Workshop',
    logo: 'https://res.cloudinary.com/dmm6avtxd/image/upload/v1787501406/Robopanda-Robotic_wwr2jb.png',
    address: '',                        // <-- isi alamat operasional (opsional)
    tel: '',                            // <-- isi nomor telepon (opsional)
    email: 'admin@robopanda.id',
    website: 'portal.robopanda.my.id'
};
const PAYMENT = {
    due_in_days: 30,                    // jatuh tempo = tanggal terbit + N hari
    method: 'Transfer Bank / QRIS',
    bank: 'Bank Mandiri / BCA',         // <-- isi nama bank resmi
    account_name: 'Robopanda',          // <-- atas nama rekening
    account_no: '(isi nomor rekening)'  // <-- isi nomor rekening
};

// --- State modal pembayaran ---
let bayarInvoiceId = null;

// ==========================================
// 1. INIT (dipanggil billing.js)
// ==========================================
export async function initSekolah(container) {
    injectStyles();

    container.innerHTML = `
        <div style="display:flex; justify-content:flex-end; margin-bottom:14px;">
            <button id="bs-add" class="bp-btn-primary">
                <i class="fas fa-plus"></i> + Buat Tagihan / Invoice
            </button>
        </div>

        <div class="bp-tabs card" id="bs-school-tabs">
            <div class="bp-tabs-label">SEKOLAH</div>
            <div class="bp-tabs-list"></div>
        </div>

        <div class="bp-tabs card" id="bs-class-tabs">
            <div class="bp-tabs-label">KELAS</div>
            <div class="bp-tabs-list"></div>
        </div>

        <div id="bs-result">
            <p class="card" style="color:#94a3b8;text-align:center;">Memuat data...</p>
        </div>

        <div id="bs-modal" class="bp-modal" style="display:none;">
            <div class="bp-modal-box card" style="max-width:680px;">
                <h3 id="bs-modal-title">Buat Tagihan / Invoice</h3>
                <div class="bp-form-grid">
                    <label>Kelas
                        <select id="bs-f-class" class="bp-input"></select>
                    </label>
                    <label>Periode / Keterangan
                        <input id="bs-f-label" class="bp-input" placeholder="mis. September 2026 / Semester Ganjil">
                    </label>
                    <label>Jumlah Siswa Aktif
                        <input id="bs-f-anak" type="number" class="bp-input" min="1" required>
                        <span class="bs-field-hint" id="bs-hint-anak"></span>
                    </label>
                    <label>Jumlah Pertemuan
                        <input id="bs-f-jumlah" type="number" class="bp-input" min="1" required>
                        <span class="bs-field-hint" id="bs-hint-jumlah"></span>
                    </label>
                    <label>Tarif per Siswa per Pertemuan (Rp)
                        <input id="bs-f-price" type="number" class="bp-input" min="0" required>
                        <span class="bs-field-hint">Dilengkapi kalkulator paket di bawah (opsional)</span>
                    </label>
                    <div class="bs-paket-box">
                        <span class="bs-paket-title">Kalkulator Paket:</span>
                        <input id="bs-f-paket" type="number" class="bp-input" min="0"
                               placeholder="Total paket — mis. 80.000" style="flex:1; min-width:110px;">
                        <span style="color:#64748b; font-weight:700;">/</span>
                        <input id="bs-f-paket-sesi" type="number" class="bp-input" min="1" value="4"
                               placeholder="sesi" style="width:72px;">
                        <span class="bs-field-hint" id="bs-f-paket-hint">mis. Rp 80.000 / 4 sesi = Rp 20.000 / sesi</span>
                    </div>
                    <div style="grid-column:1/-1;">
                        <div class="bs-total-box">
                            <span>Total Tagihan</span>
                            <b id="bs-f-total">Rp 0</b>
                        </div>
                    </div>
                </div>
                <div class="bp-form-actions" style="margin-top:16px;">
                    <button id="bs-f-save" class="bp-btn-primary">Simpan & Terbitkan</button>
                    <button id="bs-f-cancel" class="bp-btn-secondary">Batal</button>
                </div>
            </div>
        </div>

        <div id="bs-modal-bayar" class="bp-modal" style="display:none;">
            <div class="bp-modal-box card" style="max-width:420px;">
                <h3>Update Pembayaran</h3>
                <div class="bp-form-grid" style="grid-template-columns:1fr;">
                    <label>Status Pembayaran
                        <select id="bs-f-status-lunas" class="bp-input">
                            <option value="belum">Belum Lunas</option>
                            <option value="lunas">Lunas</option>
                        </select>
                    </label>
                    <label>Tanggal Pembayaran
                        <input type="date" id="bs-f-tanggal-bayar" class="bp-input">
                    </label>
                    <label>Metode Pembayaran
                        <select id="bs-f-metode-bayar" class="bp-input">
                            <option value="Transfer Bank">Transfer Bank</option>
                            <option value="Tunai">Tunai</option>
                            <option value="QRIS">QRIS</option>
                        </select>
                    </label>
                    <label>No. Ref / Bukti
                        <input type="text" id="bs-f-ref-bayar" class="bp-input" placeholder="Opsional">
                    </label>
                </div>
                <p class="bs-field-hint" style="margin:6px 0 2px;">
                    Tandai <b>Lunas</b> = tombol <b>Cetak Kwitansi</b> langsung aktif di daftar tagihan.
                </p>
                <div class="bp-form-actions" style="margin-top:14px;">
                    <button id="bs-f-save-bayar" class="bp-btn-primary">Update</button>
                    <button id="bs-f-cancel-bayar" class="bp-btn-secondary">Batal</button>
                </div>
            </div>
        </div>
    `;

    // --- WIRING EVENTS ---
    document.getElementById('bs-add').onclick = openDeclare;
    document.getElementById('bs-f-cancel').onclick = closeModal;
    document.getElementById('bs-f-save').onclick = saveContract;
    document.getElementById('bs-f-cancel-bayar').onclick = closeBayarModal;
    document.getElementById('bs-f-save-bayar').onclick = saveBayar;

    // Total realtime: siswa × pertemuan × tarif
    ['bs-f-anak', 'bs-f-jumlah', 'bs-f-price'].forEach(id => {
        document.getElementById(id).addEventListener('input', calcModalTotal);
    });
    // Kalkulator paket -> tarif / sesi
    ['bs-f-paket', 'bs-f-paket-sesi'].forEach(id => {
        document.getElementById(id).addEventListener('input', calcPaketHint);
    });
    // Ganti kelas saat form buat baru -> auto-detect siswa aktif & pertemuan kalendar
    document.getElementById('bs-f-class').addEventListener('change', (e) => {
        if (editingId || !e.target.value) return;
        autofillClassDefaults(e.target.value);
    });

    classesCache = await fetchActiveClasses();
    deriveSchools();
    renderSchoolTabs();
}

// ==========================================
// 2. CSS TAMBAHAN (sekali saja)
// ==========================================
function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;
    const css = `
        .bs-field-hint { font-size:.7rem; color:#64748b; font-weight:500; }
        .bs-paket-box { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
        .bs-paket-title { font-size:.74rem; font-weight:700; color:#475569; }
        .bs-total-box { display:flex; justify-content:space-between; align-items:center; padding:12px 16px;
                        background:#1e293b; color:#fff; border-radius:10px; }
        .bs-total-box span { font-size:.85rem; font-weight:700; letter-spacing:.04em; text-transform:uppercase; }
        .bs-total-box b { font-size:1.3rem; font-weight:900; }

        /* ============ INVOICE A4 — KOP SURAT INSTITUSI ============ */
        .bs-inv-paper { background:#fff; width:min(820px,94vw); min-height:1150px; max-height:88vh; overflow:auto;
                        padding:42px 50px; border-radius:10px; font-family:'Helvetica Neue', Helvetica, Arial, sans-serif;
                        color:#111827; box-shadow:0 10px 25px rgba(0,0,0,0.1); box-sizing:border-box; }
        .bs-inv-top { display:flex; justify-content:space-between; align-items:center; gap:18px; }
        .bs-inv-brand { display:flex; gap:16px; align-items:center; }
        .bs-inv-brand-logo { width:76px; height:76px; object-fit:contain; }
        .bs-inv-brand-name { font-size:21px; font-weight:800; color:#111827; line-height:1.15;
                             text-transform:uppercase; letter-spacing:.06em; }
        .bs-inv-brand-sub { font-size:.74rem; color:#4b5563; margin-top:2px; }
        .bs-inv-contact { font-size:.74rem; color:#4b5563; text-align:right; line-height:1.65; }
        .bs-inv-rule { border-top:3px solid #1e293b; margin-top:14px; }
        .bs-inv-rule2 { border-top:1px solid #94a3b8; margin-top:4px; }

        .bs-inv-headrow { display:flex; justify-content:space-between; align-items:flex-end; margin-top:26px; }
        .bs-inv-title h1 { margin:0; font-size:26px; font-weight:800; color:#111827;
                           text-transform:uppercase; letter-spacing:3px; }
        .bs-inv-title .sub { font-size:.8rem; letter-spacing:2px; color:#4b5563; margin-top:2px; text-transform:uppercase; }
        .bs-inv-meta { text-align:right; font-size:.85rem; color:#111827; line-height:1.7; }
        .bs-inv-meta .lbl { color:#6b7280; font-size:.76rem; }
        .bs-inv-meta b { font-weight:800; }
        .bs-inv-status { display:inline-block; padding:3px 12px; border-radius:14px; font-size:.74rem; font-weight:700; }
        .bs-inv-status.paid { background:#dcfce7; color:#15803d; }
        .bs-inv-status.unpaid { background:#fef3c7; color:#92400e; }

        .bs-inv-cap { font-size:.72rem; text-transform:uppercase; letter-spacing:1.5px; color:#6b7280;
                      font-weight:700; margin-bottom:8px; }
        .bs-inv-billto { margin:26px 0 0; font-size:.9rem; line-height:1.55; }
        .bs-inv-billto b { font-size:1.15rem; color:#111827; }
        .bs-inv-billto .prog { display:block; margin-top:8px; font-size:.86rem; color:#334155; }
        .bs-inv-billto .line { color:#4b5563; }

        .bs-inv-table { width:100%; border-collapse:collapse; margin-top:26px; font-size:.88rem; }
        .bs-inv-table th { background:#f8fafc; color:#334155; padding:10px 12px; text-align:left; font-size:.74rem;
                           text-transform:uppercase; letter-spacing:1px; border-top:2px solid #1e293b; border-bottom:1px solid #cbd5e1; }
        .bs-inv-table td { border-bottom:1px solid #e2e8f0; padding:13px 12px; vertical-align:top; }
        .bs-inv-table .num { text-align:right; white-space:nowrap; }
        .bs-inv-table .ctr { text-align:center; }
        .bs-inv-desc-sub { display:block; color:#6b7280; font-size:.76rem; margin-top:2px; }
        .bs-inv-total-row td { font-weight:800; color:#111827; border-top:2px solid #1e293b; }
        .bs-inv-total-lbl { text-align:right; text-transform:uppercase; letter-spacing:1px; font-size:.82rem; }
        .bs-inv-total-amt { font-size:1.3rem; }

        .bs-inv-terbilang { margin-top:18px; font-size:.92rem; padding:10px 14px; background:#f1f5f9; border-left:5px solid #1e293b; }
        .bs-inv-terbilang b { font-style:italic; }
        .bs-inv-note { margin-top:10px; font-size:.84rem; color:#334155; }
        .bs-inv-note i { display:block; color:#64748b; font-size:.78rem; margin-top:2px; }

        /* === INVOICE — KOTAK PEMBAYARAN & TANDA TANGAN === */
        .bs-inv-bottom { display:flex; justify-content:space-between; gap:28px; margin-top:40px; align-items:flex-start; }
        .bs-inv-paybox { width:46%; font-size:.85rem; line-height:1.7; }
        .bs-inv-paybox .row { padding:7px 6px; display:flex; justify-content:space-between; }
        .bs-inv-paybox .row b { color:#111827; }
        .bs-inv-places { width:48%; text-align:center; font-size:.86rem; }
        .bs-inv-sign-space { height:74px; }
        .bs-inv-nm { display:inline-block; min-width:230px; border-bottom:1px solid #111827; }

        /* ============ KWITANSI — FORMAT TANDA TERIMA RESMI INDONESIA ============ */
        .bs-kw-paper { background:#fff; width:min(820px,94vw); min-height:1050px; max-height:88vh; overflow:auto;
                       padding:42px 50px; border-radius:10px; font-family:'Helvetica Neue', Helvetica, Arial, sans-serif;
                       color:#111827; box-shadow:0 10px 25px rgba(0,0,0,0.1); box-sizing:border-box; }
        .bs-kw-head { display:flex; justify-content:space-between; align-items:center; gap:18px; }
        .bs-kw-brand { display:flex; gap:12px; align-items:center; }
        .bs-kw-brand-logo { width:62px; height:62px; object-fit:contain; }
        .bs-kw-brand-name { font-size:17px; font-weight:800; color:#111827; text-transform:uppercase; letter-spacing:.05em; }
        .bs-kw-brand-sub { font-size:.72rem; color:#4b5563; }
        .bs-kw-title { text-align:right; }
        .bs-kw-title h1 { margin:0; font-size:24px; font-weight:800; color:#111827; letter-spacing:2px; text-transform:uppercase; }
        .bs-kw-title .no { font-size:.84rem; color:#374151; margin-top:6px; font-weight:700; }
        .bs-kw-rule { border-top:3px double #1e293b; margin-top:10px; }
        .bs-kw-body { margin-top:30px; font-size:1rem; }
        .bs-kw-row { display:flex; gap:14px; align-items:flex-start; margin-bottom:16px; }
        .bs-kw-lbl { width:215px; flex-shrink:0; color:#374151; font-weight:700; }
        .bs-kw-val { flex:1; min-height:40px; border-bottom:1px dotted #9ca3af; padding:6px 8px; color:#111827; }
        .bs-kw-val .detail { display:block; color:#6b7280; font-size:.84rem; margin-top:2px; }
        .bs-kw-terbilang { font-style:italic; font-weight:800; font-size:1.05rem; background:#f3f4f6;
                           border-radius:7px; padding:8px 14px; }
        .bs-kw-bottom { display:grid; grid-template-columns:1fr 1fr; gap:36px; margin-top:48px; }
        .bs-kw-amount .bs-inv-cap { margin-bottom:12px; }
        .bs-kw-amount-val { font-size:1.5rem; font-weight:900; background:#111827; color:#fff;
                            padding:12px 22px; border-radius:8px; display:inline-block; }
        .bs-kw-sign { text-align:center; font-size:.86rem; }
        .bs-kw-nm { display:inline-block; min-width:210px; border-bottom:1px solid #111827; }
        .bs-kw-foot { margin-top:24px; text-align:center; font-size:.74rem; color:#9ca3af; border-top:1px solid #e2e8f0; padding-top:10px; }

        /* === TOOLS (no print) === */
        .bs-sign-tools { display:flex; align-items:center; gap:10px; margin:26px 0 -6px; padding:8px 12px;
                         background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; }
        .bs-sign-tools label { font-size:.76rem; font-weight:700; color:#475569; }

        /* === PRINT (Ctrl+P / Save as PDF) === */
        @media print {
            @page { size:A4; margin:0; }
            body * { visibility:hidden !important; }
            #bs-inv-paper, #bs-inv-paper *, #bs-kw-paper, #bs-kw-paper * { visibility:visible !important; }
            #bs-inv-paper, #bs-kw-paper { position:absolute; left:0; top:0; width:100%;
                                          box-shadow:none !important; border-radius:0 !important; padding:20mm;
                                          min-height:auto !important; max-height:none !important; }
            .bs-no-print { display:none !important; }
        }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
}

// ==========================================
// 3. HELPERS
// ==========================================
const rupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const rupiahD = (n) => rupiah(n) + ',-';

function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function fmtDate(t) {
    if (!t) return '—';
    return new Date(t + 'T00:00:00').toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
}

function fmtDateTime(t) {
    if (!t) return '—';
    return new Date(t).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
}

function yyyymm(d) {
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Numbering urutan per bulan: INV/ROBO/YYYYMM/NNN (001, 002, ...)
// seq = count invoice yang tersimpan di bulan tsb + 1 (stabil di re-cetak).
async function docSeq(iv) {
    const d = iv.created_at ? new Date(iv.created_at) : new Date();
    const ym = yyyymm(d);
    const start = `${ym}-01T00:00:00`;
    const nd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const end = `${yyyymm(nd)}-01T00:00:00`;
    try {
        const { count } = await supabase.from('invoices_sekolah')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', start).lt('created_at', end);
        return (count || 0) + 1;
    } catch (e) {
        return 1;
    }
}

function invoiceNo(iv, seq) {
    const d = iv.created_at ? new Date(iv.created_at) : new Date();
    return `INV/ROBO/${yyyymm(d)}/${String(seq || 1).padStart(3, '0')}`;
}

function kwitansiNo(iv, seq) {
    const d = iv.created_at ? new Date(iv.created_at) : new Date();
    return `KWT/ROBO/${yyyymm(d)}/${String(seq || 1).padStart(3, '0')}`;
}

// Kalimat terbilang formal (pendekmasiano, adaptado del sistema existente)
function terbilangIDR(n) {
    const s = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
    function w(x) {
        x = Math.floor(Math.abs(x));
        if (x === 0) return '';
        if (x < 12) return s[x];
        if (x < 20) return w(x - 10) + ' Belas';
        if (x < 100) return w(Math.floor(x / 10)) + ' Puluh ' + w(x % 10);
        if (x < 200) return 'Seratus ' + w(x - 100);
        if (x < 1000) return w(Math.floor(x / 100)) + ' Ratus ' + w(x % 100);
        if (x < 2000) return 'Seribu ' + w(x - 1000);
        if (x < 1e6) return w(Math.floor(x / 1000)) + ' Ribu ' + w(x % 1000);
        if (x < 1e9) return w(Math.floor(x / 1e6)) + ' Juta ' + w(x % 1e6);
        if (x < 1e12) return w(Math.floor(x / 1e9)) + ' Miliar ' + w(x % 1e9);
        return String(x);
    }
    const words = w(n).trim().replace(/\s+/g, ' ');
    return words ? words + ' Rupiah' : 'Nol Rupiah';
}

window.bsPrintInvoice = () => window.print();
window.bsCloseInvoice = () => document.getElementById('bs-inv-modal')?.remove();
window.bsPrintKwitansi = () => window.print();
window.bsCloseKwitansi = () => document.getElementById('bs-kw-modal')?.remove();

// ==========================================
// 4. HIERARKI SEKOLAH > KELAS
// ==========================================
// Kelas "aktif" = kelas pada Tahun Ajaran + Semester yang sedang AKTIF
// (mengikuti pola absensi-sekolah.js).
async function fetchActiveClasses() {
    const [{ data: ta }, { data: sem }] = await Promise.all([
        supabase.from('academic_years').select('id, year').eq('is_active', true).limit(1).maybeSingle(),
        supabase.from('semesters').select('id, name').eq('is_active', true).limit(1).maybeSingle()
    ]);

    let query = supabase.from('classes')
        .select('id, name, level, school_id, schools(name)')
        .order('name');

    if (ta && sem) {
        query = query.eq('academic_year_id', ta.id).eq('semester_id', sem.id);
    }
    // Fallback: bila periode aktif belum diset di Pengaturan,
    // tampilkan semua kelas agar modul tetap bisa digunakan.

    const { data, error } = await query;
    if (error) {
        console.error('Gagal memuat kelas sekolah:', error.message);
        return [];
    }
    return data || [];
}

// Turunkan daftar sekolah unik dari kelas-kelas aktif tersebut
function deriveSchools() {
    const seen = new Set();
    schoolsCache = [];
    classesCache.forEach(c => {
        if (!c.school_id || seen.has(c.school_id)) return;
        seen.add(c.school_id);
        schoolsCache.push({ id: c.school_id, name: c.schools?.name || 'Sekolah' });
    });
}

function renderSchoolTabs() {
    const list = document.querySelector('#bs-school-tabs .bp-tabs-list');
    if (!list) return;

    if (schoolsCache.length === 0) {
        list.innerHTML = '<span class="bp-tab-empty">Tidak ada sekolah dengan kelas aktif.</span>';
        document.querySelector('#bs-class-tabs .bp-tabs-list').innerHTML =
            '<span class="bp-tab-empty">—</span>';
        return;
    }

    list.innerHTML = schoolsCache.map(s => `
        <button class="bp-tab ${s.id === activeSchoolId ? 'active' : ''}"
                data-id="${s.id}"
                onclick="window.bsActivateSchool('${s.id}')">
            ${esc(s.name)}
        </button>
    `).join('');

    // auto-aktifkan sekolah pertama bila belum valid
    if (!activeSchoolId || !schoolsCache.some(s => s.id === activeSchoolId)) {
        activateSchool(schoolsCache[0].id);
    } else {
        renderClassTabs();
    }
}

function renderClassTabs() {
    const list = document.querySelector('#bs-class-tabs .bp-tabs-list');
    if (!list) return;

    // kelas milik SEKOLAH yang sedang dipilih saja
    const schoolClasses = classesCache.filter(c => c.school_id === activeSchoolId);

    if (schoolClasses.length === 0) {
        list.innerHTML = '<span class="bp-tab-empty">Tidak ada kelas aktif di sekolah ini.</span>';
        return;
    }

    list.innerHTML = schoolClasses.map(c => `
        <button class="bp-tab ${c.id === activeClassId ? 'active' : ''}"
                data-id="${c.id}"
                onclick="window.bsActivateClass('${c.id}')">
            ${esc(c.name)}
        </button>
    `).join('');
}

async function activateSchool(id) {
    activeSchoolId = id;
    activeClassId = null;   // reset kelas saat ganti sekolah

    document.querySelectorAll('#bs-school-tabs .bp-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.id === id);
    });

    renderClassTabs();

    // auto-aktifkan kelas pertama dari sekolah tsb
    const first = classesCache.find(c => c.school_id === id);
    if (first) await activateClass(first.id);
    else await loadClassData();
}
window.bsActivateSchool = activateSchool;

async function activateClass(id) {
    activeClassId = id;
    document.querySelectorAll('#bs-class-tabs .bp-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.id === id);
    });
    await loadClassData();
}
window.bsActivateClass = activateClass;

// ==========================================
// 5. DAFTAR TAGIHAN (rekap per kelas)
// ==========================================
async function loadClassData() {
    const box = document.getElementById('bs-result');
    if (!box) return;
    if (!activeClassId) {
        box.innerHTML = '<p class="card" style="color:#94a3b8;text-align:center;">Pilih kelas untuk melihat tagihan.</p>';
        return;
    }

    const { data: invoices } = await supabase.from('invoices_sekolah')
        .select('*, billing_periods_sekolah(*)')
        .eq('class_id', activeClassId)
        .order('created_at', { ascending: false });

    if (!invoices || invoices.length === 0) {
        box.innerHTML = '<p class="card" style="color:#94a3b8;text-align:center;">Belum ada tagihan untuk kelas ini — klik "+ Buat Tagihan / Invoice" di kanan atas.</p>';
        return;
    }

    const seqs = await Promise.all(invoices.map(iv => docSeq(iv)));

    const rows = invoices.map((iv, i) => {
        const invNo = invoiceNo(iv, seqs[i]);
        const clsName = classesCache.find(c => c.id === iv.class_id)?.name || '—';
        const schName = schoolsCache.find(s => s.id === iv.school_id)?.name || '—';
        const isLunas = iv.status_lunas === 'lunas';
        const kwBtn = isLunas
            ? `<button class="bp-btn-edit" onclick="window.bsOpenKwitansi('${iv.period_id}')" title="Cetak kwitansi resmi">
                 <i class="fas fa-receipt"></i> Kwitansi</button>`
            : `<button class="bp-btn-edit" disabled title="Tandai LUNAS dulu agar kwitansi siap cetak" style="opacity:.45;cursor:not-allowed;">
                 <i class="fas fa-receipt"></i> Kwitansi</button>`;
        return `<tr>
            <td style="white-space:nowrap;"><b>${invNo}</b></td>
            <td>${esc(schName)}<br><span class="bp-meta">${esc(clsName)}</span></td>
            <td>${esc(iv.periode_label) || '—'}</td>
            <td class="bp-meta">${iv.jumlah_anak} sis × ${iv.jumlah_pertemuan} sesi × ${rupiah(iv.price_per_session)}</td>
            <td><b>${rupiah(iv.total)}</b></td>
            <td>${isLunas
                ? '<span class="bp-badge ok">Lunas</span>'
                : '<span class="bp-badge over">Belum Lunas</span>'}</td>
            <td style="white-space:nowrap;">
                <button class="bp-btn-edit" onclick="window.bsOpenInvoice('${iv.period_id}')" title="Lihat / cetak invoice">
                    <i class="fas fa-eye"></i> Lihat Invoice</button>
                ${kwBtn}
                <button class="bp-btn-edit" onclick="window.bsUpdateBayar('${iv.id}')" title="Update status pembayaran">
                    <i class="fas fa-money-bill"></i> Bayar</button>
                <button class="bp-btn-edit" onclick="window.bsEditContract('${iv.period_id}')" title="Edit tagihan">
                    <i class="fas fa-pen"></i></button>
                <button class="bp-btn-delete" onclick="window.bsDeleteContract('${iv.period_id}')" title="Hapus">
                    <i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');

    box.innerHTML = `
        <div class="card" style="margin-top:16px;">
            <h3 style="margin:0 0 10px;">🧾 Daftar Invoice Kelas Ini</h3>
            <table class="bp-date-table">
                <thead><tr>
                    <th>No. Invoice</th>
                    <th>Sekolah / Kelas</th>
                    <th>Periode</th>
                    <th>Rincian Hitungan</th>
                    <th>Total Tagihan</th>
                    <th>Status</th>
                    <th style="width:250px;">Aksi</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

// ==========================================
// 6. FORM BUAT TAGIHAN / INVOICE (1-langkah)
// ==========================================
function fillClassSelect() {
    const sel = document.getElementById('bs-f-class');
    const schoolClasses = classesCache.filter(c => c.school_id === activeSchoolId);
    sel.innerHTML = '<option value="">-- Pilih Kelas --</option>' +
        schoolClasses.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    return sel;
}

function calcModalTotal() {
    const anak = Number(document.getElementById('bs-f-anak').value) || 0;
    const jumlah = Number(document.getElementById('bs-f-jumlah').value) || 0;
    const price = Number(document.getElementById('bs-f-price').value) || 0;
    document.getElementById('bs-f-total').innerText = rupiah(anak * jumlah * price);
}

// Kalkulator paket: total paket / sesi per paket -> tarif/sesi
function calcPaketHint() {
    const paket = Number(document.getElementById('bs-f-paket').value) || 0;
    const sesi = Number(document.getElementById('bs-f-paket-sesi').value) || 1;
    const hint = document.getElementById('bs-f-paket-hint');
    const price = document.getElementById('bs-f-price');
    if (paket > 0 && sesi > 0) {
        const per = Math.round((paket / sesi) * 100) / 100;
        price.value = per;
        hint.textContent = `= ${rupiah(per)} / sesi`;
        document.getElementById('bs-f-price').dispatchEvent(new Event('input'));
    } else {
        hint.textContent = 'mis. Rp 80.000 / 4 sesi = Rp 20.000 / sesi';
    }
}

// Auto-detect siswa aktif & pertemuan upkaming (bisa diedit manual)
async function autofillClassDefaults(classId) {
    if (!classId) return;
    const anakHint = document.getElementById('bs-hint-anak');
    const jumlahHint = document.getElementById('bs-hint-jumlah');
    anakHint.textContent = 'Detekting...';
    jumlahHint.textContent = 'Detekting...';

    const today = new Date().toISOString().split('T')[0];
    const [{ count: anak }, { data: mtgs }] = await Promise.all([
        supabase.from('students').select('id', { count: 'exact', head: true })
            .eq('class_id', classId).eq('is_active', true),
        supabase.from('pertemuan_kelas').select('tanggal')
            .eq('class_id', classId)
            .gte('tanggal', today)
            .order('tanggal')
    ]);
    const upcoming = (mtgs || []).filter(m => m.tanggal >= today).length;

    document.getElementById('bs-f-anak').value = anak || 1;
    document.getElementById('bs-f-jumlah').value = upcoming || 4;
    anakHint.textContent = anak
        ? `${anak} siswa aktif dise dikelas`
        : 'Siswa aktif tidak tercatat — isi manual';
    jumlahHint.textContent = upcoming
        ? `${upcoming} pertemuan upkaming di kalendar kelas`
        : 'Belum pertemuan upkaming — default 4, bisa diedit';
    calcModalTotal();
}

async function openDeclare() {
    editingId = null;
    editingContract = null;
    document.getElementById('bs-modal-title').textContent = 'Buat Tagihan / Invoice';
    const sel = fillClassSelect();
    sel.disabled = false;
    sel.value = activeClassId || '';
    document.getElementById('bs-f-label').value = '';
    document.getElementById('bs-f-anak').value = '';
    document.getElementById('bs-f-jumlah').value = '';
    document.getElementById('bs-f-price').value = '';
    document.getElementById('bs-f-paket').value = '';
    document.getElementById('bs-f-paket-sesi').value = '4';
    calcPaketHint();
    calcModalTotal();
    document.getElementById('bs-modal').style.display = 'block';

    // Auto-fill berdasarkan kelas yang sedang aktif di tab
    if (activeClassId) await autofillClassDefaults(activeClassId);
}
window.bsOpenDeclare = openDeclare;

async function openEditContract(id) {
    const { data: bp } = await supabase.from('billing_periods_sekolah').select('*').eq('id', id).single();
    if (!bp) return alert('Kontrak tidak ditemukan.');
    editingId = bp.id;
    editingContract = bp;
    document.getElementById('bs-modal-title').textContent = `Edit Tagihan · ${bp.periode_label || bp.start_date}`;
    const sel = fillClassSelect();
    if (!sel.querySelector(`option[value="${bp.class_id}"]`)) {
        sel.insertAdjacentHTML('beforeend', `<option value="${bp.class_id}">(kelas non-aktif)</option>`);
    }
    sel.value = bp.class_id;
    sel.disabled = true;
    document.getElementById('bs-f-label').value = bp.periode_label || '';

    // Get existing invoice data
    const { data: inv } = await supabase.from('invoices_sekolah').select('*').eq('period_id', id).single();

    document.getElementById('bs-f-anak').value = inv ? inv.jumlah_anak : '';
    document.getElementById('bs-f-jumlah').value = inv ? inv.jumlah_pertemuan : (bp.contract_sessions || 4);
    document.getElementById('bs-f-price').value = inv ? inv.price_per_session : (bp.contract_price / bp.contract_sessions);
    document.getElementById('bs-hint-anak').textContent = '';
    document.getElementById('bs-hint-jumlah').textContent = '';

    calcPaketHint();
    calcModalTotal();
    document.getElementById('bs-modal').style.display = 'block';
}
window.bsEditContract = openEditContract;

function closeModal() {
    document.getElementById('bs-modal').style.display = 'none';
    editingId = null;
    editingContract = null;
}

async function saveContract() {
    const classId = document.getElementById('bs-f-class').value;
    const cls = classesCache.find(c => c.id === classId);
    const schoolId = cls?.school_id || editingContract?.school_id || null;
    const label = document.getElementById('bs-f-label').value || null;
    const anak = Number(document.getElementById('bs-f-anak').value) || 0;
    const jumlah = Number(document.getElementById('bs-f-jumlah').value) || 0;
    const price = Number(document.getElementById('bs-f-price').value) || 0;
    const total = anak * jumlah * price;

    if (!classId) return alert('Pilih kelas!');
    if (!schoolId) return alert('Sekolah untuk kelas ini tidak ditemukan.');
    if (anak <= 0 || jumlah <= 0 || price <= 0) return alert('Jumlah siswa, pertemuan, dan tarif harus lebih dari 0!');

    // Note: skema legacy memakai start/end date — gunakan hari ini.
    const today = new Date().toISOString().split('T')[0];

    const bpPayload = {
        class_id: classId,
        school_id: schoolId,
        periode_label: label,
        start_date: editingContract ? editingContract.start_date : today,
        end_date: editingContract ? editingContract.end_date : today,
        contract_price: price * jumlah, // legacy schema mapping
        contract_sessions: jumlah,
        jumlah_pertemuan: jumlah // new schema
    };

    let periodId = editingId;

    if (editingId) {
        const { error } = await supabase.from('billing_periods_sekolah').update(bpPayload).eq('id', editingId);
        if (error) return alert('Gagal update periode: ' + error.message);
    } else {
        const { data, error } = await supabase.from('billing_periods_sekolah').insert(bpPayload).select('id').single();
        if (error) return alert('Gagal buat periode: ' + error.message);
        periodId = data.id;
    }

    const invPayload = {
        period_id: periodId,
        school_id: schoolId,
        class_id: classId,
        periode_label: label,
        jumlah_anak: anak,
        jumlah_pertemuan: jumlah,
        price_per_session: price,
        total: total
    };

    if (editingId) {
        const { data: existingInv } = await supabase.from('invoices_sekolah').select('id').eq('period_id', editingId).maybeSingle();
        if (existingInv) {
            const { error } = await supabase.from('invoices_sekolah').update(invPayload).eq('period_id', editingId);
            if (error) return alert('Gagal update invoice: ' + error.message);
        } else {
            const { error } = await supabase.from('invoices_sekolah').insert(invPayload);
            if (error) return alert('Gagal terbitkan invoice: ' + error.message);
        }
    } else {
        const { error } = await supabase.from('invoices_sekolah').insert(invPayload);
        if (error) return alert('Gagal terbitkan invoice: ' + error.message);
    }

    closeModal();
    if (classId) await activateClass(classId);
    alert('Invoice diterbitkan! Siap membuka [Lihat Invoice] atau update pembayaran di daftar tagihan.');
}

// ==========================================
// 7. STATUS PEMBAYARAN (modal, bukan prompt)
// ==========================================
async function updateBayar(invId) {
    const { data: inv } = await supabase.from('invoices_sekolah').select('*').eq('id', invId).single();
    if (!inv) return alert('Invoice tidak ditemukan.');

    bayarInvoiceId = invId;
    document.getElementById('bs-f-status-lunas').value = inv.status_lunas === 'lunas' ? 'lunas' : 'belum';
    document.getElementById('bs-f-tanggal-bayar').value = inv.paid_at ? inv.paid_at.split('T')[0] : new Date().toISOString().split('T')[0];
    const methodSel = document.getElementById('bs-f-metode-bayar');
    const curMethod = inv.payment_method || 'Transfer Bank';
    methodSel.value = Array.from(methodSel.options).some(o => o.value === curMethod) ? curMethod : 'Transfer Bank';
    document.getElementById('bs-f-ref-bayar').value = inv.payment_ref || '';

    document.getElementById('bs-modal-bayar').style.display = 'block';
}
window.bsUpdateBayar = updateBayar;

function closeBayarModal() {
    document.getElementById('bs-modal-bayar').style.display = 'none';
    bayarInvoiceId = null;
}

async function saveBayar() {
    if (!bayarInvoiceId) return;

    const status = document.getElementById('bs-f-status-lunas').value;
    const payload = { status_lunas: status };

    if (status === 'lunas') {
        let tgl = document.getElementById('bs-f-tanggal-bayar').value;
        if (!tgl) tgl = new Date().toISOString().split('T')[0];
        payload.paid_at = tgl + 'T12:00:00Z'; // default noon UTC to avoid timezone boundary issues
        payload.payment_method = document.getElementById('bs-f-metode-bayar').value;
        payload.payment_ref = document.getElementById('bs-f-ref-bayar').value;
    } else {
        payload.paid_at = null;
        payload.payment_method = null;
        payload.payment_ref = null;
    }

    const { error } = await supabase.from('invoices_sekolah').update(payload).eq('id', bayarInvoiceId);
    if (error) return alert('Gagal update pembayaran: ' + error.message);

    closeBayarModal();
    if (activeClassId) await loadClassData();
}

async function deleteContract(id) {
    const { data: bp } = await supabase.from('billing_periods_sekolah').select('*').eq('id', id).single();
    if (!bp) return alert('Kontrak tidak ditemukan.');
    if (!confirm(`Hapus tagihan "${(bp.periode_label || bp.start_date)}" permanen?\nIni juga akan menghapus invoice dan kwitansi terkait.`)) return;

    const { error } = await supabase.from('billing_periods_sekolah').delete().eq('id', id);
    if (error) return alert('Gagal hapus: ' + error.message);
    await loadClassData();
}
window.bsDeleteContract = deleteContract;

// ==========================================
// 8. PENANDA TANGAN (nama guru / admin)
// ==========================================
async function fetchTeachers() {
    if (teachersCache.length) return teachersCache;
    const { data } = await supabase.from('teachers').select('id, name, role').order('name');
    teachersCache = data || [];
    return teachersCache;
}

function setSigner(id) {
    signerId = id;
    const t = teachersCache.find(x => x.id === id);
    signerName = t ? t.name : '';
    if (id) sessionStorage.setItem('bs_signer_id', id);
    document.querySelectorAll('.bs-signer-name').forEach(el => {
        el.textContent = signerName || ' ';
    });
}

async function populateSignerSelect(sel) {
    let list;
    try { list = await fetchTeachers(); } catch (e) { list = []; }
    if (!list.length) {
        sel.innerHTML = '<option value="">— daftar guru kosong —</option>';
        return;
    }
    sel.innerHTML = '<option value="">— pilih penanda tangan —</option>' +
        list.map(t => `<option value="${t.id}">${esc(t.name)}${t.role ? ' (' + esc(t.role) + ')' : ''}</option>`).join('');
    const saved = sessionStorage.getItem('bs_signer_id') || signerId || '';
    if (saved && list.some(t => t.id === saved)) {
        sel.value = saved;
        setSigner(saved);
    }
}

// ==========================================
// 9. KWITANSI — FORMAT TANDA TERIMA RESMI INDONESIA
// Bahar: Telah Diterima Dari / Uang Sejumlah (terbilang) /
//        Untuk Pembayaran → kotak JUMLAH + Penerima Pembayaran.
// ==========================================
function kwitansiHtml(iv, cls, sch, kwNo, invNo, paidDate, kwMethod, kwRef) {
    const total = Number(iv.total) || 0;
    const issuerName = esc(ISSUER.name);
    const issuerContact = [ISSUER.address, ISSUER.tel ? 'Telp. ' + ISSUER.tel : '',
        ISSUER.email, ISSUER.website].filter(Boolean).join(' · ');
    const payerLine = `${esc(sch?.name || '-')}${sch?.headmaster ? ' — ' + esc(sch.headmaster) : ''}`;
    const payerDetail = [sch?.address, sch?.phone ? 'Telp. ' + sch.phone : ''].filter(Boolean).join(' · ');

    return `
        <div class="bs-kw-head">
            <div class="bs-kw-brand">
                <img src="${esc(ISSUER.logo)}" alt="${issuerName}" class="bs-kw-brand-logo">
                <div>
                    <div class="bs-kw-brand-name">${issuerName}</div>
                    <div class="bs-kw-brand-sub">${esc(issuerContact) || '&nbsp;'}</div>
                </div>
            </div>
            <div class="bs-kw-title">
                <h1>KWITANSI PEMBAYARAN</h1>
                <div class="no">No. ${kwNo}</div>
            </div>
        </div>
        <div class="bs-kw-rule"></div>

        <div class="bs-kw-body">
            <div class="bs-kw-row">
                <span class="bs-kw-lbl">Telah Diterima Dari</span>
                <span class="bs-kw-val">${payerLine}
                    <span class="detail">${esc(payerDetail) || '&nbsp;'}</span></span>
            </div>
            <div class="bs-kw-row">
                <span class="bs-kw-lbl">Uang Sejumlah</span>
                <span class="bs-kw-val bs-kw-terbilang"># ${terbilangIDR(Math.round(total))} #</span>
            </div>
            <div class="bs-kw-row">
                <span class="bs-kw-lbl">Untuk Pembayaran</span>
                <span class="bs-kw-val">Pelunasan Invoice No. ${invNo}
                    <span class="detail">Biaya Les Robotika — ${esc(cls?.name) || '-'}${iv.periode_label ? ' (' + esc(iv.periode_label) + ')' : ''} ·
                        ${iv.jumlah_anak} siswa × ${iv.jumlah_pertemuan} pertemuan × ${rupiah(iv.price_per_session)}</span></span>
            </div>
            <div class="bs-kw-row">
                <span class="bs-kw-lbl">Metode Pembayaran</span>
                <span class="bs-kw-val">${esc(kwMethod)}${kwRef ? ' · Ref. ' + esc(kwRef) : ''}</span>
            </div>
        </div>

        <div class="bs-kw-bottom">
            <div class="bs-kw-amount">
                <div class="bs-inv-cap">Jumlah</div>
                <span class="bs-kw-amount-val">${rupiahD(total)}</span>
            </div>
            <div class="bs-kw-sign">
                Di ${esc(ISSUER.address || '................................')}, tanggal ${paidDate}<br><br>
                Penerima Pembayaran,<br>
                <b>${issuerName} · Robotic Education</b>
                <div class="bs-sign-tools bs-no-print" style="margin:10px 0 0;">
                    <label>Penerima Pembayaran:</label>
                    <select id="bs-kw-signer" class="bp-input" style="width:210px;"></select>
                </div>
                <div class="bs-inv-sign-space"></div>
                <span class="bs-kw-nm">${signerName ? esc(signerName) : '&nbsp;'}</span><br>
                <span style="font-size:.74rem; color:#6b7280;">(cap &amp; stempel)</span>
            </div>
        </div>

        <div class="bs-kw-foot">
            Bukti tanda terima sah — dicetak dari data Invoice No. ${invNo} · No. ${kwNo}
        </div>
    `;
}

async function openKwitansiView(periodId) {
    const STEP = (s) => { window.__bsStep = s; };
    try {
        STEP('ambil invoice (kwitansi)');
        const { data: iv, error: errIv } = await supabase.from('invoices_sekolah')
            .select('*').eq('period_id', periodId).single();
        if (errIv || !iv) return alert('Data invoice tidak ditemukan.\n' + (errIv?.message || ''));

        STEP('ambil kelas & sekolah');
        const [{ data: cls }, { data: sch }] = await Promise.all([
            supabase.from('classes').select('name, level').eq('id', iv.class_id).single(),
            supabase.from('schools').select('name, address, phone, headmaster').eq('id', iv.school_id).single()
        ]);

        STEP('render dokumen kwitansi');
        document.getElementById('bs-inv-modal')?.remove();
        document.getElementById('bs-kw-modal')?.remove();

        const seq = await docSeq(iv);
        const kwNo = kwitansiNo(iv, seq);
        const invNo = invoiceNo(iv, seq);
        const paidDate = iv.paid_at ? fmtDateTime(iv.paid_at)
            : new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
        const kwMethod = iv.payment_method || PAYMENT.method;
        const kwRef = iv.payment_ref || '';

        const wrap = document.createElement('div');
        wrap.id = 'bs-kw-modal';
        wrap.className = 'bp-modal';
        wrap.innerHTML = `
            <div class="bs-no-print" style="display:flex; justify-content:flex-end; align-items:center; flex-wrap:wrap; gap:8px; width:min(820px,94vw); margin-bottom:8px;">
                <button class="bp-btn-primary" onclick="window.bsPrintKwitansi()">
                    <i class="fas fa-print"></i> Cetak / Simpan PDF</button>
                ${iv.status_lunas !== 'lunas'
                    ? '<span class="bp-badge over">Belum Lunas — kwitansi ini hanya preview</span>' : ''}
                <button class="bp-btn-secondary" onclick="window.bsBackToInvoice('${periodId}')">
                    <i class="fas fa-arrow-left"></i> Kembali ke Invoice</button>
                <button class="bp-btn-secondary" onclick="window.bsCloseKwitansi()">Tutup</button>
            </div>
            <div id="bs-kw-paper" class="bs-kw-paper" onclick="event.stopPropagation()">
                ${kwitansiHtml(iv, cls, sch, kwNo, invNo, paidDate, kwMethod, kwRef)}
            </div>
        `;

        wrap.addEventListener('click', (e) => { if (e.target === wrap) window.bsCloseKwitansi(); });
        document.body.appendChild(wrap);

        const kwSignerSel = document.getElementById('bs-kw-signer');
        if (kwSignerSel) populateSignerSelect(kwSignerSel);
        if (kwSignerSel) kwSignerSel.onchange = () => setSigner(kwSignerSel.value);
    } catch (e) {
        console.error('[Billing Sekolah] Gagal membuka kwitansi:', e);
        alert('Gagal membuka kwitansi: ' + (e.message || e) + '\n\nDetail teknis ada di Console (F12).');
    }
}
window.bsOpenKwitansi = openKwitansiView;
window.bsBackToInvoice = (periodId) => {
    document.getElementById('bs-kw-modal')?.remove();
    openInvoiceView(periodId);
};

// ==========================================
// 10. INVOICE A4 — DOKUMEN RESMI INSTITUSI
// Kop surat Robopanda · Bill To sekolah ·
// Tabel rincian jasa · Total · Terbilang ·
// Instruksi pembayaran & tanda tangan.
// ==========================================
function invoiceHtml(iv, bp, cls, sch, invNo, dueStr) {
    const total = Number(iv.total) || 0;
    const pps = Number(iv.price_per_session) || 0;
    const isLunas = iv.status_lunas === 'lunas';
    const paidStr = isLunas && iv.paid_at ? fmtDateTime(iv.paid_at) : '';
    const issuerName = esc(ISSUER.name);
    const issuerContact = [ISSUER.address, ISSUER.tel ? 'Telp. ' + ISSUER.tel : '',
        ISSUER.email, ISSUER.website].filter(Boolean).join(' · ');
    const schSub = [sch?.address, sch?.phone ? 'Telp. ' + sch.phone : '', sch?.email].filter(Boolean).join(' · ');

    return `
        <div class="bs-inv-top">
            <div class="bs-inv-brand">
                <img src="${esc(ISSUER.logo)}" alt="${issuerName}" class="bs-inv-brand-logo">
                <div>
                    <div class="bs-inv-brand-name">${issuerName}</div>
                    <div class="bs-inv-brand-sub">${esc(ISSUER.tagline)} · Robotic Education</div>
                </div>
            </div>
            <div class="bs-inv-contact">${esc(issuerContact)}</div>
        </div>
        <div class="bs-inv-rule"></div>
        <div class="bs-inv-rule2"></div>

        <div class="bs-inv-headrow">
            <div class="bs-inv-title">
                <h1>Invoice</h1>
                <div class="sub">Faktur Tagihan</div>
            </div>
            <div class="bs-inv-meta">
                <span class="lbl">Nomor Invoice</span> <b>${invNo}</b><br>
                <span class="lbl">Tanggal Penerbit</span> ${fmtDateTime(iv.created_at)}<br>
                <span class="lbl">Tanggal Jatuh Tempo</span> <b>${fmtDate(dueStr)}</b><br>
                <span class="bs-inv-status ${isLunas ? 'paid' : 'unpaid'}">${isLunas ? 'LUNAS' : 'BELUM LUNAS'}</span>
            </div>
        </div>

        <div class="bs-inv-billto">
            <div class="bs-inv-cap">Ditagihkan Kepada</div>
            <b>${esc(sch?.name || '-')}</b><br>
            <span class="line">u.p. ${esc(sch?.headmaster || 'Kepala Sekolah / Bendahara')}</span><br>
            <span class="line">${esc(schSub) || '-'}</span>
            <span class="prog">Kelas / Program: <b>${esc(cls?.name) || '-'}</b>${cls?.level ? ' · ' + esc(cls.level) : ''} — Ekstrakurikuler Robotika</span>
        </div>

        <table class="bs-inv-table">
            <thead><tr>
                <th style="width:36px;" class="ctr">No</th>
                <th>Deskripsi Layanan &amp; Rincian</th>
                <th class="ctr" style="width:70px;">Siswa</th>
                <th class="ctr" style="width:90px;">Pertemuan</th>
                <th class="num" style="width:120px;">Tarif / Sesi (Rp)</th>
                <th class="num" style="width:130px;">Subtotal (Rp)</th>
            </tr></thead>
            <tbody>
                <tr>
                    <td class="ctr">1</td>
                    <td>Jasa Ekstrakurikuler Robotika — ${esc(cls?.name) || '-'}
                        <span class="bs-inv-desc-sub">${iv.periode_label ? esc(iv.periode_label) + ' · ' : ''}${iv.jumlah_anak} siswa × ${iv.jumlah_pertemuan} pertemuan × ${rupiah(pps)} / sesi</span></td>
                    <td class="ctr">${iv.jumlah_anak}</td>
                    <td class="ctr">${iv.jumlah_pertemuan}</td>
                    <td class="num">${rupiah(pps)}</td>
                    <td class="num">${rupiah(total)}</td>
                </tr>
                <tr class="bs-inv-total-row">
                    <td colspan="5" class="bs-inv-total-lbl">Total Tagihan</td>
                    <td class="num bs-inv-total-amt">${rupiah(total)}</td>
                </tr>
            </tbody>
        </table>

        <div class="bs-inv-terbilang">
            Terbilang: <b># ${terbilangIDR(Math.round(total))} #</b>
        </div>

        ${bp.note ? `<div class="bs-inv-note"><b>Catatan:</b> ${esc(bp.note)}</div>` : ''}
        ${isLunas && paidStr ? `<div class="bs-inv-note">Pembayaran diterima di ${paidStr}${iv.payment_method ? ' · ' + esc(iv.payment_method) : ''}${iv.payment_ref ? ' · Ref. ' + esc(iv.payment_ref) : ''}.</div>` : ''}

        <div class="bs-inv-bottom">
            <div class="bs-inv-paybox">
                <div class="bs-inv-cap">Instruksi Pembayaran — ${esc(PAYMENT.method)}</div>
                <div class="row"><span>Bank</span><b>${esc(PAYMENT.bank)}</b></div>
                <div class="row"><span>Nomor Rekening</span><b>${esc(PAYMENT.account_no)}</b></div>
                <div class="row"><span>Atas Nama</span><b>${esc(PAYMENT.account_name)}</b></div>
                <div class="row"><span>Jatuh Tempo</span><b>${fmtDate(dueStr)}</b></div>
            </div>
            <div class="bs-inv-places">
                <div class="bs-inv-cap">Tanda Tangan Penerbit</div>
                <span class="line">Diterbit di ${esc(ISSUER.address || '................................')}, tanggal ${fmtDateTime(iv.created_at)}</span><br><br>
                Hormat Kami,<br>
                <b>${issuerName} · Robotic Education</b>
                <div class="bs-sign-tools bs-no-print" style="margin:10px 0 0;">
                    <label>Hormat Kami — penanda tangan:</label>
                    <select id="bs-inv-signer" class="bp-input" style="width:210px;"></select>
                </div>
                <div class="bs-inv-sign-space"></div>
                <span class="bs-inv-nm">${signerName ? esc(signerName) : '&nbsp;'}</span><br>
                <span style="font-size:.74rem; color:#6b7280;">(nama penanggung jawab / admin &amp; cap/stempel)</span>
            </div>
        </div>

        <div class="bs-inv-foot">
            Dokumen ini dihasilkan otomatis oleh sistem · No. ${invNo}
        </div>
    `;
}

async function openInvoiceView(periodId) {
    const STEP = (s) => { window.__bsStep = s; };
    try {
        STEP('ambil invoice');
        const { data: iv, error: errIv } = await supabase.from('invoices_sekolah')
            .select('*').eq('period_id', periodId).single();
        if (errIv || !iv) return alert('Data invoice tidak ditemukan.\n' + (errIv?.message || ''));

        STEP('ambil kontrak');
        const { data: bp, error: errBp } = await supabase.from('billing_periods_sekolah')
            .select('*').eq('id', periodId).single();
        if (errBp || !bp) return alert('Kontrak tidak ditemukan.\n' + (errBp?.message || ''));

        STEP('ambil kelas & sekolah');
        const [{ data: cls }, { data: sch }] = await Promise.all([
            supabase.from('classes').select('name, level').eq('id', iv.class_id).single(),
            supabase.from('schools').select('name, address, phone, email, headmaster').eq('id', iv.school_id).single()
        ]);

        STEP('render dokumen invoice');
        document.getElementById('bs-inv-modal')?.remove();
        document.getElementById('bs-kw-modal')?.remove();

        const seq = await docSeq(iv);
        const invNo = invoiceNo(iv, seq);
        const due = new Date(iv.created_at ? new Date(iv.created_at) : new Date());
        due.setDate(due.getDate() + (Number(PAYMENT.due_in_days) || 0));
        const dueStr = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;

        const wrap = document.createElement('div');
        wrap.id = 'bs-inv-modal';
        wrap.className = 'bp-modal';
        wrap.innerHTML = `
            <div class="bs-no-print" style="display:flex; justify-content:flex-end; align-items:center; flex-wrap:wrap; gap:8px; width:min(820px,94vw); margin-bottom:8px;">
                <button class="bp-btn-primary" onclick="window.bsPrintInvoice()">
                    <i class="fas fa-print"></i> Cetak / Simpan PDF</button>
                <button class="bp-btn-primary" onclick="window.bsOpenKwitansi('${periodId}')">
                    <i class="fas fa-receipt"></i> Cetak Kwitansi</button>
                <button class="bp-btn-primary" onclick="window.bsUpdateBayar('${iv.id}')">
                    <i class="fas fa-money-bill"></i> Update Pembayaran</button>
                <button class="bp-btn-secondary" onclick="window.bsCloseInvoice()">Tutup</button>
            </div>
            <div id="bs-inv-paper" class="bs-inv-paper" onclick="event.stopPropagation()">
                ${invoiceHtml(iv, bp, cls, sch, invNo, dueStr)}
            </div>
        `;

        wrap.addEventListener('click', (e) => { if (e.target === wrap) window.bsCloseInvoice(); });
        document.body.appendChild(wrap);

        const invSignerSel = document.getElementById('bs-inv-signer');
        if (invSignerSel) populateSignerSelect(invSignerSel);
        if (invSignerSel) invSignerSel.onchange = () => setSigner(invSignerSel.value);
    } catch (e) {
        console.error('[Billing Sekolah] Gagal membuka invoice:', e);
        alert('Gagal membuka invoice: ' + (e.message || e) + '\n\nDetail teknis ada di Console (F12).');
    }
}
window.bsOpenInvoice = openInvoiceView;