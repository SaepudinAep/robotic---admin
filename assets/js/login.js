import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { supabaseUrl, supabaseKey } from './config.js';

const supabase = createClient(supabaseUrl, supabaseKey);

const form = document.getElementById('form-login');
const btn = document.getElementById('btn-submit');
const errorMsg = document.getElementById('msg-error');

// KUNCI CACHE
const CACHE_KEY_ROLE = 'user_role';
const ALLOWED_ROLES = ['super_admin', 'teacher', 'pic'];

form.onsubmit = async (e) => {
    e.preventDefault();
    
    // UI Feedback: Langsung respon agar user tahu tombol sudah ditekan
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Memeriksa...`;
    errorMsg.style.display = 'none';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
        // 1. AUTHENTICATION (Network Request #1)
        const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
        if (authErr) {
            console.error("Auth error:", authErr);
            throw new Error(authErr.message === 'Invalid login credentials' 
                ? "Email atau password salah." 
                : authErr.message);
        }

        // UI Update: Memberi tahu user langkah selanjutnya
        btn.innerHTML = `<i class="fa-solid fa-user-check"></i> Memuat Profil...`;

        // 2. FETCH PROFILE (Network Request #2)
        const { data: profile, error: profErr } = await supabase
            .from('user_profiles')
            .select('role, name, is_active')
            .eq('id', auth.user.id)
            .maybeSingle();

        if (profErr) {
            console.error("Profile Fetch Error:", profErr);
            await supabase.auth.signOut();
            throw new Error(`Gagal memuat profil: ${profErr.message}`);
        }

        if (!profile) {
            await supabase.auth.signOut();
            throw new Error("Akses Ditolak: Data akun belum terdaftar di tabel profil pengguna.");
        }

        // Cek Status Aktif
        if (profile.is_active === false) {
            await supabase.auth.signOut();
            throw new Error("Akses Ditolak: Akun Anda sedang dinonaktifkan.");
        }

        // Validasi Role
        if (!ALLOWED_ROLES.includes(profile.role)) {
            await supabase.auth.signOut();
            throw new Error(`Akses Ditolak: Role '${profile.role || '-'}' tidak memiliki izin login ke Admin Panel.`);
        }

        // 3. Simpan data ke localStorage
        localStorage.setItem(CACHE_KEY_ROLE, profile.role);
        localStorage.setItem('admin_name', profile.name || 'Admin');
        
        console.log("Login Sukses:", profile.name, "(Role:", profile.role, ")");

        // 4. SUKSES & REDIRECT
        btn.innerHTML = `<i class="fa-solid fa-check"></i> Berhasil!`;
        btn.style.backgroundColor = "#10b981";
        
        setTimeout(() => {
            window.location.href = 'main.html';
        }, 500);

    } catch (err) {
        console.error("Login Gagal:", err);
        errorMsg.textContent = err.message;
        errorMsg.style.display = 'block';
        
        // Reset Tombol
        btn.disabled = false;
        btn.textContent = "Sign In";
        btn.style.backgroundColor = "";
    }
};
