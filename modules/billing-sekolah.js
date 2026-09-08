/**
 * Project: Billing Sekolah (sub-modul dari billing.js)
 * Description: Kontrak per KELAS berbasis RENTANG TANGGAL.
 *              Invoice = harga_per_sesi x jumlah_pertemuan x jumlah_anak
 *              harga_per_sesi = contract_price / contract_sessions (mis. 80rb/4)
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
let teachersCache = [];       // [{id, name, role}] utk dropdown penanda tangan (Hormat Kami)
let signerId = '';            // guru terpilih utk "Hormat Kami" / "Yang menerima"
let signerName = '';

/* ==================================================
   KONFIGURASI PENERBIT (KOP INVOICE) & PEMBAYARAN
   Sesuaikan data resmi Robopanda di sini.
   Logo diambil dari index.html (brand kanonik Robopanda).
   ================================================== */
const ISSUER = {
    name: 'Robopanda',
    tagline: 'Robotic Education & Workshop',
    logo: 'https://res.cloudinary.com/dmm6avtxd/image/upload/v1787501406/Robopanda-Robotic_wwr2jb.png',
    address: '',                        // <-- isi alamat kantor (opsional)
    tel: '',                            // <-- isi nomor telepon
    email: 'admin@robopanda.id',
    website: 'portal.robopanda.my.id'
};
const PAYMENT = {
    due_in_days: 30,                    // jatuh tempo = tanggal terbit + N hari
    method: 'Transfer / QRIS',
    bank: '(nama bank)',                // <-- isi nama bank
    account_name: '(nama pemilik rekening)', // <-- isi nama rekening
    account_no: '(nomor rekening)'      // <-- isi nomor rekening
};

// ==========================================
// 1. INIT (dipanggil billing.js)
// ==========================================
export async function initSekolah(container) {
    injectStyles();

    container.innerHTML = `
        <div style="display:flex; justify-content:flex-end; margin-bottom:14px;">
            <button id="bs-add" class="bp-btn-primary">
                <i class="fas fa-plus"></i> Buat Tagihan / Invoice
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
            <div class="bp-modal-box card">
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
                    </label>
                    <label>Jumlah Pertemuan
                        <input id="bs-f-jumlah" type="number" class="bp-input" min="1" required>
                    </label>
                    <label>Tarif per Siswa per Pertemuan (Rp)
                        <input id="bs-f-price" type="number" class="bp-input" min="0" required>
                    </label>
                    <div style="grid-column:1/-1;">
                        <div style="background:#f1f5f9; padding:12px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:0.85rem; color:#475569; font-weight:700;">TOTAL TAGIHAN:</span>
                            <span id="bs-f-total" style="font-size:1.2rem; font-weight:900; color:#1e3a8a;">Rp 0</span>
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
            <div class="bp-modal-box card" style="max-width: 400px;">
                <h3>Update Pembayaran</h3>
                <div class="bp-form-grid" style="grid-template-columns: 1fr;">
                    <label>Status Pembayaran
                        <select id="bs-f-status-lunas" class="bp-input">
                            <option value="belum_lunas">Belum Lunas</option>
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
                <div class="bp-form-actions" style="margin-top:16px;">
                    <button id="bs-f-save-bayar" class="bp-btn-primary">Update</button>
                    <button id="bs-f-cancel-bayar" class="bp-btn-secondary">Batal</button>
                </div>
            </div>
        </div>`;

    document.getElementById('bs-add').onclick = openDeclare;
    document.getElementById('bs-f-cancel').onclick = closeModal;
    document.getElementById('bs-f-save').onclick = saveContract;
    ['bs-f-price', 'bs-f-sessions'].forEach(id => {
        const el = document.getElementById(id);
        el.addEventListener('input', updatePriceHint);
    });
    ['bs-f-mulai', 'bs-f-akhir'].forEach(id => {
        document.getElementById(id).addEventListener('change', refreshMeetHint);
    });
    // Mode pemilih periode: Rentang Tanggal | Jumlah Pertemuan
    document.querySelectorAll('#bs-mode-seg .bs-mode-btn').forEach(b => {
        b.onclick = async () => {
            if (b.dataset.bsMode === 'count') {
                const has = await ensureJumlahKolom();
                if (!has) {
                    alert('Database belum punya kolom "jumlah_pertemuan".\n\n' +
                        'Jalankan file berikut di Supabase SQL Editor:\n' +
                        'migrations/2026-09-05-billing-sekolah-jumlah-pertemuan.sql\n\n' +
                        'Lalu muat ulang halaman (Ctrl+F5) untuk menggunakan mode "Jumlah Pertemuan".');
                    return;
                }
            }
            setDateMode(b.dataset.bsMode);
        };
    });
    document.getElementById('bs-f-jumlah').addEventListener('input', () => {
        syncEndFromJumlah();
        refreshMeetHint();
    });
    // Ganti kelas saat deklarasi baru -> muat ulang daftar pertemuan
    document.getElementById('bs-f-class').addEventListener('change', (e) => {
        if (editingId || !e.target.value) return;
        modalMeetings = [];
        selMulaiTgl = selAkhirTgl = null;
        (async () => {
            modalMeetings = await fetchMeetings(e.target.value);
            populateMeetingSelects();
            applyDateModeUI();
        })();
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
        .bs-total td:first-child { font-weight:700; color:#1e293b; }
        .bs-total td:last-child  { color:#15803d; font-weight:800; font-size:.95rem; }
        .bs-label-cell { width:38%; color:#475569; }

        /* === MODE PEMILIH PERIODE (rentang tanggal / jumlah pertemuan) === */
        .bs-mode-seg { display:inline-flex; flex-wrap:wrap; gap:6px; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:10px; padding:4px; }
        .bs-mode-btn { border:none; background:transparent; color:#64748b; font-weight:700; font-size:.82rem; padding:7px 14px; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:7px; transition:.12s; }
        .bs-mode-btn:hover { color:#1e40af; }
        .bs-mode-btn.active { background:#2563eb; color:#fff; box-shadow:0 1px 3px rgba(37,99,235,.4); }
        .bs-mode-btn i { font-size:.85rem; }
        .bs-migrate-warn { display:none; background:#fffbeb; border:1px solid #fcd34d; color:#92400e; font-size:.78rem;
                           padding:8px 12px; border-radius:8px; margin:0 0 12px; line-height:1.5; }
        .bs-migrate-warn code { background:#fef3c7; padding:1px 4px; border-radius:4px; font-size:.72rem; }

        /* === INVOICE PAPER === */
        .bs-inv-paper { background:#fff; width:min(820px,94vw); max-height:88vh; overflow:auto;
                        padding:32px 36px; border-radius:10px; font-family:'Roboto',sans-serif; color:#1f2937; }
        .bs-inv-top { display:flex; justify-content:space-between; gap:20px; align-items:flex-start;
                      padding-bottom:14px; border-bottom:3px double #cbd5e1; }
        .bs-inv-issuer { display:flex; gap:12px; align-items:center; }
        .bs-inv-issuer-logo { width:64px; height:64px; object-fit:contain; border-radius:8px;
                              background:#fff; display:flex; align-items:center; justify-content:center; }
        .bs-inv-logo { width:40px; height:40px; object-fit:contain; border-radius:6px; background:#f1f5f9;
                       display:flex; align-items:center; justify-content:center; font-size:20px; color:#94a3b8; }
        .bs-inv-sch-name { font-size:19px; font-weight:800; color:#111827; line-height:1.2; }
        .bs-inv-sch-sub { font-size:.72rem; color:#6b7280; margin-top:2px; line-height:1.45; }
        .bs-inv-pay { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-top:10px;
                      border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; background:#f8fafc; font-size:.8rem; }
        .bs-inv-pay .bs-inv-cap { display:block; margin-bottom:2px; }
        .bs-inv-pay .pay-status { color:#b45309; font-weight:800; }
        .bs-inv-pay .pay-status.paid { color:#15803d; }
        .bs-inv-title { text-align:right; }
        .bs-inv-title h1 { margin:0; font-size:30px; letter-spacing:5px; color:#2563eb; font-weight:900; }
        .bs-inv-title .no { font-size:.8rem; color:#374151; margin-top:4px; font-weight:600; }
        .bs-inv-title .tgl { font-size:.75rem; color:#6b7280; }
        .bs-inv-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 24px; margin:16px 0 6px; font-size:.85rem; }
        .bs-inv-grid b { color:#111827; }
        .bs-inv-cap { font-size:.68rem; text-transform:uppercase; letter-spacing:.8px; color:#9ca3af; font-weight:700; }
        .bs-inv-table { width:100%; border-collapse:collapse; margin-top:14px; font-size:.85rem; }
        .bs-inv-table th { background:#1e293b; color:#fff; padding:9px 10px; text-align:left; font-size:.72rem;
                           text-transform:uppercase; letter-spacing:.6px; }
        .bs-inv-table td { border-bottom:1px solid #e5e7eb; padding:10px; vertical-align:top; }
        .bs-inv-table .num { text-align:right; white-space:nowrap; }
        .bs-inv-table .ctr { text-align:center; }
        .bs-inv-dates { display:block; font-size:.72rem; color:#6b7280; margin-top:5px; line-height:1.5; }
        .bs-inv-total-row td { background:#eff6ff; font-weight:900; font-size:1rem; color:#1e3a8a;
                               border-bottom:none !important; }
        .bs-inv-terbilang { font-size:.82rem; font-style:italic; color:#374151; margin-top:10px;
                            border:1px dashed #d1d5db; border-radius:6px; padding:8px 12px; background:#f9fafb; }
        .bs-inv-note { font-size:.78rem; color:#4b5563; margin-top:14px; }
        .bs-inv-sign { display:flex; justify-content:space-between; margin-top:34px; font-size:.85rem; text-align:center; }
        .bs-sign-tools { display:flex; align-items:center; gap:10px; margin:26px 0 -6px; padding:8px 12px;
                         background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; }
        .bs-sign-tools label { font-size:.76rem; font-weight:700; color:#475569; }
        .bs-inv-sign div { width:220px; }
        .bs-inv-sign .space { height:64px; }
        .bs-inv-sign .nm { border-top:1px solid #9ca3af; padding-top:4px; font-weight:700; }
        .bs-inv-foot { margin-top:22px; font-size:.66rem; color:#9ca3af; text-align:center;
                       border-top:1px solid #f1f5f9; padding-top:8px; }

        /* === KWITANSI (bukti lunas) === */
        .bs-kw-title { text-align:right; }
        .bs-kw-title h1 { margin:0; font-size:30px; letter-spacing:5px; color:#15803d; font-weight:900; }
        .bs-kw-title .no { font-size:.8rem; color:#374151; margin-top:4px; font-weight:600; }
        .bs-kw-title .tgl { font-size:.75rem; color:#6b7280; }
        .bs-kw-paper { width:min(720px,94vw); }
        .bs-kw-body { margin-top:18px; font-size:.86rem; }
        .bs-kw-body .lbl { width:176px; flex-shrink:0; color:#475569; font-weight:700; }
        .bs-kw-body .val { flex:1; color:#111827; font-weight:600; }
        .bs-kw-amount { font-size:1.08rem; font-weight:800; color:#15803d; }
        .bs-kw-terbilang { font-style:italic; color:#374151; font-weight:600; }

        /* === PRINT === */
        @media print {
            @page { size:A4; margin:14mm; }
            body * { visibility:hidden !important; }
            #bs-inv-paper, #bs-inv-paper *, #bs-kw-paper, #bs-kw-paper * { visibility:visible !important; }
            #bs-inv-paper, #bs-kw-paper { position:fixed; inset:0; width:100%; max-height:none; overflow:visible;
                            box-shadow:none !important; border-radius:0 !important; padding:0; }
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

// Hierarki: SEKOLAH dulu, baru KELAS.
// PENTING: tabel `classes` TIDAK punya kolom is_active.
// Kelas "aktif" = kelas pada Tahun Ajaran + Semester yang sedang AKTIF
// (mengikuti pola absensi-sekolah.js).
async function fetchActiveClasses() {
    const [{ data: ta }, { data: sem }] = await Promise.all([
        supabase.from('academic_years').select('id, year').eq('is_active', true).limit(1).maybeSingle(),
        supabase.from('semesters').select('id, name').eq('is_active', true).limit(1).maybeSingle()
    ]);

    let query = supabase.from('classes')
        .select('id, name, school_id, schools(name)')
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
// 4. REKAP + PERHITUNGAN INVOICE
// invoice = (contract_price / contract_sessions) x pertemuan x anak
// ==========================================
async function loadClassData() {
    const box = document.getElementById('bs-result');
    if (!box) return;
    if (!activeClassId) {
        box.innerHTML = '<p class="card" style="color:#94a3b8;text-align:center;">Pilih kelas untuk melihat kontrak.</p>';
        return;
    }

    const cls = classesCache.find(c => c.id === activeClassId);
    const [{ count: anak }, { data: periods }, { data: allMeetings }, { data: invoices }] = await Promise.all([
        supabase.from('students').select('id', { count: 'exact', head: true })
            .eq('class_id', activeClassId).eq('is_active', true),
        supabase.from('billing_periods_sekolah').select('*')
            .eq('class_id', activeClassId)
            .order('start_date', { ascending: false }),
        supabase.from('pertemuan_kelas').select('id, tanggal')
            .eq('class_id', activeClassId).order('tanggal'),
        supabase.from('invoices_sekolah').select('*')
            .eq('class_id', activeClassId)
            .order('created_at', { ascending: false })
    ]);

    const invByPeriod = {};
    (invoices || []).forEach(iv => invByPeriod[iv.period_id] = iv);

    let blocks = '';
    (periods || []).forEach(bp => {
        const pps = Math.round((Number(bp.contract_price) / Math.max(1, bp.contract_sessions)) * 100) / 100;
        const meetings = (allMeetings || []).filter(m => m.tanggal &&
            m.tanggal >= bp.start_date && m.tanggal <= bp.end_date);
        // nomor urut pertemuan (P#) sesuai posisi di daftar pertemuan kelas
        const idxS = (allMeetings || []).findIndex(m => m.tanggal === bp.start_date);
        const idxE = (allMeetings || []).findIndex(m => m.tanggal === bp.end_date);
        const rangeTxt = (idxS > -1 && idxE > -1) ? `P${idxS + 1}–P${idxE + 1} · ` : '';
        // Jumlah pertemuan yang DIKONTAK (bisa > realisasi utk kasus bayar di muka)
        const kontrakJumlah = (bp.jumlah_pertemuan != null && Number(bp.jumlah_pertemuan) > 0)
            ? Number(bp.jumlah_pertemuan) : meetings.length;
        const liveTotal = Math.round(pps * kontrakJumlah * (anak || 0) * 100) / 100;
        const iv = invByPeriod[bp.id];
        // Bila invoice sudah terbit, total resmi = snapshot invoice (agar rekap
        // selalu konsisten dengan dokumen yang dicetak)
        const total = (iv && Number(iv.total) != null) ? Number(iv.total) : liveTotal;

        blocks += `
        <div class="bp-period-block card">
            <div class="bp-toolbar">
                <div class="bp-toolbar-info">
                    <strong>${esc(bp.periode_label) || 'Periode tanpa label'}</strong>
                    <span class="bp-meta">${rangeTxt}${fmtDate(bp.start_date)} s/d <b>${fmtDate(bp.end_date)}</b></span>
                    <span class="bp-meta">Kontrak: <b>${rupiah(bp.contract_price)}</b> / ${bp.contract_sessions} sesi · <b>${kontrakJumlah}</b> pertemuan</span>
                    <span class="bp-meta">Harga/sesi: <b>${rupiah(pps)}</b></span>
                    <span class="bp-badge ${iv ? 'ok' : 'over'}">${iv ? 'Invoice terbit ✓' : 'Belum ada invoice'}</span>
                </div>
                <div class="bp-toolbar-actions">
                    ${iv ? `<button class="bp-btn-edit" onclick="window.bsOpenInvoice ? window.bsOpenInvoice('${bp.id}') : alert('Modul invoice belum termuat. Muat ulang halaman (Ctrl+F5).')">
                        <i class="fas fa-eye"></i> Lihat Invoice</button>` :
                    `<button class="bp-btn-edit" onclick="window.bsGenerateInvoice('${bp.id}')">
                        <i class="fas fa-file-invoice-dollar"></i> Generate Invoice</button>`}
                    <button class="bp-btn-edit" onclick="window.bsEditContract('${bp.id}')">
                        <i class="fas fa-pen"></i> Edit</button>
                    <button class="bp-btn-delete" onclick="window.bsDeleteContract('${bp.id}')">
                        <i class="fas fa-trash"></i> Hapus</button>
                </div>
            </div>
            <table class="bp-date-table">
                <tbody>
                    <tr><td class="bs-label-cell">👨‍🎓 Jumlah Anak (aktif)</td><td><b>${anak || 0}</b></td></tr>
                    <tr><td class="bs-label-cell">📅 Pertemuan dikontrak</td><td><b>${kontrakJumlah}</b></td></tr>
                    <tr><td class="bs-label-cell">📅 Realisasi tercatat</td><td>${meetings.length}</td></tr>
                    <tr><td class="bs-label-cell">💰 Harga per sesi</td><td>${rupiah(pps)}</td></tr>
                    <tr class="bs-total"><td class="bs-label-cell">🧾 TOTAL INVOICE</td>
                        <td>${rupiah(total)}${iv ? ` <span class="bp-badge ok">terbit ${fmtDateTime(iv.created_at)}</span>` : ''}</td></tr>
                </tbody>
            </table>
        </div>`;
    });

    if (!blocks) {
        blocks = '<p class="card" style="color:#94a3b8;text-align:center;">Belum ada kontrak untuk kelas ini.</p>';
    }

    let invoiceList = '';
    if ((invoices || []).length) {
        invoiceList = `
        <div class="card" style="margin-top:16px;">
            <h3 style="margin:0 0 10px;">🧾 Daftar Invoice Kelas Ini</h3>
            <table class="bp-date-table">
                <thead><tr><th style="width:40px;">No</th><th>Periode</th><th>Anak</th><th>Pertemuan</th>
                    <th>Harga/Sesi</th><th>Total</th><th>Diterbitkan</th><th>Status</th><th>Dibayar</th></tr></thead>
                <tbody>${invoices.map((iv, i) => `<tr>
                    <td>${i + 1}</td>
                    <td>${esc(iv.periode_label) || '—'}</td>
                    <td>${iv.jumlah_anak}</td>
                    <td>${iv.jumlah_pertemuan}</td>
                    <td>${rupiah(iv.price_per_session)}</td>
                    <td><b>${rupiah(iv.total)}</b></td>
                    <td>${fmtDateTime(iv.created_at)}</td>
                    <td>${iv.status_lunas === 'lunas'
                        ? '<span class="bp-badge ok">Lunas</span>'
                        : '<span class="bp-badge over">Belum Lunas</span>'}</td>
                    <td>${iv.paid_at ? fmtDateTime(iv.paid_at) : '—'}</td>
                </tr>`).join('')}</tbody>
            </table>
        </div>`;
    }

    box.innerHTML = `${blocks}${invoiceList}
        <p style="font-size:.78rem;color:#64748b;margin-top:14px;">
            Invoice = harga per sesi x jumlah pertemuan dalam rentang tanggal x jumlah anak aktif.
            Harga per sesi diturunkan dari kontrak (mis. 80rb / 4 sesi = 20rb).
        </p>`;
}

// ==========================================
// 5. MODAL CONTROLLERS (CRUD) & PEMBAYARAN
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
    calcModalTotal();
    document.getElementById('bs-modal').style.display = 'block';

    // Auto-fill defaults based on selected class
    if (activeClassId) {
        sel.dispatchEvent(new Event('change'));
    }
}

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
    document.getElementById('bs-f-jumlah').value = inv ? inv.jumlah_pertemuan : bp.contract_sessions;
    document.getElementById('bs-f-price').value = inv ? inv.price_per_session : (bp.contract_price / bp.contract_sessions);
    
    calcModalTotal();
    document.getElementById('bs-modal').style.display = 'block';
}

function closeModal() {
    document.getElementById('bs-modal').style.display = 'none';
    editingId = null;
    editingContract = null;
}
window.bsEditContract = openEditContract;

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

    // Note: since we bypass "dates", we just use today's date for start/end to satisfy DB constraints
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
}

let bayarInvoiceId = null;

async function updateBayar(invId) {
    const { data: inv } = await supabase.from('invoices_sekolah').select('*').eq('id', invId).single();
    if (!inv) return alert('Invoice tidak ditemukan.');
    
    bayarInvoiceId = invId;
    document.getElementById('bs-f-status-lunas').value = inv.status_lunas === 'lunas' ? 'lunas' : 'belum_lunas';
    document.getElementById('bs-f-tanggal-bayar').value = inv.paid_at ? inv.paid_at.split('T')[0] : new Date().toISOString().split('T')[0];
    document.getElementById('bs-f-metode-bayar').value = inv.payment_method || 'Transfer Bank';
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
    let payload = { status_lunas: status };
    
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
// 7. TAMPILAN DOKUMEN INVOICE (+ cetak/PDF)
// ==========================================
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

function invoiceNo(iv) {
    const d = iv.created_at ? new Date(iv.created_at) : new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `INV/${ymd}/${(iv.id || '').slice(0, 6).toUpperCase()}`;
}

window.bsPrintInvoice = () => window.print();
window.bsCloseInvoice = () => document.getElementById('bs-inv-modal')?.remove();

// ==========================================
// 7b. KWITANSI / BUKTI LUNAS
// Dicetak langsung dari data invoice (tanpa simpan status pembayaran).
// ==========================================
function kwitansiNo(iv) {
    const d = iv.created_at ? new Date(iv.created_at) : new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `KWT/${ymd}/${(iv.id || '').slice(0, 6).toUpperCase()}`;
}

// --- Penandatar tangan (nama guru) utk "Hormat Kami"/"Yang menerima" ---
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

async function openKwitansiView(periodId) {
    const STEP = (s) => { window.__bsStep = s; };
    try {
        STEP('ambil invoice (kwitansi)');
        const { data: iv, error: errIv } = await supabase.from('invoices_sekolah')
            .select('*').eq('period_id', periodId).single();
        if (errIv || !iv) return alert('Data invoice tidak ditemukan.\n' + (errIv?.message || ''));

        // Kwitansi = bukti pembayaran: hanya boleh dicetak bebas bila sudah bertatus LUNAS
        // (atau bila kolom pembayaran belum ada di DB — mode kompatibilitas).
        const hasPayCol = await ensurePaymentKolom();
        if (hasPayCol && iv.status_lunas !== 'lunas' &&
            !confirm('Invoice ini belum ditandai LUNAS.\nKwitansi adalah bukti pembayaran.\nTetap buka/cetak kwitansi?')) return;

        STEP('ambil kontrak');
        const { data: bp, error: errBp } = await supabase.from('billing_periods_sekolah')
            .select('*').eq('id', periodId).single();
        if (errBp || !bp) return alert('Kontrak tidak ditemukan.\n' + (errBp?.message || ''));

        STEP('ambil kelas & sekolah');
        const [{ data: cls }, { data: sch }] = await Promise.all([
            supabase.from('classes').select('name, level').eq('id', iv.class_id).single(),
            supabase.from('schools').select('name, address, phone, email, headmaster')
                .eq('id', iv.school_id).single()
        ]);

        STEP('render dokumen kwitansi');
        // Tutup modal invoice agar cetak hanya menampilkan kwitansi
        document.getElementById('bs-inv-modal')?.remove();
        document.getElementById('bs-kw-modal')?.remove();

        const total = Number(iv.total) || 0;
        const issuerLogoHtml = `<img src="${esc(ISSUER.logo)}" alt="${esc(ISSUER.name)}" class="bs-inv-issuer-logo">`;
        const issuerName = esc(ISSUER.name);
        const issuerContact = [ISSUER.address,
                               ISSUER.tel ? 'Telp. ' + ISSUER.tel : '',
                               ISSUER.email,
                               ISSUER.website].filter(Boolean).join(' · ');

        const todayStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
        // Tanggal di kwitansi = tanggal pembayaran tersimpan (jika sudah lunas), bukan tanggal cetak.
        const kwDateStr = iv.paid_at ? fmtDate(iv.paid_at) : todayStr;
        const kwMethod = iv.payment_method || PAYMENT.method;
        const kwRef = iv.payment_ref || '';
        const schoolLine = sch?.address
            ? `${esc(sch.name)}<br><span style="color:#4b5563; font-weight:500;">${esc(sch.address)}</span>`
            : esc(sch?.name || '-');
        const payerLabel = sch?.headmaster ? esc(sch.headmaster) : esc(sch?.name || '-');

        const wrap = document.createElement('div');
        wrap.id = 'bs-kw-modal';
        wrap.className = 'bp-modal';
        wrap.innerHTML = `
        <div style="display:flex; justify-content:flex-end; align-items:center; flex-wrap:wrap; gap:8px; width:min(720px,94vw); margin-bottom:8px;" class="bs-no-print">
            <button class="bp-btn-primary" onclick="window.bsPrintKwitansi()">
                <i class="fas fa-print"></i> Cetak / Simpan PDF</button>
            <button class="bp-btn-secondary" onclick="window.bsBackToInvoice('${periodId}')">
                <i class="fas fa-file-invoice-dollar"></i> Lihat Invoice</button>
            <button class="bp-btn-secondary" onclick="window.bsCloseKwitansi()">Tutup</button>
        </div>
        <div id="bs-kw-paper" class="bs-inv-paper bs-kw-paper" onclick="event.stopPropagation()">
            <div class="bs-inv-top">
                <div class="bs-inv-issuer">
                    ${issuerLogoHtml}
                    <div>
                        <div class="bs-inv-sch-name">${issuerName}</div>
                        <div class="bs-inv-sch-sub">${esc(issuerContact) || '&nbsp;'}</div>
                    </div>
                </div>
                <div class="bs-kw-title">
                    <h1>KWITANSI</h1>
                    <div class="no">No. ${kwitansiNo(iv)}</div>
                    <div class="tgl">Tanggal: ${kwDateStr}</div>
                </div>
            </div>

            <div class="bs-kw-body">
                <div style="display:flex; gap:12px; margin-bottom:10px;">
                    <span class="lbl">Sudah terima dari</span>
                    <span class="val">${schoolLine}</span>
                </div>
                <div style="display:flex; gap:12px; margin-bottom:10px;">
                    <span class="lbl">Uang sejumlah</span>
                    <span class="val bs-kw-amount">${rupiah(total)}</span>
                </div>
                <div style="display:flex; gap:12px; margin-bottom:10px;">
                    <span class="lbl">Terbilang</span>
                    <span class="val bs-kw-terbilang"># ${terbilangIDR(Math.round(total))} #</span>
                </div>
                <div style="display:flex; gap:12px; margin-bottom:10px;">
                    <span class="lbl">Untuk pembayaran</span>
                    <span class="val">Jasa Les Robotik — ${esc(cls?.name) || '-'}${iv.periode_label ? ' (' + esc(iv.periode_label) + ')' : ''}
                        <span style="display:block; color:#4b5563; font-weight:500; margin-top:3px;">
                            No. Invoice: ${invoiceNo(iv)}${cls?.level ? ' · ' + esc(cls.level) : ''}<br>
                            Periode: ${fmtDate(bp.start_date)} s/d ${fmtDate(bp.end_date)} · ${iv.jumlah_pertemuan} pertemuan · ${iv.jumlah_anak} anak
                        </span>
                    </span>
                </div>
                <div style="display:flex; gap:12px; margin-bottom:10px;">
                    <span class="lbl">Metode</span>
                    <span class="val">${esc(kwMethod)}${PAYMENT.account_no ? ' (' + esc(PAYMENT.account_no) + ')' : ''}</span>
                </div>
                ${kwRef ? `<div style="display:flex; gap:12px; margin-bottom:10px;">
                    <span class="lbl">No. Referensi</span>
                    <span class="val">${esc(kwRef)}</span>
                </div>` : ''}
            </div>

            <div class="bs-sign-tools bs-no-print">
                <label>Yang menerima — penanda tangan:</label>
                <select id="bs-kw-signer" class="bp-input" style="width:230px;"></select>
            </div>

            <div class="bs-inv-sign">
                <div>
                    Yang membayar,<br>
                    ${payerLabel}
                    <div class="space"></div>
                    <div class="nm">(........................................)</div>
                </div>
                <div>
                    Yang menerima,<br>
                    <span class="bs-signer-name">${signerName ? esc(signerName) : '&nbsp;'}</span>
                    <div class="space"></div>
                    <div class="nm">(........................................)</div>
                </div>
            </div>

            <div class="bs-inv-foot">
                Bukti lunas ini dicetak dari data invoice No. ${invoiceNo(iv)} · No. ${kwitansiNo(iv)}
            </div>
        </div>
    `;

        wrap.addEventListener('click', (e) => { if (e.target === wrap) window.bsCloseKwitansi(); });
        document.body.appendChild(wrap);

        // Dropdown penanda tangan (Yang menerima) — nama guru dari tabel teachers
        const kwSignerSel = document.getElementById('bs-kw-signer');
        if (kwSignerSel) populateSignerSelect(kwSignerSel);
        if (kwSignerSel) kwSignerSel.onchange = () => setSigner(kwSignerSel.value);
    } catch (e) {
        console.error('[Billing Sekolah] Gagal membuka kwitansi:', e);
        const detail = (e && e.message) ? e.message : String(e);
        alert('Gagal membuka kwitansi: ' + detail + '\n\nDetail teknis ada di Console (F12).');
    }
}
window.bsOpenKwitansi = openKwitansiView;
window.bsPrintKwitansi = () => window.print();
window.bsCloseKwitansi = () => document.getElementById('bs-kw-modal')?.remove();
window.bsBackToInvoice = (periodId) => {
    document.getElementById('bs-kw-modal')?.remove();
    openInvoiceView(periodId);
};

// ==========================================
// 7c. STATUS PEMBAYARAN (Tandai Lunas / Batalkan)
// Menyimpan tanggal bayar + metode + ref di invoices_sekolah.
// ==========================================
async function markPaid(periodId) {
    const has = await ensurePaymentKolom();
    if (!has) return alert('Database belum punya kolom status pembayaran.\n\n' +
        'Jalankan migrations/2026-09-06-billing-sekolah-pembayaran.sql di Supabase SQL Editor,\nlalu muat ulang halaman (Ctrl+F5).');
    const method = (prompt('Metode pembayaran (kosongkan utk default):', PAYMENT.method || 'Transfer / QRIS') || '').trim() || null;
    const ref = (prompt('No. referensi / bukti bayar (opsional, bisa dikosongkan):') || '').trim() || null;
    if (!confirm('Tandai invoice ini LUNAS?\n' + (ref ? ('Ref: ' + ref + '\n') : '') + 'Tanggal bayar: sekarang.')) return;
    const { error } = await supabase.from('invoices_sekolah')
        .update({
            status_lunas: 'lunas',
            paid_at: new Date().toISOString(),
            payment_method: method,
            payment_ref: ref
        })
        .eq('period_id', periodId);
    if (error) return alert('Gagal tandai lunas: ' + error.message);
    await openInvoiceView(periodId);
}

async function unmarkPaid(periodId) {
    if (!confirm('Batalkan status LUNAS invoice ini?\nData tanggal bayar, metode & referensi akan dihapus.')) return;
    const { error } = await supabase.from('invoices_sekolah')
        .update({ status_lunas: 'belum', paid_at: null, payment_method: null, payment_ref: null })
        .eq('period_id', periodId);
    if (error) return alert('Gagal batalkan lunas: ' + error.message);
    await openInvoiceView(periodId);
}
window.bsMarkPaid = markPaid;
window.bsUnmarkPaid = unmarkPaid;

async function openInvoiceView(periodId) {
    const STEP = (s) => { window.__bsStep = s; };
    try {
        STEP('inisialisasi');
        document.getElementById('bs-inv-modal')?.remove();

        STEP('ambil invoice');
        const { data: iv, error: errIv } = await supabase.from('invoices_sekolah')
            .select('*').eq('period_id', periodId).single();
        if (errIv || !iv) return alert('Data invoice tidak ditemukan.\n' + (errIv?.message || ''));

        // 1) Kontrak dulu (dibutuhkan untuk rentang tanggal pertemuan)
        STEP('ambil kontrak');
        const { data: bp, error: errBp } = await supabase.from('billing_periods_sekolah')
            .select('*').eq('id', periodId).single();
        if (errBp || !bp) return alert('Kontrak tidak ditemukan.\n' + (errBp?.message || ''));

        const startD = bp.start_date || '';
        const endD = bp.end_date || '';

        // 2) Baru kelas, sekolah & daftar pertemuan dalam rentang
        STEP('ambil kelas & sekolah');
        const [{ data: cls }, { data: sch }] = await Promise.all([
            supabase.from('classes').select('name, level').eq('id', iv.class_id).single(),
            supabase.from('schools').select('name, address, phone, email, npsn, headmaster, logo_url')
                .eq('id', iv.school_id).single()
        ]);

        STEP('ambil daftar pertemuan');
        const { data: mtgs } = await supabase.from('pertemuan_kelas').select('tanggal')
            .eq('class_id', iv.class_id)
            .gte('tanggal', startD).lte('tanggal', endD)
            .order('tanggal');

        STEP('render dokumen invoice');
    const pps = Number(iv.price_per_session);
    const total = Number(iv.total);
    const isLunas = iv.status_lunas === 'lunas';
    const paidStr = isLunas && iv.paid_at ? fmtDateTime(iv.paid_at) : '';
    // Logo PENERIMA (sekolah) -> dipindah ke blok "Ditagihkan Kepada"
    const schoolLogoHtml = sch?.logo_url
        ? `<img src="${esc(sch.logo_url)}" alt="logo" class="bs-inv-logo">`
        : `<div class="bs-inv-logo"><i class="fas fa-school"></i></div>`;
    // Kop PENERBIT = Robopanda (logo kanonik dari index.html)
    const issuerLogoHtml = `<img src="${esc(ISSUER.logo)}" alt="${esc(ISSUER.name)}" class="bs-inv-issuer-logo">`;
    const issuerName = esc(ISSUER.name);
    const issuerContact = [ISSUER.address,
                           ISSUER.tel ? 'Telp. ' + ISSUER.tel : '',
                           ISSUER.email,
                           ISSUER.website].filter(Boolean).join(' · ');
    // Jatuh tempo = tanggal terbit + N hari
    const dueDate = iv.created_at ? new Date(iv.created_at) : new Date();
    dueDate.setDate(dueDate.getDate() + (Number(PAYMENT.due_in_days) || 0));
    const dueStr = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;
    const datesHtml = (mtgs || []).length
        ? `<span class="bs-inv-dates">Pertemuan: ${(mtgs || []).map((m, i) => `P${i + 1} (${fmtDate(m.tanggal)})`).join(', ')}</span>`
        : '';
    const lineTotal = Math.round(pps * iv.jumlah_pertemuan * iv.jumlah_anak * 100) / 100;
    const schSub = [sch?.address, sch?.phone ? 'Telp. ' + sch.phone : '', sch?.email,
                    sch?.npsn ? 'NPSN ' + sch.npsn : ''].filter(Boolean).join(' · ');

    const wrap = document.createElement('div');
    wrap.id = 'bs-inv-modal';
    wrap.className = 'bp-modal';
    wrap.innerHTML = `
        <div style="display:flex; justify-content:flex-end; align-items:center; flex-wrap:wrap; gap:8px; width:min(820px,94vw); margin-bottom:8px;" class="bs-no-print">
            <button class="bp-btn-primary" onclick="window.bsPrintInvoice()">
                <i class="fas fa-print"></i> Cetak / Simpan PDF</button>
            <button class="bp-btn-primary" onclick="window.bsOpenKwitansi && window.bsOpenKwitansi('${periodId}')">
                <i class="fas fa-receipt"></i> Cetak Kwitansi</button>
            ${isLunas
                ? `<button class="bp-btn-delete" onclick="window.bsUnmarkPaid('${periodId}')">
                    <i class="fas fa-undo"></i> Batalkan Lunas</button>`
                : `<button class="bp-btn-primary" onclick="window.bsMarkPaid && window.bsMarkPaid('${periodId}')">
                    <i class="fas fa-check-circle"></i> Tandai Lunas</button>`}
            <button class="bp-btn-secondary" onclick="window.bsCloseInvoice()">Tutup</button>
        </div>
        <div id="bs-inv-paper" class="bs-inv-paper" onclick="event.stopPropagation()">
            <div class="bs-inv-top">
                <div class="bs-inv-issuer">
                    ${issuerLogoHtml}
                    <div>
                        <div class="bs-inv-sch-name">${issuerName}</div>
                        <div class="bs-inv-sch-sub">${esc(issuerContact) || '&nbsp;'}</div>
                    </div>
                </div>
                <div class="bs-inv-title">
                    <h1>INVOICE</h1>
                    <div class="no">No. ${invoiceNo(iv)}</div>
                    <div class="tgl">Diterbitkan: ${fmtDateTime(iv.created_at)}</div>
                    <div class="tgl">Jatuh Tempo: ${fmtDate(dueStr)}</div>
                </div>
            </div>

            <div class="bs-inv-grid">
                <div>
                    <div class="bs-inv-cap">Ditagihkan Kepada</div>
                    <div style="display:flex; gap:8px; align-items:center; margin-top:2px;">
                        ${schoolLogoHtml}
                        <b>${esc(sch?.name) || '-'}</b>
                    </div>
                    <span style="color:#4b5563; display:block; margin-top:4px;">${sch?.address ? esc(sch.address) : '-'}<br>
                    ${sch?.headmaster ? 'u.p. ' + esc(sch.headmaster) + ' (Kepala Sekolah)' : ''}</span>
                </div>
                <div style="text-align:right;">
                    <div class="bs-inv-cap">Kelas</div>
                    <b>${esc(cls?.name) || '-'}${cls?.level ? ' · ' + esc(cls.level) : ''}</b>
                </div>
                <div>
                    <div class="bs-inv-cap">Periode</div>
                    <b>${esc(iv.periode_label) || '—'}</b><br>
                    <span style="color:#4b5563;">${fmtDate(bp.start_date)} s/d ${fmtDate(bp.end_date)}</span>
                </div>
                <div style="text-align:right;">
                    <div class="bs-inv-cap">Basis Kontrak</div>
                    <b>${rupiah(bp.contract_price)}</b> per ${bp.contract_sessions} sesi<br>
                    <span style="color:#4b5563;">= ${rupiah(pps)} / sesi</span>
                </div>
            </div>

            <div class="bs-inv-pay">
                <div>
                    <span class="bs-inv-cap">Status</span>
                    <b class="pay-status ${isLunas ? 'paid' : ''}">${isLunas ? 'Lunas' : 'Belum Lunas'}</b>
                </div>
                <div>
                    <span class="bs-inv-cap">Jatuh Tempo</span>
                    <b>${fmtDate(dueStr)}</b>
                </div>
                ${isLunas && paidStr ? `<div>
                    <span class="bs-inv-cap">Dibayar</span>
                    <b>${paidStr}</b>
                </div>` : ''}
                ${iv.payment_method ? `<div>
                    <span class="bs-inv-cap">Metode Bayar</span>
                    <b>${esc(iv.payment_method)}</b>
                </div>` : ''}
                <div>
                    <span class="bs-inv-cap">Rekening</span>
                    <b>${esc(PAYMENT.account_no)}</b><br>
                    <span style="font-size:.72rem;color:#6b7280;">${esc(PAYMENT.account_name)} · ${esc(PAYMENT.bank)}</span>
                </div>
                ${iv.payment_ref ? `<div>
                    <span class="bs-inv-cap">Ref. Bayar</span>
                    <b>${esc(iv.payment_ref)}</b>
                </div>` : ''}
            </div>

            <table class="bs-inv-table">
                <thead><tr>
                    <th style="width:36px;" class="ctr">No</th>
                    <th>Uraian</th>
                    <th class="ctr" style="width:90px;">Pertemuan</th>
                    <th class="ctr" style="width:70px;">Anak</th>
                    <th class="num" style="width:110px;">Tarif / Sesi</th>
                    <th class="num" style="width:130px;">Jumlah</th>
                </tr></thead>
                <tbody>
                    <tr>
                        <td class="ctr">1</td>
                        <td>Jasa Les Robotik — ${esc(cls?.name) || '-'}${iv.periode_label ? ' (' + esc(iv.periode_label) + ')' : ''}
                            ${datesHtml}</td>
                        <td class="ctr">${iv.jumlah_pertemuan}</td>
                        <td class="ctr">${iv.jumlah_anak}</td>
                        <td class="num">${rupiah(pps)}</td>
                        <td class="num">${rupiah(lineTotal)}</td>
                    </tr>
                    <tr class="bs-inv-total-row">
                        <td colspan="5" style="text-align:right;">TOTAL</td>
                        <td class="num">${rupiah(total)}</td>
                    </tr>
                </tbody>
            </table>

            <div class="bs-inv-terbilang">
                Terbilang: <b># ${terbilangIDR(Math.round(total))} #</b>
            </div>

            ${bp.note ? `<div class="bs-inv-note"><b>Catatan:</b> ${esc(bp.note)}</div>` : ''}

            <div class="bs-sign-tools bs-no-print">
                <label>Hormat Kami — penanda tangan:</label>
                <select id="bs-inv-signer" class="bp-input" style="width:230px;"></select>
            </div>

            <div class="bs-inv-sign">
                <div>
                    Penerima,<br>
                    ${sch?.name ? esc(sch.name) : ''}
                    <div class="space"></div>
                    <div class="nm">(........................................)</div>
                </div>
                <div>
                    Hormat Kami,<br>
                    <span class="bs-signer-name">${signerName ? esc(signerName) : '&nbsp;'}</span>
                    <div class="space"></div>
                    <div class="nm">(........................................)</div>
                </div>
            </div>

            <div class="bs-inv-foot">
                Dokumen ini dihasilkan otomatis oleh sistem · No. ${invoiceNo(iv)}
            </div>
        </div>
    `;

    wrap.addEventListener('click', (e) => { if (e.target === wrap) window.bsCloseInvoice(); });
    document.body.appendChild(wrap);

    // Dropdown penanda tangan (Hormat Kami) — nama guru dari tabel teachers
    const invSignerSel = document.getElementById('bs-inv-signer');
    if (invSignerSel) populateSignerSelect(invSignerSel);
    if (invSignerSel) invSignerSel.onchange = () => setSigner(invSignerSel.value);
    } catch (e) {
        console.error('[Billing Sekolah] Gagal di tahap:', window.__bsStep || '?', e);
        const detail = (e && e.message) ? e.message : String(e);
        alert('Gagal membuka invoice [' + (window.__bsStep || '?') + ']: ' + detail
            + '\n\nDetail teknis ada di Console (F12).');
    }
}
window.bsOpenInvoice = openInvoiceView;
