-- ============================================================
-- MIGRATION: Daftarkan Menu "Monitoring Galeri"
-- Modul    : modules/monitoring-galeri.js
-- Tabel    : menu_categories + app_menus
-- ============================================================

-- 1. Pastikan kategori "Monitoring" atau "Galeri" tersedia (opsional jika sudah ada)
INSERT INTO public.menu_categories (title, category_key, order_index, target_app, is_active)
VALUES ('Monitoring', 'monitoring', 50, 'admin_v2', true)
ON CONFLICT (category_key) DO NOTHING;

-- 2. Daftarkan menu "Monitoring Galeri"
INSERT INTO public.app_menus
    (title, route, category, allowed_roles, allowed_level_ids,
     icon_class, order_index, is_active)
SELECT
    'Monitoring Galeri',
    'monitoring-galeri',
    id,
    ARRAY['super_admin','teacher']::text[],
    ARRAY[]::text[],
    'fa-solid fa-camera-retro',
    25,
    true
FROM public.menu_categories
WHERE category_key IN ('monitoring', 'galeri', 'dokumentasi')
  AND NOT EXISTS (SELECT 1 FROM public.app_menus WHERE route = 'monitoring-galeri')
LIMIT 1;

