/**
 * Project: Guru & Materi Module (School)
 * Version: 9.0 - Single-Scroll RPP Form + Panel "Isi Otomatis dari AI" (Master Prompt 8 Section A-H: identitas, overview, tujuan, alat, timeline per-menit, langkah detail, troubleshooting kritis, rubric 3x4; Contoh Lesson Plan terstandar; parsing label baru + merge blok), Versi RPP (v1.0/v2.0), RPP Reader & Interactive Assembly Slider Viewer, RBAC Soft vs Hard Delete
 * Format: Touch & Tablet Optimized UI
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { supabaseUrl, supabaseKey } from '../assets/js/config.js';
import { openImageCropper } from '../assets/js/image-cropper.js';

const supabase = createClient(supabaseUrl, supabaseKey);

// State Global
let currentUserProfile = null;
let userRole = 'teacher'; // 'super_admin' | 'teacher'
let currentTab = "materi"; 
let editingId = null;
let selectedLevelId = "all";
let selectedSubLevelId = "all";
let levelsList = [];
let subLevelsList = [];
let currentMateriCache = [];

// Viewer State untuk Assembly Slider
let currentViewingMateri = null;
let currentViewingSteps = [];
let currentStepIndex = 0;
let printColorMode = true; // true = cetak berwarna, false = hitam-putih

// ==========================================
// 1. INITIALIZATION
// ==========================================

export async function init(canvas, userProfile = null) {
    currentUserProfile = userProfile;
    userRole = userProfile?.role || 'teacher';

    await fetchLevels();
    injectStyles();

    canvas.innerHTML = `
        <div class="gm-container fade-in">
            <div class="gm-header">
                <div>
                    <h2>Kurikulum &amp; RPP Sekolah</h2>
                    <p>Kelola materi pembelajaran, RPP terstruktur, versi kurikulum (v1.0/v2.0), dan target achievement.</p>
                </div>
            </div>

            <!-- MAIN TABS -->
            <div class="gm-tabs">
                <button id="btnMateri" class="tab-btn active" data-tab="materi">
                    <i class="fas fa-book-bookmark"></i> MATERI &amp; RPP SEKOLAH
                </button>
                <button id="btnAchievement" class="tab-btn" data-tab="achievement">
                    <i class="fas fa-trophy"></i> ACHIEVEMENT SEKOLAH
                </button>
            </div>

            <!-- SEARCH & LEVEL FILTER BAR -->
            <div class="gm-filter-section">
                <div class="gm-search-wrapper">
                    <i class="fas fa-search"></i>
                    <input type="text" id="globalSearch" placeholder="Cari judul materi, RPP, versi (v1.0), deskripsi, atau achievement...">
                </div>

                <div class="level-filter-bar" id="level-filter-bar">
                    <button class="level-chip active" data-level="all">
                        <i class="fas fa-layer-group"></i> Semua Level
                    </button>
                    ${levelsList.map(l => `
                        <button class="level-chip" data-level="${l.id}">
                            ${l.kode}
                        </button>
                    `).join('')}
                </div>

                <!-- Filter Sub-Level khusus tab Achievement -->
                <div id="achievement-sub-filter" class="gm-subfilter" style="display:none;">
                    <select id="achievement-sub-level-filter" aria-label="Filter Sub-Level Achievement">
                        <option value="all">-- Semua Sub-Level --</option>
                    </select>
                </div>
            </div>

            <!-- CONTENT LIST AREA -->
            <div id="main-content-area" class="gm-content">
                <div id="loading-state" style="text-align:center; padding:40px; color:#94a3b8;">
                    <i class="fas fa-circle-notch fa-spin fa-2x"></i>
                    <p style="margin-top:10px; font-weight:600;">Memuat data materi...</p>
                </div>
                <div id="materi-list" class="content-list active"></div>
                <div id="achievement-list" class="content-list" style="display:none;"></div>
            </div>
        </div>

        <!-- FLOATING ACTION BUTTON (ADD) -->
        <button id="fab-add" class="fab-btn" title="Tambah Data Baru">
            <i class="fas fa-plus"></i>
        </button>

        <!-- MODAL FORM DRAWER (4 RPP TABS) -->
        <div id="modal-overlay" class="modal-overlay">
            <div class="modal-drawer">
                <div class="modal-header">
                    <h2 id="modal-title">Input Data</h2>
                    <button id="modal-close" class="close-btn" aria-label="Tutup">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="dynamic-form">
                        <div id="form-fields"></div>
                        <div class="form-footer">
                            <button type="submit" class="btn-primary">
                                <i class="fas fa-save" style="margin-right:8px;"></i> Simpan Data RPP / Materi
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>

        <!-- MODAL PREVIEW RPP READER -->
        <div id="modal-rpp-overlay" class="modal-overlay">
            <div class="modal-drawer rpp-view-drawer">
                <div class="modal-header">
                    <h2 style="display:flex; align-items:center; gap:8px;">
                        <i class="fas fa-file-signature" style="color:#4d97ff;"></i> Detail Lesson Plan (RPP)
                    </h2>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <button id="btn-open-assembly-from-rpp" type="button" class="btn-action-icon" title="Buka Petunjuk Perakitan Robot" style="background:#f0fdf4; color:#16a34a; border-color:#bbf7d0; width:auto; padding:0 12px; font-weight:700; font-size:0.82rem; gap:6px;">
                            <i class="fas fa-puzzle-piece"></i> Petunjuk Perakitan
                        </button>
                        <select id="rpp-print-mode" title="Mode Cetak RPP" style="background:#fff; color:#334155; border:1px solid #cbd5e1; border-radius:9px; padding:7px 8px; font-size:0.78rem; font-weight:700; font-family:'Poppins',sans-serif; cursor:pointer; outline:none;">
                            <option value="color">Berwarna</option>
                            <option value="bw">Hitam Putih</option>
                        </select>
                        <button id="btn-print-rpp" type="button" class="btn-action-icon" title="Cetak RPP" style="background:#eff6ff; color:#2563eb; border-color:#bfdbfe;">
                            <i class="fas fa-print"></i>
                        </button>
                        <button id="modal-rpp-close" class="close-btn" aria-label="Tutup">&times;</button>
                    </div>
                </div>
                <div class="modal-body" id="rpp-preview-container">
                    <!-- Dynamic RPP Content -->
                </div>
            </div>
        </div>

        <!-- MODAL INTERACTIVE ASSEMBLY SLIDER VIEWER -->
        <div id="modal-ag-viewer" class="modal-overlay">
            <div class="modal-drawer ag-viewer-drawer">
                <div class="modal-header">
                    <div>
                        <h2 id="viewer-robot-title" style="font-size:1.15rem; margin:0; color:#0f172a;">Nama Robot</h2>
                        <span id="viewer-step-badge" class="badge-sublevel-tag" style="margin-top:4px;">Step 1 dari 1</span>
                    </div>
                    <button id="modal-ag-viewer-close" class="close-btn" aria-label="Tutup">&times;</button>
                </div>
                <div class="modal-body" id="viewer-slider-body">
                    <!-- Dynamic Step Slide Content -->
                </div>
                <div class="ag-viewer-footer">
                    <button id="btn-prev-step" class="btn-ag-nav" disabled>
                        <i class="fas fa-arrow-left"></i> Sebelumnya
                    </button>
                    <div id="viewer-dots-container" class="ag-dots-bar"></div>
                    <button id="btn-next-step" class="btn-ag-nav primary">
                        Selanjutnya <i class="fas fa-arrow-right"></i>
                    </button>
                </div>
            </div>
        </div>
    `;

    setupEventListeners();
    await loadData();
}

// ==========================================
// 2. FETCH LEVELS & DATA PARSING
// ==========================================
// Render pilihan Sub-Level untuk filter tab Achievement (dari subLevelsList)
function renderAchievementSubFilter() {
    const sel = document.getElementById("achievement-sub-level-filter");
    if (!sel) return;
    const subs = selectedLevelId !== "all"
        ? subLevelsList.filter(s => s.level_id === selectedLevelId)
        : subLevelsList;
    sel.innerHTML = '<option value="all">-- Semua Sub-Level --</option>' +
        subs.map(s => {
            const kode = s.kode ? ` (${esc(s.kode)})` : '';
            return `<option value="${s.id}" ${selectedSubLevelId === s.id ? 'selected' : ''}>${esc(s.name)}${kode}</option>`;
        }).join('');
}

async function fetchLevels() {
    try {
        const { data: lvData } = await supabase.from('levels').select('id, kode, detail').order('kode');
        if (lvData) levelsList = lvData;

        const { data: subData } = await supabase.from('sub_levels').select('id, level_id, kode, name, kit_alat, description, is_active').order('name');
        if (subData) subLevelsList = subData;
    } catch (e) {
        console.error("Gagal memuat levels:", e);
    }
}

function parseMateriDetail(m) {
    let result = {
        version: m.version || '1.0',
        version_notes: m.version_notes || '',
        alokasi_waktu: m.alokasi_waktu || '',
        tujuan_pembelajaran: m.tujuan_pembelajaran || '',
        alat_bahan: m.alat_bahan || '',
        kegiatan_apersepsi: m.kegiatan_apersepsi || '',
        kegiatan_inti: m.kegiatan_inti || '',
        kegiatan_penutup: m.kegiatan_penutup || '',
        indikator_penilaian: m.indikator_penilaian || '',
        timeline_pembelajaran: m.timeline_pembelajaran || '',
        troubleshooting: m.troubleshooting || '',
        rubric_penilaian: m.rubric_penilaian || '',
        assembly_steps: [],
        history: []
    };

    // Normalisasi field step agar viewer robust terhadap sumber data (baru vs legacy)
    const normalizeStep = (s) => ({
        step_number: s.step_number || s.order_index || 0,
        title: s.title || s.step_title || '',
        instruction_text: s.instruction_text || s.description || '',
        image_url: s.image_url || null
    });
    const sortSteps = (a, b) => (a.step_number || 0) - (b.step_number || 0);

    // Kumpulkan step dari join assembly_guides (tabel aktual) & detail JSON (legacy/backup)
    const guideRows = Array.isArray(m.assembly_guides) ? m.assembly_guides : (Array.isArray(m.assembly_guide_steps) ? m.assembly_guide_steps : []);
    const joinSteps = guideRows
        .filter(st => !st.is_deleted)
        .map(normalizeStep)
        .sort(sortSteps);

    let jsonSteps = [];
    if (m.detail && typeof m.detail === 'string' && m.detail.startsWith('{') && m.detail.endsWith('}')) {
        try {
            const jsonDetail = JSON.parse(m.detail);
            if (jsonDetail && jsonDetail.is_rpp) {
                result = { ...result, ...jsonDetail };
            }
            if (Array.isArray(jsonDetail.assembly_steps)) {
                jsonSteps = jsonDetail.assembly_steps
                    .filter(st => !st.is_deleted)
                    .map(normalizeStep)
                    .sort(sortSteps);
            }
        } catch (e) {}
    }

    // Pilih sumber PALING LENGKAP (memiliki foto), agar foto lama di detail JSON tetap tampil
    const hasImages = arr => arr.some(s => Boolean(s.image_url));
    if (jsonSteps.length > 0 && hasImages(jsonSteps)) {
        result.assembly_steps = jsonSteps;
    } else if (joinSteps.length > 0) {
        result.assembly_steps = joinSteps;
    } else if (jsonSteps.length > 0) {
        result.assembly_steps = jsonSteps;
    }
    return result;
}

// ==========================================
// 3. STYLING (CSS INJECTION)
// ==========================================
function injectStyles() {
    const styleId = 'guru-materi-css-v10';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .gm-container { max-width: 1040px; margin: 0 auto; padding-bottom: 90px; font-family: 'Poppins', sans-serif; }
        .gm-header { margin-bottom: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 15px; }
        .gm-header h2 { color: #1e293b; margin: 0; font-size: 1.5rem; font-weight: 800; }
        .gm-header p { color: #64748b; margin: 5px 0 0; font-size: 0.9rem; }

        .gm-tabs { display: flex; gap: 10px; margin-bottom: 15px; background: #fff; padding: 6px; border-radius: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
        .tab-btn { flex: 1; border: none; background: transparent; padding: 12px 15px; font-weight: 700; color: #64748b; cursor: pointer; border-radius: 10px; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.9rem; }
        .tab-btn.active { background: #4d97ff; color: white; box-shadow: 0 4px 12px rgba(77, 151, 255, 0.3); }

        .gm-filter-section { margin-bottom: 20px; display: flex; flex-direction: column; gap: 12px; }
        .gm-search-wrapper { position: relative; width: 100%; }
        .gm-search-wrapper i { position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
        .gm-search-wrapper input { width: 100%; padding: 12px 15px 12px 42px; border: 1px solid #cbd5e1; border-radius: 12px; font-size: 0.95rem; outline: none; background: white; box-sizing: border-box; }
        .gm-search-wrapper input:focus { border-color: #4d97ff; box-shadow: 0 0 0 3px rgba(77, 151, 255, 0.15); }

        .level-filter-bar { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 5px; scrollbar-width: none; }
        .level-filter-bar::-webkit-scrollbar { display: none; }
        .level-chip { border: 1px solid #e2e8f0; background: white; padding: 8px 16px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; color: #475569; cursor: pointer; white-space: nowrap; transition: 0.2s; display: flex; align-items: center; gap: 6px; }
        .level-chip.active { background: #1e293b; color: white; border-color: #1e293b; }

        .content-list { display: flex; flex-direction: column; gap: 14px; }

        .materi-card {
            background: white; border-radius: 16px; padding: 16px 20px;
            display: flex; justify-content: space-between; align-items: center;
            box-shadow: 0 3px 10px rgba(0,0,0,0.03); border: 1px solid #edf2f7;
            transition: transform 0.2s, box-shadow 0.2s; position: relative; overflow: hidden;
        }
        .materi-card:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(0,0,0,0.08); border-color: #bfdbfe; }
        
        .materi-left { display: flex; align-items: center; gap: 16px; flex: 1; min-width: 0; cursor: pointer; }
        
        .materi-thumb {
            width: 75px; height: 75px; border-radius: 12px; flex-shrink: 0;
            background: #f1f5f9; display: flex; align-items: center; justify-content: center;
            overflow: hidden; border: 1px solid #e2e8f0; position: relative;
        }
        .materi-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .materi-thumb i { font-size: 1.8rem; color: #94a3b8; }
        
        .materi-info { flex: 1; min-width: 0; }
        
        .materi-badges-top { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
        .badge-level-tag { background: #e0f2fe; color: #0369a1; padding: 3px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
        .badge-sublevel-tag { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; padding: 3px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; }
        .badge-version-tag { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 3px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; }
        .badge-rpp-pill { background: #f0f5ff; color: #3b82f6; border: 1px solid #bfdbfe; padding: 3px 10px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; }
        .badge-assembly-pill { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; padding: 3px 10px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; }

        .materi-title { margin: 0 0 8px 0; font-size: 1.05rem; font-weight: 700; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .materi-indicators { display: flex; gap: 6px; flex-wrap: wrap; }
        .ind-pill { font-size: 0.72rem; font-weight: 600; padding: 3px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; }
        .ind-ok { background: #f0fdf4; color: #16a34a; border: 1px solid #dcfce7; }
        .ind-no { background: #fef2f2; color: #dc2626; border: 1px solid #fee2e2; }

        .materi-actions { display: flex; align-items: center; gap: 8px; margin-left: 15px; }
        .btn-action-icon {
            background: #f8fafc; border: 1px solid #e2e8f0; width: 40px; height: 40px;
            border-radius: 10px; cursor: pointer; color: #64748b; display: flex;
            align-items: center; justify-content: center; font-size: 0.95rem; transition: 0.2s;
        }
        .btn-action-icon.btn-delete:hover { background: #fee2e2; color: #ef4444; border-color: #fecaca; }
        .btn-action-icon.btn-dup:hover { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; }
        .btn-action-icon.btn-edit:hover { background: #f0fdf4; color: #16a34a; border-color: #bbf7d0; }

        .badge-status-pill { padding: 3px 10px; border-radius: 20px; font-size: 0.72rem; font-weight: 700; display: inline-flex; align-items: center; gap: 5px; }
        .status-complete { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
        .status-draft { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }

        /* Achievement Card (self-contained, tidak bergantung modul lain) */
        .achievement-folder {
            background: white; border-radius: 16px; margin-bottom: 12px;
            overflow: hidden; box-shadow: 0 3px 10px rgba(0,0,0,0.03);
            border: 1px solid #edf2f7; border-left: 5px solid #f59e0b;
        }
        .ach-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 14px 18px; }
        .ach-title-block { flex: 1; min-width: 0; }
        .ach-badges { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
        .ach-title { display: flex; align-items: center; gap: 8px; font-weight: 700; color: #1e293b; font-size: 1rem; line-height: 1.4; }
        .ach-title i { color: #f59e0b; flex-shrink: 0; }
        .ach-list { margin: 0; padding: 0 44px 14px 18px; color: #64748b; font-size: 0.88rem; line-height: 1.6; }
        .ach-list li { margin-bottom: 2px; }

        /* Filter Sub-Level (tab Achievement) */
        .gm-subfilter { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
        .gm-subfilter select {
            background: white; border: 1px solid #e2e8f0; border-radius: 10px;
            padding: 8px 12px; font-size: 0.82rem; font-weight: 600; color: #334155;
            font-family: 'Poppins', sans-serif; outline: none; max-width: 100%; cursor: pointer;
        }
        .gm-subfilter select:focus { border-color: #4d97ff; box-shadow: 0 0 0 3px rgba(77,151,255,0.15); }
        
        .btn-rpp-view {
            background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; padding: 8px 12px;
            border-radius: 10px; font-weight: 700; font-size: 0.82rem; cursor: pointer;
            display: inline-flex; align-items: center; gap: 6px; transition: 0.2s;
        }
        .btn-rpp-view:hover { background: #dbeafe; }

        .btn-assembly-view {
            background: #10b981; color: white; border: none; padding: 8px 14px;
            border-radius: 10px; font-weight: 700; font-size: 0.82rem; cursor: pointer;
            display: inline-flex; align-items: center; gap: 6px; transition: 0.2s;
            box-shadow: 0 3px 10px rgba(16, 185, 129, 0.25);
        }
        .btn-assembly-view:hover { background: #059669; }

        .fab-btn {
            position: fixed; bottom: 30px; right: 30px; width: 60px; height: 60px;
            border-radius: 50%; background: #4d97ff; color: white; border: none;
            font-size: 24px; box-shadow: 0 6px 20px rgba(77, 151, 255, 0.4);
            cursor: pointer; z-index: 100; display: flex; align-items: center; justify-content: center;
            transition: transform 0.2s, background 0.2s;
        }
        .fab-btn:hover { transform: scale(1.08); background: #2563eb; }

        .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.6); z-index: 1000; display: none; align-items: flex-end; backdrop-filter: blur(3px); }
        .modal-overlay.active { display: flex; animation: fadeIn 0.2s ease-out; }
        .modal-drawer { background: white; width: 100%; max-width: 650px; margin: 0 auto; border-radius: 24px 24px 0 0; padding: 25px; max-height: 92vh; overflow-y: auto; position: relative; animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        .rpp-view-drawer { max-width: 800px; }
        .ag-viewer-drawer { max-width: 840px; height: 92vh; }
        
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; }
        .modal-header h2 { margin: 0; font-size: 1.25rem; font-weight: 800; color: #1e293b; }
        .close-btn { background: none; border: none; font-size: 1.8rem; cursor: pointer; color: #94a3b8; }
        
        /* === FORM SATU HALAMAN (SECTION A-D) === */
        .gm-form-section { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px 16px 18px; margin-bottom: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.03); }
        .gm-section-title { display: flex; align-items: center; gap: 10px; font-weight: 800; color: #1e293b; font-size: 0.95rem; margin-bottom: 4px; padding-bottom: 10px; border-bottom: 1px dashed #e2e8f0; }
        .gm-section-letter { width: 28px; height: 28px; border-radius: 9px; background: #4d97ff; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; font-weight: 800; flex-shrink: 0; }

        /* === PANEL ISI OTOMATIS DARI AI === */
        .gm-ai-box { border: 1px solid #c7d2fe; background: linear-gradient(135deg, #eef2ff 0%, #f0f9ff 100%); border-radius: 16px; margin-bottom: 14px; overflow: hidden; }
        .gm-ai-head { display: flex; gap: 10px; align-items: center; padding: 13px 14px; cursor: pointer; user-select: none; }
        .gm-ai-head > i.fa-wand-magic-sparkles { color: #6366f1; font-size: 1.15rem; flex-shrink: 0; }
        .gm-ai-title { flex: 1; min-width: 0; }
        .gm-ai-title strong { display: block; color: #1e293b; font-size: 0.9rem; }
        .gm-ai-title span { font-size: 0.76rem; color: #64748b; line-height: 1.4; display: block; margin-top: 2px; }
        .gm-ai-caret { color: #6366f1; transition: transform 0.25s; flex-shrink: 0; }
        .gm-ai-box.open .gm-ai-caret { transform: rotate(180deg); }
        .gm-ai-body { display: none; padding: 0 14px 14px; }
        .gm-ai-box.open .gm-ai-body { display: block; animation: fadeIn 0.2s ease-out; }
        .gm-ai-field { min-height: 130px; resize: vertical; }
        .gm-ai-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
        .gm-ai-btn-primary { flex: 2 1 180px; background: #6366f1; color: #fff; border: none; padding: 12px; border-radius: 11px; font-weight: 700; cursor: pointer; font-family: inherit; font-size: 0.88rem; display: flex; align-items: center; justify-content: center; gap: 8px; transition: 0.2s; }
        .gm-ai-btn-primary:hover { background: #4f46e5; }
        .gm-ai-btn-ghost { flex: 1 1 150px; background: #fff; color: #4f46e5; border: 1px solid #c7d2fe; padding: 12px; border-radius: 11px; font-weight: 700; cursor: pointer; font-family: inherit; font-size: 0.88rem; display: flex; align-items: center; justify-content: center; gap: 8px; transition: 0.2s; }
        .gm-ai-btn-ghost:hover { background: #eef2ff; }
        .gm-ai-hint { font-size: 0.75rem; color: #64748b; margin: 10px 0 0; line-height: 1.5; display: flex; gap: 6px; align-items: flex-start; }
        .gm-ai-hint i { margin-top: 2px; flex-shrink: 0; }

        #form-fields label { display: block; font-weight: 700; margin-bottom: 6px; color: #334155; font-size: 0.85rem; margin-top: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
        #form-fields input, #form-fields textarea, #form-fields select { width: 100%; padding: 12px 14px; border: 1px solid #cbd5e1; border-radius: 10px; font-size: 0.93rem; font-family: inherit; box-sizing: border-box; outline: none; transition: 0.2s; }
        #form-fields input:focus, #form-fields textarea:focus, #form-fields select:focus { border-color: #4d97ff; box-shadow: 0 0 0 3px rgba(77, 151, 255, 0.15); }
        
        .btn-primary { width: 100%; padding: 14px; background: #4d97ff; color: white; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; font-size: 1rem; margin-top: 20px; transition: 0.2s; box-shadow: 0 4px 12px rgba(77, 151, 255, 0.3); }
        .btn-primary:hover { background: #2563eb; }

        .ag-viewer-body-content { display: flex; flex-direction: column; align-items: center; text-align: center; height: 100%; }
        .ag-step-image-box { width: 100%; max-height: 48vh; background: #0f172a; border-radius: 16px; overflow: hidden; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; }
        .ag-step-image-box img { max-width: 100%; max-height: 48vh; object-fit: contain; }
        .ag-step-text-box { width: 100%; background: white; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; text-align: left; }
        .ag-step-text-box h4 { margin: 0 0 6px 0; font-size: 1.05rem; color: #0f172a; font-weight: 800; }
        .ag-step-text-box p { margin: 0; color: #334155; font-size: 0.93rem; line-height: 1.6; }

        .ag-viewer-footer { display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 14px; margin-top: 14px; }
        .btn-ag-nav { background: #f1f5f9; border: 1px solid #cbd5e1; color: #334155; padding: 10px 18px; border-radius: 10px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px; }
        .btn-ag-nav.primary { background: #10b981; color: white; border-color: #10b981; }
        .btn-ag-nav:disabled { opacity: 0.4; cursor: not-allowed; }

        .ag-dots-bar { display: flex; gap: 6px; overflow-x: auto; max-width: 280px; scrollbar-width: none; }
        .ag-dot { width: 10px; height: 10px; border-radius: 50%; background: #cbd5e1; cursor: pointer; flex-shrink: 0; transition: 0.2s; }
        .ag-dot.active { background: #10b981; transform: scale(1.3); }

        .rpp-preview-card { background: #fafafa; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; font-family: 'Poppins', sans-serif; color: #1e293b; }

        /* Kop & Footer — khusus tampilan cetak, disembunyikan di layar */
        .rpp-print-identitas { display: none; }
        .rpp-print-footer { display: none; }
        .rpp-header-box { text-align: center; border-bottom: 2px solid #cbd5e1; padding-bottom: 16px; margin-bottom: 20px; }
        .rpp-header-box h3 { margin: 0 0 6px 0; font-size: 1.3rem; color: #0f172a; font-weight: 800; }
        .rpp-meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; background: white; padding: 12px 16px; border-radius: 12px; border: 1px solid #e2e8f0; margin-top: 12px; text-align: left; }
        .rpp-meta-item label { font-size: 0.72rem; font-weight: 700; color: #64748b; text-transform: uppercase; display: block; }
        .rpp-meta-item span { font-size: 0.88rem; font-weight: 700; color: #1e293b; }

        .rpp-block { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 14px; }
        .rpp-block h4 { margin: 0 0 10px 0; font-size: 0.95rem; font-weight: 800; color: #2563eb; display: flex; align-items: center; gap: 8px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 6px; }
        .rpp-block-content { font-size: 0.9rem; color: #334155; line-height: 1.6; white-space: pre-line; }

        .rpp-rubric-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-top: 8px; min-width: 560px; }
        .rpp-rubric-table th, .rpp-rubric-table td { border: 1px solid #e2e8f0; padding: 8px 10px; vertical-align: top; text-align: left; }
        .rpp-rubric-table th { background: #f1f5f9; color: #334155; text-transform: uppercase; font-size: 0.72rem; letter-spacing: 0.4px; }
        .rpp-rubric-wrap { overflow-x: auto; }

        .gm-ex-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.55); z-index: 2400; display: flex; align-items: center; justify-content: center; padding: 16px; }
        .gm-ex-box { background: #fff; border-radius: 18px; max-width: 880px; width: 100%; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 60px rgba(0,0,0,.35); font-family: 'Poppins', sans-serif; }
        .gm-ex-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 16px 20px; border-bottom: 1px solid #e2e8f0; }
        .gm-ex-head h3 { margin: 0; font-size: 1.02rem; color: #0f172a; display: flex; align-items: center; gap: 8px; }
        .gm-ex-x { background: none; border: none; font-size: 1.6rem; color: #94a3b8; cursor: pointer; line-height: 1; }
        .gm-ex-body { padding: 16px 20px; overflow-y: auto; flex: 1; }
        .gm-ex-note { background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; border-radius: 10px; padding: 10px 12px; font-size: 0.8rem; font-weight: 600; margin-bottom: 12px; line-height: 1.55; }
        .gm-ex-pre { background: #0f172a; color: #e2e8f0; border-radius: 12px; padding: 16px; font-family: 'Consolas', 'Menlo', monospace; font-size: 0.74rem; line-height: 1.55; white-space: pre-wrap; word-break: break-word; max-height: 55vh; overflow-y: auto; margin: 0; }
        .gm-ex-foot { display: flex; gap: 8px; flex-wrap: wrap; padding: 14px 20px; border-top: 1px solid #e2e8f0; }
        .gm-ex-btn { flex: 1; min-width: 150px; padding: 11px 14px; border-radius: 11px; font-weight: 800; font-size: 0.84rem; cursor: pointer; border: 1px solid; font-family: inherit; transition: .2s; }
        .gm-ex-btn-primary { background: #4d97ff; color: #fff; border-color: #4d97ff; }
        .gm-ex-btn-ghost { background: #fff; color: #334155; border-color: #cbd5e1; }

        .fade-in { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }

        @media print {
            @page { size: A4; margin: 13mm; }

            /* Sembunyikan SEMUA konten aplikasi kecuali area cetak khusus (#gm-print-root).
               Elemen ini selalu dibuat & diisi oleh printRpp() tepat sebelum window.print(). */
            body > *:not(#gm-print-root) { display: none !important; }

            #gm-print-root {
                display: block !important;
                max-width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                color: #000000 !important;
                font-family: 'Poppins', 'Segoe UI', Roboto, system-ui, sans-serif;
                font-size: 11pt;
                line-height: 1.55;
                visibility: visible !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }

            #gm-print-root, #gm-print-root * { visibility: visible !important; }

            /* Area dokumen: frame tipis + padding */
            #gm-print-root .rpp-preview-card {
                border: 2px solid currentColor;
                border-radius: 0 !important;
                box-shadow: none !important;
                background: #ffffff !important;
                padding: 22px 26px !important;
                color: #000000 !important;
            }

            /* Sembunyikan header versi/meta grid & kontrol interaktif yang hanya untuk layar */
            #gm-print-root .rpp-version-bar,
            #gm-print-root .rpp-header-box,
            #gm-print-root .rpp-meta-grid,
            #gm-print-root .rpp-meta-assembly,
            #gm-print-root .modal-header,
            #gm-print-root .close-btn { display: none !important; }

            /* Foto project tetap tampil jika ada */
            #gm-print-root img {
                max-height: 100mm;
                object-fit: contain;
                page-break-inside: avoid;
            }

            /* ====== MODE BERWARNA (fun & formal, default) ====== */
            #gm-print-root.gm-print-color .rpp-preview-card {
                border-color: #2563eb !important;
            }
            #gm-print-root.gm-print-color .rpp-print-identitas {
                display: block !important;
                text-align: center;
                border-radius: 14px;
                background: linear-gradient(135deg, #eff6ff 0%, #f0f9ff 70%, #e0f2fe 100%);
                border: 1px solid #bfdbfe;
                padding: 16px 14px;
                margin-bottom: 16px;
            }
            #gm-print-root.gm-print-color .rpp-print-title {
                font-size: 15.5pt;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 1px;
                color: #1d4ed8 !important;
            }
            #gm-print-root.gm-print-color .rpp-print-meta {
                display: inline-flex;
                flex-wrap: wrap;
                gap: 6px;
                justify-content: center;
                margin-top: 10px;
                font-size: 9.5pt;
            }
            #gm-print-root.gm-print-color .rpp-print-meta meta-chip {
                background: #ffffff;
                border: 1px solid #93c5fd;
                color: #1e40af;
                border-radius: 20px;
                padding: 3px 10px;
                font-weight: 600;
            }

            /* Section: heading berwarna biru + garis lembut */
            #gm-print-root.gm-print-color .rpp-block h4 {
                font-size: 11.5pt;
                font-weight: 800;
                color: #2563eb !important;
                border-bottom: 2px solid #93c5fd;
                padding-bottom: 4px;
            }
            #gm-print-root.gm-print-color .rpp-block h4 i { display: none !important; }
            #gm-print-root.gm-print-color .rpp-block-content { color: #1e293b !important; }

            /* Rubrik: header biru muda */
            #gm-print-root.gm-print-color .rpp-rubric-table th {
                background: #eff6ff !important;
                color: #1d4ed8 !important;
                border-color: #93c5fd;
            }
            #gm-print-root.gm-print-color .rpp-rubric-table td {
                border-color: #bfdbfe;
                color: #1e293b !important;
            }

            /* ====== MODE HITAM-PUTIH (resmi / hemat tinta) ====== */
            #gm-print-root.gm-print-bw .rpp-print-identitas {
                display: block !important;
                text-align: center;
                border-bottom: 2px solid #000000;
                padding-bottom: 12px;
                margin-bottom: 16px;
            }
            #gm-print-root.gm-print-bw .rpp-print-title {
                font-size: 15pt;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 1px;
                color: #000000 !important;
            }
            #gm-print-root.gm-print-bw .rpp-print-meta {
                display: block;
                margin-top: 8px;
                font-size: 10.5pt;
            }
            #gm-print-root.gm-print-bw .rpp-print-meta .meta-chip {
                background: #f0f0f0;
                border: 1px solid #888888;
                color: #000000;
                border-radius: 3px;
                padding: 2px 8px;
                display: inline-block;
                margin: 2px;
                font-weight: 400;
            }
            #gm-print-root.gm-print-bw .rpp-block h4 {
                font-size: 11.5pt;
                font-weight: 800;
                color: #000000 !important;
                border-bottom: 1.5px solid #000000;
                padding-bottom: 4px;
            }
            #gm-print-root.gm-print-bw .rpp-block h4 i { display: none !important; }
            #gm-print-root.gm-print-bw .rpp-block-content { color: #000000 !important; }
            #gm-print-root.gm-print-bw .rpp-rubric-table th,
            #gm-print-root.gm-print-bw .rpp-rubric-table td {
                border: 1px solid #000000;
                color: #000000 !important;
                background: #ffffff !important;
            }
            #gm-print-root.gm-print-bw .rpp-rubric-table th {
                background: #f0f0f0 !important;
                color: #000000 !important;
                text-transform: uppercase;
                font-size: 9.5pt;
            }

            /* ====== SEKSI UMUM (berlaku kedua mode) ====== */
            #gm-print-root .rpp-block {
                border: none !important;
                border-radius: 0 !important;
                background: #ffffff !important;
                padding: 8px 0 !important;
                margin-bottom: 10px !important;
                page-break-inside: avoid;
                break-inside: avoid;
            }

            #gm-print-root .rpp-rubric-wrap { overflow: visible !important; }
            #gm-print-root .rpp-rubric-table {
                width: 100% !important;
                min-width: 0 !important;
                border-collapse: collapse;
                font-size: 10pt !important;
            }
            #gm-print-root .rpp-rubric-table th,
            #gm-print-root .rpp-rubric-table td {
                padding: 6px 8px;
                vertical-align: top;
                text-align: left;
            }
            #gm-print-root .rpp-rubric-table th {
                text-transform: uppercase;
                font-size: 9.5pt;
            }

            /* ====== FOOTER NOTE (hanya tampil saat cetak) ====== */
            #gm-print-root .rpp-print-footer {
                display: block !important;
                margin-top: 24px;
                padding-top: 10px;
                border-top: 1px solid #94a3b8;
                text-align: center;
                font-size: 8.5pt;
                color: #64748b;
                line-height: 1.5;
            }
        }

        @media (max-width: 600px) {
            .materi-card { flex-direction: column; align-items: flex-start; gap: 12px; }
            .materi-left { width: 100%; }
            .materi-actions { width: 100%; justify-content: space-between; margin-left: 0; border-top: 1px solid #f1f5f9; padding-top: 10px; }
            .materi-thumb { width: 65px; height: 65px; }
        }
    `;
    document.head.appendChild(style);
}

// ==========================================
// 4. LOGIC & DATA LOADERS
// ==========================================

async function loadData() {
    const search = document.getElementById("globalSearch").value.toLowerCase();
    const containerMateri = document.getElementById("materi-list");
    const containerAchieve = document.getElementById("achievement-list");
    const loading = document.getElementById("loading-state");

    loading.style.display = 'block';
    containerMateri.innerHTML = '';
    containerAchieve.innerHTML = '';

    try {
        if (currentTab === "materi") {
            // === Query dengan kolom baru (setelah migrasi) ===
            let query = supabase
                .from('materi')
                .select('*, levels(id, kode, detail), sub_levels(name, kode), assembly_guides(id, title, description, image_url, step_number, instruction_text, created_at)')
                .or('is_deleted.is.null,is_deleted.eq.false')
                .order('created_at', { ascending: false });

            if (selectedLevelId !== "all") {
                query = query.eq('level_id', selectedLevelId);
            }

            let { data, error } = await query;

            // === Fallback: Jika tabel/kolom baru belum ada (migrasi belum dijalankan) ===
            if (error) {
                console.warn('[guru-materi] Query utama gagal, mencoba fallback:', error.message);
                let fallbackQuery = supabase
                    .from('materi')
                    .select('*, levels(id, kode, detail), sub_levels(name, kode)')
                    .order('created_at', { ascending: false });

                if (selectedLevelId !== "all") {
                    fallbackQuery = fallbackQuery.eq('level_id', selectedLevelId);
                }

                const fallback = await fallbackQuery;
                data = fallback.data;
                error = fallback.error;
            }

            loading.style.display = 'none';
            if (error) throw error;

            currentMateriCache = data || [];

            const filtered = data ? data.filter(m => {
                const titleMatch = m.title?.toLowerCase().includes(search);
                const descMatch = m.description?.toLowerCase().includes(search);
                const levelMatch = m.levels?.kode?.toLowerCase().includes(search) || m.level?.toLowerCase().includes(search);
                const rpp = parseMateriDetail(m);
                const versionMatch = ('v' + rpp.version).toLowerCase().includes(search);
                const rppMatch = (rpp.tujuan_pembelajaran + rpp.alat_bahan).toLowerCase().includes(search);
                return titleMatch || descMatch || levelMatch || versionMatch || rppMatch;
            }) : [];
            
            if (!filtered.length) {
                containerMateri.innerHTML = `
                    <div style="text-align:center; padding:40px; color:#94a3b8; background:white; border-radius:14px; border:2px dashed #e2e8f0;">
                        <i class="fas fa-book-open" style="font-size:2rem; margin-bottom:10px; color:#cbd5e1;"></i>
                        <p style="margin:0; font-weight:600;">Tidak ada materi ditemukan untuk filter ini.</p>
                    </div>`;
                return;
            }

            containerMateri.innerHTML = filtered.map(m => {
                const rpp = parseMateriDetail(m);
                const hasTitle = Boolean(m.title && m.title.trim());
                const hasImg = Boolean(m.image_url && m.image_url.trim());
                const hasDesc = Boolean((m.description && m.description.trim()) || (m.detail && m.detail.trim()));
                const hasRpp = Boolean(rpp.tujuan_pembelajaran || rpp.kegiatan_inti);
                const hasAssembly = Boolean(rpp.assembly_steps && rpp.assembly_steps.length > 0);
                const isComplete = hasTitle && hasImg && hasDesc && hasRpp && hasAssembly;
                const levelName = m.levels?.kode || m.level || 'Umum';
                const subLevelName = m.sub_level_id ? (m.sub_levels?.name || m.sub_levels?.kode || '') : '';

                return `
                    <div class="materi-card item-card" data-id="${m.id}" data-type="materi">
                        <div class="materi-left" data-action="edit">
                            <div class="materi-thumb">
                                ${hasImg 
                                    ? `<img src="${m.image_url}" alt="${m.title}" loading="lazy">` 
                                    : `<i class="fas fa-robot"></i>`
                                }
                            </div>
                            <div class="materi-info">
                                <div class="materi-badges-top">
                                    <span class="badge-level-tag">
                                        <i class="fas fa-layer-group"></i> ${levelName}
                                    </span>
                                    ${subLevelName ? `<span class="badge-sublevel-tag"><i class="fas fa-tag"></i> ${subLevelName}</span>` : ''}
                                    <span class="badge-version-tag"><i class="fas fa-code-branch"></i> v${rpp.version}</span>
                                    ${hasRpp ? `<span class="badge-rpp-pill"><i class="fas fa-file-circle-check"></i> RPP</span>` : ''}
                                    ${hasAssembly ? `<span class="badge-assembly-pill"><i class="fas fa-puzzle-piece"></i> ${rpp.assembly_steps.length} Steps</span>` : ''}
                                    <span class="badge-status-pill ${isComplete ? 'status-complete' : 'status-draft'}">
                                        <i class="fas ${isComplete ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i>
                                        ${isComplete ? 'Lengkap' : 'Belum Lengkap'}
                                    </span>
                                </div>
                                <h3 class="materi-title">${m.title}</h3>
                                
                                <div class="materi-indicators">
                                    <span class="ind-pill ${hasTitle ? 'ind-ok' : 'ind-no'}" title="Status Judul">
                                        <i class="fas ${hasTitle ? 'fa-check' : 'fa-xmark'}"></i> Judul
                                    </span>
                                    <span class="ind-pill ${hasImg ? 'ind-ok' : 'ind-no'}" title="Status Foto">
                                        <i class="fas ${hasImg ? 'fa-check' : 'fa-xmark'}"></i> Foto
                                    </span>
                                    <span class="ind-pill ${hasRpp ? 'ind-ok' : 'ind-no'}" title="Status RPP">
                                        <i class="fas ${hasRpp ? 'fa-check' : 'fa-xmark'}"></i> RPP
                                    </span>
                                    <span class="ind-pill ${hasAssembly ? 'ind-ok' : 'ind-no'}" title="Status Perakitan">
                                        <i class="fas ${hasAssembly ? 'fa-check' : 'fa-xmark'}"></i> Perakitan
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div class="materi-actions">
                            <button class="btn-rpp-view" data-action="view-rpp" data-id="${m.id}" title="Lihat RPP" aria-label="Lihat RPP">
                                <i class="fas fa-file-signature"></i> RPP
                            </button>
                            <button class="btn-assembly-view" data-action="view-assembly" data-id="${m.id}" title="Buka Petunjuk Perakitan Slider" aria-label="Buka petunjuk perakitan slider">
                                <i class="fas fa-puzzle-piece"></i> Perakitan
                            </button>
                            <button class="btn-action-icon btn-delete" data-id="${m.id}" data-type="materi" title="Hapus Materi" aria-label="Hapus Materi">
                                <i class="fas fa-trash-can"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join("");

        } else {
            // ============ TAB ACHIEVEMENT SEKOLAH ============
            let query = supabase
                .from('achievement_sekolah')
                .select('*, levels(id, kode, detail), sub_levels(name, kode)')
                .order('created_at', { ascending: false });

            if (selectedLevelId !== "all") {
                query = query.eq('level_id', selectedLevelId);
            }

            const { data, error } = await query;
            loading.style.display = 'none';
            if (error) throw error;

            // Hitung pemakaian achievement di pertemuan/absensi (info guru: berapa sesi terpakai)
            let usageMap = {};
            try {
                const { data: ur } = await supabase.from('achievement_kelas').select('achievement_sekolah_id');
                (ur || []).forEach(r => {
                    if (r.achievement_sekolah_id) {
                        usageMap[r.achievement_sekolah_id] = (usageMap[r.achievement_sekolah_id] || 0) + 1;
                    }
                });
            } catch (uErr) { console.warn('[guru-materi] Gagal hitung pemakaian achievement:', uErr.message); }

            const filtered = data ? data.filter(a => {
                const mainMatch = a.main_achievement?.toLowerCase().includes(search);
                const subMatch = a.sub_achievement?.toLowerCase().includes(search);
                const levelMatch = a.levels?.kode?.toLowerCase().includes(search);
                const subLevelMatch = (a.sub_levels?.name || a.sub_levels?.kode || '').toLowerCase().includes(search);
                const subFilterMatch = selectedSubLevelId === "all" || a.sub_level_id === selectedSubLevelId;
                return (mainMatch || subMatch || levelMatch || subLevelMatch) && subFilterMatch;
            }) : [];

            if (!filtered.length) {
                containerAchieve.innerHTML = `
                    <div style="text-align:center; padding:40px; color:#94a3b8; background:white; border-radius:14px; border:2px dashed #e2e8f0;">
                        <i class="fas fa-trophy" style="font-size:2rem; margin-bottom:10px; color:#cbd5e1;"></i>
                        <p style="margin:0; font-weight:600;">Tidak ada achievement ditemukan untuk filter ini.</p>
                    </div>`;
                return;
            }

            const summaryBar = `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; padding:8px 14px; background:#fffbeb; border:1px solid #fde68a; border-radius:10px; font-size:0.8rem; color:#b45309; font-weight:600; flex-wrap:wrap;">
                    <span><i class="fas fa-trophy"></i> ${filtered.length} Achievement</span>
                    <span style="display:inline-flex; align-items:center; gap:5px;"><i class="fas fa-repeat"></i> Angka = pemakaian di sesi absensi</span>
                </div>`;

            containerAchieve.innerHTML = summaryBar + filtered.map(a => {
                const subList = (a.sub_achievement || "").split("\n").filter(s => s.trim() !== "");
                const levelName = a.levels?.kode || 'Umum';
                const subLevelName = a.sub_level_id ? (a.sub_levels?.name || a.sub_levels?.kode || '') : '';
                const usage = usageMap[a.id] || 0;
                const isComplete = Boolean(a.main_achievement && a.main_achievement.trim()) && subList.length >= 1;

                return `
                    <div class="achievement-folder item-card" data-id="${a.id}" data-type="achievement">
                        <div class="ach-header">
                            <div class="ach-title-block">
                                <div class="ach-badges">
                                    <span class="badge-level-tag"><i class="fas fa-layer-group"></i> ${esc(levelName)}</span>
                                    ${subLevelName ? `<span class="badge-sublevel-tag"><i class="fas fa-tag"></i> ${esc(subLevelName)}</span>` : ''}
                                    <span class="badge-status-pill ${isComplete ? 'status-complete' : 'status-draft'}">
                                        <i class="fas ${isComplete ? 'fa-list-check' : 'fa-triangle-exclamation'}"></i>
                                        ${isComplete ? `${subList.length} Indikator` : 'Belum Lengkap'}
                                    </span>
                                    ${usage > 0 ? `<span class="badge-rpp-pill"><i class="fas fa-repeat"></i> ${usage}&times; Dipakai</span>` : ''}
                                    ${a.sub_level_id ? '' : '<span class="badge-version-tag"><i class="fas fa-tag"></i> Tanpa Sub-Level</span>'}
                                </div>
                                <div class="ach-title">
                                    <i class="fas fa-trophy"></i>
                                    <span>${esc(a.main_achievement || 'Tanpa Judul')}</span>
                                </div>
                            </div>
                            <div style="display:flex; align-items:center; gap:4px;">
                                <button class="btn-action-icon btn-dup" data-id="${a.id}" data-type="achievement" title="Duplikat Achievement" aria-label="Duplikat Achievement">
                                    <i class="fas fa-copy"></i>
                                </button>
                                <button class="btn-action-icon btn-delete" data-id="${a.id}" data-type="achievement_sekolah" title="Hapus Achievement" aria-label="Hapus Achievement">
                                    <i class="fas fa-trash-can"></i>
                                </button>
                            </div>
                        </div>
                        <ul class="ach-list">
                            ${subList.length > 0
                                ? subList.map(s => `<li>${esc(s)}</li>`).join("")
                                : "<li style='color:#94a3b8;'>Belum ada sub-indikator</li>"}
                        </ul>
                    </div>
                `;
            }).join("");
        }
    } catch (err) {
        loading.innerHTML = `<span style="color:red; font-weight:600;">Error: ${err.message}</span>`;
    }
}

// ==========================================
// 5. FORM HANDLING (Single-Scroll Form + AI Auto-Fill)
// ==========================================

async function injectFormFields(mode = "add", data = {}) {
    const formFields = document.getElementById("form-fields");
    document.getElementById("modal-title").innerText = `${mode === "edit" ? "Edit" : "Tambah"} ${currentTab === "materi" ? "Materi & RPP Sekolah" : "Achievement Sekolah"}`;

    const levelOptions = levelsList.map(l => `
        <option value="${l.id}" ${data.level_id === l.id ? 'selected' : ''}>
            ${l.kode} ${l.detail ? `(${l.detail})` : ''}
        </option>
    `).join('');

    const renderSubOptions = (lvlId, currentSubId) => {
        const subs = subLevelsList.filter(s => s.level_id === lvlId);
        if (!subs.length) return '<option value="">-- Tidak ada Sub-Level untuk Level ini --</option>';
        return '<option value="">-- Pilih Sub-Level (Opsional) --</option>' + 
            subs.map(s => `
                <option value="${s.id}" ${currentSubId === s.id ? "selected" : ""}>
                    ${s.name}
                </option>
            `).join('');
    };

    if (currentTab === "materi") {
        const rpp = parseMateriDetail(data);
        const currentImg = data.image_url || "https://via.placeholder.com/200?text=Pilih+Foto+Project";
        const hasImg = Boolean(data.image_url);

        formFields.innerHTML = `
            <!-- PANEL ISI OTOMATIS DARI AI (Single Paste) -->
            <div class="gm-ai-box${mode === "add" ? " open" : ""}" id="gm-ai-box">
                <div class="gm-ai-head" id="gm-ai-head" role="button" tabindex="0" aria-expanded="false">
                    <i class="fas fa-wand-magic-sparkles"></i>
                    <div class="gm-ai-title">
                        <strong>Isi Otomatis dari AI</strong>
                        <span>Tempel satu kali hasil RPP dari AI Anda &mdash; semua kolom di bawah terisi otomatis. Tidak perlu pindah-pindah tab.</span>
                    </div>
                    <i class="fas fa-chevron-down gm-ai-caret"></i>
                </div>
                <div class="gm-ai-body">
                    <textarea class="gm-ai-field" rows="7" placeholder="Tempel di sini hasil lengkap RPP dari AI (teks biasa, markdown, atau JSON), lalu klik &quot;Isi Kolom Otomatis&quot;..."></textarea>
                    <div class="gm-ai-actions">
                        <button type="button" id="btn-ai-fill" class="gm-ai-btn-primary">
                            <i class="fas fa-fill-drip"></i> Isi Kolom Otomatis
                        </button>
                        <button type="button" id="btn-ai-copy-prompt" class="gm-ai-btn-ghost">
                            <i class="fas fa-copy"></i> Salin Prompt untuk AI
                        </button>
                        <button type="button" id="btn-ai-example" class="gm-ai-btn-ghost">
                            <i class="fas fa-book-open"></i> Contoh Lesson Plan
                        </button>
                    </div>
                    <p class="gm-ai-hint">
                        <i class="fas fa-circle-info"></i>
                        <span>Tips alur kerja: klik <strong>Salin Prompt untuk AI</strong> &mdash; prompt menyertakan pilihan <strong>Level, Sub-Level &amp; Kit</strong> yang aktif, kolom yang masih kosong <strong>ditanyakan AI dulu SATU PER SATU</strong> (1 pertanyaan per pesan), dan output mengikuti <strong>format 8 section terstandar (A&ndash;H)</strong>. Ingin contoh format ideal? Buka <strong>Contoh Lesson Plan</strong>. Selanjutnya: jawab pertanyaan AI &rarr; salin hasil RPP-nya &rarr; tempel balik di kotak atas &rarr; klik <strong>Isi Kolom Otomatis</strong>.</span>
                    </p>
                </div>
            </div>

            <!-- SECTION A: IDENTITAS, VERSI & PROJECT -->
            <div class="gm-form-section">
                <div class="gm-section-title"><span class="gm-section-letter">A</span> Identitas, Versi &amp; Project</div>
                <div style="display:flex; gap:10px;">
                    <div style="flex:2;">
                        <label>Level Kurikulum *</label>
                        <select id="level_id" required>
                            <option value="">-- Pilih Level --</option>
                            ${levelOptions}
                        </select>
                    </div>
                    <div style="flex:1;">
                        <label>Versi RPP *</label>
                        <input type="text" id="version" value="${rpp.version || "1.0"}" placeholder="Contoh: 1.0" required>
                    </div>
                </div>

                <label>Catatan Revisi Versi Ini (Changelog)</label>
                <input type="text" id="version_notes" value="${rpp.version_notes || ""}" placeholder="Contoh: Penyesuaian durasi & sensor ultrasonic">

                ${mode === "edit" ? `
                    <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:10px; margin-top:10px; display:flex; align-items:center; gap:8px;">
                        <input type="checkbox" id="save_history_snapshot" checked style="width:auto; margin:0; cursor:pointer;">
                        <label for="save_history_snapshot" style="margin:0; font-size:0.82rem; font-weight:700; color:#1d4ed8; cursor:pointer;">Simpan salinan versi lama ke Riwayat Versi (History)</label>
                    </div>
                ` : ''}

                <label>Sub-Level (Opsional)</label>
                <select id="sub_level_id">
                    ${renderSubOptions(data.level_id, data.sub_level_id)}
                </select>

                <label>Judul Materi / Topik Robot *</label>
                <input type="text" id="title" value="${data.title || ""}" placeholder="Contoh: Line Follower Robot" required>
                
                <label>Alokasi Waktu / Durasi Sesi</label>
                <input type="text" id="alokasi_waktu" value="${rpp.alokasi_waktu || ""}" placeholder="Contoh: 2 Sesi (90 Menit)">

                <label>Foto Cover Project (Support Crop 3:4)</label>
                <div style="margin-bottom: 14px;">
                    <button type="button" id="btn-upload-p" style="background:#4d97ff; color:white; border:none; padding:10px; border-radius:10px; cursor:pointer; width:100%; margin-bottom:8px; display:flex; align-items:center; justify-content:center; gap:8px; font-weight:700; font-family:inherit;">
                        <i class="fas fa-camera"></i> ${hasImg ? "Ganti Foto Project" : "Ambil & Potong Foto"}
                    </button>
                    <input type="hidden" id="image_url" value="${data.image_url || ""}">
                    <div style="text-align:center;">
                        <img id="img-preview-p" src="${currentImg}" style="width:100%; max-height:180px; object-fit:cover; border-radius:12px; border:2px solid #e2e8f0; background:#f8fafc;">
                    </div>
                </div>
                
                <label>Deskripsi Singkat Project</label>
                <textarea id="description" rows="2" placeholder="Ringkasan konsep robotik atau mekanisme utama...">${data.description || ""}</textarea>
            </div>

            <!-- SECTION B: TUJUAN PEMBELAJARAN & ALAT/KIT -->
            <div class="gm-form-section">
                <div class="gm-section-title"><span class="gm-section-letter">B</span> Tujuan Pembelajaran &amp; Alat/Kit</div>
                <label>Tujuan Pembelajaran (RPP)</label>
                <textarea id="tujuan_pembelajaran" rows="4" placeholder="Contoh:&#10;1. Siswa memahami fungsi sensor garis.&#10;2. Siswa mampu merakit bodi robot.">${rpp.tujuan_pembelajaran || ""}</textarea>

                <label>Alat & Bahan / Robot Kit Yang Digunakan</label>
                <textarea id="alat_bahan" rows="4" placeholder="Contoh: LEGO WeDo 2.0 Kit, Kabel USB, Laptop/Tablet...">${rpp.alat_bahan || ""}</textarea>
            </div>

            <!-- SECTION C: LANGKAH KEGIATAN PEMBELAJARAN -->
            <div class="gm-form-section">
                <div class="gm-section-title"><span class="gm-section-letter">C</span> Langkah Kegiatan Pembelajaran</div>
                <label>Apersepsi / Pendahuluan (15 Menit)</label>
                <textarea id="kegiatan_apersepsi" rows="3" placeholder="Sapa siswa, apersepsi materi minggu lalu, jelaskan tantangan robot hari ini...">${rpp.kegiatan_apersepsi || ""}</textarea>

                <label>Kegiatan Inti / Perakitan & Coding (60 Menit)</label>
                <textarea id="kegiatan_inti" rows="5" placeholder="Langkah 1: Merakit sasis robot.&#10;Langkah 2: Menghubungkan sensor.&#10;Langkah 3: Pemrograman logika pergerakan...">${rpp.kegiatan_inti || ""}</textarea>

                <label>Kegiatan Penutup / Evaluasi (15 Menit)</label>
                <textarea id="kegiatan_penutup" rows="3" placeholder="Uji coba robot di arena, pengemasan kit, apresiasi karya siswa...">${rpp.kegiatan_penutup || ""}</textarea>
            </div>

            <!-- SECTION D: PENILAIAN & CATATAN GURU -->
            <div class="gm-form-section">
                <div class="gm-section-title"><span class="gm-section-letter">D</span> Penilaian &amp; Catatan Guru</div>
                <label>Indikator Penilaian / Achievement Target</label>
                <textarea id="indikator_penilaian" rows="4" placeholder="Kriteria Penilaian:&#10;- Ketepatan perakitan fisik&#10;- Logika coding berhasil berjalan&#10;- Kerjasama tim">${rpp.indikator_penilaian || ""}</textarea>

                <label>Catatan Tambahan Guru (Detail Opsional)</label>
                <textarea id="detail" rows="3" placeholder="Catatan khusus untuk pengajar...">${data.detail && !data.detail.startsWith('{') ? data.detail : ""}</textarea>
            </div>

            <!-- SECTION E: TIMELINE PEMBELAJARAN (per menit) -->
            <div class="gm-form-section">
                <div class="gm-section-title"><span class="gm-section-letter">E</span> Timeline Pembelajaran (Per Menit)</div>
                <label>Alur Waktu Detail Per Fase / Step</label>
                <textarea id="timeline_pembelajaran" rows="6" placeholder="Fase 1: APERSEPSI (menit ke 0-10)&#10;  • Hook/Icebreaker: 5 menit&#10;    Aktivitas: ...&#10;Fase 2: INTI - ASSEMBLY (menit ke 10-50)&#10;  • Step 1 ...: 8 menit&#10;    Aktivitas: ...">${rpp.timeline_pembelajaran || ""}</textarea>
            </div>

            <!-- SECTION F: TROUBLESHOOTING KRITIS -->
            <div class="gm-form-section">
                <div class="gm-section-title"><span class="gm-section-letter">F</span> Troubleshooting (Masalah &amp; Solusi)</div>
                <label>Masalah Umum, Opsi Penyebab &amp; Checklist Solusi (min. 3)</label>
                <textarea id="troubleshooting" rows="5" placeholder="MASALAH 1: Roda tidak berputar&#10;Opsi Penyebab Umum:&#10;- Kabel motor tidak terpasang&#10;Checklist Solusi:&#10;□ Cek koneksi kabel motor">${rpp.troubleshooting || ""}</textarea>
            </div>

            <!-- SECTION G: RUBRIC PENILAIAN -->
            <div class="gm-form-section">
                <div class="gm-section-title"><span class="gm-section-letter">G</span> Rubric Penilaian (3 Kriteria &times; 4 Skor)</div>
                <label>Kriteria &amp; Deskripsi Skor 4/3/2/1 yang Terukur</label>
                <textarea id="rubric_penilaian" rows="6" placeholder="KRITERIA 1: Ketepatan Perakitan&#10;Skor 4 (Sempurna):&#10;- Semua komponen rapi, sensor ±1cm, kokoh&#10;Skor 3 (Baik):&#10;- ...&#10;Skor 2 (Cukup):&#10;- ...&#10;Skor 1 (Perlu Perbaikan):&#10;- ...">${rpp.rubric_penilaian || ""}</textarea>
            </div>
        `;

        setTimeout(() => {
            const lvlSel = document.getElementById("level_id");
            const subSel = document.getElementById("sub_level_id");
            if (lvlSel && subSel) {
                lvlSel.onchange = (e) => {
                    subSel.innerHTML = renderSubOptions(e.target.value, null);
                };
            }

            const btn = document.getElementById("btn-upload-p");
            if (btn) {
                btn.onclick = () => openImageCropper('robotic_school', url => {
                    document.getElementById("image_url").value = url;
                    document.getElementById("img-preview-p").src = url;
                });
            }

            // === Panel "Isi Otomatis dari AI" ===
            const aiBox = document.getElementById("gm-ai-box");
            const aiHead = document.getElementById("gm-ai-head");
            if (aiBox && aiHead) {
                const toggleAiBox = () => {
                    aiBox.classList.toggle('open');
                    aiHead.setAttribute('aria-expanded', aiBox.classList.contains('open') ? 'true' : 'false');
                };
                aiHead.onclick = toggleAiBox;
                aiHead.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggleAiBox(); } };
            }

            const btnFill = document.getElementById("btn-ai-fill");
            if (btnFill) {
                btnFill.onclick = () => {
                    const raw = (document.querySelector('.gm-ai-field')?.value || '').trim();
                    if (!raw) {
                        showToast('Kotak tempel masih kosong. Tempel dulu hasil RPP dari AI Anda.', 'error');
                        return;
                    }
                    const parsed = parseAiRppText(raw);
                    if (!parsed) {
                        showToast('Tidak ada bagian yang dikenali. Klik "Salin Prompt untuk AI" agar format keluaran AI sesuai.', 'error');
                        return;
                    }
                    applyParsedToForm(parsed);
                    showToast(`${Object.keys(parsed).length} bagian berhasil diisi otomatis. Periksa kembali sebelum menyimpan.`, 'success');
                };
            }

            const btnPrompt = document.getElementById("btn-ai-copy-prompt");
            if (btnPrompt) {
                btnPrompt.onclick = async () => {
                    btnPrompt.disabled = true;
                    try {
                        const promptText = await buildAiPromptTemplate();
                        const ok = await copyToClipboard(promptText);
                        showToast(ok
                            ? 'Prompt disalin. AI akan menanyakan data yang masih kosong SATU PER SATU sebelum membuat RPP.'
                            : 'Gagal menyalin prompt ke clipboard.', ok ? 'success' : 'error');
                    } finally {
                        btnPrompt.disabled = false;
                    }
                };
            }

            const btnExample = document.getElementById("btn-ai-example");
            if (btnExample) {
                btnExample.onclick = () => openExampleLessonPlan();
            }
        }, 50);

    } else {
        formFields.innerHTML = `
            <label>Level Target *</label>
            <select id="level_id" required>
                <option value="">-- Pilih Level Target --</option>
                ${levelOptions}
            </select>

            <label>Sub-Level (Opsional)</label>
            <select id="sub_level_id">
                ${renderSubOptions(data.level_id, data.sub_level_id)}
            </select>

            <label>Topik Utama Achievement *</label>
            <input type="text" id="main_achievement" value="${data.main_achievement || ""}" placeholder="Contoh: Pemahaman Sensor & Motor" required>
            
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px;">
                <label style="margin:0;">Indikator Capaian (Sub-Target)</label>
                <button type="button" id="btn-add-sub" style="background:#10b981; color:white; border:none; padding:6px 14px; border-radius:8px; cursor:pointer; font-size:0.8rem; font-weight:700;">
                    <i class="fas fa-plus"></i> Tambah Baris
                </button>
            </div>
            <div id="sub-ach-container" style="margin-top:10px;"></div>
        `;

        setTimeout(() => {
            const lvlSel = document.getElementById("level_id");
            const subSel = document.getElementById("sub_level_id");
            if (lvlSel && subSel) {
                lvlSel.onchange = (e) => {
                    subSel.innerHTML = renderSubOptions(e.target.value, null);
                };
            }

            const existingSubs = (data.sub_achievement || "").split('\n').filter(s => s.trim() !== "");
            if (existingSubs.length > 0) {
                existingSubs.forEach(val => addSubRow(val));
            } else {
                addSubRow();
            }
            document.getElementById("btn-add-sub").onclick = () => addSubRow();
        }, 50);
    }
}

function addSubRow(value = "") {
    const container = document.getElementById("sub-ach-container");
    const row = document.createElement("div");
    row.style = "display:flex; gap:8px; margin-top:8px;";
    row.innerHTML = `
        <input type="text" class="sub-input" value="${value}" placeholder="Tuliskan indikator..." style="flex:1;">
        <button type="button" class="btn-remove" style="background:#fee2e2; color:#ef4444; border:1px solid #fecaca; border-radius:10px; width:40px; cursor:pointer; font-weight:bold; font-size:1.1rem;">&times;</button>
    `;
    row.querySelector('.btn-remove').onclick = () => row.remove();
    container.appendChild(row);
}

// ==========================================
// 5B. AI PASTE AUTO-FILL (Isi Otomatis dari AI)
// ==========================================

// Escape karakter HTML agar nilai aman disuntikkan ke template form
function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Prompt siap-tempel: konteks HANYA dari pilihan aktif di form (dropdown Level &
// Sub-Level + Kit-nya, judul, durasi). Kolom yang masih kosong TIDAK dikarang —
// AI diwajibkan menanyakannya dulu kepada user sebelum membuat RPP.
function buildAiPromptTemplate() {
    const selLevelId = document.getElementById('level_id')?.value || '';
    const selSubId = document.getElementById('sub_level_id')?.value || '';
    const currentTitle = (document.getElementById('title')?.value || '').trim();
    const currentDurasi = (document.getElementById('alokasi_waktu')?.value || '').trim();

    const selLevel = levelsList.find(l => l.id === selLevelId) || null;
    const selSub = subLevelsList.find(s => s.id === selSubId) || null;

    // ============ FASE 1: DATA FIXED (dari form) ============
    const fixedData = [
        `- Level: ${selLevel ? selLevel.kode + (selLevel.detail ? ` (${selLevel.detail})` : '') : '[Pilih di form]'}`,
        `- Sub-Level: ${selSub ? selSub.name : '[Pilih di form]'}`,
        `- Kit/Alat yang WAJIB dipakai: ${selSub && selSub.kit_alat ? selSub.kit_alat : selSub ? '[Belum diisi di DB - boleh ditanyakan ke user]' : '[Pilih di form]'}`,
        `- Nama Materi (Judul): ${currentTitle || '[Belum diisi - wajib ditanyakan]'}`,
        `- Durasi Sesi Total: ${currentDurasi || '[Belum diisi - wajib ditanyakan]'}`
    ];
    if (selSub && selSub.description) fixedData.push(`- Fokus kit/sub-level: ${selSub.description}`);

    // ============ FASE 2: CLARIFICATION (prioritas WAJIB -> OPTIONAL) ============
    // ATURAN: Level, Sub-Level, dan Kit SUDAH tersedia di DB (dropdown form) —
    // TIDAK BOLEH ditanyakan. Hanya data yang benar-benar tidak ada di DB/form
    // yang ditanyakan (judul materi, durasi, dan kit bila kolom kit di DB kosong).
    const wajibQuestions = [];
    if (!currentTitle) wajibQuestions.push('□ Topik/nama robot apa yang ingin dibuat? (Contoh: Line Follower, Obstacle Avoider, Object Gripper)');
    if (selSub && !selSub.kit_alat) wajibQuestions.push('□ Kit/alat robotik apa yang tersedia? (Contoh: LEGO WeDo 2.0, LEGO Mindstorm, Arduino Kit)');
    if (!currentDurasi) wajibQuestions.push('□ Berapa durasi sesi pembelajaran? (60 menit atau 90 menit?)');

    const optionalQuestions = [
        `□ Durasi ${currentDurasi || 'total durasi'}, tolong estimasi breakdown per fase: Apersepsi __, Assembly __, Coding/Testing __, Penutup __ (total harus = ${currentDurasi || 'total durasi'})`,
        '□ Fokus sesi ini pada apa? (Opsi: Assembly only / Coding only / Keduanya)',
        '□ Fungsi final robot apa yang spesifik? (Contoh: gerak lurus / hindari obstacle / angkat barang / follow line / detect warna / lainnya?)',
        '□ Di akhir sesi robot harus: (Opsi: Berfungsi 100% sempurna / Cukup prototipe dasar yang stabil / Siswa explore bebas, hasil lebih sekunder)',
        '□ Preferensi gaya mengajar? (Opsi: Guided teaching (guru demo dulu) / Discovery learning (siswa explore) / Project-based (siswa buat, guru konsultasi))'
    ];

    const hasWajibMissing = wajibQuestions.length > 0;

    const clarification = hasWajibMissing
        ? [
            '=== FASE 2: CLARIFICATION QUESTIONS (WAJIB SATU PER SATU) ===',
            'JIKA ada data yang kosong ATAU tidak jelas, TANYA dulu. JANGAN langsung buat RPP.',
            'CATATAN PENTING: Level, Sub-Level, dan Kit sudah tersedia di database/form — DILARANG menanyakannya (termasuk usia siswa). Hanya ajukan pertanyaan dari daftar di bawah.',
            'WAJIB: HANYA 1 (satu) pertanyaan dalam 1 pesan, lalu BERHENTI dan tunggu jawaban user. Setelah dijawab, baru ajukan pertanyaan berikutnya.',
            'DILARANG menggabungkan beberapa pertanyaan dalam satu pesan, DILARANG menampilkan daftar pertanyaan sekaligus.',
            'URUTAN: selesaikan SEMUA WAJIB (daftar bawah) satu per satu dulu, baru OPTIONAL yang belum terjawab.',
            'Setelah SEMUA terjawab, langsung generate RPP memakai FORMAT OUTPUT di bawah (tanpa bertanya lagi).',
            'DILARANG mengarang atau mengisi sendiri data yang masih kosong.',
            '',
            '---DAFTAR PRIORITAS PERTANYAAN (JANGAN kirim sekaligus; tanya 1 per 1)---',
            'WAJIB QUESTIONS (CRITICAL DATA):',
            ...wajibQuestions,
            '',
            'OPTIONAL QUESTIONS (DETAIL & REFINEMENT):',
            ...optionalQuestions.map(q => `- ${q}`)
        ]
        : [
            '=== FASE 2: CLARIFICATION QUESTIONS (WAJIB SATU PER SATU) ===',
            'Semua data utama (Level, Sub-Level, Kit, Judul, Durasi) sudah lengkap.',
            'HANYA ajukan OPTIONAL yang belum terjawab, TAPI 1 (satu) pertanyaan per pesan, lalu BERHENTI dan tunggu jawaban.',
            'DILARANG menggabungkan beberapa pertanyaan dalam satu pesan, DILARANG menampilkan daftar pertanyaan sekaligus.',
            'Setelah semua terjawab, langsung generate RPP memakai FORMAT OUTPUT di bawah.',
            '',
            '---DAFTAR PRIORITAS OPTIONAL QUESTIONS (JANGAN kirim sekaligus; tanya 1 per 1)---',
            ...optionalQuestions.map(q => `- ${q}`)
        ];

    // ============ FASE 3: FORMAT OUTPUT RPP (MANDATORY STRUCTURE) ============
    const outputFormat = [
        '=== FASE 3: OUTPUT FORMAT RPP (MANDATORY STRUCTURE) ===',
        'STRUKTUR OUTPUT PERSIS seperti di bawah. Tanpa kalimat pembuka/penutup percakapan.',
        'Baris dalam tanda kurung seperti "(WAJIB breakdown...)" adalah INSTRUKSI untuk AI, JANGAN dicetak ke output.',
        '',
        '---SECTION A: IDENTITAS---',
        'JUDUL: [PERSIS dari DATA FIXED - DILARANG mengubah/mengarang]',
        'LEVEL: [dari form, PERSIS]',
        'SUB-LEVEL: [dari form, PERSIS]',
        'KIT: [dari form, PERSIS]',
        'DURASI TOTAL: [PERSIS dari DATA FIXED]',

        '',
        '---SECTION B: OVERVIEW---',
        'DESKRIPSI: [ringkasan 1-2 kalimat project robotik]',
        '',
        '---SECTION C: TUJUAN---',
        'TUJUAN PEMBELAJARAN:',
        '- [poin 1: apa siswa BISA lakukan di akhir sesi]',
        '- [poin 2: skill/pemahaman konkret]',
        '- [poin 3: kemampuan yang terukur]',
        '',
        '---SECTION D: ALAT & BAHAN---',
        'ALAT DAN BAHAN:',
        '- [komponen wajib dari kit: Smart Hub, Motor, Sensor, Balok, dll]',
        '- [peralatan penunjang: Kabel USB, Laptop/Tablet, Power Bank, dll]',
        '',
        '---SECTION E: TIMELINE PEMBELAJARAN---',
        '(WAJIB breakdown durasi PER STEP dengan timing jelas & presisi)',
        'Fase 1: APERSEPSI (menit ke 0-10 | Total 10 menit)',
        '  • Hook/Icebreaker: 5 menit',
        '    Aktivitas: [deskripsi konkret aktivitas guru]',
        '  • Tanyakan prasyarat & jelaskan tujuan hari ini: 5 menit',
        '    Aktivitas: [deskripsi konkret]',
        'Fase 2: INTI - ASSEMBLY (menit ke X-Y | Total XX menit)',
        '  • Step 1 [nama step konkret]: 8 menit',
        '    Aktivitas: [deskripsi singkat apa yang dirakit & instruksi guru]',
        '  • Step 2 [nama step konkret]: 10 menit',
        '    Aktivitas: [deskripsi singkat]',
        '  • Step 3 [nama step konkret]: 12 menit',
        '    Aktivitas: [deskripsi singkat]',
        'Fase 3: INTI - CODING/TESTING (menit ke X-Y | Total XX menit)',
        '  • Setup & penjelasan logika program: 5 menit',
        '    Aktivitas: [guru jelaskan konsep dasar, misal loop, kondisi, dll]',
        '  • Coding bersama/guided: N menit',
        '    Aktivitas: [siswa buat block program, guru guide step-by-step]',
        '  • Testing & troubleshoot: N menit',
        '    Aktivitas: [test robot, cek error, fix bugs]',
        'Fase 4: PENUTUP (menit ke X-Y | Total XX menit)',
        '  • Refleksi & diskusi: 6 menit',
        '    Pertanyaan: [3-5 pertanyaan pemantik konkret]',
        '  • Showcase & cleanup: 4 menit',
        '    Aktivitas: [demo hasil, rapi kit, feedback guru]',
        '',
        '---SECTION F: LANGKAH-LANGKAH PEMBELAJARAN DETAIL---',
        'PENDAHULUAN / APERSEPSI:',
        '[langkah konkret, poin penting untuk guru, bisa panjang]',
        'INTI - ASSEMBLY (Detail Step-by-Step):',
        '[deskripsi lengkap per step, urutan jelas, instruksi guru detail]',
        'INTI - CODING/TESTING:',
        '[logika program konkret, blok yang digunakan, testing procedure]',
        'PENUTUP:',
        '[refleksi konkret, evaluasi singkat, showcase, cleanup]',
        '',
        '---SECTION G: TROUBLESHOOTING KRITIS---',
        '(TEPAT 3 MASALAH; spesifik untuk kit & mekanisme robot ini, bukan generic)',
        'MASALAH 1: [problem konkret yang umum terjadi]',
        'Opsi Penyebab Umum:',
        '- [opsi A - technical issue]',
        '- [opsi B - programming issue]',
        '- [opsi C - mechanical issue]',
        'Checklist Solusi:',
        '□ [langkah 1 diagnosis]',
        '□ [langkah 2 fixing]',
        '□ [langkah 3 verify]',
        'MASALAH 2: [problem konkret lainnya]',
        'Opsi Penyebab Umum:',
        '- [opsi A]',
        '- [opsi B]',
        'Checklist Solusi:',
        '□ [langkah 1]',
        '□ [langkah 2]',
        'MASALAH 3: [problem konkret lainnya]',
        'Opsi Penyebab Umum:',
        '- [opsi A]',
        '- [opsi B]',
        'Checklist Solusi:',
        '□ [langkah 1]',
        '□ [langkah 2]',
        '',
        '---SECTION H: RUBRIC PENILAIAN (3 KRITERIA, 4 LEVEL MASING-MASING)---',
        '(TEPAT 3 kriteria; setiap kriteria Skor 4/3/2/1 dengan deskripsi TERUKUR)',
        'KRITERIA 1: [nama kriteria konkret - dimensi pertama]',
        'Skor 4 (Sempurna):',
        '- [deskripsi spesifik & terukur]',
        'Skor 3 (Baik):',
        '- [deskripsi spesifik & terukur]',
        'Skor 2 (Cukup):',
        '- [deskripsi spesifik & terukur]',
        'Skor 1 (Perlu Perbaikan):',
        '- [deskripsi spesifik & terukur]',
        'KRITERIA 2: [nama kriteria konkret - dimensi kedua]',
        'Skor 4 (Sempurna):',
        '- [deskripsi spesifik & terukur]',
        'Skor 3 (Baik):',
        '- [deskripsi spesifik & terukur]',
        'Skor 2 (Cukup):',
        '- [deskripsi spesifik & terukur]',
        'Skor 1 (Perlu Perbaikan):',
        '- [deskripsi spesifik & terukur]',
        'KRITERIA 3: [nama kriteria konkret - dimensi ketiga]',
        'Skor 4 (Sempurna):',
        '- [deskripsi spesifik & terukur]',
        'Skor 3 (Baik):',
        '- [deskripsi spesifik & terukur]',
        'Skor 2 (Cukup):',
        '- [deskripsi spesifik & terukur]',
        'Skor 1 (Perlu Perbaikan):',
        '- [deskripsi spesifik & terukur]',
        '',
        '=== ATURAN KERJA (NON-NEGOTIABLE) ===',
        'BEFORE GENERATE RPP:',
        '1. STEP 1: Pastikan WAJIB data (Judul, Durasi; Kit hanya bila kolom Kit di DB kosong) lengkap; jika belum, tanya SATU PER SATU.',
        '2. ATURAN SATU PER SATU: 1 pesan = TEPAT 1 pertanyaan saja. Tunggu jawaban user, baru lanjut ke pertanyaan berikutnya.',
        '3. DILARANG menanyakan banyak hal sekaligus ATAU memunculkan daftar pertanyaan dalam satu pesan.',
        '4. DILARANG menanyakan Level, Sub-Level, Kit (jika sudah tercantum), usia siswa, atau data lain yang sudah tersedia di DB — itu bukan bagian pertanyaan.',
        '5. STEP 2: Setelah WAJIB lengkap, ajukan OPTIONAL yang belum terjawab SATU PER SATU (hanya yang missing).',
        '6. STEP 3: Setelah semua terjawab, generate. JANGAN asumsi/mengarang data yang belum terjawab.',
        '',
        'SAAT GENERATE RPP:',
        '7. IDENTITAS TIDAK BOLEH DIUBAH: Judul, Level, Sub-Level, Kit, dan Durasi WAJIB dipakai PERSIS dari DATA FIXED. DILARANG mengubah, memperindah, menterjemahkan, meringkas, atau mengarang identitas baru.',
        '8. TIMELINE WAJIB: total durasi = jumlah semua fase (tanpa sisa); SETIAP step punya durasi menit + aktivitas konkret.',
        '9. TROUBLESHOOTING: tepat 3 masalah spesifik untuk kit & robot ini; tiap masalah min 2 penyebab & min 2 langkah solusi; format checklist.',
        '10. RUBRIC: tepat 3 kriteria; tiap kriteria Skor 4/3/2/1 dengan deskripsi operasional terukur (bukan samar).',
        '11. Format output PERSIS (---SECTION X---, dash, penomoran). Tanpa pembuka/penutup percakapan.',
        '',
        'QUALITY GATES (cek sebelum submit):',
        '12. Math check: timeline total = durasi yang diminta?',
        '13. Identitas: Judul, Level, Sub-Level, Kit, Durasi PERSIS sama dengan DATA FIXED (tidak berubah satu huruf pun)?',
        '14. Completeness: semua 8 section (A-H) ada?',
        '15. Clarity: setiap poin jelas & operasional?',
        '16. Relevance: troubleshooting & rubric spesifik untuk kit/mekanisme robot ini?'
    ];

    return [
        'Anda adalah perancang RPP (Rencana Pelaksanaan Pembelajaran) untuk sekolah/ekstrakurikuler coding & robotik.',
        'Tugas Anda: buat lesson plan terstruktur 8 section lengkap, timeline detail per menit, troubleshooting kritis, dan rubric penilaian terukur.',
        '',
        '════════════════════════════════════════════════════════════════',
        '',
        '=== FASE 1: DATA YANG SUDAH DIKETAHUI (DATA FIXED dari form, gunakan PERSIS) ===',
        fixedData.join('\n'),
        '',
        ...clarification,
        '',
        ...outputFormat
    ].join('\n');
}

// Salin teks ke clipboard (dengan fallback untuk browser lama / non-secure context)
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        } catch (e2) {
            return false;
        }
    }
}

// ==========================================
// CONTOH LESSON PLAN TERSTANDAR (Format 8 Section A-H)
// ==========================================
const EXAMPLE_LESSON_PLAN_P1 = `---SECTION A: IDENTITAS---
JUDUL: Line Follower Robot - Robot Pengikut Garis
LEVEL: WeDo Basic
SUB-LEVEL: WeDo Basic SD Kelas 3-6
KIT: LEGO Education WeDo 2.0
DURASI TOTAL: 90 menit

---SECTION B: OVERVIEW---
DESKRIPSI: Siswa merakit robot beroda yang mengikuti garis hitam di lintasan, lalu memprogram sensor jarak sebagai "mata" untuk belok kiri-kanan. Project ini memperkenalkan konsep sensor, kondisi (condition), dan loop.

---SECTION C: TUJUAN---
TUJUAN PEMBELAJARAN:
- Siswa mampu merakit sasis roda + smart hub dengan benar mengikuti instruksi dalam 30 menit.
- Siswa mampu menempatkan & mengatur sensor sehingga robot dapat membedakan garis hitam dan kertas putih.
- Siswa mampu menyusun blok program sensor->motor dengan benar sehingga robot berhasil melewati 3 tikungan lintasan.

---SECTION D: ALAT & BAHAN---
ALAT DAN BAHAN:
- WeDo 2.0 Kit: Smart Hub, Motor, Sensor Jarak, Kabel penghubung, Balok & gear
- Laptop/tablet dengan aplikasi WeDo 2.0 + kabel USB
- Lintasan garis hitam (kertas manila + isolasi hitam) + penggaris

---SECTION E: TIMELINE PEMBELAJARAN---
Fase 1: APERSEPSI (menit ke 0-10 | Total 10 menit)
  • Hook/Icebreaker: 5 menit
    Aktivitas: Walt Disney quote menghubungkan ke robot: tampilkan video robot pengikut garis di pabrik, lalu tanya "Apa yang membuat robot ini tahu harus berbelok?"
  • Tanyakan prasyarat & jelaskan tujuan hari ini: 5 menit
    Aktivitas: Tanya pengalaman pakai sensor; tunjukkan lintasan & target hari ini: robot lewati 1 putaran penuh.
Fase 2: INTI - ASSEMBLY (menit ke 10-50 | Total 40 menit)
  • Step 1 Merakit Sasis & Roda: 8 menit
    Aktivitas: Pasang roda, balok penggerak, dan motor pada smart hub mengikuti kartu instruksi.
  • Step 2 Memasang Sensor (posisi ±1 cm dari lantai): 10 menit
    Aktivitas: Pasang sensor jarak menghadap bawah; guru membantu ketepatan sudut & jarak.
  • Step 3 Menghubungkan Kabel & Power: 12 menit
    Aktivitas: Sambungkan motor & sensor ke port smart hub; nyalakan hub; tes putaran manual motor.
  • Step 4 Proteksi & Stabilitas: 10 menit
    Aktivitas: Perkuat sambungan balok, rapikan kabel agar tidak menyangkut roda, uji di tangan.
Fase 3: INTI - CODING/TESTING (menit ke 50-80 | Total 30 menit)
  • Setup & penjelasan logika program: 5 menit
    Aktivitas: Jelaskan blok start, loop, dan "wait until sensor"; buat tabel keputusan sensor kanan/kiri.
  • Coding bersama/guided: 15 menit
    Aktivitas: Susun program: jika sensor di tepi garis -> motor belok; jika di tengah -> motor maju.
  • Testing & troubleshoot: 10 menit
    Aktivitas: Uji robot di lintasan, catat titik gagal, perbaiki program/posisi sensor, uji ulang.
Fase 4: PENUTUP (menit ke 80-90 | Total 10 menit)
  • Refleksi & diskusi: 6 menit
    Aktivitas: Tanya 3 pertanyaan pemantik:
    - Apa bagian tersulit saat merakit?
    - Mengapa sensor harus dekat lantai?
    - Perbaikan apa pertama yang kamu coba saat robot keluar garis?
  • Showcase & cleanup: 4 menit
    Aktivitas: Setiap tim demo 1 putaran; 1 apresiasi dari guru; bongkar & bereskan kit.

---SECTION F: LANGKAH-LANGKAH PEMBELAJARAN DETAIL---
PENDAHULUAN / APERSEPSI:
- Sambut siswa, cek kehadiran, bagi tim 2 siswa per kit.
- Mulai dengan pertanyaan hook: "Kalian pernah lihat robot di pabrik yang bisa jalan sendiri? Kira-kira apa yang membuat dia tahu belok kemana?" → tunjukkan lintasan garis hitam.
- Jelaskan: "Hari ini kita bikin robot 'bermata' yang bisa lihat garis dan belok otomatis. Targetnya: robot lewati 1 putaran lintasan penuh."
- Ingatkan K3: jangan menarik kabel USB, balok tidak boleh dilempar.
INTI - ASSEMBLY (Detail Step-by-Step):
- Bagikan kit per tim; kenalkan nama bagian: smart hub, motor, sensor, kabel.
- Pandu perakitan bertahap: sasis -> motor -> roda -> sensor (sudut 90 derajat menghadap bawah) -> kabel ke port.
- Patokan: "Sensor harus bisa melihat lantai" (jarak ±1 cm) - minta siswa memverifikasi.
- Kelilingi kelas, bantu tim yang kesulitan; gunakan timer per step.
INTI - CODING/TESTING:
- Jelaskan alur program: loop -> cek sensor -> putar motor kanan/kiri.
- Pandu membuat blok: start -> loop forever -> wait until sensor mendeteksi -> set motor power.
- Uji logika lewat simulasi tangan: siswa menutup sensor dengan telapak, lihat respon motor.
- Testing di lintasan; jika gagal, gunakan checklist troubleshooting.
PENUTUP:
- Diskusi refleksi dengan 3 pertanyaan pemantik (lihat timeline).
- Showcase: 1 tim demo, umpan balik spesifik.
- Evaluasi singkat: "Apa 1 hal baru yang kamu pelajari hari ini?"
- Bersihkan kit: bongkar robot, hitung balok, isi inventory kit.
`;
const EXAMPLE_LESSON_PLAN_P2 = `---SECTION G: TROUBLESHOOTING KRITIS---
MASALAH 1: Roda tidak berputar saat program dijalankan
Opsi Penyebab Umum:
- Kabel motor tidak terpasang / port salah pada smart hub
- Smart hub low battery / belum terisi daya
- Nilai "motor power" di blok program = 0
Checklist Solusi:
□ Cek koneksi kabel motor ke port; lepas-pasang ulang
□ Isi daya smart hub; pastikan lampu hijau menyala
□ Ubah nilai motor power minimal 5 di blok program
MASALAH 2: Robot keluar dari garis / tidak mengikuti tikungan
Opsi Penyebab Umum:
- Sensor jarak terlalu tinggi dari lantai (>2 cm) → tidak kuat deteksi terang/gelap
- Motor kanan/kiri tertukar di program → belok arah yang salah
- Kecepatan terlalu tinggi untuk tikungan tajam (power > 7) → tidak sempat bereaksi
- Lintasan kertas/isolasi kusam atau terang → sensor susah bedakan terang/gelap
Checklist Solusi:
□ Turunkan sensor hingga ±1 cm dari lantai, uji lagi
□ Pertukarkan arah motor di blok program (set A vs set B)
□ Kurangi power motor ke 3-5 khusus di area tikungan
□ Bersihkan lintasan, ganti isolasi jika kusam
MASALAH 3: Smart hub tidak terhubung ke laptop/tablet
Opsi Penyebab Umum:
- Bluetooth tidak aktif / hub belum pairing
- Kabel USB rusak atau port salah
- Aplikasi WeDo 2.0 perlu diperbarui
Checklist Solusi:
□ Aktifkan Bluetooth; tekan tombol hub sampai lampu berkedip
□ Ganti kabel USB; colok langsung ke port laptop
□ Tutup & buka kembali aplikasi; pastikan versi terbaru

---SECTION H: RUBRIC PENILAIAN (3 KRITERIA, 4 LEVEL MASING-MASING)---
KRITERIA 1: Ketepatan Perakitan (Sasis, Sensor & Kabel)
Skor 4 (Sempurna):
- Semua komponen rapi, sensor ±1 cm dari lantai, kabel tidak menghalangi roda; robot kokoh saat diangkat.
Skor 3 (Baik):
- Robot berfungsi penuh, tapi ada 1 komponen kurang rapi (mis. kabel tersangkut); mudah diperbaiki.
Skor 2 (Cukup):
- Ada komponen salah pasang (roda kendor/sensor miring) dan cepat lepas; butuh banyak bantuan guru.
Skor 1 (Perlu Perbaikan):
- Robot tidak bisa dijalankan; banyak balok terpasang dangkal/terbalik; sensor tidak berfungsi.
KRITERIA 2: Logika Pemrograman
Skor 4 (Sempurna):
- Program memakai loop + kondisi sensor dengan benar; robot menyelesaikan 1 putaran penuh; siswa bisa menjelaskan tiap blok.
Skor 3 (Baik):
- Program membuat robot jalan & belok, tapi belum konsisten di semua tikungan; alur bisa dijelaskan.
Skor 2 (Cukup):
- Program seadanya (robot jalan lurus saja), belum ada logika sensor yang benar; butuh contoh untuk menyusun blok.
Skor 1 (Perlu Perbaikan):
- Tidak ada program berjalan atau blok teracak; siswa belum bisa menjelaskan fungsi blok apa pun.
KRITERIA 3: Kerjasama Tim & Kemandirian
Skor 4 (Sempurna):
- Kedua anggota aktif: 1 perakit & 1 programmer, lalu bergantian.
  Saat error, coba perbaiki sendiri dulu (min 2 kali) sebelum tanya guru.
Skor 3 (Baik):
- Pembagian peran ada; 1 anggota agak dominan tapi yang lain tetap aktif.
  Langsung tanya guru saat masalah (tidak coba sendiri dulu).
Skor 2 (Cukup):
- Kerja tim tidak terkoordinasi, sering berebut kit; butuh pendampingan intensif.
Skor 1 (Perlu Perbaikan):
- Siswa tidak mau bekerja sama / meninggalkan tim; tidak ada usaha perbaikan saat robot gagal.
`;

const EXAMPLE_LESSON_PLAN = EXAMPLE_LESSON_PLAN_P1 + '\n' + EXAMPLE_LESSON_PLAN_P2;

// Buka modal "Contoh Lesson Plan Terstandar" dari Panel AI
let exampleModalActive = false;

function openExampleLessonPlan() {
    if (exampleModalActive) return;
    exampleModalActive = true;

    const overlay = document.createElement('div');
    overlay.className = 'gm-ex-overlay';
    overlay.innerHTML = `
        <div class="gm-ex-box" role="dialog" aria-modal="true" aria-label="Contoh Lesson Plan Terstandar">
            <div class="gm-ex-head">
                <h3><i class="fas fa-book-open" style="color:#4d97ff;"></i> Contoh Lesson Plan Terstandar (Format 8 Section A-H)</h3>
                <button type="button" class="gm-ex-x" aria-label="Tutup">&times;</button>
            </div>
            <div class="gm-ex-body">
                <p class="gm-ex-note">
                    <i class="fas fa-circle-info"></i> Contoh ini adalah acuan format output RPP yang diminta AI (tombol <strong>Salin Prompt untuk AI</strong> meminta format PERSIS seperti ini).
                    Anda bisa <strong>Salin Teks</strong> sebagai referensi, atau <strong>Tempel &amp; Isi Otomatis</strong> untuk melihat cara seluruh kolom form terisi otomatis.
                </p>
                <pre class="gm-ex-pre">${esc(EXAMPLE_LESSON_PLAN)}</pre>
            </div>
            <div class="gm-ex-foot">
                <button type="button" class="gm-ex-btn gm-ex-btn-ghost" id="gm-ex-close">Tutup</button>
                <button type="button" class="gm-ex-btn gm-ex-btn-ghost" id="gm-ex-copy">Salin Teks</button>
                <button type="button" class="gm-ex-btn gm-ex-btn-primary" id="gm-ex-fill">Tempel &amp; Isi Otomatis</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const destroy = () => { overlay.remove(); exampleModalActive = false; };
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) destroy(); });
    overlay.querySelector('.gm-ex-x').onclick = destroy;
    overlay.querySelector('#gm-ex-close').onclick = destroy;

    overlay.querySelector('#gm-ex-copy').onclick = async () => {
        const ok = await copyToClipboard(EXAMPLE_LESSON_PLAN);
        showToast(ok ? 'Contoh lesson plan disalin ke clipboard.' : 'Gagal menyalin ke clipboard.', ok ? 'success' : 'error');
        if (ok) destroy();
    };

    overlay.querySelector('#gm-ex-fill').onclick = () => {
        const field = document.querySelector('.gm-ai-field');
        if (!field) { showToast('Kotak tempel AI tidak ditemukan.', 'error'); destroy(); return; }
        field.value = EXAMPLE_LESSON_PLAN;
        destroy();
        const btnFill = document.getElementById('btn-ai-fill');
        if (btnFill) btnFill.click();
    };
}

// Pemetaan section header "---SECTION X: NAMA---" -> field form (E/G/H punya field tersendiri)
const SECTION_FIELD_MAP = { E: 'timeline_pembelajaran', G: 'troubleshooting', H: 'rubric_penilaian' };

// Pemetaan field RPP -> kata kunci label (urutan array = urutan prioritas pencocokan)
const AI_FIELD_PATTERNS = [
    { id: 'title', re: /judul|nama\s*(materi|robot|project|proyek)|^topik|materi\s*pembelajaran/i },
    { id: 'description', re: /deskripsi|ringkasan|abstrak|overview|summary/i },
    { id: 'rubric_penilaian', re: /rubrik|rubric|matriks\s*penilaian|scoring\s*guide/i },
    { id: 'indikator_penilaian', re: /penilaian|indikator|assessment|asessment|kriteria|achievement/i },
    { id: 'tujuan_pembelajaran', re: /tujuan|objektif|objective|capaian/i },
    { id: 'timeline_pembelajaran', re: /timeline|alur\s*waktu|pembagian\s*waktu|breakdown\s*waktu/i },
    { id: 'alokasi_waktu', re: /alokasi|durasi|waktu|jam\s*pelajaran|\bjp\b|menit/i },
    { id: 'alat_bahan', re: /\balat\b|\bbahan\b|\bkit\b|peralatan|perangkat|media/i },
    { id: 'kegiatan_apersepsi', re: /apersepsi|pendahuluan|pembuka|opening|introduction/i },
    { id: 'kegiatan_inti', re: /inti|perakitan|coding|praktik|aktivitas|langkah|prosedur|step/i },
    { id: 'kegiatan_penutup', re: /penutup|evaluasi|closing|refleksi|kesimpulan/i },
    { id: 'troubleshooting', re: /troubleshooting|kendala|debugging|solusi\s*masalah/i }
];

function matchAiField(label) {
    for (const fp of AI_FIELD_PATTERNS) {
        if (fp.re.test(label)) return fp.id;
    }
    return null;
}

// Parser utama: menerima output AI (JSON, markdown, atau teks per-bagian) -> objek field form
function parseAiRppText(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;

    // 1) Mode JSON
    if (text.startsWith('{') || text.startsWith('[')) {
        try {
            const jsonResult = mapJsonToRppFields(JSON.parse(text));
            if (jsonResult) return jsonResult;
        } catch (e) { /* bukan JSON valid, lanjut ke mode teks */ }
    }

    // 2) Mode teks per-bagian (label ALL-CAPS, markdown, penomoran, atau label berakhir ':')
    const cleanLabel = (s) => s
        .replace(/^#{1,6}\s*/, '')                                      // markdown heading
        .replace(/^\*\*(.+?)\*\*:?\s*$/, '$1')                          // **bold**
        .replace(/\*\*/g, '')
        .replace(/^\s*(?:\d{1,2}[.)]|[A-Za-z][.)]|[IVX]+[.)])\s*/, '')  // 1. / A. / I.
        .replace(/\s*:\s*$/, '')                                        // label:
        .replace(/\s*\(.*?\)\s*$/, '')                                  // buang anotasi "(15 Menit)"
        .trim();

    const lines = text.split(/\r?\n/);
    const blocks = [];
    let current = null;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            if (current) current.content.push('');
            continue;
        }

        // Probe: salinan tanpa penanda **bold** untuk deteksi heading
        const probe = trimmed.replace(/\*\*/g, '').trim();

        // Baris meta instruksi (mis. "(WAJIB breakdown durasi PER STEP...)") -> diabaikan
        if (/^\(.*\)$/.test(probe) && probe.length <= 200) continue;

        // Header ber-format "---SECTION X: NAMA---" -> mulai/memutus blok; E/G/H punya field sendiri
        const secMatch = /^---+\s*SECTION\s+([A-Za-z])\s*:/i.exec(probe);
        if (secMatch) {
            const secField = SECTION_FIELD_MAP[secMatch[1].toUpperCase()];
            if (secField) {
                current = { fieldId: secField, inline: '', content: [] };
                blocks.push(current);
            } else {
                current = null;
            }
            continue;
        }

        // Baris terstruktur baru (MASALAH n / KRITERIA n / Skor n / Opsi / Checklist serta
        // caption indent "Aktivitas:"/"Pertanyaan:") -> SELALU konten, jangan dianggap heading
        const isIndented = /^\s{2,}/.test(line);
        const isStructuredLine =
            /^MASALAH(\s+\d+|:)/i.test(probe) ||
            /^KRITERIA\s+\d/i.test(probe) ||
            /^SKOR\s*[1-4]/i.test(probe) ||
            /^OPSI(\s+PENYEBAB)?\b/i.test(probe) ||
            /^CHECKLIST\b/i.test(probe) ||
            (isIndented && /^AKTIVITAS\s*:/i.test(probe)) ||
            (isIndented && /^PERTANYAAN\s*:/i.test(probe));
        if (isStructuredLine) {
            if (current) current.content.push(line);
            continue;
        }

        // Baris bullet selalu konten (jangan dianggap heading)
        if (/^[-*•]\s+\S/.test(probe)) {
            if (current) current.content.push(line);
            continue;
        }

        // Deteksi kandidat heading
        const colonIdx = probe.indexOf(':');
        const headPart = colonIdx > -1 ? probe.slice(0, colonIdx).trim() : '';
        const restPart = colonIdx > -1 ? probe.slice(colonIdx + 1).trim() : '';
        const isMarkdownHead = /^#{1,6}\s+/.test(probe);
        const isBoldLine = /^\*\*.+\*\*:?\s*$/.test(trimmed);
        const isBoldInline = /^\*\*[^*]+\*\*\s*:/.test(trimmed);
        const isNumbered = /^\s*(?:\d{1,2}[.)]|[A-Za-z][.)]|[IVX]+[.)])\s+\S/.test(probe);
        const isAllCapsInline = colonIdx > -1 && headPart.length >= 3 && headPart.length <= 60
            && headPart === headPart.toUpperCase() && /[A-Z]/.test(headPart);
        const endsWithColon = /:$/.test(probe) && probe.length <= 90;
        const isInlineLabel = colonIdx > -1 && !isNumbered && headPart.length >= 3 && headPart.length <= 40
            && matchAiField(headPart) !== null;
        const isHeadingLike = isMarkdownHead || isBoldLine || isBoldInline || isAllCapsInline || endsWithColon || isInlineLabel || isNumbered;

        if (isHeadingLike && (probe.length <= 120 || isInlineLabel)) {
            const label = cleanLabel(probe);
            const fieldId = label ? matchAiField(label) : null;
            const labelWords = label ? label.split(/\s+/).length : 99;
            // Baris bernomor hanya dianggap heading bila labelnya pendek (bukan poin list panjang)
            const okNumbered = !isNumbered || labelWords <= 5;
            if (fieldId && okNumbered) {
                current = { fieldId, inline: restPart, content: [] };
                blocks.push(current);
                continue;
            }
            if (isMarkdownHead || isBoldLine || isBoldInline || isAllCapsInline || endsWithColon) {
                // Heading tak dikenali: putus blok agar tidak mencemari field sebelumnya
                current = null;
                continue;
            }
            // Penomoran yang bukan judul bagian (mis. poin list) -> perlakukan sebagai konten
        }

        if (current) current.content.push(line);
        // Baris sebelum heading pertama yang dikenali diabaikan
    }

    const result = {};
    for (const b of blocks) {
        const body = b.content.join('\n').replace(/\n{3,}/g, '\n\n').trim();
        const value = [b.inline, body].filter(v => v && v.trim()).join('\n').trim();
        if (!value) continue;
        // Gabungkan blok ber-field sama (mis. "INTI - ASSEMBLY" + "INTI - CODING/TESTING" -> kegiatan_inti)
        result[b.fieldId] = result[b.fieldId] ? result[b.fieldId] + '\n\n' + value : value;
    }
    return Object.keys(result).length ? result : null;
}

// Petakan output JSON dari AI ke field form (kunci fleksibel, sinonim Indonesia/Inggris)
function mapJsonToRppFields(parsedJson) {
    const root = Array.isArray(parsedJson) ? parsedJson[0] : parsedJson;
    if (!root || typeof root !== 'object') return null;

    const flat = {};
    const walk = (obj, prefix) => {
        for (const [key, val] of Object.entries(obj)) {
            const normKey = (prefix ? prefix + '_' : '') + String(key).toLowerCase().replace(/[\s-]+/g, '_');
            if (val && typeof val === 'object' && !Array.isArray(val)) walk(val, normKey);
            else flat[normKey] = val;
        }
    };
    walk(root, '');

    const SYNONYMS = {
        title: ['judul', 'title', 'materi', 'topik', 'nama_materi', 'nama_robot', 'nama_project', 'nama_proyek', 'nama'],
        description: ['deskripsi', 'description', 'ringkasan', 'summary', 'overview', 'abstrak'],
        version: ['versi', 'version', 'versi_rpp'],
        version_notes: ['version_notes', 'catatan_revisi', 'catatan_versi', 'changelog'],
        alokasi_waktu: ['alokasi_waktu', 'alokasi', 'durasi', 'waktu', 'durasi_sesi', 'durasi_total', 'total_durasi', 'jam_pelajaran'],
        tujuan_pembelajaran: ['tujuan_pembelajaran', 'tujuan', 'objectives', 'objective', 'capaian_pembelajaran'],
        alat_bahan: ['alat_bahan', 'alat_dan_bahan', 'alat', 'bahan', 'kit', 'robot_kit', 'peralatan', 'media'],
        kegiatan_apersepsi: ['kegiatan_apersepsi', 'apersepsi', 'pendahuluan', 'kegiatan_pendahuluan'],
        kegiatan_inti: ['kegiatan_inti', 'inti', 'kegiatan_utama', 'langkah_kegiatan', 'aktivitas_utama'],
        kegiatan_penutup: ['kegiatan_penutup', 'penutup', 'evaluasi', 'closing', 'refleksi'],
        indikator_penilaian: ['indikator_penilaian', 'penilaian', 'indikator', 'kriteria_penilaian', 'assessment'],
        timeline_pembelajaran: ['timeline_pembelajaran', 'timeline', 'alur_waktu', 'pembagian_waktu', 'breakdown_waktu', 'timeline_detail'],
        troubleshooting: ['troubleshooting', 'troubleshooting_kritis', 'masalah_dan_solusi', 'solusi_masalah', 'kendala_umum'],
        rubric_penilaian: ['rubric_penilaian', 'rubrik_penilaian', 'rubrik', 'rubric', 'matriks_penilaian', 'rubric_detail']
    };

    const toText = (val) => {
        if (Array.isArray(val)) {
            return val.map(v => `- ${String(typeof v === 'object' && v !== null ? JSON.stringify(v) : v).trim()}`).join('\n');
        }
        if (val === null || val === undefined || typeof val === 'object') return '';
        return String(val).trim();
    };

    const result = {};
    for (const [field, keys] of Object.entries(SYNONYMS)) {
        // Coba kecocokan kunci persis dulu, lalu kecocokan berakhiran '_sinonim' (JSON nested)
        for (const mode of ['exact', 'suffix']) {
            for (const k of keys) {
                const hit = mode === 'exact'
                    ? (Object.prototype.hasOwnProperty.call(flat, k) ? k : null)
                    : Object.keys(flat).find(fk => fk.endsWith('_' + k));
                if (!hit) continue;
                const val = toText(flat[hit]);
                if (val) { result[field] = val; break; }
            }
            if (result[field]) break;
        }
    }
    return Object.keys(result).length ? result : null;
}

// Terapkan hasil parse ke kolom form yang ada
function applyParsedToForm(parsed) {
    Object.entries(parsed).forEach(([field, value]) => {
        const el = document.getElementById(field);
        if (el) el.value = value;
    });
    const drawer = document.querySelector('#modal-overlay .modal-drawer');
    if (drawer) drawer.scrollTop = 0;
}

// ==========================================
// 6. RPP READER & INTERACTIVE SLIDER VIEWER
// ==========================================
// Render blok troubleshooting: pecah "MASALAH n: ... / Opsi Penyebab Umum: / Checklist Solusi:"
function renderTroubleshooting(text) {
    if (!text || !String(text).trim()) return '<div class="rpp-block-content">Belum diisi.</div>';
    const blocks = [];
    let cur = null;
    let mode = null;
    for (const line of String(text).split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        const mHead = t.match(/^MASALAH\s*\d*\s*:\s*(.*)$/i);
        if (mHead) {
            cur = { title: esc((t.split(':')[0] + ': ' + mHead[1]).trim()), causes: [], checks: [] };
            blocks.push(cur);
            mode = null;
            continue;
        }
        if (!cur) continue;
        if (/^OPSI\s+PENYEBAB/i.test(t)) { mode = 'causes'; continue; }
        if (/^CHECKLIST\s+SOLUSI/i.test(t)) { mode = 'checks'; continue; }
        const clean = t.replace(/^[-*•☐□]\s*/, '').trim();
        if (!clean) continue;
        if (mode === 'causes') cur.causes.push(esc(clean));
        else if (mode === 'checks') cur.checks.push(esc(clean));
    }
    if (!blocks.length) return `<div class="rpp-block-content">${esc(text)}</div>`;
    return blocks.map(b => `
        <div style="margin-bottom:12px; border:1px solid #fecaca; background:#fff8f7; border-radius:10px; padding:12px;">
            <strong style="color:#b91c1c; font-size:0.88rem;"><i class="fas fa-triangle-exclamation" style="font-size:0.75rem;"></i> ${b.title}</strong>
            ${b.causes.length ? `
                <div style="margin-top:8px;">
                    <span style="font-size:0.7rem; font-weight:700; color:#64748b; text-transform:uppercase;">Opsi Penyebab Umum</span>
                    ${b.causes.map(c => `<div style="font-size:0.83rem; color:#334155; line-height:1.5;">- ${c}</div>`).join('')}
                </div>` : ''}
            ${b.checks.length ? `
                <div style="margin-top:8px;">
                    <span style="font-size:0.7rem; font-weight:700; color:#64748b; text-transform:uppercase;">Checklist Solusi</span>
                    ${b.checks.map(c => `<div style="font-size:0.83rem; color:#166534; line-height:1.5;"><i class="fas fa-square-check" style="font-size:0.7rem;"></i> ${c}</div>`).join('')}
                </div>` : ''}
        </div>`).join('');
}

// Render rubric: pecah "KRITERIA n: ... / Skor 4..1" -> tabel 4 kolom skor
function renderRubric(text) {
    if (!text || !String(text).trim()) return '<div class="rpp-block-content">Belum diisi.</div>';
    const rows = [];
    let cur = null;
    let curIdx = 0;
    for (const line of String(text).split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        const mKrit = t.match(/^KRITERIA\s*\d*\s*:\s*(.*)$/i);
        if (mKrit) {
            cur = { title: esc((t.split(':')[0] + ': ' + mKrit[1]).trim()), scores: ['', '', '', ''] };
            curIdx = 0;
            rows.push(cur);
            continue;
        }
        if (!cur) continue;
        const mSkor = t.match(/^Skor\s*([1-4])\b[\s\S]*?:\s*(.*)$/i);
        if (mSkor) {
            curIdx = Number(mSkor[1]) - 1;
            cur.scores[curIdx] = esc(mSkor[2]).trim();
            continue;
        }
        if (cur.scores.some(s => s !== '')) {
            const clean = t.replace(/^[-*•]\s*/, '').trim();
            if (clean) cur.scores[curIdx] += (cur.scores[curIdx] ? '\n' : '') + esc(clean);
        }
    }
    if (!rows.length) return `<div class="rpp-block-content">${esc(text)}</div>`;
    return `
        <div class="rpp-rubric-wrap">
            <table class="rpp-rubric-table">
                <thead>
                    <tr><th>Kriteria</th><th>Skor 4</th><th>Skor 3</th><th>Skor 2</th><th>Skor 1</th></tr>
                </thead>
                <tbody>
                    ${rows.map(r => `
                        <tr>
                            <td><strong style="font-size:0.8rem;">${r.title}</strong></td>
                            ${r.scores.map(s => `<td style="white-space:pre-line; font-size:0.78rem; color:#334155;">${s || '-'}</td>`).join('')}
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}

async function openRppReader(id) {
    const m = currentMateriCache.find(item => item.id === id);
    if (!m) return;

    currentViewingMateri = m;
    const mainRpp = parseMateriDetail(m);
    
    let versionHistory = [];
    try {
        const { data: vData } = await supabase
            .from('materi_versions')
            .select('*')
            .eq('materi_id', id)
            .order('created_at', { ascending: false });
        if (vData && vData.length) {
            versionHistory = vData.map(v => ({
                version: v.version,
                version_notes: v.version_notes || '',
                created_at: v.created_at,
                rpp: v.snapshot || {}
            }));
        }
    } catch (e) {}

    const container = document.getElementById('rpp-preview-container');
    const levelName = m.levels?.kode || m.level || 'Umum';
    const subLevelName = m.sub_levels?.name || m.sub_levels?.kode || '-';

    function renderRppCard(rppData, selectedVer) {
        const isCurrent = selectedVer === mainRpp.version;
        const steps = rppData.assembly_steps || mainRpp.assembly_steps || [];

        return `
            <div class="rpp-preview-card" id="rpp-printable-area">
                <!-- KOP / IDENTITAS STANDAR SEKOLAH (hanya tampil di cetak) -->
                <div class="rpp-print-identitas">
                    <div class="rpp-print-title">RENCANA PELAKSANAAN PEMBELAJARAN (RPP)</div>
                    <div class="rpp-print-meta">
                        <span class="meta-chip">Level: ${esc(levelName)}</span>
                        <span class="meta-chip">Sub-Level: ${esc(subLevelName)}</span>
                        <span class="meta-chip">Judul: ${esc(m.title || '-')}</span>
                        <span class="meta-chip">Durasi: ${esc(rppData.alokasi_waktu || '1 Sesi (60-90 Menit)')}</span>
                    </div>
                </div>

                <div class="rpp-version-bar">
                    <label><i class="fas fa-code-branch"></i> Pilihan Versi RPP:</label>
                    <select id="rpp-version-select">
                        <option value="${mainRpp.version}" ${selectedVer === mainRpp.version ? 'selected' : ''}>
                            v${mainRpp.version} (Versi Aktif ${mainRpp.version_notes ? `- ${mainRpp.version_notes}` : ''})
                        </option>
                        ${versionHistory.map(vh => `
                            <option value="${vh.version}" ${selectedVer === vh.version ? 'selected' : ''}>
                                v${vh.version} ${vh.version_notes ? `- ${vh.version_notes}` : ''} (${new Date(vh.created_at || Date.now()).toLocaleDateString('id-ID')})
                            </option>
                        `).join('')}
                    </select>
                </div>

                <div class="rpp-header-box">
                    <span class="badge-rpp-pill" style="margin-bottom:8px;">
                        <i class="fas fa-graduation-cap"></i> LESSON PLAN (RPP) ROBOPANDA - VERSI ${selectedVer} ${isCurrent ? '' : '(RIWAYAT LAMA)'}
                    </span>
                    <h3>${m.title || 'Materi Pembelajaran'}</h3>
                    ${rppData.version_notes ? `<p style="margin:4px 0 0 0; color:#d97706; font-size:0.85rem; font-weight:600;"><i class="fas fa-note-sticky"></i> Catatan Revisi: ${rppData.version_notes}</p>` : ''}
                    
                    <div class="rpp-meta-grid">
                        <div class="rpp-meta-item">
                            <label>Level</label>
                            <span>${levelName}</span>
                        </div>
                        <div class="rpp-meta-item">
                            <label>Sub-Level</label>
                            <span>${subLevelName}</span>
                        </div>
                        <div class="rpp-meta-item">
                            <label>Alokasi Waktu</label>
                            <span>${rppData.alokasi_waktu || '1 Sesi (60-90 Menit)'}</span>
                        </div>
                        ${steps.length > 0 ? `
                        <div class="rpp-meta-item rpp-meta-assembly">
                            <label>Perakitan</label>
                            <span>${steps.length} Langkah</span>
                        </div>` : ''}
                    </div>
                </div>

                ${m.image_url ? `
                    <div style="text-align:center; margin-bottom:16px;">
                        <img src="${m.image_url}" alt="Project Photo" style="max-height:220px; border-radius:12px; border:1px solid #e2e8f0; object-fit:cover;">
                    </div>
                ` : ''}

                <!-- SECTION A: TUJUAN -->
                <div class="rpp-block">
                    <h4><i class="fas fa-bullseye"></i> A. TUJUAN PEMBELAJARAN</h4>
                    <div class="rpp-block-content">${rppData.tujuan_pembelajaran || 'Belum diisi.'}</div>
                </div>

                <!-- SECTION B: ALAT & BAHAN -->
                <div class="rpp-block">
                    <h4><i class="fas fa-toolbox"></i> B. ALAT & BAHAN / ROBOT KIT</h4>
                    <div class="rpp-block-content">${rppData.alat_bahan || 'Belum diisi.'}</div>
                </div>

                <!-- SECTION C: LANGKAH KEGIATAN -->
                <div class="rpp-block">
                    <h4><i class="fas fa-list-ol"></i> C. LANGKAH-LANGKAH KEGIATAN PEMBELAJARAN</h4>
                    
                    <div style="margin-bottom:12px;">
                        <strong style="color:#1e293b; font-size:0.88rem;">1. Pendahuluan / Apersepsi</strong>
                        <div class="rpp-block-content">${rppData.kegiatan_apersepsi || 'Belum diisi.'}</div>
                    </div>

                    <div style="margin-bottom:12px;">
                        <strong style="color:#1e293b; font-size:0.88rem;">2. Kegiatan Inti (Perakitan & Logika)</strong>
                        <div class="rpp-block-content">${rppData.kegiatan_inti || 'Belum diisi.'}</div>
                    </div>

                    <div>
                        <strong style="color:#1e293b; font-size:0.88rem;">3. Penutup & Evaluasi</strong>
                        <div class="rpp-block-content">${rppData.kegiatan_penutup || 'Belum diisi.'}</div>
                    </div>
                </div>

                <!-- SECTION D: PENILAIAN -->
                <div class="rpp-block">
                    <h4><i class="fas fa-clipboard-check"></i> D. INDIKATOR PENILAIAN / ACHIEVEMENT</h4>
                    <div class="rpp-block-content">${rppData.indikator_penilaian || 'Belum diisi.'}</div>
                </div>

                <!-- SECTION E: TIMELINE -->
                <div class="rpp-block">
                    <h4><i class="fas fa-clock"></i> E. TIMELINE PEMBELAJARAN</h4>
                    <div class="rpp-block-content">${rppData.timeline_pembelajaran ? esc(rppData.timeline_pembelajaran) : 'Belum diisi.'}</div>
                </div>

                <!-- SECTION F: TROUBLESHOOTING -->
                <div class="rpp-block">
                    <h4><i class="fas fa-screwdriver-wrench"></i> F. TROUBLESHOOTING KRITIS</h4>
                    ${renderTroubleshooting(rppData.troubleshooting)}
                </div>

                <!-- SECTION G: RUBRIC -->
                <div class="rpp-block">
                    <h4><i class="fas fa-table-list"></i> G. RUBRIC PENILAIAN</h4>
                    ${renderRubric(rppData.rubric_penilaian)}
                </div>

                <!-- FOOTER NOTE — hanya tampil saat cetak -->
                <div class="rpp-print-footer">
                    <strong>Robopanda Robotic</strong> &nbsp;·&nbsp; Lesson Plan (RPP) Internal &nbsp;·&nbsp; ${esc(levelName)} — ${esc(m.title || 'Materi Pembelajaran')}<br>
                    Dicetak pada: ${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} &nbsp;·&nbsp; Dokumen ini untuk keperluan internal pengajaran
                </div>
            </div>
        `;
    }

    container.innerHTML = renderRppCard(mainRpp, mainRpp.version);

    setTimeout(() => {
        const verSel = document.getElementById('rpp-version-select');
        if (verSel) {
            verSel.onchange = (e) => {
                const targetVer = e.target.value;
                if (targetVer === mainRpp.version) {
                    container.innerHTML = renderRppCard(mainRpp, mainRpp.version);
                } else {
                    const foundHist = versionHistory.find(vh => vh.version === targetVer);
                    if (foundHist) {
                        container.innerHTML = renderRppCard(foundHist.rpp || foundHist, targetVer);
                    }
                }
            };
        }
    }, 50);

    document.getElementById('modal-rpp-overlay').classList.add('active');
}

// Buka Interactive Assembly Slider
function openAssemblySlider(materiId) {
    const m = currentMateriCache.find(item => item.id === materiId);
    if (!m) return;

    currentViewingMateri = m;
    const rpp = parseMateriDetail(m);
    currentViewingSteps = rpp.assembly_steps || [];
    currentStepIndex = 0;

    document.getElementById("viewer-robot-title").innerText = m.title || 'Petunjuk Perakitan Robot';
    renderSliderStep();

    document.getElementById("modal-ag-viewer").classList.add("active");
}

function renderSliderStep() {
    const steps = currentViewingSteps;
    const container = document.getElementById("viewer-slider-body");

    if (!steps || !steps.length) {
        container.innerHTML = `
            <div style="text-align:center; padding:50px; color:#94a3b8;">
                <i class="fas fa-puzzle-piece fa-3x" style="margin-bottom:12px; color:#cbd5e1;"></i>
                <h3 style="margin:0 0 6px 0; color:#1e293b;">Belum ada Langkah Perakitan</h3>
                <p style="margin:0; font-size:0.9rem;">Buka modul <strong>Assembly Guide</strong> untuk menambahkan foto langkah perakitan robot ini.</p>
            </div>`;
        document.getElementById("btn-prev-step").disabled = true;
        document.getElementById("btn-next-step").disabled = true;
        document.getElementById("viewer-step-badge").innerText = `0 Step`;
        document.getElementById("viewer-dots-container").innerHTML = '';
        return;
    }

    const total = steps.length;
    if (currentStepIndex < 0) currentStepIndex = 0;
    if (currentStepIndex >= total) currentStepIndex = total - 1;

    const st = steps[currentStepIndex];
    document.getElementById("viewer-step-badge").innerText = `Step ${currentStepIndex + 1} dari ${total}`;

    container.innerHTML = `
        <div class="ag-viewer-body-content fade-in">
            <div class="ag-step-image-box">
                ${st.image_url 
                    ? `<img src="${st.image_url}" alt="Step ${currentStepIndex + 1}">` 
                    : `<i class="fas fa-camera" style="font-size:3rem; color:#475569;"></i>`
                }
            </div>
            <div class="ag-step-text-box">
                <h4>${st.title || `Langkah ${currentStepIndex + 1}`}</h4>
                <p>${st.instruction_text || 'Tidak ada instruksi khusus.'}</p>
            </div>
        </div>
    `;

    const btnPrev = document.getElementById("btn-prev-step");
    const btnNext = document.getElementById("btn-next-step");
    if (btnPrev) btnPrev.disabled = currentStepIndex === 0;
    if (btnNext) {
        btnNext.disabled = currentStepIndex === total - 1;
        btnNext.innerHTML = currentStepIndex === total - 1 
            ? `Selesai <i class="fas fa-check-circle"></i>` 
            : `Selanjutnya <i class="fas fa-arrow-right"></i>`;
    }

    const dotsContainer = document.getElementById("viewer-dots-container");
    if (dotsContainer) {
        dotsContainer.innerHTML = steps.map((_, i) => `
            <div class="ag-dot ${i === currentStepIndex ? 'active' : ''}" data-idx="${i}"></div>
        `).join("");
    }
}

// ==========================================
// 6B. CETAK RPP (Print via #gm-print-root di body)
// ==========================================

// Cetak area RPP secara andal: clone #rpp-printable-area ke elemen #gm-print-root
// (anak langsung body) lalu panggil window.print(). Dengan pendekatan ini area cetak
// bebas dari clamp modal (fixed/overflow/transform), sehingga tidak pernah kosong.
function printRpp() {
    const source = document.getElementById('rpp-printable-area');
    if (!source || !source.textContent.trim()) {
        showToast('Tidak ada konten RPP untuk dicetak.', 'error');
        return;
    }

    // Siapkan wadah cetak khusus sebagai anak langsung <body>
    let root = document.getElementById('gm-print-root');
    if (!root) {
        root = document.createElement('div');
        root.id = 'gm-print-root';
        document.body.appendChild(root);
    }

    // Terapkan mode cetak: 'gm-print-color' atau 'gm-print-bw'
    root.classList.remove('gm-print-color', 'gm-print-bw');
    root.classList.add(printColorMode ? 'gm-print-color' : 'gm-print-bw');

    // Kloning konten RPP (kontrol interaktif dihapus agar tidak ikut tercetak)
    const clone = source.cloneNode(true);
    clone.querySelectorAll('.rpp-version-bar, .btn-action-icon, button, select, input, .modal-header, .close-btn').forEach(el => el.remove());
    root.innerHTML = '';
    root.appendChild(clone);

    // Paksa reflow sesaat agar browser menyadari elemen baru sebelum print
    void root.offsetHeight;

    // === Atur nama file PDF (via document.title — dipakai browser sebagai default filename) ===
    const originalTitle = document.title;
    if (currentViewingMateri) {
        const levelName = (currentViewingMateri.levels?.kode || currentViewingMateri.level || 'Umum')
            .replace(/[/\\?%*:|"<>]/g, '-').trim();
        const materiTitle = (currentViewingMateri.title || 'Materi')
            .replace(/[/\\?%*:|"<>]/g, '-').trim();
        document.title = `RPP - ${levelName} - ${materiTitle}`;
    }

    // Restore title setelah dialog print / Save as PDF ditutup
    const restoreTitle = () => {
        document.title = originalTitle;
        root.innerHTML = '';
        window.removeEventListener('afterprint', restoreTitle);
    };
    window.addEventListener('afterprint', restoreTitle);

    window.print();
}

// ==========================================
// 7. EVENT HANDLERS & RBAC DELETION
// ==========================================

function setupEventListeners() {
    document.getElementById("btnMateri").onclick = () => switchTab('materi');
    document.getElementById("btnAchievement").onclick = () => switchTab('achievement');
    let searchDebounce;
    document.getElementById("globalSearch").oninput = () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(loadData, 300);
    };

    const chipContainer = document.getElementById("level-filter-bar");
    chipContainer.onclick = (e) => {
        const chip = e.target.closest('.level-chip');
        if (!chip) return;
        chipContainer.querySelectorAll('.level-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        selectedLevelId = chip.dataset.level;
        selectedSubLevelId = 'all';
        renderAchievementSubFilter();
        loadData();
    };

    const subFilterEl = document.getElementById("achievement-sub-level-filter");
    if (subFilterEl) {
        subFilterEl.onchange = (e) => {
            selectedSubLevelId = e.target.value;
            loadData();
        };
    }

    document.getElementById("fab-add").onclick = async () => {
        editingId = null;
        await injectFormFields("add");
        document.getElementById("modal-overlay").classList.add("active");
    };

    document.getElementById("modal-close").onclick = () => {
        document.getElementById("modal-overlay").classList.remove("active");
    };

    document.getElementById("modal-rpp-close").onclick = () => {
        document.getElementById("modal-rpp-overlay").classList.remove("active");
    };

    document.getElementById("modal-ag-viewer-close").onclick = () => {
        document.getElementById("modal-ag-viewer").classList.remove("active");
    };

    const printModeSel = document.getElementById("rpp-print-mode");
    if (printModeSel) {
        printModeSel.value = printColorMode ? 'color' : 'bw';
        printModeSel.onchange = (e) => {
            printColorMode = e.target.value === 'color';
        };
    }
    document.getElementById("btn-print-rpp").onclick = printRpp;

    document.getElementById("btn-open-assembly-from-rpp").onclick = () => {
        if (currentViewingMateri) {
            document.getElementById("modal-rpp-overlay").classList.remove("active");
            openAssemblySlider(currentViewingMateri.id);
        }
    };

    document.getElementById("btn-prev-step").onclick = () => {
        if (currentStepIndex > 0) {
            currentStepIndex--;
            renderSliderStep();
        }
    };

    document.getElementById("btn-next-step").onclick = () => {
        if (currentStepIndex < currentViewingSteps.length - 1) {
            currentStepIndex++;
            renderSliderStep();
        } else {
            document.getElementById("modal-ag-viewer").classList.remove("active");
        }
    };

    document.getElementById("viewer-dots-container").onclick = (e) => {
        const dot = e.target.closest('.ag-dot');
        if (dot) {
            currentStepIndex = parseInt(dot.dataset.idx);
            renderSliderStep();
        }
    };

    document.getElementById("dynamic-form").onsubmit = handleFormSubmit;

    document.getElementById("main-content-area").onclick = (e) => {
        const btnDelete = e.target.closest('.btn-delete');
        if (btnDelete) {
            e.stopPropagation();
            deleteData(btnDelete.dataset.type, btnDelete.dataset.id);
            return;
        }

        const btnDup = e.target.closest('.btn-dup');
        if (btnDup) {
            e.stopPropagation();
            duplicateAchievement(btnDup.dataset.id);
            return;
        }

        const btnRpp = e.target.closest('.btn-rpp-view');
        if (btnRpp) {
            e.stopPropagation();
            openRppReader(btnRpp.dataset.id);
            return;
        }

        const btnAssembly = e.target.closest('.btn-assembly-view');
        if (btnAssembly) {
            e.stopPropagation();
            openAssemblySlider(btnAssembly.dataset.id);
            return;
        }

        const card = e.target.closest('.item-card');
        if (card) {
            openEdit(card.dataset.type, card.dataset.id);
        }
    };

    // Tutup modal saat klik backdrop atau tekan Escape
    document.querySelectorAll('.modal-overlay').forEach(ov => {
        ov.onmousedown = (ev) => { if (ev.target === ov) ov.classList.remove('active'); };
    });
    document.onkeydown = (ev) => {
        if (ev.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(ov => ov.classList.remove('active'));
        }
    };
}

function switchTab(tab) {
    currentTab = tab;
    document.getElementById("btnMateri").className = tab === 'materi' ? 'tab-btn active' : 'tab-btn';
    document.getElementById("btnAchievement").className = tab === 'achievement' ? 'tab-btn active' : 'tab-btn';
    document.getElementById("materi-list").style.display = tab === 'materi' ? 'block' : 'none';
    document.getElementById("achievement-list").style.display = tab === 'achievement' ? 'block' : 'none';
    const subFilter = document.getElementById("achievement-sub-filter");
    if (subFilter) {
        subFilter.style.display = tab === 'achievement' ? 'flex' : 'none';
        if (tab === 'achievement') renderAchievementSubFilter();
    }
    loadData();
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const tableMap = { materi: 'materi', achievement: 'achievement_sekolah' };
    const payload = {};
    
    e.target.querySelectorAll("input:not(.sub-input):not(.gm-ai-field), select, textarea:not(.gm-ai-field)").forEach(el => {
        if (el.id && el.id !== 'save_history_snapshot') payload[el.id] = el.value;
    });

    const shouldSaveHistory = Boolean(document.getElementById('save_history_snapshot')?.checked);

    if (payload.level_id && currentTab === "materi") {
        const matchedLevel = levelsList.find(l => l.id === payload.level_id);
        if (matchedLevel) payload.level = matchedLevel.kode;
        /* Catatan: tabel achievement_sekolah TIDAK punya kolom `level`, hanya `level_id`;
           karena itu payload.level hanya diisi untuk tab materi. */
    }

    // Bersihkan nilai kosong pada kolom FK (Supabase kolom uuid menolak string kosong '')
    if (payload.sub_level_id === '') delete payload.sub_level_id;
    if (payload.level_id === '') delete payload.level_id;

    if (currentTab === "materi") {
        if (editingId && shouldSaveHistory) {
            const oldMateri = currentMateriCache.find(m => m.id === editingId);
            if (oldMateri) {
                const oldDetail = parseMateriDetail(oldMateri);
                try {
                    await supabase.from('materi_versions').insert([{
                        materi_id: editingId,
                        version: oldDetail.version || '1.0',
                        title: oldMateri.title,
                        version_notes: oldDetail.version_notes || 'Versi sebelum diperbarui',
                        snapshot: oldDetail
                    }]);
                } catch (vErr) {}
            }
        }

        const rppBackup = {
            is_rpp: true,
            version: payload.version || '1.0',
            version_notes: payload.version_notes || '',
            alokasi_waktu: payload.alokasi_waktu || '',
            tujuan_pembelajaran: payload.tujuan_pembelajaran || '',
            alat_bahan: payload.alat_bahan || '',
            kegiatan_apersepsi: payload.kegiatan_apersepsi || '',
            kegiatan_inti: payload.kegiatan_inti || '',
            kegiatan_penutup: payload.kegiatan_penutup || '',
            indikator_penilaian: payload.indikator_penilaian || '',
            timeline_pembelajaran: payload.timeline_pembelajaran || '',
            troubleshooting: payload.troubleshooting || '',
            rubric_penilaian: payload.rubric_penilaian || ''
        };
        payload.detail = JSON.stringify(rppBackup);

        try {
            const { error: saveErr } = editingId 
                ? await supabase.from('materi').update(payload).eq('id', editingId)
                : await supabase.from('materi').insert([payload]);

            if (saveErr) {
                delete payload.version; delete payload.version_notes; delete payload.alokasi_waktu;
                delete payload.tujuan_pembelajaran; delete payload.alat_bahan; delete payload.kegiatan_apersepsi;
                delete payload.kegiatan_inti; delete payload.kegiatan_penutup; delete payload.indikator_penilaian;
                delete payload.timeline_pembelajaran; delete payload.troubleshooting; delete payload.rubric_penilaian;

                const { error: retryErr } = editingId 
                    ? await supabase.from('materi').update(payload).eq('id', editingId)
                    : await supabase.from('materi').insert([payload]);
                if (retryErr) throw retryErr;
            }

            document.getElementById("modal-overlay").classList.remove("active");
            loadData();
            showToast(editingId ? "Materi & RPP berhasil diperbarui." : "Materi & RPP berhasil disimpan.", 'success');
            return;
        } catch (err) {
            showToast("Error: " + err.message, 'error');
            return;
        }
    }

    if (currentTab === "achievement") {
        const subInputs = Array.from(document.querySelectorAll(".sub-input"));
        payload.sub_achievement = subInputs.map(i => i.value.trim()).filter(v => v !== "").join('\n');
        const { error } = editingId 
            ? await supabase.from('achievement_sekolah').update(payload).eq('id', editingId)
            : await supabase.from('achievement_sekolah').insert([payload]);
        if (error) showToast("Error: " + error.message, 'error');
        else {
            document.getElementById("modal-overlay").classList.remove("active");
            loadData();
            showToast(editingId ? "Achievement berhasil diperbarui." : "Achievement berhasil disimpan.", 'success');
        }
    }
}

async function openEdit(type, id) {
    const table = type === 'materi' ? 'materi' : 'achievement_sekolah';
    // Achievement tidak punya relasi assembly_guides -> hindari embed yang selalu gagal (fallback)
    const selectCols = table === 'materi'
        ? '*, assembly_guides(id, title, description, image_url, step_number, instruction_text, created_at)'
        : '*';
    let { data, error } = await supabase.from(table).select(selectCols).eq('id', id).single();
    if (error) {
        console.warn('[guru-materi] Embed assembly_guides gagal, fallback select dasar:', error.message);
        const fb = await supabase.from(table).select('*').eq('id', id).single();
        data = fb.data;
    }
    if (data) {
        editingId = id;
        await injectFormFields("edit", data);
        document.getElementById("modal-overlay").classList.add("active");
    }
}

// Duplikat achievement: buka form add dengan data bawaan dari achievement terpilih
async function duplicateAchievement(id) {
    try {
        const { data, error } = await supabase.from('achievement_sekolah').select('*').eq('id', id).single();
        if (error || !data) throw new Error(error?.message || 'Data tidak ditemukan');
        editingId = null;
        await injectFormFields("add", {
            level_id: data.level_id,
            sub_level_id: data.sub_level_id,
            main_achievement: data.main_achievement || '',
            sub_achievement: data.sub_achievement || ''
        });
        document.getElementById("modal-overlay").classList.add("active");
        showToast('Form duplikat siap — ubah bila perlu lalu simpan.', 'info');
    } catch (err) {
        showToast('Gagal duplikat achievement: ' + err.message, 'error');
    }
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = 'gm-toast';
    toast.style.cssText = `
        position:fixed;bottom:26px;left:50%;transform:translateX(-50%) translateY(20px);
        background:#1e293b;color:#fff;padding:12px 20px;border-radius:12px;font-size:.88rem;
        font-weight:700;z-index:2500;opacity:0;transition:.25s;box-shadow:0 10px 30px rgba(0,0,0,.25);
        display:flex;align-items:center;gap:8px;max-width:90vw;font-family:'Roboto',sans-serif;
    `;
    if (type === 'success') toast.style.background = '#059669';
    if (type === 'error') toast.style.background = '#dc2626';
    if (type === 'info') toast.style.background = '#2563eb';
    toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-exclamation' : 'fa-info-circle'}"></i> ${message}`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function openDeleteDialog({ title, message, softLabel = 'Sembunyikan (Soft Delete)', softDanger = false, onSoft, onHard }) {
    const overlay = document.createElement('div');
    overlay.className = 'gm-del-overlay';
    overlay.innerHTML = `
        <div class="gm-del-box">
            <div class="gm-del-head">
                <h3 style="margin:0;font-size:1.05rem;color:#1e293b;display:flex;align-items:center;gap:8px;">
                    <i class="fas fa-trash-can" style="color:#ef4444;"></i>${title}
                </h3>
                <button type="button" class="gm-del-x" aria-label="Tutup">&times;</button>
            </div>
            <p class="gm-del-msg">${message}</p>
            <div class="gm-del-actions">
                <button type="button" class="gm-del-btn gm-del-cancel">Batal</button>
                <button type="button" class="gm-del-btn gm-del-soft" style="${softDanger ? 'background:#dc2626;color:#fff;border-color:#dc2626;' : ''}">${softLabel}</button>
                <button type="button" class="gm-del-btn gm-del-hard" style="${onHard ? '' : 'display:none;'}">Hapus Permanen</button>
            </div>
            <div class="gm-del-hardzone" style="display:none;margin-top:14px;border-top:1px dashed #fecaca;padding-top:12px;">
                <label style="font-size:.82rem;font-weight:700;color:#dc2626;display:block;margin-bottom:6px;">
                    <i class="fas fa-key"></i> Ketik <strong>HAPUS</strong> untuk konfirmasi permanen:
                </label>
                <input type="text" class="gm-del-input" placeholder="HAPUS" autocomplete="off"
                    style="width:100%;padding:10px 12px;border:1px solid #fecaca;border-radius:10px;font-family:inherit;outline:none;">
                <button type="button" class="gm-del-btn gm-del-hard-confirm" disabled
                    style="margin-top:10px;width:100%;background:#dc2626;color:#fff;border:none;padding:11px 14px;border-radius:10px;font-weight:800;cursor:pointer;">
                    <i class="fas fa-radiation"></i> Ya, Hapus Permanen Sekarang
                </button>
            </div>
        </div>
    `;

    const styleEl = document.createElement('style');
    styleEl.textContent = `
        .gm-del-overlay{position:fixed;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(3px);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeIn .2s ease-out;}
        .gm-del-box{background:#fff;border-radius:18px;max-width:430px;width:100%;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,.25);}
        .gm-del-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;}
        .gm-del-x{background:none;border:none;font-size:1.6rem;color:#94a3b8;cursor:pointer;line-height:1;}
        .gm-del-msg{color:#475569;font-size:.92rem;line-height:1.65;margin:0 0 18px;}
        .gm-del-actions{display:flex;gap:8px;flex-wrap:wrap;}
        .gm-del-btn{padding:11px 12px;border-radius:11px;font-weight:800;font-size:.85rem;cursor:pointer;border:1px solid;flex:1;min-width:0;transition:.2s;font-family:inherit;}
        .gm-del-cancel{background:#f1f5f9;color:#475569;border-color:#e2e8f0;}
        .gm-del-cancel:hover{background:#e2e8f0;}
        .gm-del-soft{background:#fffbeb;color:#b45309;border-color:#fde68a;}
        .gm-del-soft:hover{background:#fef3c7;}
        .gm-del-hard{background:#fff1f2;color:#dc2626;border-color:#fecaca;}
        .gm-del-hard:hover{background:#fee2e2;}
        .gm-del-hard:disabled,.gm-del-hard-confirm:disabled{opacity:.45;cursor:not-allowed;}
    `;
    document.head.appendChild(styleEl);
    document.body.appendChild(overlay);

    const box = overlay.querySelector('.gm-del-box');
    const hardZone = overlay.querySelector('.gm-del-hardzone');
    const input = overlay.querySelector('.gm-del-input');
    const hardBtn = overlay.querySelector('.gm-del-hard-confirm');
    let busy = false;

    const destroy = () => { overlay.remove(); styleEl.remove(); };

    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) destroy(); });
    box.querySelector('.gm-del-x').onclick = destroy;
    box.querySelector('.gm-del-cancel').onclick = destroy;
    box.querySelector('.gm-del-soft').onclick = async () => {
        if (busy) return;
        busy = true;
        try { await onSoft(); } finally { destroy(); }
    };
    box.querySelector('.gm-del-hard').onclick = () => { hardZone.style.display = 'block'; input.focus(); };
    input.oninput = () => { hardBtn.disabled = input.value.trim().toUpperCase() !== 'HAPUS'; };
    hardBtn.onclick = async () => {
        if (busy) return;
        busy = true;
        try { await onHard(); } finally { destroy(); }
    };
}

// RBAC DELETION LOGIC: Soft Delete for Teacher, Hard/Soft Delete for Super Admin
async function deleteData(tableType, id) {
    // Achievement Sekolah: tabel belum punya kolom soft-delete (is_deleted/deleted_at/deleted_by),
    // jadi jalur "Sembunyikan" tidak tersedia. Gunakan hard delete permanen dengan proteksi:
    // jika sudah dipakai di achievement_kelas (pertemuan/absensi), tolak penghapusan.
    if (tableType === 'achievement_sekolah') {
        openDeleteDialog({
            title: 'Hapus Achievement',
            message: 'Tindakan ini menghapus achievement SECARA PERMANEN dan tidak bisa dikembalikan.<br>Jika achievement sudah dipakai di sesi absensi, penghapusan akan dibatalkan otomatis.',
            softLabel: 'Ya, Hapus Permanen',
            softDanger: true,
            onSoft: async () => {
                try {
                    const { count: usedCount, error: cErr } = await supabase
                        .from('achievement_kelas')
                        .select('id', { count: 'exact', head: true })
                        .eq('achievement_sekolah_id', id);
                    if (cErr) throw cErr;
                    if (usedCount > 0) {
                        showToast(`Tidak bisa dihapus: sudah dipakai di ${usedCount} sesi absensi.`, 'error');
                        loadData();
                        return;
                    }
                    const { error } = await supabase.from('achievement_sekolah').delete().eq('id', id);
                    if (error) throw error;
                    showToast('Achievement dihapus permanen.', 'success');
                } catch (err) {
                    showToast('Gagal menghapus: ' + err.message, 'error');
                }
                loadData();
            }
        });
        return;
    }

    const softPayload = {
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: currentUserProfile?.id || null
    };

    openDeleteDialog({
        title: userRole === 'super_admin' ? 'Hapus Data' : 'Sembunyikan Data',
        message: userRole === 'super_admin'
            ? '"Sembunyikan" menyembunyikan data dari aplikasi, sedangkan "Hapus Permanen" menghapus data dari database (tidak bisa dikembalikan).'
            : 'Sebagai Guru, Anda hanya dapat menyembunyikan data (Soft Delete). Data tidak akan tampil lagi di aplikasi.',
        softLabel: 'Sembunyikan',
        onSoft: async () => {
            try {
                await supabase.from(tableType).update(softPayload).eq('id', id);
                showToast('Data berhasil disembunyikan (Soft Delete).', 'success');
            } catch (err) {
                showToast('Gagal menyembunyikan data: ' + err.message, 'error');
            }
            loadData();
        },
        onHard: userRole === 'super_admin' ? async () => {
            const { error } = await supabase.from(tableType).delete().eq('id', id);
            if (error) showToast('Gagal menghapus permanen: ' + error.message, 'error');
            else showToast('Data berhasil dihapus permanen.', 'success');
            loadData();
        } : null
    });
}