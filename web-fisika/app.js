// ============================================================================
// KONFIGURASI KLIEN SUPABASE
// ============================================================================
const SUPABASE_URL = 'https://URL-PROYEK-ANDA.supabase.co';
const SUPABASE_ANON_KEY = 'ANON-KEY-PUBLIK-ANDA';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================================
// FUNGSI HELPER: UNGGAH FOTO KE SUPABASE STORAGE (OPSIONAL)
// ============================================================================
async function uploadFotoAlatKeStorage(file, kodeAlat) {
    if (!file) return null;

    const ext = file.name.split('.').pop();
    const fileName = `${kodeAlat}_${Date.now()}.${ext}`;
    const filePath = `katalog/${fileName}`;

    // Pastikan Anda sudah membuat bucket publik bernama 'foto-alat' di Supabase Storage
    const { error: uploadError } = await supabaseClient.storage
        .from('foto-alat')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

    if (uploadError) {
        console.warn('Gagal unggah ke Storage, menggunakan kompresi lokal sementara:', uploadError.message);
        return null;
    }

    const { data: publicUrlData } = supabaseClient.storage
        .from('foto-alat')
        .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
}

// ============================================================================
// SINKRONISASI DATA DARI TABEL SUPABASE 'alat' KE TAMPILAN DASHBOARD
// ============================================================================
async function muatDataAlatDariSupabase() {
    const { data, error } = await supabaseClient
        .from('alat')
        .select('*')
        .order('id', { ascending: true });

    if (error) {
        console.error('Gagal mengambil data dari Supabase:', error.message);
        return;
    }

    if (data && data.length > 0) {
        // Petakan kolom tabel SQL Supabase ke struktur objek array inventoryData di dashboard.html
        inventoryData = data.map((row, index) => ({
            id: row.id,
            no: index + 1,
            code: row.kode,
            name: row.nama,
            category: row.kategori,
            location: row.lokasi,
            goodCount: row.stok_baik,
            brokenCount: row.stok_rusak,
            totalQty: row.stok, // Kolom generated (stok_baik + stok_rusak)
            unit: row.satuan || 'Unit',
            status: row.status,
            notes: row.catatan || '',
            photo: row.foto || ''
        }));

        if (typeof populateFilterDropdowns === 'function') populateFilterDropdowns();
        if (typeof refreshSystem === 'function') refreshSystem();
    }
}

// ============================================================================
// EVENT HANDLER TOMBOL SIMPAN PADA FORM TAMBAH ALAT (#addToolForm)
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Muat data terbaru dari Supabase saat halaman dibuka
    muatDataAlatDariSupabase();

    const addToolForm = document.getElementById('addToolForm');
    if (!addToolForm) return;

    addToolForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = addToolForm.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Menyimpan...';

        try {
            // 1. Ambil seluruh nilai input dari modal Tambah Alat di dashboard.html
            const kode = document.getElementById('newToolCode').value.trim().toUpperCase();
            const nama = document.getElementById('newToolName').value.trim();
            const kategori = document.getElementById('newToolCat').value.trim();
            const lokasi = document.getElementById('newToolLocation').value.trim();
            const satuan = document.getElementById('newToolUnit').value.trim() || 'Unit';
            const stok_baik = Math.max(0, parseInt(document.getElementById('newToolGood').value) || 0);
            const stok_rusak = Math.max(0, parseInt(document.getElementById('newToolBroken').value) || 0);
            const catatan = document.getElementById('newToolNotes').value.trim();
            const photoFile = document.getElementById('newToolPhotoFile').files[0];

            // Tentukan status otomatis berdasarkan ketersediaan unit baik
            const status = (stok_baik + stok_rusak) > 0 ? 'Tersedia' : 'Dalam Perbaikan';

            // 2. Unggah foto jika pengguna memilih file gambar
            let fotoUrl = null;
            if (photoFile) {
                fotoUrl = await uploadFotoAlatKeStorage(photoFile, kode);
            }

            // 3. Kirim data ke tabel 'alat' di Supabase (kolom 'stok' dihitung otomatis oleh PostgreSQL)
            const { data: insertedData, error } = await supabaseClient
                .from('alat')
                .insert([
                    {
                        kode: kode,
                        nama: nama,
                        foto: fotoUrl,
                        lokasi: lokasi,
                        kategori: kategori,
                        stok_baik: stok_baik,
                        stok_rusak: stok_rusak,
                        satuan: satuan,
                        status: status,
                        catatan: catatan || null
                    }
                ])
                .select()
                .single();

            if (error) {
                // Penanganan pesan error umum (RLS / Duplikat Kode / Belum Login)
                if (error.code === '23505') {
                    throw new Error(`Kode inventaris "${kode}" sudah terdaftar di database!`);
                } else if (error.code === '42501') {
                    throw new Error('Akses ditolak! Pastikan Anda sudah login menggunakan akun ber-role "Editor".');
                } else {
                    throw new Error(error.message);
                }
            }

            // 4. Reset form, tutup modal, dan perbarui tabel di dashboard
            addToolForm.reset();
            if (typeof closeAddToolModal === 'function') closeAddToolModal();

            await muatDataAlatDariSupabase();

            if (typeof showToast === 'function') {
                showToast(`Alat ${insertedData.kode} (${insertedData.nama}) berhasil disimpan ke Supabase!`);
            } else {
                alert(`Alat ${insertedData.kode} berhasil disimpan ke Supabase!`);
            }

        } catch (err) {
            console.error('Error simpan alat:', err);
            alert('Gagal menyimpan alat: ' + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
        }
    });
});