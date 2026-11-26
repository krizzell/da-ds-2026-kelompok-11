package service

import (
	"HKBP/internal/domain"
	"context"
	"os"
	"testing"
)

type fakeKewajibanRepo struct{ huria domain.Huria }

func (f *fakeKewajibanRepo) FindAll(context.Context) ([]domain.Wilayah, error) { return nil, nil }
func (f *fakeKewajibanRepo) SaveAll(context.Context, []domain.Wilayah) error   { return nil }
func (f *fakeKewajibanRepo) FindHuria(_ context.Context, id string) (*domain.Huria, error) {
	h := f.huria
	return &h, nil
}
func (f *fakeKewajibanRepo) UpdateHuria(_ context.Context, id string, h domain.Huria) error {
	f.huria = h
	return nil
}
func (f *fakeKewajibanRepo) FindUserByEmail(context.Context, string) (*domain.User, error) {
	return nil, nil
}
func (f *fakeKewajibanRepo) SyncTree(context.Context) error { return nil }

func TestKewajibanPelunasanBertahap(t *testing.T) {
	repo := &fakeKewajibanRepo{huria: domain.Huria{
		IdHuria:             "H-1",
		PemasukanJemaat:     []domain.PemasukanJemaat{{IdTransaksi: "T1", Tanggal: "2026-01-10"}},
		AlokasiTransaksi:    []domain.AlokasiTransaksi{{IdAlokasi: "A1", IdTransaksi: "T1", Peruntukan: "Setoran Pusat", Nominal: 100}},
		SetoranPusat:        []domain.SetoranPusat{{IdSetoran: "S1", TanggalSetor: "2026-02-04"}, {IdSetoran: "S2", TanggalSetor: "2026-02-13"}},
		RincianSetoranPusat: []domain.RincianSetoranPusat{{IdRincian: "R1", IdAlokasi: "A1", IdSetoran: "S1", NominalDilunasi: 60}, {IdRincian: "R2", IdAlokasi: "A1", IdSetoran: "S2", NominalDilunasi: 40}},
	}}
	svc := NewWilayahService(repo)
	user := &domain.User{Role: "Admin", IdHuria: "H-1"}
	ctx := context.Background()
	os.Setenv("APP_ENV", "dev")
	defer os.Unsetenv("APP_ENV")
	err := svc.UpsertJadwalSetoran(ctx, "H-1", "2026-01", domain.JadwalSetoran{Periode: "2026-01", TanggalJatuhTempo: "2026-02-10", SumberAturan: "SIMULASI_TES", VersiAturan: "DEMO-1", StatusVerifikasi: "SIMULASI", IsSynthetic: true}, user)
	if err != nil {
		t.Fatal(err)
	}
	rows, err := svc.GetRingkasanKewajibanSetoran(ctx, "H-1", "2026-02-11", user)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].TotalDibayar != 60 || rows[0].SisaKewajiban != 40 || rows[0].Status != "TERLAMBAT_BELUM_LUNAS" || rows[0].LayakUntukDatasetNyata {
		t.Fatalf("hasil tengah salah: %+v", rows)
	}
	rows, err = svc.GetRingkasanKewajibanSetoran(ctx, "H-1", "2026-02-14", user)
	if err != nil {
		t.Fatal(err)
	}
	if rows[0].TanggalPelunasan != "2026-02-13" || rows[0].Status != "TERLAMBAT_LUNAS" {
		t.Fatalf("hasil lunas salah: %+v", rows)
	}
}
func TestKewajibanTolakAksesLainDanTanggalInvalid(t *testing.T) {
	svc := NewWilayahService(&fakeKewajibanRepo{huria: domain.Huria{IdHuria: "H-1"}})
	bad := &domain.User{Role: "Admin", IdHuria: "H-LAIN"}
	if _, err := svc.GetRingkasanKewajibanSetoran(context.Background(), "H-1", "2026-03-01", bad); err == nil {
		t.Fatal("akses lain harus ditolak")
	}
	if err := parsePeriode("2026-13"); err == nil {
		t.Fatal("periode invalid diterima")
	}
	if _, err := parseTanggal("test", "2026-02-30"); err == nil {
		t.Fatal("tanggal invalid diterima")
	}
}
func TestJadwalSimulasiDitolakDalamProduksi(t *testing.T) {
	svc := NewWilayahService(&fakeKewajibanRepo{huria: domain.Huria{IdHuria: "H-1"}})
	os.Setenv("APP_ENV", "production")
	defer os.Unsetenv("APP_ENV")
	err := svc.UpsertJadwalSetoran(context.Background(), "H-1", "2026-02", domain.JadwalSetoran{TanggalJatuhTempo: "2026-03-10", SumberAturan: "SIMULASI", VersiAturan: "1", StatusVerifikasi: "SIMULASI", IsSynthetic: true}, &domain.User{Role: "Admin", IdHuria: "H-1"})
	if err == nil {
		t.Fatal("jadwal simulasi tidak boleh tersimpan di produksi")
	}
}
