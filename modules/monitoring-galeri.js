/**
 * Project: Robopanda Admin
 * Module: Monitoring Galeri
 * Filename: modules/monitoring-galeri.js
 * Description: Memantau keterisian dan kelengkapan foto/dokumentasi pada setiap pertemuan kelas (Sekolah & Private) yang sudah terlaksana.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { supabaseUrl, supabaseKey } from '../assets/js/config.js';

const supabase = createClient(supabaseUrl, supabaseKey);

// --- STATE MODUL ---
let activeTab = 'sekolah'; // 'sekolah' | 'private'
let dataSekolah = [];
let dataPrivate = [];
let filterStatus = 'unuploaded'; // 'all' | 'unuploaded' | 'uploaded' (default unuploaded agar admin langsung fokus ke yang belum ada foto)
let filterMonth = '';
let searchQuery = '';
let isLoading = false;
let rootContainer = null;

// ==========================================
// 1. INITIALIZATION
// ==========================================
export async function init(canvas) {
    injectStyles();
    rootContainer = canvas;
    
    // Set default filter bulan ke bulan berjalan
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    filterMonth = currentMonth;

    renderLayout();
    await loadAllData();
}

// ==========================================
// 2. DATA FETCHING
// ==========================================
async function loadAllData() {
    isLoading = true;
    updateLoadingState(true);

    try {
        await Promise.all([
            fetchDataSekolah(),
            fetchDataPrivate()
        ]);
    } catch (err) {
        console.error("Error loading monitoring data:", err);
    } finally {
        isLoading = false;
        updateLoadingState(false);
        renderStats();
        renderTable();
    }
}

async function fetchDataSekolah() {
    try {
        const { data, error } = await supabase
            .from('pertemuan_kelas')
            .select(`
                id,
                tanggal,
                school:schools(name),
                class:classes(id, name, schools(name)),
                guru:teachers!pertemuan_kelas_guru_id_fkey(name),
                materi(title),
                gallery:gallery_contents(id, is_deleted)
            `)
            .order('tanggal', { ascending: false });

        if (error) throw error;

        dataSekolah = (data || []).map(item => {
            const activePhotos = (item.gallery || []).filter(g => !g.is_deleted);
            const schoolName = item.class?.schools?.name || item.school?.name || '-';
            const className = item.class?.name || 'Tanpa Kelas';
            const classId = item.class?.id || null;
            const guruName = item.guru?.name || '-';
            const materiTitle = item.materi?.title || 'Kegiatan Belajar';

            return {
                id: item.id,
                tanggal: item.tanggal,
                classId: classId,
                className: className,
                institutionName: schoolName,
                guruName: guruName,
                materiTitle: materiTitle,
                photoCount: activePhotos.length,
                mode: 'SCHOOL'
            };
        });
    } catch (e) {
        console.error("Gagal mengambil data sekolah:", e);
        dataSekolah = [];
    }
}

async function fetchDataPrivate() {
    try {
        const { data, error } = await supabase
            .from('pertemuan_private')
            .select(`
                id,
                tanggal,
                pertemuan_ke,
                class:class_private(id, name, group_private(code, owner)),
                teacher:teachers!pertemuan_private_teacher_id_fkey(name),
                materi:materi_private(judul),
                gallery:gallery_contents(id, is_deleted)
            `)
            .order('tanggal', { ascending: false });

        if (error) throw error;

        dataPrivate = (data || []).map(item => {
            const activePhotos = (item.gallery || []).filter(g => !g.is_deleted);
            const className = item.class?.name || 'Kelas Private';
            const classId = item.class?.id || null;
            const groupOwner = item.class?.group_private?.owner || item.class?.group_private?.code || '-';
            const guruName = item.teacher?.name || '-';
            const materiTitle = item.materi?.judul || 'Sesi Private';

            return {
                id: item.id,
                tanggal: item.tanggal,
                classId: classId,
                className: className,
                institutionName: groupOwner,
                pertemuanKe: item.pertemuan_ke,
                guruName: guruName,
                materiTitle: materiTitle,
                photoCount: activePhotos.length,
                mode: 'PRIVATE'
            };
        });
    } catch (e) {
        console.error("Gagal mengambil data private:", e);
        dataPrivate = [];
    }
}

// ==========================================
// 3. UI LAYOUT & RENDERING
// ==========================================
function renderLayout() {
    rootContainer.innerHTML = `
        <div class="mg-container fade-in">
            <!-- Header -->
            <div class="mg-header">
                <div class="mg-header-left">
                    <div class="mg-icon-box"><i class="fa-solid fa-camera-retro"></i></div>
                    <div>
                        <h2 class="mg-title">Monitoring Galeri</h2>
                        <p class="mg-subtitle">Pantau keterisian foto dokumentasi pertemuan kelas Sekolah & Private</p>
                    </div>
                </div>
                <div class="mg-header-actions">
                    <button class="mg-btn-refresh" id="mg-btn-refresh" title="Muat Ulang Data">
                        <i class="fa-solid fa-arrows-rotate"></i> <span>Refresh</span>
                    </button>
                </div>
            </div>

            <!-- Tabs Navigasi -->
            <div class="mg-tabs-wrapper">
                <button class="mg-tab-btn ${activeTab === 'sekolah' ? 'active' : ''}" id="tab-sekolah">
                    <i class="fa-solid fa-school"></i>
                    <span>Kelas Sekolah</span>
                    <span class="mg-tab-pill" id="pill-sekolah-missing">0 Kosong</span>
                </button>
                <button class="mg-tab-btn ${activeTab === 'private' ? 'active' : ''}" id="tab-private">
                    <i class="fa-solid fa-user-group"></i>
                    <span>Kelas Private</span>
                    <span class="mg-tab-pill" id="pill-private-missing">0 Kosong</span>
                </button>
            </div>

            <!-- Stat Summary Cards -->
            <div class="mg-stats-grid">
                <div class="mg-stat-card card-total">
                    <div class="stat-icon"><i class="fa-solid fa-calendar-check"></i></div>
                    <div class="stat-info">
                        <div class="stat-label">Total Pertemuan</div>
                        <div class="stat-val" id="stat-total">0</div>
                    </div>
                </div>
                <div class="mg-stat-card card-missing">
                    <div class="stat-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
                    <div class="stat-info">
                        <div class="stat-label">Belum Ada Foto</div>
                        <div class="stat-val text-danger" id="stat-missing">0</div>
                    </div>
                </div>
                <div class="mg-stat-card card-uploaded">
                    <div class="stat-icon"><i class="fa-solid fa-circle-check"></i></div>
                    <div class="stat-info">
                        <div class="stat-label">Sudah Upload</div>
                        <div class="stat-val text-success" id="stat-uploaded">0</div>
                    </div>
                </div>
                <div class="mg-stat-card card-rate">
                    <div class="stat-icon"><i class="fa-solid fa-chart-pie"></i></div>
                    <div class="stat-info">
                        <div class="stat-label">Persentase Lengkap</div>
                        <div class="stat-val" id="stat-rate">0%</div>
                    </div>
                </div>
            </div>

            <!-- Filter Controls -->
            <div class="mg-filter-bar">
                <div class="mg-filter-group-left">
                    <div class="mg-search-wrapper">
                        <i class="fa-solid fa-magnifying-glass search-icon"></i>
                        <input type="text" id="mg-search" class="mg-input" placeholder="Cari kelas, sekolah, guru, materi..." value="${searchQuery}">
                    </div>

                    <div class="mg-date-wrapper">
                        <i class="fa-solid fa-calendar-days"></i>
                        <input type="month" id="mg-month" class="mg-input-month" value="${filterMonth}" title="Filter Bulan Pertemuan">
                        ${filterMonth ? `<button class="mg-btn-clear-date" id="mg-clear-month" title="Semua Bulan"><i class="fa-solid fa-xmark"></i></button>` : ''}
                    </div>
                </div>

                <div class="mg-status-buttons">
                    <button class="mg-btn-status ${filterStatus === 'unuploaded' ? 'active' : ''}" data-status="unuploaded">
                        <i class="fa-solid fa-triangle-exclamation"></i> Belum Upload
                    </button>
                    <button class="mg-btn-status ${filterStatus === 'uploaded' ? 'active' : ''}" data-status="uploaded">
                        <i class="fa-solid fa-check"></i> Sudah Ada Foto
                    </button>
                    <button class="mg-btn-status ${filterStatus === 'all' ? 'active' : ''}" data-status="all">
                        Semua
                    </button>
                </div>
            </div>

            <!-- Table / Content Area -->
            <div class="mg-content-card">
                <div id="mg-table-container">
                    <div class="mg-loading">
                        <i class="fa-solid fa-circle-notch fa-spin"></i> Memuat data monitoring...
                    </div>
                </div>
            </div>
        </div>
    `;

    setupEvents();
}

function setupEvents() {
    // Tab switching
    const tabSekolah = document.getElementById('tab-sekolah');
    const tabPrivate = document.getElementById('tab-private');
    if (tabSekolah) {
        tabSekolah.onclick = () => {
            activeTab = 'sekolah';
            updateActiveTabUI();
            renderStats();
            renderTable();
        };
    }
    if (tabPrivate) {
        tabPrivate.onclick = () => {
            activeTab = 'private';
            updateActiveTabUI();
            renderStats();
            renderTable();
        };
    }

    // Refresh
    const btnRefresh = document.getElementById('mg-btn-refresh');
    if (btnRefresh) {
        btnRefresh.onclick = () => loadAllData();
    }

    // Filter Status Buttons
    document.querySelectorAll('.mg-btn-status').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.mg-btn-status').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterStatus = btn.dataset.status;
            renderTable();
        };
    });

    // Search Input
    const searchInput = document.getElementById('mg-search');
    if (searchInput) {
        searchInput.oninput = (e) => {
            searchQuery = (e.target.value || '').trim().toLowerCase();
            renderTable();
        };
    }

    // Filter Month
    const monthInput = document.getElementById('mg-month');
    if (monthInput) {
        monthInput.onchange = (e) => {
            filterMonth = e.target.value;
            renderLayout();
            renderStats();
            renderTable();
        };
    }

    const clearMonthBtn = document.getElementById('mg-clear-month');
    if (clearMonthBtn) {
        clearMonthBtn.onclick = () => {
            filterMonth = '';
            renderLayout();
            renderStats();
            renderTable();
        };
    }
}

function updateActiveTabUI() {
    const tabSekolah = document.getElementById('tab-sekolah');
    const tabPrivate = document.getElementById('tab-private');
    if (tabSekolah) tabSekolah.classList.toggle('active', activeTab === 'sekolah');
    if (tabPrivate) tabPrivate.classList.toggle('active', activeTab === 'private');
}

function updateLoadingState(show) {
    const tableContainer = document.getElementById('mg-table-container');
    if (show && tableContainer) {
        tableContainer.innerHTML = `
            <div class="mg-loading">
                <i class="fa-solid fa-circle-notch fa-spin fa-2x"></i>
                <p style="margin-top:10px; color:#64748b;">Mengambil data pertemuan & dokumentasi...</p>
            </div>
        `;
    }
}

// ==========================================
// 4. STATISTIK SUMMARY
// ==========================================
function renderStats() {
    const currentDataset = activeTab === 'sekolah' ? dataSekolah : dataPrivate;
    
    // Hitung badge missing untuk kedua tab
    const missingSekolah = dataSekolah.filter(d => d.photoCount === 0).length;
    const missingPrivate = dataPrivate.filter(d => d.photoCount === 0).length;

    const pillSekolah = document.getElementById('pill-sekolah-missing');
    const pillPrivate = document.getElementById('pill-private-missing');
    if (pillSekolah) pillSekolah.textContent = `${missingSekolah} Kosong`;
    if (pillPrivate) pillPrivate.textContent = `${missingPrivate} Kosong`;

    // Filter per bulan jika ada
    const filteredByMonth = filterMonth 
        ? currentDataset.filter(d => d.tanggal && d.tanggal.startsWith(filterMonth))
        : currentDataset;

    const total = filteredByMonth.length;
    const uploaded = filteredByMonth.filter(d => d.photoCount > 0).length;
    const missing = total - uploaded;
    const rate = total > 0 ? Math.round((uploaded / total) * 100) : 0;

    const elTotal = document.getElementById('stat-total');
    const elMissing = document.getElementById('stat-missing');
    const elUploaded = document.getElementById('stat-uploaded');
    const elRate = document.getElementById('stat-rate');

    if (elTotal) elTotal.textContent = total;
    if (elMissing) elMissing.textContent = missing;
    if (elUploaded) elUploaded.textContent = uploaded;
    if (elRate) elRate.textContent = `${rate}%`;
}

// ==========================================
// 5. TABLE RENDERING
// ==========================================
function renderTable() {
    const tableContainer = document.getElementById('mg-table-container');
    if (!tableContainer) return;

    const currentDataset = activeTab === 'sekolah' ? dataSekolah : dataPrivate;

    // Terapkan Filter
    let filtered = currentDataset;

    // Filter Bulan
    if (filterMonth) {
        filtered = filtered.filter(item => item.tanggal && item.tanggal.startsWith(filterMonth));
    }

    // Filter Status
    if (filterStatus === 'unuploaded') {
        filtered = filtered.filter(item => item.photoCount === 0);
    } else if (filterStatus === 'uploaded') {
        filtered = filtered.filter(item => item.photoCount > 0);
    }

    // Filter Search
    if (searchQuery) {
        filtered = filtered.filter(item => {
            return (
                item.className?.toLowerCase().includes(searchQuery) ||
                item.institutionName?.toLowerCase().includes(searchQuery) ||
                item.guruName?.toLowerCase().includes(searchQuery) ||
                item.materiTitle?.toLowerCase().includes(searchQuery)
            );
        });
    }

    if (filtered.length === 0) {
        tableContainer.innerHTML = `
            <div class="mg-empty-state">
                <div class="mg-empty-icon">
                    <i class="${filterStatus === 'unuploaded' ? 'fa-solid fa-circle-check text-success' : 'fa-solid fa-folder-open text-muted'}"></i>
                </div>
                <h3>${filterStatus === 'unuploaded' ? 'Semua Pertemuan Sudah Lengkap Foto!' : 'Tidak Ada Data Pertemuan'}</h3>
                <p>${filterStatus === 'unuploaded' ? 'Hebat, tidak ada sesi yang terlewat tanpa dokumentasi.' : 'Coba sesuaikan filter status, bulan, atau kata kunci pencarian.'}</p>
            </div>
        `;
        return;
    }

    const rowsHtml = filtered.map((item, index) => {
        const dateObj = new Date(item.tanggal);
        const formattedDate = !isNaN(dateObj) 
            ? dateObj.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
            : item.tanggal;

        const isUploaded = item.photoCount > 0;
        const statusBadge = isUploaded 
            ? `<span class="mg-badge-success"><i class="fa-solid fa-check"></i> ${item.photoCount} Foto</span>`
            : `<span class="mg-badge-danger"><i class="fa-solid fa-triangle-exclamation"></i> Belum Ada Foto</span>`;

        const rowHighlight = !isUploaded ? 'row-missing' : '';

        const titleSub = activeTab === 'sekolah' 
            ? `<div class="sub-inst"><i class="fa-solid fa-building-columns"></i> ${escapeHtml(item.institutionName)}</div>`
            : `<div class="sub-inst"><i class="fa-solid fa-user-shield"></i> ${escapeHtml(item.institutionName)} ${item.pertemuanKe ? `(Sesi Ke-${item.pertemuanKe})` : ''}</div>`;

        return `
            <tr class="${rowHighlight}">
                <td class="col-num">${index + 1}</td>
                <td class="col-date">
                    <div class="date-main">${formattedDate}</div>
                    <div class="date-raw">${item.tanggal}</div>
                </td>
                <td class="col-class">
                    <div class="class-name">${escapeHtml(item.className)}</div>
                    ${titleSub}
                </td>
                <td class="col-materi">
                    <div class="materi-title">${escapeHtml(item.materiTitle)}</div>
                </td>
                <td class="col-guru">
                    <div class="guru-name"><i class="fa-solid fa-chalkboard-user"></i> ${escapeHtml(item.guruName)}</div>
                </td>
                <td class="col-status text-center">
                    ${statusBadge}
                </td>
                <td class="col-action text-center">
                    <button class="mg-btn-open-galeri" onclick="window.openGalleryFromMonitoring('${item.mode}', '${item.classId}', '${escapeHtml(item.className)}')">
                        <i class="fa-solid fa-images"></i> <span>Buka Galeri</span>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    tableContainer.innerHTML = `
        <div class="mg-table-responsive">
            <table class="mg-table">
                <thead>
                    <tr>
                        <th style="width: 45px;">No</th>
                        <th style="width: 150px;">Tanggal</th>
                        <th>Kelas & ${activeTab === 'sekolah' ? 'Sekolah' : 'Kelompok/Owner'}</th>
                        <th>Materi Pembelajaran</th>
                        <th>Guru Pengajar</th>
                        <th style="width: 150px; text-align:center;">Status Foto</th>
                        <th style="width: 130px; text-align:center;">Aksi</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;
}

// ==========================================
// 6. GLOBAL ACTION: SHORTCUT KE GALERI MASTER
// ==========================================
window.openGalleryFromMonitoring = (mode, classId, className) => {
    if (!classId) {
        alert("ID Kelas tidak valid.");
        return;
    }

    if (mode === 'SCHOOL') {
        localStorage.setItem("galleryContextMode", "SCHOOL");
        localStorage.setItem("activeClassId", classId);
        localStorage.setItem("activeClassName", className);
        localStorage.removeItem("activePrivateClassId");
        localStorage.removeItem("activePrivateClassName");

        if (window.loadAdminModule) {
            window.loadAdminModule('galeri-master', 'Dokumentasi Harian', className);
        } else if (window.dispatchModuleLoad) {
            window.dispatchModuleLoad('galeri-master', 'Dokumentasi Harian', className);
        }
    } else {
        localStorage.setItem("galleryContextMode", "PRIVATE");
        localStorage.setItem("activePrivateClassId", classId);
        localStorage.setItem("activePrivateClassName", className);
        localStorage.removeItem("activeClassId");
        localStorage.removeItem("activeClassName");

        if (window.loadAdminModule) {
            window.loadAdminModule('galeri-master', 'Dokumentasi Private', className);
        } else if (window.dispatchModuleLoad) {
            window.dispatchModuleLoad('galeri-master', 'Dokumentasi Private', className);
        }
    }
};

// ==========================================
// 7. UTILITY & STYLING
// ==========================================
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function injectStyles() {
    if (document.getElementById('mg-styles')) return;

    const style = document.createElement('style');
    style.id = 'mg-styles';
    style.textContent = `
        .mg-container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 10px 15px 50px 15px;
            font-family: 'Poppins', -apple-system, sans-serif;
            color: #1e293b;
        }

        .mg-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 15px;
            margin-bottom: 20px;
        }

        .mg-header-left {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .mg-icon-box {
            width: 46px;
            height: 46px;
            background: linear-gradient(135deg, #3b82f6, #1d4ed8);
            color: white;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.3rem;
            box-shadow: 0 4px 10px rgba(59, 130, 246, 0.25);
        }

        .mg-title {
            margin: 0;
            font-size: 1.4rem;
            font-weight: 700;
            color: #0f172a;
        }

        .mg-subtitle {
            margin: 2px 0 0 0;
            font-size: 0.85rem;
            color: #64748b;
        }

        .mg-btn-refresh {
            background: white;
            border: 1px solid #cbd5e1;
            padding: 8px 14px;
            border-radius: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 600;
            font-size: 0.85rem;
            color: #334155;
            transition: all 0.2s;
        }
        .mg-btn-refresh:hover {
            background: #f8fafc;
            border-color: #94a3b8;
        }

        /* Tabs */
        .mg-tabs-wrapper {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 2px;
        }

        .mg-tab-btn {
            background: none;
            border: none;
            padding: 10px 18px;
            cursor: pointer;
            font-size: 0.95rem;
            font-weight: 600;
            color: #64748b;
            display: flex;
            align-items: center;
            gap: 8px;
            border-bottom: 3px solid transparent;
            margin-bottom: -2px;
            transition: all 0.2s;
        }

        .mg-tab-btn:hover {
            color: #1e293b;
        }

        .mg-tab-btn.active {
            color: #2563eb;
            border-bottom-color: #2563eb;
        }

        .mg-tab-pill {
            background: #fee2e2;
            color: #dc2626;
            font-size: 0.75rem;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 12px;
            border: 1px solid #fca5a5;
        }

        /* Stat Cards */
        .mg-stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }

        .mg-stat-card {
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 16px;
            display: flex;
            align-items: center;
            gap: 14px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.03);
            transition: transform 0.2s;
        }
        .mg-stat-card:hover {
            transform: translateY(-2px);
        }

        .mg-stat-card .stat-icon {
            width: 44px;
            height: 44px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.25rem;
        }

        .card-total .stat-icon { background: #eff6ff; color: #3b82f6; }
        .card-missing .stat-icon { background: #fef2f2; color: #ef4444; }
        .card-uploaded .stat-icon { background: #f0fdf4; color: #16a34a; }
        .card-rate .stat-icon { background: #fdf4ff; color: #a855f7; }

        .stat-label {
            font-size: 0.8rem;
            color: #64748b;
            font-weight: 500;
        }

        .stat-val {
            font-size: 1.35rem;
            font-weight: 700;
            color: #0f172a;
            line-height: 1.2;
            margin-top: 2px;
        }

        .text-danger { color: #dc2626 !important; }
        .text-success { color: #16a34a !important; }

        /* Filter Bar */
        .mg-filter-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 12px;
            margin-bottom: 16px;
            background: white;
            padding: 12px 16px;
            border-radius: 12px;
            border: 1px solid #e2e8f0;
        }

        .mg-filter-group-left {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
            flex: 1;
        }

        .mg-search-wrapper {
            position: relative;
            flex: 1;
            min-width: 200px;
        }

        .search-icon {
            position: absolute;
            left: 12px;
            top: 50%;
            transform: translateY(-50%);
            color: #94a3b8;
            font-size: 0.85rem;
        }

        .mg-input {
            width: 100%;
            box-sizing: border-box;
            padding: 8px 12px 8px 34px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            font-size: 0.85rem;
            outline: none;
            transition: border-color 0.2s;
        }
        .mg-input:focus {
            border-color: #3b82f6;
        }

        .mg-date-wrapper {
            display: flex;
            align-items: center;
            gap: 6px;
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 4px 10px;
            color: #64748b;
        }

        .mg-input-month {
            border: none;
            background: transparent;
            font-size: 0.85rem;
            color: #1e293b;
            outline: none;
            cursor: pointer;
            font-family: inherit;
        }

        .mg-btn-clear-date {
            background: none;
            border: none;
            cursor: pointer;
            color: #94a3b8;
            padding: 2px 4px;
            font-size: 0.8rem;
        }
        .mg-btn-clear-date:hover { color: #dc2626; }

        .mg-status-buttons {
            display: flex;
            gap: 6px;
        }

        .mg-btn-status {
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.8rem;
            font-weight: 600;
            color: #475569;
            transition: all 0.2s;
        }
        .mg-btn-status:hover {
            background: #e2e8f0;
        }
        .mg-btn-status.active {
            background: #2563eb;
            color: white;
            border-color: #2563eb;
        }
        .mg-btn-status[data-status="unuploaded"].active {
            background: #dc2626;
            border-color: #dc2626;
            color: white;
        }
        .mg-btn-status[data-status="uploaded"].active {
            background: #16a34a;
            border-color: #16a34a;
            color: white;
        }

        /* Content Card */
        .mg-content-card {
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 1px 4px rgba(0,0,0,0.02);
        }

        .mg-table-responsive {
            width: 100%;
            overflow-x: auto;
        }

        .mg-table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
            font-size: 0.85rem;
        }

        .mg-table thead {
            background: #f8fafc;
            border-bottom: 2px solid #e2e8f0;
        }

        .mg-table th {
            padding: 12px 14px;
            font-weight: 600;
            color: #475569;
            white-space: nowrap;
        }

        .mg-table td {
            padding: 12px 14px;
            border-bottom: 1px solid #f1f5f9;
            vertical-align: middle;
        }

        .mg-table tbody tr:hover {
            background: #f8fafc;
        }

        .row-missing {
            background: #fffafa;
        }

        .col-num {
            font-weight: 600;
            color: #94a3b8;
            text-align: center;
        }

        .date-main {
            font-weight: 600;
            color: #0f172a;
        }
        .date-raw {
            font-size: 0.72rem;
            color: #94a3b8;
        }

        .class-name {
            font-weight: 700;
            color: #1e293b;
        }
        .sub-inst {
            font-size: 0.75rem;
            color: #64748b;
            margin-top: 2px;
        }

        .materi-title {
            font-weight: 500;
            color: #334155;
        }

        .guru-name {
            font-size: 0.8rem;
            color: #475569;
        }

        .mg-badge-success {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            background: #ecfdf5;
            color: #059669;
            padding: 4px 10px;
            border-radius: 20px;
            font-weight: 700;
            font-size: 0.75rem;
            border: 1px solid #a7f3d0;
        }

        .mg-badge-danger {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            background: #fef2f2;
            color: #dc2626;
            padding: 4px 10px;
            border-radius: 20px;
            font-weight: 700;
            font-size: 0.75rem;
            border: 1px solid #fecaca;
        }

        .mg-btn-open-galeri {
            background: #eff6ff;
            border: 1px solid #bfdbfe;
            color: #2563eb;
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.78rem;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s;
            white-space: nowrap;
        }
        .mg-btn-open-galeri:hover {
            background: #2563eb;
            color: white;
            border-color: #2563eb;
        }

        .mg-loading {
            padding: 40px;
            text-align: center;
            color: #64748b;
        }

        .mg-empty-state {
            padding: 50px 20px;
            text-align: center;
            color: #64748b;
        }
        .mg-empty-icon {
            font-size: 2.5rem;
            margin-bottom: 10px;
        }
        .mg-empty-state h3 {
            margin: 0;
            color: #1e293b;
            font-size: 1.1rem;
        }
        .mg-empty-state p {
            margin: 6px 0 0 0;
            font-size: 0.85rem;
            color: #64748b;
        }

        @media (max-width: 768px) {
            .mg-header {
                flex-direction: column;
                align-items: flex-start;
            }
            .mg-filter-bar {
                flex-direction: column;
                align-items: stretch;
            }
            .mg-filter-group-left {
                width: 100%;
            }
            .mg-status-buttons {
                width: 100%;
                justify-content: space-between;
            }
            .mg-btn-status {
                flex: 1;
                text-align: center;
            }
        }
    `;
    document.head.appendChild(style);
}

