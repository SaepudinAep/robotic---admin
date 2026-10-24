/** * Project: User Management Module (SPA) - ULTIMATE REVISION
 * Features: Role-Based View, Hard/Soft Delete, Hierarchy Logic, Premium UI
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { supabaseUrl, supabaseKey } from '../assets/js/config.js';

const supabase = createClient(supabaseUrl, supabaseKey);
const EDGE_URL = 'https://aedtrwpomswdqxarvsrg.supabase.co/functions/v1/add-user';

// --- GLOBAL STATE ---
let allUsers = [];
let allLevels = [];
let currentUserId = null; 
let loggedInUserRole = null;

// ==========================================
// 1. INITIALIZATION & STYLES
// ==========================================

export async function init(canvas) {
    injectStyles();
    
    canvas.innerHTML = `
        <div class="um-container">
            <div class="um-header-card">
                <div class="header-text">
                    <h2><i class="fa-solid fa-users-gear"></i> User Management</h2>
                    <p>Kontrol penuh atas akses, hierarki, dan data pengguna.</p>
                </div>
                <div class="header-actions">
                    <div class="search-wrapper">
                        <i class="fa-solid fa-magnifying-glass"></i>
                        <input type="text" id="searchUser" placeholder="Cari Nama / Email...">
                    </div>
                </div>
            </div>

            <div class="um-tabs">
                <button class="tab-btn active" id="tab-reg">
                    <i class="fa-solid fa-user-plus"></i> Registrasi & Data
                </button>
                <button class="tab-btn" id="tab-scope">
                    <i class="fa-solid fa-sitemap"></i> Mapping Area
                </button>
                <button class="tab-btn" id="tab-teacher" style="display:none;">
                    <i class="fa-solid fa-chalkboard-user"></i> Level Guru
                </button>
            </div>

            <div id="panel-reg" class="tab-panel active">
                
                <div class="form-card">
                    <div class="form-header">
                        <h4><i class="fa-solid fa-pen-to-square"></i> Form Input User</h4>
                        <button id="btn-reset-form" class="btn-text">Reset Form</button>
                    </div>
                    <div class="form-grid">
                        <input type="hidden" id="userId">
                        
                        <div class="input-group">
                            <label>Nama Lengkap</label>
                            <input type="text" id="fullName" placeholder="Contoh: Budi Santoso">
                        </div>
                        
                        <div class="input-group">
                            <label>Email Login</label>
                            <input type="email" id="email" placeholder="email@sekolah.com">
                        </div>

                        <div class="input-group">
                            <label>Password</label>
                            <input type="password" id="password" placeholder="(Min. 6 Karakter)">
                            <small class="hint">*Kosongkan jika edit user tanpa ubah password</small>
                        </div>

                        <div class="input-group">
                            <label>Role (Hak Akses)</label>
                            <select id="role">
                                <option value="" disabled selected>-- Pilih Role --</option>
                                </select>
                        </div>
                    </div>
                    <div class="form-footer">
                        <button id="btn-save-user" class="btn-primary">
                            <i class="fa-solid fa-floppy-disk"></i> Simpan Data
                        </button>
                    </div>
                </div>

                <div class="table-card">
                    <table class="modern-table">
                        <thead>
                            <tr>
                                <th width="30%">User Profile</th>
                                <th width="25%">Email</th>
                                <th width="15%">Role</th>
                                <th width="15%">Status</th>
                                <th width="15%" class="text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody id="user-table-body">
                            <tr><td colspan="5" class="loading">Memuat data...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div id="panel-scope" class="tab-panel" style="display:none;">
                <div class="info-banner">
                    <i class="fa-solid fa-circle-info"></i>
                    <div>
                        <strong>Mapping Area</strong> menentukan data sekolah/kelas mana yang bisa diakses user tersebut.
                    </div>
                </div>
                <div class="table-card">
                    <table class="modern-table">
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Role</th>
                                <th>Akses Wilayah (Scope)</th>
                                <th class="text-right">Setting</th>
                            </tr>
                        </thead>
                        <tbody id="scope-table-body"></tbody>
                    </table>
                </div>
            </div>

            <div id="panel-teacher" class="tab-panel" style="display:none;">
                <div class="table-card">
                    <table class="modern-table">
                        <thead>
                            <tr>
                                <th>Nama Guru</th>
                                <th>Email</th>
                                <th>Level Mengajar</th>
                                <th class="text-right">Setting</th>
                            </tr>
                        </thead>
                        <tbody id="teacher-table-body"></tbody>
                    </table>
                </div>
            </div>
        </div>

        <div id="modal-wrapper" class="modal-overlay">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="modal-title">Judul Modal</h3>
                    <span id="close-modal" class="close-btn">&times;</span>
                </div>
                <div id="modal-body" class="modal-body"></div>
                <div id="modal-footer" class="modal-footer"></div>
            </div>
        </div>

        <div id="toast-box" class="toast"></div>
    `;

    await setupLogic();
}

// ==========================================
// 2. CORE LOGIC & SECURITY
// ==========================================

async function setupLogic() {
    // 1. Cek User Login
    const { data: { user } } = await supabase.auth.getUser();
    currentUserId = user?.id || null;

    if (!currentUserId) return showToast("Sesi habis, silakan login ulang", true);

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', currentUserId).single();
    loggedInUserRole = profile?.role || 'student';

    // 2. Proteksi Halaman (Kick Student)
    if (['student'].includes(loggedInUserRole)) {
        document.querySelector('.um-container').innerHTML = `
            <div class="access-denied">
                <i class="fa-solid fa-lock"></i>
                <h2>Akses Dibatasi</h2>
                <p>Anda tidak memiliki izin untuk mengakses halaman manajemen user.</p>
            </div>`;
        return;
    }

    // 3. Konfigurasi UI Berdasarkan Role
    configureRoleUI();

    // 4. Fetch Data Awal
    await fetchLevels();
    await fetchUsers();

    // 5. Setup Event Listeners
    setupEvents();
}

function configureRoleUI() {
    const roleSelect = document.getElementById('role');
    const tabTeacher = document.getElementById('tab-teacher');

    // Reset opsi
    roleSelect.innerHTML = '';

    if (loggedInUserRole === 'super_admin') {
        // Super Admin: Full Power
        roleSelect.innerHTML = `
            <option value="student">Student (Siswa)</option>
            <option value="pic">PIC (Staff/Ortu)</option>
            <option value="teacher">Teacher (Tim Internal)</option>
            <option value="super_admin">Super Admin</option>
        `;
        if (tabTeacher) tabTeacher.style.display = 'block'; // Bisa atur level guru
    } 
    else if (loggedInUserRole === 'teacher') {
        // Teacher: Hanya bawahan
        roleSelect.innerHTML = `
            <option value="student">Student (Siswa)</option>
            <option value="pic">PIC (Staff/Ortu)</option>
        `;
        if (tabTeacher) tabTeacher.style.display = 'none'; // Guru tidak atur level guru lain
    } 
    else if (loggedInUserRole === 'pic') {
        // PIC: Hanya siswa
        roleSelect.innerHTML = `<option value="student">Student (Siswa)</option>`;
        if (tabTeacher) tabTeacher.style.display = 'none';
    }
}

function setupEvents() {
    // Tab Switching
    document.getElementById('tab-reg').onclick = () => switchTab('reg');
    document.getElementById('tab-scope').onclick = () => switchTab('scope');
    if (document.getElementById('tab-teacher')) {
        document.getElementById('tab-teacher').onclick = () => switchTab('teacher');
    }

    // Form Actions
    document.getElementById('btn-save-user').onclick = saveUser;
    document.getElementById('btn-reset-form').onclick = resetForm;
    document.getElementById('searchUser').oninput = renderTables;

    // Table Actions (Delegation)
    document.getElementById('user-table-body').onclick = handleUserTableAction;
    document.getElementById('scope-table-body').onclick = handleScopeTableAction;
    document.getElementById('teacher-table-body').onclick = handleTeacherTableAction;

    // Modal
    document.getElementById('close-modal').onclick = closeModal;
    document.getElementById('modal-wrapper').onclick = (e) => {
        if (e.target.id === 'modal-wrapper') closeModal();
    };
}

function switchTab(target) {
    document.querySelectorAll('.tab-panel').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    document.getElementById(`panel-${target}`).style.display = 'block';
    document.getElementById(`tab-${target}`).classList.add('active');
}

// ==========================================
// 3. DATA FETCHING
// ==========================================

async function fetchLevels() {
    const { data } = await supabase.from('levels').select('*').order('kode');
    allLevels = data || [];
}

async function fetchUsers() {
    // Fetch lengkap dengan relasi untuk mapping
    const { data, error } = await supabase
        .from('user_profiles')
        .select(`
            id, name, email, role, is_active, 
            school_id, class_id, group_id, class_private_id, level_id,
            schools(name), classes(name), 
            group_private(code), class_private(name), 
            levels(kode)
        `)
        .order('created_at', { ascending: false });

    if (error) return showToast("Gagal mengambil data user", true);

    allUsers = data.map(u => ({
        ...u,
        email: u.email || "(Belum Sinkron)",
        // Format Scope Text untuk tabel
        scopeText: formatScope(u),
        levelCode: u.levels?.kode || '-'
    }));

    renderTables();
}

function formatScope(u) {
    if (u.role === 'super_admin') return '<span class="badge badge-gray">Global Access</span>';

    const school = u.schools?.name;
    const group = u.group_private?.code;
    const cls = u.classes?.name || u.class_private?.name;

    if (!school && !group) {
        return '<span style="color:#94a3b8; font-style:italic;">Belum Set</span>';
    }

    const typeBadge = school 
        ? '<span style="background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:4px; font-size:0.75rem; margin-right:4px;">Sekolah</span>'
        : '<span style="background:#fef3c7; color:#92400e; padding:2px 6px; border-radius:4px; font-size:0.75rem; margin-right:4px;">Private</span>';

    let main = school || group;
    let sub = cls ? `<i class="fa-solid fa-chevron-right" style="font-size:0.7em; margin:0 5px; color:#94a3b8;"></i> <strong>${esc(cls)}</strong>` : (u.role !== 'student' ? ' <span style="color:#64748b; font-size:0.8rem;">(Semua Kelas)</span>' : '');

    return `${typeBadge} <strong>${esc(main)}</strong>${sub}`;
}

// ==========================================
// 4. RENDERING TABLES (THE LOGIC CORE)
// ==========================================

function renderTables() {
    renderUserTable();
    renderScopeTable();
    if (loggedInUserRole === 'super_admin') renderTeacherLevelTable();
}

function renderUserTable() {
    const search = document.getElementById('searchUser').value.toLowerCase();
    const tbody = document.getElementById('user-table-body');

    const filtered = allUsers.filter(u => {
        // --- LOGIC 1: ROLE FILTER ---
        if (loggedInUserRole === 'teacher') {
            // Sembunyikan Super Admin
            if (u.role === 'super_admin') return false;
            // Sembunyikan Teacher LAIN (Kecuali Diri Sendiri)
            if (u.role === 'teacher' && u.id !== currentUserId) return false;
        }
        if (loggedInUserRole === 'pic') {
            // PIC hanya lihat Student & Diri Sendiri
            if (u.id === currentUserId) return true;
            if (u.role !== 'student') return false;
        }

        // --- LOGIC 2: STATUS FILTER ---
        // Super Admin lihat semua (Active & Inactive).
        // Role lain HANYA lihat yang Active (Kecuali diri sendiri, jaga-jaga).
        if (loggedInUserRole !== 'super_admin' && u.id !== currentUserId) {
            if (u.is_active === false) return false; 
        }

        // --- LOGIC 3: SEARCH ---
        return (u.name?.toLowerCase().includes(search) || u.email?.toLowerCase().includes(search));
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:#94a3b8;">Data tidak ditemukan.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(u => {
        const isMe = u.id === currentUserId;
        const isActive = u.is_active;

        // Tentukan Tombol Delete
        let btnDelete = '';
        // Aturan: Tidak boleh hapus diri sendiri
        if (!isMe) {
            if (loggedInUserRole === 'super_admin') {
                // Hard Delete / Restore
                btnDelete = `<button class="action-btn btn-delete" data-id="${u.id}" title="Hapus Permanen"><i class="fa-solid fa-trash-can"></i></button>`;
            } else {
                // Soft Delete (Teacher/PIC)
                btnDelete = `<button class="action-btn btn-delete" data-id="${u.id}" title="Non-aktifkan User"><i class="fa-solid fa-user-slash"></i></button>`;
            }
        }

        // Visual Styling
        const rowStyle = !isActive ? 'background: #f8fafc; opacity: 0.6;' : '';
        const statusBadge = isActive 
            ? '<span class="status-dot active"></span> Aktif' 
            : '<span class="status-dot inactive"></span> Non-Aktif';
        
        const meBadge = isMe ? '<span class="me-tag">SAYA</span>' : '';

        return `
            <tr style="${rowStyle}">
                <td>
                    <div class="user-info">
                        <div class="user-avatar">${(u.name?.[0] || '?').toUpperCase()}</div>
                        <div>
                            <div class="user-name">${u.name || 'Tanpa Nama'} ${meBadge}</div>
                            <div class="user-sub">Terdaftar: ${new Date(u.created_at || Date.now()).toLocaleDateString('id-ID')}</div>
                        </div>
                    </div>
                </td>
                <td>${u.email}</td>
                <td><span class="badge role-${u.role}">${u.role.replace('_', ' ')}</span></td>
                <td>${statusBadge}</td>
                <td class="text-right">
                    <div class="action-group">
                        <button class="action-btn btn-edit" data-id="${u.id}" title="Edit Data"><i class="fa-solid fa-pen"></i></button>
                        ${btnDelete}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderScopeTable() {
    const tbody = document.getElementById('scope-table-body');
    const search = (document.getElementById('searchUser')?.value || '').toLowerCase().trim();

    // Filter logic: Mapping biasanya untuk bawahan
    const list = allUsers.filter(u => {
        if (loggedInUserRole === 'super_admin') {
            if (!['teacher', 'pic', 'student'].includes(u.role)) return false;
        } else if (loggedInUserRole === 'teacher') {
            if (!(['pic', 'student'].includes(u.role) && u.is_active)) return false;
        } else if (loggedInUserRole === 'pic') {
            if (!(u.role === 'student' && u.is_active)) return false;
        } else {
            return false;
        }

        if (search) {
            return (u.name?.toLowerCase().includes(search) || u.email?.toLowerCase().includes(search));
        }
        return true;
    });

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; color:#94a3b8;">Data user untuk mapping tidak ditemukan.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(u => `
        <tr>
            <td style="font-weight:600;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <div class="user-avatar" style="width:30px; height:30px; font-size:0.85rem;">${(u.name?.[0] || '?').toUpperCase()}</div>
                    <div>
                        <div>${esc(u.name || 'Tanpa Nama')}</div>
                        <div style="font-size:0.75rem; color:#94a3b8;">${esc(u.email || '-')}</div>
                    </div>
                </div>
            </td>
            <td><span class="badge role-${u.role}">${u.role.replace('_', ' ')}</span></td>
            <td>${u.scopeText}</td>
            <td class="text-right">
                <button class="btn-small btn-outline btn-map" data-id="${u.id}">
                    <i class="fa-solid fa-gear"></i> Atur
                </button>
            </td>
        </tr>
    `).join('');
}

function renderTeacherLevelTable() {
    const tbody = document.getElementById('teacher-table-body');
    const teachers = allUsers.filter(u => u.role === 'teacher'); // Admin see all teachers

    tbody.innerHTML = teachers.map(u => `
        <tr>
            <td style="font-weight:600;">${u.name}</td>
            <td>${u.email}</td>
            <td>
                <span style="background:#eff6ff; color:#2563eb; padding:4px 8px; border-radius:6px; font-weight:bold; font-size:0.85rem;">
                    ${u.levelCode}
                </span>
            </td>
            <td class="text-right">
                <button class="btn-small btn-outline btn-level" data-id="${u.id}">
                    <i class="fa-solid fa-layer-group"></i> Level
                </button>
            </td>
        </tr>
    `).join('');
}

// ==========================================
// 5. ACTIONS: SAVE, EDIT, DELETE
// ==========================================

async function saveUser() {
    const id = document.getElementById('userId').value;
    const name = document.getElementById('fullName').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const role = document.getElementById('role').value;

    if (!name || !email || (!id && !password) || !role) {
        return showToast("Mohon lengkapi semua field!", true);
    }

    const btn = document.getElementById('btn-save-user');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Proses...';
    btn.disabled = true;

    try {
        // Menggunakan Edge Function untuk Create/Update Auth & DB
        const reqPayload = { 
            action: id ? 'UPDATE' : 'CREATE', 
            userId: id || undefined, 
            name, 
            email, 
            role 
        };
        if (password && password.trim() !== '') {
            reqPayload.password = password;
        }

        const response = await fetch(EDGE_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'apikey': supabaseKey, 
                'Authorization': Bearer  
            },
            body: JSON.stringify(reqPayload)
        });

        if (!response.ok) {
            const msg = await response.text();
            throw new Error(msg);
        }

        showToast("Data user berhasil disimpan!");
        resetForm();
        await fetchUsers();

    } catch (e) {
        showToast("Error: " + e.message, true);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function handleUserTableAction(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;

    if (btn.classList.contains('btn-edit')) {
        const u = allUsers.find(x => x.id === id);
        if (u) populateForm(u);
    } 
    else if (btn.classList.contains('btn-delete')) {
        deleteUser(id);
    }
}

function populateForm(u) {
    document.getElementById('userId').value = u.id;
    document.getElementById('fullName').value = u.name;
    document.getElementById('email').value = u.email;
    document.getElementById('password').value = ''; // Reset password field
    document.getElementById('password').placeholder = '(Biarkan kosong jika tidak diubah)';
    
    // Set Role (handle case if role not in current user's permission)
    const roleSel = document.getElementById('role');
    const roleOpt = roleSel.querySelector(`option[value="${u.role}"]`);
    if (roleOpt) roleSel.value = u.role;

    // Scroll to form
    document.querySelector('.form-card').scrollIntoView({ behavior: 'smooth' });
    
    // UI Feedback
    document.querySelector('.form-header h4').innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Edit User: <b>${u.name}</b>`;
    document.getElementById('btn-save-user').innerHTML = '<i class="fa-solid fa-check"></i> Update Data';
}

function resetForm() {
    document.getElementById('userId').value = '';
    document.getElementById('fullName').value = '';
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
    document.getElementById('password').placeholder = '(Min. 6 Karakter)';
    document.getElementById('role').selectedIndex = 0;
    
    document.querySelector('.form-header h4').innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Form Input User`;
    document.getElementById('btn-save-user').innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Simpan Data';
}

async function deleteUser(id) {
    const u = allUsers.find(x => x.id === id);
    if (!u) return;

    // A. LOGIKA HARD DELETE (SUPER ADMIN)
    if (loggedInUserRole === 'super_admin') {
        if (!confirm(`HAPUS PERMANEN user ${u.name}?\nData tidak bisa dikembalikan!`)) return;

        try {
            const res = await fetch(EDGE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
                body: JSON.stringify({ action: 'DELETE', userId: id })
            });
            if (res.ok) { showToast("User dihapus permanen."); await fetchUsers(); }
            else { showToast("Gagal menghapus.", true); }
        } catch (e) { showToast("Koneksi Error", true); }
    }
    // B. LOGIKA SOFT DELETE (TEACHER/PIC)
    else {
        if (!confirm(`Non-aktifkan user ${u.name}?\nUser akan hilang dari daftar ini.`)) return;

        const { error } = await supabase.from('user_profiles').update({ is_active: false }).eq('id', id);
        if (error) showToast("Gagal update status: " + error.message, true);
        else { showToast("User berhasil dinonaktifkan."); await fetchUsers(); }
    }
}

// ==========================================
// 6. MODAL HANDLERS (SCOPE & LEVEL)
// ==========================================

function handleScopeTableAction(e) {
    const btn = e.target.closest('button');
    if (btn?.classList.contains('btn-map')) showMappingModal(btn.dataset.id);
}

function handleTeacherTableAction(e) {
    const btn = e.target.closest('button');
    if (btn?.classList.contains('btn-level')) showLevelModal(btn.dataset.id);
}

async function showMappingModal(userId) {
    const u = allUsers.find(x => x.id === userId);
    if (!u) return showToast("User tidak ditemukan", true);

    const isStudent = u.role === 'student';
    let currentType = '';
    if (u.school_id) currentType = 'sekolah';
    else if (u.group_id) currentType = 'private';

    const modalTitle = `Atur Mapping: ${esc(u.name || u.email)}`;
    
    const bodyHtml = `
        <div style="margin-bottom: 16px; font-size: 0.85rem; color: #475569; background: #f8fafc; padding: 12px 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <div style="font-size:0.95rem; font-weight:700; color:#1e293b;">${esc(u.name || 'Tanpa Nama')}</div>
            <div style="color:#64748b; font-size:0.8rem; margin-top:2px;">${esc(u.email || '-')} &bull; <span class="badge role-${u.role}" style="font-size:0.65rem;">${u.role.replace('_', ' ')}</span></div>
            <div style="margin-top: 6px; padding-top:6px; border-top:1px dashed #cbd5e1;">
                <strong>Scope Saat Ini:</strong> ${u.scopeText || 'Belum Set'}
            </div>
        </div>

        <input type="hidden" id="map-user-id" value="${u.id}">
        
        <div class="input-group" style="margin-bottom:14px;">
            <label style="font-weight:700; margin-bottom:6px; display:block;">Tipe Institusi</label>
            <select id="map-type" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px;">
                <option value="">-- Pilih Tipe --</option>
                <option value="sekolah" ${currentType === 'sekolah' ? 'selected' : ''}>Sekolah Formal</option>
                <option value="private" ${currentType === 'private' ? 'selected' : ''}>Kursus / Private</option>
            </select>
        </div>

        <div class="input-group" style="margin-bottom:14px;">
            <label id="lbl-map-parent" style="font-weight:700; margin-bottom:6px; display:block;">Institusi Induk</label>
            <select id="map-parent" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px;">
                <option value="">-- Pilih Tipe Terlebih Dahulu --</option>
            </select>
        </div>

        <div class="input-group" id="group-child" style="margin-bottom:14px;">
            <label id="lbl-map-child" style="font-weight:700; margin-bottom:6px; display:block;">
                Kelas / Unit ${isStudent ? '<span style="color:#ef4444;">* (Wajib untuk Siswa)</span>' : '<span style="color:#64748b; font-weight:normal; font-size:0.8rem;">(Opsional - kosongkan jika seluruh sekolah/group)</span>'}
            </label>
            <select id="map-child" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px;">
                <option value="">-- Pilih Induk Terlebih Dahulu --</option>
            </select>
        </div>
    `;

    const hasMapping = !!(u.school_id || u.group_id || u.class_id || u.class_private_id);
    const footerHtml = `
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:10px;">
            <div>
                ${hasMapping ? `
                    <button type="button" id="btn-clear-map" class="btn-text" style="color:#ef4444; font-size:0.85rem; padding:0; text-decoration:none;">
                        <i class="fa-solid fa-trash-can"></i> Hapus Mapping
                    </button>
                ` : ''}
            </div>
            <div style="display:flex; gap:8px;">
                <button type="button" id="btn-cancel-map" class="btn-small btn-outline">Batal</button>
                <button type="button" id="btn-save-map" class="btn-primary" style="padding:8px 18px;">
                    <i class="fa-solid fa-floppy-disk"></i> Simpan
                </button>
            </div>
        </div>
    `;

    openModal(modalTitle, bodyHtml, footerHtml);

    document.getElementById('btn-cancel-map').onclick = closeModal;

    const typeSel = document.getElementById('map-type');
    const parentSel = document.getElementById('map-parent');
    const childSel = document.getElementById('map-child');
    const lblParent = document.getElementById('lbl-map-parent');

    async function loadParents(type, selectedParentId = null) {
        if (!type) {
            lblParent.innerText = 'Institusi Induk';
            parentSel.innerHTML = '<option value="">-- Pilih Tipe Terlebih Dahulu --</option>';
            parentSel.disabled = true;
            childSel.innerHTML = '<option value="">-- Pilih Induk Terlebih Dahulu --</option>';
            childSel.disabled = true;
            return;
        }

        parentSel.disabled = false;
        parentSel.innerHTML = '<option value="">Memuat data...</option>';
        childSel.innerHTML = '<option value="">-- Pilih Induk Terlebih Dahulu --</option>';
        childSel.disabled = true;

        if (type === 'sekolah') {
            lblParent.innerText = 'Pilih Sekolah';
            const { data, error } = await supabase.from('schools').select('id, name').order('name');
            if (error || !data) {
                parentSel.innerHTML = '<option value="">Gagal memuat sekolah</option>';
                return;
            }
            parentSel.innerHTML = '<option value="">-- Pilih Sekolah --</option>' +
                data.map(d => `<option value="${d.id}" ${d.id === selectedParentId ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
        } else if (type === 'private') {
            lblParent.innerText = 'Pilih Group Private';
            const { data, error } = await supabase.from('group_private').select('id, code, owner').order('code');
            if (error || !data) {
                parentSel.innerHTML = '<option value="">Gagal memuat group</option>';
                return;
            }
            parentSel.innerHTML = '<option value="">-- Pilih Group Private --</option>' +
                data.map(d => `<option value="${d.id}" ${d.id === selectedParentId ? 'selected' : ''}>${esc(d.code || 'Tanpa Kode')}${d.owner ? ' (' + esc(d.owner) + ')' : ''}</option>`).join('');
        }
    }

    async function loadChildren(type, parentId, selectedChildId = null) {
        if (!type || !parentId) {
            childSel.innerHTML = '<option value="">-- Pilih Induk Terlebih Dahulu --</option>';
            childSel.disabled = true;
            return;
        }

        childSel.disabled = false;
        childSel.innerHTML = '<option value="">Memuat kelas...</option>';

        const table = type === 'sekolah' ? 'classes' : 'class_private';
        const col = type === 'sekolah' ? 'school_id' : 'group_id';

        const { data, error } = await supabase.from(table).select('id, name').eq(col, parentId).order('name');
        if (error || !data) {
            childSel.innerHTML = '<option value="">Gagal memuat kelas</option>';
            return;
        }

        if (data.length === 0) {
            childSel.innerHTML = '<option value="">(Belum ada kelas terdaftar)</option>';
            return;
        }

        const defaultLabel = isStudent ? '-- Pilih Kelas (Wajib) --' : '-- Semua Kelas (Opsional) --';
        childSel.innerHTML = `<option value="">${defaultLabel}</option>` +
            data.map(d => `<option value="${d.id}" ${d.id === selectedChildId ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
    }

    typeSel.addEventListener('change', async (e) => {
        await loadParents(e.target.value);
    });

    parentSel.addEventListener('change', async (e) => {
        await loadChildren(typeSel.value, e.target.value);
    });

    // Initial pre-population
    if (currentType) {
        const currentParentId = currentType === 'sekolah' ? u.school_id : u.group_id;
        const currentChildId = currentType === 'sekolah' ? u.class_id : u.class_private_id;
        await loadParents(currentType, currentParentId);
        if (currentParentId) {
            await loadChildren(currentType, currentParentId, currentChildId);
        }
    } else {
        parentSel.disabled = true;
        childSel.disabled = true;
    }

    // Clear mapping button handler
    const btnClear = document.getElementById('btn-clear-map');
    if (btnClear) {
        btnClear.onclick = async () => {
            if (!confirm(`Hapus / kosongkan mapping area untuk user "${u.name || u.email}"?
User tidak akan memiliki akses wilayah khusus.`)) return;
            btnClear.disabled = true;
            btnClear.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menghapus...';

            const { error } = await supabase.from('user_profiles').update({
                school_id: null,
                class_id: null,
                group_id: null,
                class_private_id: null
            }).eq('id', u.id);

            if (error) {
                showToast("Gagal menghapus mapping: " + error.message, true);
                btnClear.disabled = false;
                btnClear.innerHTML = '<i class="fa-solid fa-trash-can"></i> Hapus Mapping';
            } else {
                showToast("Mapping berhasil dihapus!");
                closeModal();
                await fetchUsers();
            }
        };
    }

    // Save mapping button handler
    document.getElementById('btn-save-map').onclick = async () => {
        const uid = document.getElementById('map-user-id').value;
        const type = document.getElementById('map-type').value;
        const pid = document.getElementById('map-parent').value;
        const cid = document.getElementById('map-child').value;
        const validCid = (cid && cid.trim() !== '') ? cid.trim() : null;

        if (!uid || !type || !pid) {
            return showToast("Tipe dan Institusi Induk wajib dipilih!", true);
        }

        if (isStudent && !validCid) {
            return showToast("Siswa wajib memilih Kelas / Unit!", true);
        }

        const btnSave = document.getElementById('btn-save-map');
        const origText = btnSave.innerHTML;
        btnSave.disabled = true;
        btnSave.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Menyimpan...';

        const updatePayload = {
            school_id: type === 'sekolah' ? pid : null,
            class_id: type === 'sekolah' ? validCid : null,
            group_id: type === 'private' ? pid : null,
            class_private_id: type === 'private' ? validCid : null
        };

        const { error } = await supabase.from('user_profiles')
            .update(updatePayload)
            .eq('id', uid);

        if (error) {
            console.error("Save mapping error:", error);
            showToast("Gagal menyimpan mapping: " + error.message, true);
            btnSave.disabled = false;
            btnSave.innerHTML = origText;
        } else {
            showToast("Mapping berhasil disimpan!");
            closeModal();
            await fetchUsers();
        }
    };
}

function showLevelModal(userId) {
    const u = allUsers.find(x => x.id === userId);
    openModal("Atur Level Guru", `
        <input type="hidden" id="lvl-user-id" value="${u.id}">
        <div class="input-group">
            <label>Level Pengajaran</label>
            <select id="lvl-select" style="width:100%">
                <option value="">-- Pilih Level --</option>
                ${allLevels.map(l => `<option value="${l.id}" ${u.level_id === l.id ? 'selected' : ''}>${l.kode}</option>`).join('')}
            </select>
        </div>
    `, `<button id="btn-save-lvl" class="btn-primary" style="width:100%">Update Level</button>`);

    document.getElementById('btn-save-lvl').onclick = async () => {
        const uid = document.getElementById('lvl-user-id').value;
        const lid = document.getElementById('lvl-select').value;
        if(!lid) return showToast("Pilih level dulu", true);

        const { error } = await supabase.from('user_profiles').update({ level_id: lid }).eq('id', uid);
        if(error) showToast(error.message, true);
        else { showToast("Level diupdate!"); closeModal(); fetchUsers(); }
    };
}

function openModal(title, bodyHtml, footerHtml) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-footer').innerHTML = footerHtml;
    document.getElementById('modal-wrapper').style.display = 'flex';
}

function closeModal() {
    document.getElementById('modal-wrapper').style.display = 'none';
}

// ==========================================
// 7. UTILS & STYLES INJECTION
// ==========================================

function esc(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showToast(msg, isError = false) {
    const t = document.getElementById('toast-box');
    t.innerHTML = `<i class="fa-solid ${isError ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i> ${msg}`;
    t.className = `toast ${isError ? 'error' : 'success'} show`;
    setTimeout(() => t.classList.remove('show'), 3000);
}

function injectStyles() {
    if (document.getElementById('um-styles')) return;
    const style = document.createElement('style');
    style.id = 'um-styles';
    style.textContent = `
        /* --- LAYOUT & CONTAINERS --- */
        .um-container { max-width: 1200px; margin: 0 auto; padding-bottom: 80px; font-family: 'Inter', system-ui, sans-serif; color: #334155; }
        .um-header-card { background: linear-gradient(135deg, #eff6ff 0%, #ffffff 100%); padding: 24px; border-radius: 16px; border: 1px solid #dbeafe; display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 16px; }
        .header-text h2 { margin: 0; color: #1e3a8a; font-size: 1.5rem; display: flex; align-items: center; gap: 10px; }
        .header-text p { margin: 4px 0 0 0; color: #64748b; font-size: 0.9rem; }
        
        /* --- SEARCH --- */
        .search-wrapper { position: relative; width: 300px; }
        .search-wrapper i { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
        .search-wrapper input { width: 100%; padding: 10px 10px 10px 36px; border: 1px solid #cbd5e1; border-radius: 8px; outline: none; transition: 0.2s; font-size: 0.9rem; }
        .search-wrapper input:focus { border-color: #4d97ff; box-shadow: 0 0 0 3px rgba(77, 151, 255, 0.15); }

        /* --- TABS --- */
        .um-tabs { display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 2px; overflow-x: auto; }
        .tab-btn { background: none; border: none; padding: 10px 20px; font-weight: 600; color: #64748b; cursor: pointer; border-radius: 8px; transition: 0.2s; display: flex; align-items: center; gap: 8px; white-space: nowrap; font-size: 0.9rem; }
        .tab-btn:hover { background: #f1f5f9; color: #334155; }
        .tab-btn.active { background: #eff6ff; color: #2563eb; }

        /* --- CARDS --- */
        .form-card, .table-card { background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); overflow: hidden; margin-bottom: 24px; }
        
        /* --- FORM --- */
        .form-header { background: #f8fafc; padding: 16px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
        .form-header h4 { margin: 0; color: #334155; font-size: 1rem; }
        .form-grid { padding: 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
        .form-footer { padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: right; }
        
        .input-group label { display: block; font-size: 0.75rem; font-weight: 700; color: #475569; margin-bottom: 6px; text-transform: uppercase; }
        .input-group input, .input-group select { width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fdfdfd; font-size: 0.9rem; }
        .input-group input:focus, .input-group select:focus { border-color: #4d97ff; outline: none; }
        .input-group .hint { font-size: 0.75rem; color: #94a3b8; display: block; margin-top: 4px; }

        /* --- BUTTONS --- */
        .btn-primary { background: #4d97ff; color: #fff; border: none; padding: 10px 24px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: 0.2s; display: inline-flex; align-items: center; gap: 8px; justify-content: center; }
        .btn-primary:hover { background: #2563eb; transform: translateY(-1px); }
        .btn-text { background: none; border: none; color: #64748b; font-size: 0.85rem; cursor: pointer; text-decoration: underline; }
        .btn-text:hover { color: #ef4444; }
        .btn-small { padding: 6px 12px; font-size: 0.8rem; border-radius: 4px; cursor: pointer; border: 1px solid transparent; }
        .btn-outline { background: white; border-color: #cbd5e1; color: #475569; }
        .btn-outline:hover { border-color: #4d97ff; color: #4d97ff; }

        /* --- TABLE --- */
        .modern-table { width: 100%; border-collapse: collapse; min-width: 600px; }
        .modern-table th { background: #f8fafc; text-align: left; padding: 14px 20px; font-size: 0.75rem; color: #64748b; text-transform: uppercase; font-weight: 700; border-bottom: 1px solid #e2e8f0; }
        .modern-table td { padding: 14px 20px; border-bottom: 1px solid #f1f5f9; color: #334155; vertical-align: middle; font-size: 0.9rem; }
        .modern-table tr:last-child td { border-bottom: none; }
        
        .user-info { display: flex; gap: 12px; align-items: center; }
        .user-avatar { width: 36px; height: 36px; background: #dbeafe; color: #1e40af; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1rem; }
        .user-name { font-weight: 600; color: #0f172a; }
        .user-sub { font-size: 0.75rem; color: #94a3b8; margin-top: 2px; }
        
        .badge { padding: 4px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; }
        .role-super_admin { background: #fee2e2; color: #991b1b; }
        .role-teacher { background: #dbeafe; color: #1e40af; }
        .role-pic { background: #fef3c7; color: #92400e; }
        .role-student { background: #dcfce7; color: #166534; }
        .badge-gray { background: #f1f5f9; color: #475569; }

        .status-dot { height: 8px; width: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
        .status-dot.active { background: #10b981; }
        .status-dot.inactive { background: #ef4444; }

        .me-tag { font-size: 0.65rem; background: #4d97ff; color: white; padding: 2px 5px; border-radius: 3px; margin-left: 6px; vertical-align: middle; }

        .action-group { display: flex; justify-content: flex-end; gap: 8px; }
        .action-btn { width: 32px; height: 32px; border-radius: 6px; border: 1px solid #e2e8f0; background: white; color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
        .action-btn:hover { border-color: #4d97ff; color: #4d97ff; }
        .action-btn.btn-delete:hover { border-color: #ef4444; color: #ef4444; background: #fef2f2; }

        /* --- MODAL --- */
        .modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(2px); z-index: 1000; align-items: center; justify-content: center; }
        .modal-content { background: white; width: 100%; max-width: 450px; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); overflow: hidden; animation: modalIn 0.2s ease-out; }
        .modal-header { padding: 16px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; }
        .modal-header h3 { margin: 0; font-size: 1.1rem; color: #334155; }
        .close-btn { font-size: 1.5rem; cursor: pointer; color: #94a3b8; }
        .modal-body { padding: 24px; }
        .modal-footer { padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; }

        /* --- TOAST --- */
        .toast { position: fixed; bottom: 24px; right: 24px; background: #334155; color: white; padding: 12px 20px; border-radius: 8px; display: flex; align-items: center; gap: 10px; transform: translateY(100px); transition: 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); z-index: 2000; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }
        .toast.show { transform: translateY(0); }
        .toast.error { background: #ef4444; }
        .toast.success { background: #10b981; }

        @keyframes modalIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .text-right { text-align: right; }
        @media (max-width: 640px) { .um-header-card { flex-direction: column; align-items: flex-start; } .search-wrapper { width: 100%; } .form-grid { grid-template-columns: 1fr; } }
    `;
    document.head.appendChild(style);
}