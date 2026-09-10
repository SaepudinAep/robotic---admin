/**
 * Project: Billing/Summary Private Module (SPA)
 * Description: Rekap jumlah sesi (pertemuan_private) per GROUP per periode,
 *              mendukung model prepaid (mode default) & postpaid.
 *              Unit sesi = pertemuan_private.id UNIK (bukan per baris absensi).
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { supabaseUrl, supabaseKey } from '../assets/js/config.js';

const supabase = createClient(supabaseUrl, supabaseKey);

// --- STATE MODULE ---
let editingPeriodId = null;
let activeGroupId = null;
let groupsCache = [];
let privateView = 'summary';   // tampilan Private: 'summary' | 'rincian'

// ==========================================
// 1. INITIALIZATION (SHELL: mode Private / Sekolah)
// ==========================================
export async function init(canvas) {
    injectStyles();

    canvas.innerHTML = `
        <div class="bp-container">
            <div class="bp-header">
                <div>
                    <h2>Billing</h2>
                    <p>Kelola siklus & tagihan — Private dan Sekolah</p>
                </div>
                <div class="bp-modes" id="bp-modes">
                    <button class="bp-mode-btn active" data-mode="private">
                        <i class="fas fa-user-lock"></i> Private
                    </button>
                    <button class="bp-mode-btn" data-mode="sekolah">
                        <i class="fas fa-school"></i> Sekolah
                    </button>
                    <button class="bp-mode-btn" data-mode="guru">
                        <i class="fas fa-chalkboard-teacher"></i> Rekap Guru
                    </button>
                </div>
            </div>
            <div id="bp-view"></div>
        </div>
    `;

    const view = document.getElementById('bp-view');
    const buttons = Array.from(document.querySelectorAll('#bp-modes .bp-mode-btn'));
    let currentMode = null;

    const show = async (mode) => {
        if (currentMode === mode) return;
        currentMode = mode;
        buttons.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
        view.innerHTML = '<div style="text-align:center; padding:40px; color:#94a3b8;"><i class="fas fa-circle-notch fa-spin"></i></div>';
        if (mode === 'sekolah') {
            // dynamic import + cache-buster agar selalu versi terbaru
            const mod = await import('./billing-sekolah.js?v=' + Date.now());
            await mod.initSekolah(view);
        } else if (mode === 'guru') {
            const mod = await import('./billing-guru.js?v=' + Date.now());
            await mod.initGuru(view);
        } else {
            await renderPrivate(view);
        }
    };

    buttons.forEach(b => b.onclick = () => show(b.dataset.mode));
    await show('private');
}

// ==========================================
// 1b. MODE PRIVATE (logika lama, dipindah utuh)
// ==========================================
async function renderPrivate(view) {
    view.innerHTML = `
            <div style="display:flex; justify-content:flex-end; margin-bottom:14px;">
                <button id="bp-add-period" class="bp-btn-primary">
                    <i class="fas fa-plus"></i> Deklarasi Periode
                </button>
            </div>

            <div class="bp-view-switch" id="bp-view-switch" style="margin-bottom:10px;">
                <button type="button" class="bp-view-btn active" data-bp-view="summary">
                    <i class="fas fa-table-list"></i> Summary</button>
                <button type="button" class="bp-view-btn" data-bp-view="rincian">
                    <i class="fas fa-list"></i> Rincian</button>
            </div>

            <div class="bp-tabs card" id="bp-group-tabs">
                <div class="bp-tabs-label">GROUP</div>
                <div class="bp-tabs-list"></div>
            </div>

            <div id="bp-modal" class="bp-modal" style="display:none;">
                <div class="bp-modal-box card">
                    <h3 id="bp-modal-title">Deklarasi Periode</h3>
                    <div class="bp-form-grid">
                        <label>Group
                            <select id="bp-f-group" class="bp-input"></select>
                        </label>
                        <label>Mode
                            <select id="bp-f-mode" class="bp-input">
                                <option value="prepaid">Prepaid</option>
                                <option value="postpaid">Postpaid</option>
                            </select>
                        </label>
                        <label>Label periode
                            <input id="bp-f-label" class="bp-input" placeholder="mis. Agustus / Siklus 1">
                        </label>
                        <label>Awal periode (dideklarasikan)
                            <input id="bp-f-start" type="date" class="bp-input" required>
                        </label>
                        <label>Kuota sesi (otomatis 4)
                            <input id="bp-f-quota" type="number" class="bp-input" value="4" min="1" required>
                        </label>
                    </div>
                    <div class="bp-form-actions">
                        <button id="bp-f-save" class="bp-btn-primary">Simpan</button>
                        <button id="bp-f-cancel" class="bp-btn-secondary">Batal</button>
                    </div>
                </div>
            </div>

            <div id="bp-result"></div>
    `;

    await Promise.all([loadGroups(), loadModalGroups()]);
    document.getElementById('bp-add-period').onclick = openAddPeriod;
    document.getElementById('bp-f-cancel').onclick = closePeriodModal;
    document.getElementById('bp-f-save').onclick = savePeriod;

    // Penghito Summary / Rincian (mirip bg-view-switch di Rekap Guru)
    document.querySelectorAll('#bp-view-switch .bp-view-btn').forEach(btn => {
        btn.onclick = () => {
            privateView = btn.dataset.bpView;
            document.querySelectorAll('#bp-view-switch .bp-view-btn')
                .forEach(b => b.classList.toggle('active', b === btn));
            if (activeGroupId) loadSummary(); // render ulang dengan mode baru
        };
    });
}

// --- MODAL CONTROLLERS ---
function openAddPeriod() {
    editingPeriodId = null;
    document.getElementById('bp-modal-title').textContent = 'Deklarasi Periode';
    const groupSel = document.getElementById('bp-f-group');
    groupSel.disabled = false;
    groupSel.value = activeGroupId || '';   // pre-select group yg sedang aktif
    document.getElementById('bp-f-mode').value = 'prepaid';
    document.getElementById('bp-f-label').value = '';
    document.getElementById('bp-f-start').value = '';
    document.getElementById('bp-f-quota').value = 4;
    document.getElementById('bp-modal').style.display = 'block';
}

async function openEditPeriod(id) {
    const { data: bp } = await supabase.from('billing_periods').select('*').eq('id', id).single();
    if (!bp) return alert('Periode tidak ditemukan.');
    editingPeriodId = bp.id;
    document.getElementById('bp-modal-title').textContent = `Edit Siklus · ${bp.periode_label || bp.start_date}`;
    const sel = document.getElementById('bp-f-group');
    sel.value = bp.group_id;
    sel.disabled = true; // group tidak diubah saat edit
    document.getElementById('bp-f-mode').value = bp.mode || 'prepaid';
    document.getElementById('bp-f-label').value = bp.periode_label || '';
    document.getElementById('bp-f-start').value = bp.start_date || '';
    document.getElementById('bp-f-quota').value = bp.quota_sessions ?? 4;
    document.getElementById('bp-modal').style.display = 'block';
}

function closePeriodModal() {
    document.getElementById('bp-modal').style.display = 'none';
    editingPeriodId = null;
}

window.bpEditPeriod = openEditPeriod;

// ==========================================
// 2. CSS
// ==========================================
function injectStyles() {
    const css = `
        .bp-container { max-width: 1100px; margin: 0 auto; padding: 20px; font-family: 'Roboto', sans-serif; }
        .bp-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .bp-header h2 { margin: 0; font-family: 'Fredoka One', cursive; color: #333; }
        .bp-header p { margin: 4px 0 0; color: #64748b; font-size: 0.85rem; }
        .bp-modes { display: flex; gap: 8px; background:#f1f5f9; padding:5px; border-radius:12px; }
        .bp-mode-btn { border:none; background:transparent; color:#475569; padding:9px 18px; border-radius:9px; cursor:pointer; font-weight:700; font-size:.88rem; display:inline-flex; align-items:center; gap:7px; transition:0.15s; }
        .bp-mode-btn:hover { color:#1e293b; }
        .bp-mode-btn.active { background:#fff; color:#2563eb; box-shadow:0 2px 8px rgba(15,23,42,.08); }
        .card { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:16px; box-shadow:0 2px 8px rgba(0,0,0,.05); }
        .bp-btn-primary { background:linear-gradient(90deg,#4d97ff,#2563eb); color:#fff; border:none; padding:10px 16px; border-radius:8px; cursor:pointer; font-weight:600; }
        .bp-btn-secondary { background:#e2e8f0; color:#334155; border:none; padding:10px 16px; border-radius:8px; cursor:pointer; }
        .bp-input { width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; }
        .bp-tabs { display:flex; align-items:center; gap:14px; flex-wrap:wrap; margin-bottom:16px; padding:10px 14px; }
        .bp-tabs-label { font-weight:700; font-size:.78rem; color:#64748b; letter-spacing:.04em; }
        .bp-tabs-list { display:flex; flex-wrap:wrap; gap:6px; }
        .bp-tab { background:#f1f5f9; color:#475569; border:1px solid #e2e8f0; padding:7px 14px; border-radius:20px; cursor:pointer; font-weight:600; font-size:.83rem; transition:0.15s; }
        .bp-tab:hover { background:#e2e8f0; }
        .bp-tab.active { background:#2563eb; border-color:#2563eb; color:#fff; box-shadow:0 2px 8px rgba(37,99,235,.35); }
        .bp-tab-empty { color:#94a3b8; font-size:.83rem; padding:6px 2px; }
        .bp-modal { position:fixed; inset:0; background:rgba(15,23,42,.5); display:flex; align-items:center; justify-content:center; z-index:999; }
        .bp-modal-box { width:min(480px,92vw); }
        .bp-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:16px 0; }
        .bp-form-grid label { font-size:.8rem; font-weight:600; color:#334155; display:flex; flex-direction:column; gap:4px; }
        .bp-form-actions { display:flex; gap:10px; justify-content:flex-end; }
        .bp-table { width:100%; border-collapse:collapse; margin-top:12px; }
        .bp-table th, .bp-table td { border:1px solid #e2e8f0; padding:8px; text-align:left; font-size:.85rem; }
        .bp-table th { background:#f1f5f9; font-weight:600; }
        .bp-badge { padding:3px 8px; border-radius:10px; font-size:.72rem; font-weight:700; }
        .bp-badge.ok { background:#dcfce7; color:#15803d; }
        .bp-badge.habis { background:#fee2e2; color:#b91c1c; }
        .bp-badge.over { background:#fef3c7; color:#92400e; }
        .bp-period-card { margin:14px 0; padding:14px 16px; }
        .bp-period-head { display:flex; flex-wrap:wrap; gap:8px 16px; align-items:center; margin-bottom:10px; font-size:.85rem; color:#334155; }
        .bp-class-name { font-size:1rem; font-weight:700; color:#1e293b; }
        .bp-level { background:#eff6ff; color:#1e40af; border:1px solid #dbeafe; padding:2px 8px; border-radius:10px; font-size:.72rem; font-weight:600; }
        .bp-meta { color:#475569; }
        .bp-meta b { color:#0f172a; }
        .bp-date-table { width:100%; border-collapse:collapse; }
        .bp-date-table th, .bp-date-table td { border:1px solid #e2e8f0; padding:7px 10px; text-align:left; font-size:.82rem; }
        .bp-date-table th { background:#f8fafc; font-weight:600; color:#475569; }
        .bp-date-table tr.bp-over td { background:#fffbeb; }
        .bp-period-block { padding:0; overflow:hidden; }
        .bp-toolbar { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px; padding:14px 16px; background:#f8fafc; border-bottom:1px solid #e2e8f0; }
        .bp-toolbar-info { display:flex; flex-wrap:wrap; gap:6px 16px; align-items:center; font-size:.85rem; color:#334155; }
        .bp-toolbar-info strong { color:#1e293b; font-size:.95rem; }
        .bp-toolbar-actions { display:flex; gap:8px; }
        .bp-btn-edit { background:#fff; color:#2563eb; border:1px solid #bfdbfe; padding:7px 12px; border-radius:8px; cursor:pointer; font-weight:600; font-size:.82rem; display:inline-flex; align-items:center; gap:6px; }
        .bp-btn-edit:hover { background:#eff6ff; }
        .bp-btn-delete { background:#fff; color:#dc2626; border:1px solid #fecaca; padding:7px 12px; border-radius:8px; cursor:pointer; font-weight:600; font-size:.82rem; display:inline-flex; align-items:center; gap:6px; }
        .bp-btn-delete:hover { background:#fef2f2; }
        .bp-breakdown-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:10px 16px; background:#fff; border-bottom:1px solid #f1f5f9; font-size:0.82rem; color:#475569; }
        .bp-class-chip { display:inline-flex; align-items:center; gap:6px; background:#f0f9ff; color:#0369a1; border:1px solid #bae6fd; padding:3px 10px; border-radius:20px; font-size:0.76rem; font-weight:600; }
        .bp-view-switch { display:inline-flex; background:#e2e8f0; border-radius:8px; padding:3px; gap:2px; }
        .bp-view-btn { border:none; background:transparent; color:#475569; font-weight:600; font-size:.8rem; padding:6px 14px; border-radius:6px; cursor:pointer; transition:.12s; }
        .bp-view-btn:hover { color:#1e293b; }
        .bp-view-btn.active { background:#1e293b; color:#fff; box-shadow:0 1px 2px rgba(0,0,0,.15); }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
}

// ==========================================
// 3. DATA HELPERS
// ==========================================
// Group yang ditampilkan = hanya yang masih punya minimal satu KELAS AKTIF
async function fetchGroupsWithActiveClass() {
    const [{ data: groups }, { data: classes }] = await Promise.all([
        supabase.from('group_private').select('id, code, owner').order('owner'),
        supabase.from('class_private').select('group_id, is_active')
    ]);
    const withActiveClass = new Set(
        (classes || []).filter(c => c.is_active).map(c => c.group_id)
    );
    return (groups || []).filter(g => withActiveClass.has(g.id));
}

async function loadGroups() {
    groupsCache = await fetchGroupsWithActiveClass();

    // render tab group di container
    const list = document.querySelector('#bp-group-tabs .bp-tabs-list');
    if (!list) return;

    if (groupsCache.length === 0) {
        list.innerHTML = '<span class="bp-tab-empty">Tidak ada group dengan kelas aktif.</span>';
        return;
    }

    list.innerHTML = groupsCache.map(g => `
        <button class="bp-tab ${g.id === activeGroupId ? 'active' : ''}"
                data-id="${g.id}"
                onclick="window.bpActivateGroup('${g.id}')">
            ${escapeHtml(g.code || g.owner || 'Group')}
        </button>
    `).join('');

    // auto-aktifkan group pertama bila belum ada yang aktif
    if (!activeGroupId || !groupsCache.some(g => g.id === activeGroupId)) {
        await activateGroup(groupsCache[0].id);
    }
}

async function activateGroup(id) {
    activeGroupId = id;
    // update class aktif di semua tab berdasarkan data-id
    document.querySelectorAll('#bp-group-tabs .bp-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.id === id);
    });
    await loadSummary();
}

window.bpActivateGroup = activateGroup;

async function deletePeriod(id) {
    const { data: bp } = await supabase.from('billing_periods').select('*').eq('id', id).single();
    if (!bp) return alert('Periode tidak ditemukan.');
    const ok = confirm(`Hapus siklus "${(bp.periode_label || bp.start_date)}" permanen?\nData ini tidak bisa dikembalikan.`);
    if (!ok) return;
    const { error } = await supabase.from('billing_periods').delete().eq('id', id);
    if (error) return alert('Gagal hapus: ' + error.message);
    await loadSummary();
}

window.bpDeletePeriod = deletePeriod;

async function loadModalGroups() {
    const data = await fetchGroupsWithActiveClass();
    const sel = document.getElementById('bp-f-group');
    sel.innerHTML = '';
    data.forEach(g => sel.add(new Option(`${g.code || ''} — ${g.owner}`, g.id)));
}

async function savePeriod() {
    const payload = {
        group_id: document.getElementById('bp-f-group').value,
        mode: document.getElementById('bp-f-mode').value,
        periode_label: document.getElementById('bp-f-label').value || null,
        start_date: document.getElementById('bp-f-start').value,
        quota_sessions: Number(document.getElementById('bp-f-quota').value) || 4,
    };
    if (!payload.group_id || !payload.start_date) return alert('Pilih group dan awal periode!');

    let error = null;
    if (editingPeriodId) {
        const { error: err } = await supabase.from('billing_periods').update(payload).eq('id', editingPeriodId);
        error = err;
    } else {
        const { error: err } = await supabase.from('billing_periods').insert(payload);
        error = err;
    }

    if (error) return alert('Gagal simpan: ' + error.message);
    document.getElementById('bp-modal').style.display = 'none';
    editingPeriodId = null;
    // Otomatis aktifkan tab group tsb agar summary langsung tampil
    if (payload.group_id) {
        await activateGroup(payload.group_id);
    } else {
        await loadSummary();
    }
}

// ==========================================
// 4. SUMMARY (jumlah sesi per group per periode)
// Unit sesi = pertemuan_private.id (satu baris = satu sesi pada class_private),
// dihitung dari tabel pertemuan (sumber kebenaran), di level GROUP
// (gabungan semua class_private milik group). Tidak memakai students_private.
// ==========================================
function fmtTanggal(t) {
    if (!t) return '—';
    const d = new Date(t + 'T00:00:00'); // hindari pergeseran zona waktu
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtHari(t) {
    if (!t) return '—';
    const d = new Date(t + 'T00:00:00');
    return d.toLocaleDateString('id-ID', { weekday: 'long' });
}

// Tabel rapi daftar pertemuan gabungan seluruh kelas milik group
// Setiap baris = satu PERTEMUAN; kolom "Sesi" menunjukkan rentang sesi
// (pertemuan bernilai 2 sesi tampil mis. "3–4"). Info overflow hanya di siklus terakhir.
// Mode "rincian" = tambahan kolom Sub-Level & Materi.
function renderGlobalDateTable(sessions, isLastSiklus, overflow, rincian) {
    const colCount = rincian ? 8 : 6;
    if (!sessions || sessions.length === 0) {
        return `<tr><td colspan="${colCount}" style="text-align:center; color:#94a3b8; padding:16px;">Belum ada pertemuan pada periode ini.</td></tr>`;
    }

    let html = sessions.map((s, i) => {
        const span = (s._mulai === s._sampai) ? `${s._mulai}` : `${s._mulai}–${s._sampai}`;
        const js = Number(s.jumlah_sesi) || 1;
        let badge = '';
        if (!s._carry && !s._partial && js > 1) badge += ` <span class="bp-badge over">×${js}</span>`;
        if (s._carry) badge += ` <span class="bp-badge ok">↪ carry siklus sebelumnya</span>`;
        if (s._partial) badge += ` <span class="bp-badge over">×${js} · carry +${s._remainder} ke berikut</span>`;
        const levelBadge = s._levelTxt ? ` <span class="bp-level" style="font-size:0.68rem; margin-left:4px;">${escapeHtml(s._levelTxt)}</span>` : '';
        const subLevelTd = rincian
            ? `<td>${s._subLevel ? `<span class="bp-level" style="font-size:0.68rem;">${escapeHtml(s._subLevel)}</span>` : '<span style="color:#94a3b8;">—</span>'}</td>`
            : '';
        const materiTd = rincian
            ? `<td style="max-width:220px;">${escapeHtml(s._materi && s._materi !== '—' ? s._materi : '—')}</td>`
            : '';
        return `<tr>
        <td>${i + 1}</td>
        <td>${fmtTanggal(s.tanggal)}</td>
        <td>${fmtHari(s.tanggal)}</td>
        <td><strong style="color:#1e293b;">${escapeHtml(s._className || 'Kelas Private')}</strong>${levelBadge}</td>
        ${subLevelTd}
        ${materiTd}
        <td><b>${span}</b>${badge}</td>
        <td><span class="bp-badge ok">Dalam kuota</span></td>
    </tr>`;
    }).join('');

    if (isLastSiklus && overflow > 0) {
        html += `<tr class="bp-over">
            <td colspan="${colCount}" style="color:#92400e; padding:10px 14px; font-weight:600;">
                <i class="fas fa-arrow-right"></i> + ${overflow} sesi berikutnya otomatis masuk <b>siklus berikutnya</b>.
            </td>
        </tr>`;
    }
    return html;
}

async function loadSummary() {
    const groupId = activeGroupId;
    const box = document.getElementById('bp-result');
    if (!groupId) { box.innerHTML = '<p class="card" style="color:#94a3b8;text-align:center;">Pilih group untuk melihat rekap.</p>'; return; }

    const { data: periods } = await supabase.from('billing_periods')
        .select('*').eq('group_id', groupId).order('start_date', { ascending: false });

    if (!periods || periods.length === 0) {
        box.innerHTML = '<p class="card" style="color:#94a3b8;text-align:center;">Belum ada periode dideklarasikan untuk group ini.</p>';
        return;
    }

    // Kelas milik group + level/kit (levels.kode, sub_levels.name)
    const { data: classes } = await supabase.from('class_private')
        .select('id, name, levels(kode), sub_levels(name)')
        .eq('group_id', groupId);
    
    // Map info kelas untuk lookup cepat
    const classMap = {};
    (classes || []).forEach(c => {
        const levelTxt = (c.levels?.kode || '') + (c.sub_levels?.name ? ' · ' + c.sub_levels.name : '');
        classMap[c.id] = {
            name: c.name,
            levelTxt: levelTxt,
            subLevel: c.sub_levels?.name || c.levels?.kode || ''
        };
    });
    const classIds = (classes || []).map(c => c.id);

    // Semua pertemuan group dalam satu query, urut tanggal ASC
    // CATATAN: jumlah_sesi menentukan bobot sesi (default 1, bisa 2)
    // Materi & sub-level diekstra dari FK materi_private(judul) / class_private(sub_levels(name))
    const { data: allP } = classIds.length
        ? await supabase.from('pertemuan_private')
            .select('id, class_id, tanggal, pertemuan_ke, jumlah_sesi, materi_private(judul), class_private(sub_levels(name))')
            .in('class_id', classIds)
            .order('tanggal', { ascending: true })
        : { data: [] };

    let blocks = '';

    /* ============================================================
       ALOKASIAN SIKLUS — REGULA:
       "Periode yang lebih lama wajib jumlah sesi = kuota kontrak."
       Sesi dikonsumsi KRONOLOGIS di seluruh kelas group. Periode yang
       lebih old digi pieni penuh (kuota) KESANTAAN sebelum sesi masuk
       periode yang lebih baru. Pertemuan 2-sesi yang memotong batas
       kuota → split (carry ke periode berikut).
       ============================================================ */
    const periodsAsc = [...periods].sort((a, b) => a.start_date < b.start_date ? -1 : 1);
    const sessionsAsc = [...(allP || [])].sort((a, b) =>
        a.tanggal < b.tanggal ? -1 : (a.tanggal > b.tanggal ? 1 : 0));
    const firstStart = periodsAsc.length ? periodsAsc[0].start_date : '9999-12-31';
    let idx = 0;
    while (idx < sessionsAsc.length && sessionsAsc[idx].tanggal < firstStart) idx++;

    const allocByPeriod = {};
    let carryLeft = 0;
    let carryItem = null;

    periodsAsc.forEach((bp, pi) => {
        const q = Number(bp.quota_sessions) || 4;
        let acc = 0;
        const sessi = [];
        const brk = {};
        (classes || []).forEach(c => { brk[c.name] = 0; });
        const push = (s, take, extra) => {
            const cInfo = classMap[s.class_id] || { name: 'Kelas Private', levelTxt: '' };
            // Sub-level pereferensi: class_private.sub_levels > materi_private.sub_levels > levels.kode
            const subLevel = s.class_private?.sub_levels?.name || s.materi_private?.sub_levels?.name || cInfo.subLevel || '';
            const materi = s.materi_private?.judul?.trim() || '—';
            sessi.push({ ...s, _mulai: acc + 1, _sampai: acc + take, _className: cInfo.name, _levelTxt: cInfo.levelTxt, _subLevel: subLevel, _materi: materi, ...extra });
            brk[cInfo.name] = (brk[cInfo.name] || 0) + take;
            acc += take;
        };

        // 1) konsum carry dari pertemuan 2-sesi yang memotong periode sebelum
        if (carryLeft > 0 && acc < q) {
            const take = Math.min(carryLeft, q - acc);
            push(carryItem, take, { _carry: true, _partial: take < carryLeft, _remainder: carryLeft - take });
            carryLeft -= take;
            if (carryLeft <= 0) carryItem = null;
        }

        // 2) konsum sesi berikutnya kronologis (TIDAK berhento di tanggal!)
        while (acc < q && idx < sessionsAsc.length) {
            const s = sessionsAsc[idx];
            const js = Number(s.jumlah_sesi) || 1;
            const need = q - acc;
            if (js <= need) {
                push(s, js, {});
                idx++;
            } else {
                push(s, need, { _partial: true, _remainder: js - need });
                carryLeft = js - need;
                carryItem = s;
                idx++;
                acc = q;
                break;
            }
        }

        // overflow: sesi setelah SEMUA kuota (hanya dihitung di periode terbaru)
        let oflow = 0;
        if (pi === periodsAsc.length - 1) {
            oflow = carryLeft;
            for (let j = idx; j < sessionsAsc.length; j++) oflow += Number(sessionsAsc[j].jumlah_sesi) || 1;
        }
        allocByPeriod[bp.id] = { sessInQuota: sessi, pakai: acc, quota: q, sisa: Math.max(0, q - acc), habis: acc >= q, classBreakdown: brk, overflow: Math.max(0, oflow), isLastSiklus: pi === periodsAsc.length - 1 };
    });

    // Render: order DESC sesuai fetch (siklus terbaru di atas)
    periods.forEach(bp => {
        const A = allocByPeriod[bp.id] || { sessInQuota: [], pakai: 0, quota: bp.quota_sessions || 4, sisa: 0, habis: false, classBreakdown: {}, overflow: 0, isLastSiklus: true };
        const sessInQuota = A.sessInQuota;
        const classBreakdown = A.classBreakdown;
        const isLastSiklus = A.isLastSiklus;

        const quota = A.quota;
        const pakai = A.pakai;
        const sisa = A.sisa;
        const habis = A.habis;
        const overflow = A.overflow;

        const akhir = habis && sessInQuota.length
            ? fmtTanggal(sessInQuota[sessInQuota.length - 1].tanggal) // tanggal pertemuan yang memenuhi kuota
            : `Sesi ke-${quota} belum tercapai`;

        const statusTxt = habis
            ? 'Kuota habis — siap siklus berikutnya'
            : `Sisa kuota ${sisa}`;

        // Rincian kontribusi per kelas (hanya jika group memiliki > 1 kelas)
        let breakdownHtml = '';
        if ((classes || []).length > 1) {
            const chips = Object.entries(classBreakdown).map(([cName, count]) => {
                return `<span class="bp-class-chip"><i class="fas fa-chalkboard-user"></i> ${escapeHtml(cName)}: <b>${count} sesi</b></span>`;
            }).join(' ');
            breakdownHtml = `
                <div class="bp-breakdown-row">
                    <span style="font-weight:700; color:#334155;"><i class="fas fa-layer-group"></i> Gabungan Kelas (${classes.length}):</span>
                    ${chips}
                    <span style="margin-left:auto; font-weight:600; color:#0f172a;">Total: <b>${pakai} / ${quota}</b> sesi</span>
                </div>
            `;
        }

        blocks += `
        <div class="bp-period-block card" style="margin-bottom:20px;">
            <div class="bp-toolbar">
                <div class="bp-toolbar-info">
                    <strong>${escapeHtml(bp.periode_label) || 'Periode tanpa label'}</strong>
                    <span class="bp-meta">Mode: <b>${escapeHtml(bp.mode)}</b></span>
                    <span class="bp-meta">Awal: <b>${fmtTanggal(bp.start_date)}</b></span>
                    <span class="bp-meta">Akhir (otomatis): <b>${akhir}</b></span>
                    <span class="bp-meta">Kuota Kontrak: <b>${quota} Sesi</b></span>
                    <span class="bp-meta">Terpakai: <b>${pakai} Sesi</b></span>
                    ${isLastSiklus && overflow > 0
                        ? `<span class="bp-meta" style="color:#92400e; font-weight:600;">+ ${overflow} sesi menunggu siklus berikutnya</span>`
                        : ''}
                    <span class="bp-badge ${habis ? 'habis' : 'ok'}">
                        ${statusTxt}
                    </span>
                </div>
                <div class="bp-toolbar-actions">
                    <button class="bp-btn-edit" onclick="window.bpEditPeriod('${bp.id}')">
                        <i class="fas fa-pen"></i> Edit
                    </button>
                    <button class="bp-btn-delete" onclick="window.bpDeletePeriod('${bp.id}')">
                        <i class="fas fa-trash"></i> Hapus
                    </button>
                </div>
            </div>
            ${breakdownHtml}
            <div style="padding:14px 16px; overflow-x:auto;">
                <table class="bp-date-table">
                    <thead><tr>
                        <th style="width:40px;">No</th>
                        <th>Tanggal</th>
                        <th>Hari</th>
                        <th>Kelas Siswa</th>
                        ${privateView === 'rincian' ? '<th>Sub-Level</th><th>Materi</th>' : ''}
                        <th style="width:90px;">Sesi</th>
                        <th>Status Kuota</th>
                    </tr></thead>
                    <tbody>
                        ${renderGlobalDateTable(sessInQuota, isLastSiklus, overflow, privateView === 'rincian')}
                    </tbody>
                </table>
            </div>
        </div>`;
    });

    box.innerHTML = `<div class="card">
        <div style="margin-bottom:14px;">
            <h3 style="margin:0 0 4px 0;">Rekap Sesi Global Group per Periode</h3>
            <p style="margin:0; font-size:0.85rem; color:#64748b;">
                Perhitungan kuota berlaku secara <b>global gabungan semua kelas</b> di bawah group orang tua ini.
            </p>
        </div>
        ${blocks}
        <p style="font-size:.78rem;color:#64748b;margin-top:14px;">
            <b>Regula:</b> Periode yang lebih old wajib digi pieni sampai kuota kontrak dalam jumlah
            sesi <b>keshanyan sebelum</b> sesi masuk periode yang lebih baru. Sesi dihitung dari
            <b>pertemuan_private</b> dengan bobot <b>jumlah_sesi</b> per pertemuan (default 1, bisa 2)
            dan dikonsumsi kronologis di seluruh kelas milik group. Pertemuan 2-sesi yang memotong
            batas kuota digi <b>split (carry)</b> ke periode berikut.
        </p>
    </div>`;
}

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
