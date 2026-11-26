package service

import (
	"HKBP/internal/domain"
	"context"
	"errors"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"
)

const formatTanggal = "2006-01-02"

func parsePeriode(periode string) error {
	t, err := time.Parse("2006-01", periode)
	if err != nil || t.Format("2006-01") != periode {
		return errors.New("periode wajib YYYY-MM yang valid")
	}
	return nil
}

func parseTanggal(label, value string) (time.Time, error) {
	parsed, err := time.Parse(formatTanggal, value)
	if err != nil || parsed.Format(formatTanggal) != value {
		return time.Time{}, fmt.Errorf("%s wajib YYYY-MM-DD yang valid", label)
	}
	return parsed, nil
}

func (s *wilayahService) UpsertJadwalSetoran(ctx context.Context, idHuria string, periode string, jadwal domain.JadwalSetoran, user *domain.User) error {
	if err := s.validateAdminAccess(user, idHuria); err != nil {
		return err
	}
	if err := parsePeriode(periode); err != nil {
		return err
	}
	if jadwal.Periode != "" && jadwal.Periode != periode {
		return errors.New("periode URL dan body berbeda")
	}
	jadwal.Periode = periode
	if _, err := parseTanggal("tanggal jatuh tempo", jadwal.TanggalJatuhTempo); err != nil {
		return err
	}
	if strings.TrimSpace(jadwal.SumberAturan) == "" || strings.TrimSpace(jadwal.VersiAturan) == "" {
		return errors.New("sumber aturan dan versi aturan wajib diisi")
	}
	if jadwal.IsSynthetic {
		if jadwal.StatusVerifikasi != "SIMULASI" {
			return errors.New("jadwal sintetis harus berstatus SIMULASI")
		}
		if !strings.EqualFold(os.Getenv("APP_ENV"), "dev") && !strings.EqualFold(os.Getenv("APP_ENV"), "development") {
			return errors.New("jadwal sintetis hanya boleh diubah pada APP_ENV=dev")
		}
	} else if jadwal.StatusVerifikasi != "TERVERIFIKASI" {
		return errors.New("jadwal non-sintetis wajib TERVERIFIKASI disertai referensi aturan")
	}
	h, err := s.repo.FindHuria(ctx, idHuria)
	if err != nil {
		return err
	}
	if h == nil {
		return errors.New("Huria tidak ditemukan")
	}
	for i, existing := range h.JadwalSetoran {
		if existing.Periode == periode {
			h.JadwalSetoran[i] = jadwal
			return s.repo.UpdateHuria(ctx, idHuria, *h)
		}
	}
	h.JadwalSetoran = append(h.JadwalSetoran, jadwal)
	return s.repo.UpdateHuria(ctx, idHuria, *h)
}

type pembayaranKewajiban struct {
	tanggal string
	nominal int64
}

type kelompokKewajiban struct {
	nominal    int64
	alokasiIDs []string
}

// GetRingkasanKewajibanSetoran menghitung kewajiban dari alokasi pusat per bulan
// transaksi pemasukan dan tanggal lunas dari pembayaran bertahap pada asOf.
// Tidak menggunakan periode setoran sebagai bulan kewajiban: satu setoran boleh
// melunasi alokasi dari beberapa periode.
func (s *wilayahService) GetRingkasanKewajibanSetoran(ctx context.Context, idHuria string, asOf string, user *domain.User) ([]domain.RingkasanKewajibanSetoran, error) {
	if err := s.validateAdminAccess(user, idHuria); err != nil {
		return nil, err
	}
	if asOf == "" {
		asOf = time.Now().In(time.FixedZone("WIB", 7*3600)).Format(formatTanggal)
	}
	if _, err := parseTanggal("asOf", asOf); err != nil {
		return nil, err
	}
	h, err := s.repo.FindHuria(ctx, idHuria)
	if err != nil {
		return nil, err
	}
	if h == nil {
		return nil, errors.New("Huria tidak ditemukan")
	}
	tanggalTransaksi := map[string]string{}
	for _, p := range h.PemasukanJemaat {
		if _, err := parseTanggal("tanggal pemasukan", p.Tanggal); err != nil {
			return nil, err
		}
		tanggalTransaksi[p.IdTransaksi] = p.Tanggal
	}
	groups := map[string]*kelompokKewajiban{}
	alokasiPeriode := map[string]string{}
	for _, a := range h.AlokasiTransaksi {
		if !strings.EqualFold(strings.TrimSpace(a.Peruntukan), "Setoran Pusat") {
			continue
		}
		tanggal, ok := tanggalTransaksi[a.IdTransaksi]
		if !ok || a.Nominal < 0 {
			return nil, fmt.Errorf("alokasi %s tidak punya tanggal transaksi atau nominal valid", a.IdAlokasi)
		}
		if _, dupe := alokasiPeriode[a.IdAlokasi]; dupe {
			return nil, fmt.Errorf("ID alokasi ganda: %s", a.IdAlokasi)
		}
		period := tanggal[:7]
		alokasiPeriode[a.IdAlokasi] = period
		if groups[period] == nil {
			groups[period] = &kelompokKewajiban{}
		}
		groups[period].nominal += a.Nominal
		groups[period].alokasiIDs = append(groups[period].alokasiIDs, a.IdAlokasi)
	}
	datesSetoran := map[string]string{}
	for _, p := range h.SetoranPusat {
		if _, err := parseTanggal("tanggal setoran", p.TanggalSetor); err != nil {
			return nil, err
		}
		datesSetoran[p.IdSetoran] = p.TanggalSetor
	}
	payByPeriod := map[string][]pembayaranKewajiban{}
	for _, rincian := range h.RincianSetoranPusat {
		periode, ok := alokasiPeriode[rincian.IdAlokasi]
		if !ok {
			return nil, fmt.Errorf("rincian %s mengacu pada alokasi pusat tidak dikenal", rincian.IdRincian)
		}
		tanggal, ok := datesSetoran[rincian.IdSetoran]
		if !ok || rincian.NominalDilunasi <= 0 {
			return nil, fmt.Errorf("rincian %s memiliki setoran atau nominal tidak valid", rincian.IdRincian)
		}
		if tanggal <= asOf {
			payByPeriod[periode] = append(payByPeriod[periode], pembayaranKewajiban{tanggal, rincian.NominalDilunasi})
		}
	}
	jadwalByPeriode := map[string]domain.JadwalSetoran{}
	for _, j := range h.JadwalSetoran {
		jadwalByPeriode[j.Periode] = j
	}
	keys := make([]string, 0, len(groups))
	for k := range groups {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make([]domain.RingkasanKewajibanSetoran, 0, len(keys))
	for _, period := range keys {
		g := groups[period]
		payments := payByPeriod[period]
		sort.SliceStable(payments, func(i, j int) bool { return payments[i].tanggal < payments[j].tanggal })
		item := domain.RingkasanKewajibanSetoran{
			IdHuria: idHuria, Periode: period, NominalKewajiban: g.nominal,
			Status: "BELUM_ADA_JADWAL", StatusVerifikasi: "BELUM_DIVERIFIKASI", AsOf: asOf,
		}
		running := int64(0)
		for _, p := range payments {
			running += p.nominal
			if running >= g.nominal && item.TanggalPelunasan == "" {
				item.TanggalPelunasan = p.tanggal
			}
		}
		if running > g.nominal {
			return nil, fmt.Errorf("pembayaran %s melebihi kewajiban", period)
		}
		item.TotalDibayar = running
		item.SisaKewajiban = g.nominal - running
		if jadwal, ok := jadwalByPeriode[period]; ok {
			if _, err := parseTanggal("tanggal jatuh tempo", jadwal.TanggalJatuhTempo); err != nil {
				return nil, err
			}
			item.TanggalJatuhTempo = jadwal.TanggalJatuhTempo
			item.SumberAturan = jadwal.SumberAturan
			item.StatusVerifikasi = jadwal.StatusVerifikasi
			item.IsSynthetic = jadwal.IsSynthetic
			if item.TanggalPelunasan != "" {
				late := item.TanggalPelunasan > jadwal.TanggalJatuhTempo
				item.Terlambat = &late
				if late {
					item.Status = "TERLAMBAT_LUNAS"
				} else {
					item.Status = "TEPAT_WAKTU"
				}
			} else if asOf > jadwal.TanggalJatuhTempo {
				late := true
				item.Terlambat = &late
				item.Status = "TERLAMBAT_BELUM_LUNAS"
			} else {
				item.Status = "BELUM_JATUH_TEMPO"
			}
			item.LayakUntukDatasetNyata = !jadwal.IsSynthetic && jadwal.StatusVerifikasi == "TERVERIFIKASI" && item.Terlambat != nil
		}
		out = append(out, item)
	}
	return out, nil
}
