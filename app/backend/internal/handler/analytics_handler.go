package handler

import (
	"HKBP/internal/config"
	"HKBP/internal/middleware"
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// AnalyticsHandler meneruskan permintaan ke layanan Python (FastAPI) dengan kunci internal.
// Frontend tidak pernah berbicara langsung dengan Python.
type AnalyticsHandler struct {
	baseURL string
	key     string
	client  *http.Client
}

func NewAnalyticsHandler(cfg config.Config) *AnalyticsHandler {
	return &AnalyticsHandler{
		baseURL: strings.TrimRight(cfg.AnalyticsURL, "/"),
		key:     cfg.AnalyticsKey,
		client:  &http.Client{Timeout: 45 * time.Second},
	}
}

// proxyScoped membaca token server untuk membatasi data per Huria.
// Proteksi tidak bergantung pada filter di React maupun idHuria kiriman browser.
func (h *AnalyticsHandler) proxy(method, path string, scoped bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body io.Reader
		if method == http.MethodPost {
			raw, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Payload analitik tidak dapat dibaca"})
				return
			}
			if scoped && !middleware.IsSuperAdmin(c) {
				claims, ok := middleware.ClaimsFrom(c)
				if !ok || strings.TrimSpace(claims.IdHuria) == "" {
					c.JSON(http.StatusForbidden, gin.H{"error": "Akun belum memiliki cakupan Huria untuk analitik"})
					return
				}
				raw, err = restrictAnalyticsBody(raw, claims.IdHuria)
				if err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Payload analitik bukan JSON yang valid"})
					return
				}
			}
			body = bytes.NewReader(raw)
		}

		target := h.baseURL + path
		if query := c.Request.URL.RawQuery; query != "" {
			target += "?" + query
		}

		req, err := http.NewRequestWithContext(c.Request.Context(), method, target, body)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyiapkan permintaan analitik"})
			return
		}
		if method == http.MethodPost {
			req.Header.Set("Content-Type", "application/json")
		}
		if h.key != "" {
			req.Header.Set("X-Internal-Key", h.key)
		}

		response, err := h.client.Do(req)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "Layanan analitik Python tidak tersedia"})
			return
		}
		defer response.Body.Close()
		responseBody, err := io.ReadAll(response.Body)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "Respons layanan analitik tidak dapat dibaca"})
			return
		}

		if scoped && method == http.MethodGet && response.StatusCode >= 200 && response.StatusCode < 300 && !middleware.IsSuperAdmin(c) {
			claims, ok := middleware.ClaimsFrom(c)
			if !ok || strings.TrimSpace(claims.IdHuria) == "" {
				c.JSON(http.StatusForbidden, gin.H{"error": "Akun belum memiliki cakupan Huria untuk analitik"})
				return
			}
			responseBody, err = scopeWarehouseResponse(responseBody, claims.IdHuria)
			if err != nil {
				c.JSON(http.StatusBadGateway, gin.H{"error": "Respons warehouse tidak memiliki cakupan Huria yang valid"})
				return
			}
		}
		c.Data(response.StatusCode, response.Header.Get("Content-Type"), responseBody)
	}
}

// restrictAnalyticsBody mengganti (bukan sekadar memeriksa) idHuria yang dikirim
// pengguna dengan identitas Huria terverifikasi dari JWT.
func restrictAnalyticsBody(raw []byte, idHuria string) ([]byte, error) {
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, err
	}
	if payload == nil {
		return nil, errors.New("payload analitik wajib objek JSON")
	}
	scoped, err := json.Marshal([]string{idHuria})
	if err != nil {
		return nil, err
	}
	payload["idHuria"] = scoped
	return json.Marshal(payload)
}

// scopeWarehouseResponse menolak baris tanpa idHuria, sehingga query yang
// lupa membawa identitas tidak secara tidak sengaja membocorkan data wilayah.
func scopeWarehouseResponse(raw []byte, idHuria string) ([]byte, error) {
	var response map[string]json.RawMessage
	if err := json.Unmarshal(raw, &response); err != nil {
		return nil, err
	}
	var rows []map[string]json.RawMessage
	if err := json.Unmarshal(response["data"], &rows); err != nil {
		return nil, err
	}
	scoped := make([]map[string]json.RawMessage, 0, len(rows))
	for _, row := range rows {
		var id string
		if err := json.Unmarshal(row["idHuria"], &id); err != nil {
			return nil, err
		}
		if id == idHuria {
			scoped = append(scoped, row)
		}
	}
	result, err := json.Marshal(scoped)
	if err != nil {
		return nil, err
	}
	response["data"] = result
	return json.Marshal(response)
}

// --- Analitik statistik (POST): non-superadmin hanya boleh ID Huria sendiri.
func (h *AnalyticsHandler) Forecast(c *gin.Context) { h.proxy(http.MethodPost, "/forecast", true)(c) }
func (h *AnalyticsHandler) Anomaly(c *gin.Context)  { h.proxy(http.MethodPost, "/anomaly", true)(c) }
func (h *AnalyticsHandler) Correlation(c *gin.Context) {
	h.proxy(http.MethodPost, "/correlation", true)(c)
}
func (h *AnalyticsHandler) Drop(c *gin.Context) { h.proxy(http.MethodPost, "/drop", true)(c) }

// --- Warehouse: admin mendapatkan hasil yang disaring server berdasarkan JWT.
// Ringkasan bersifat global dan hanya diizinkan untuk SuperAdmin pada router.
func (h *AnalyticsHandler) DwRingkasan(c *gin.Context) {
	h.proxy(http.MethodGet, "/dw/ringkasan", false)(c)
}
func (h *AnalyticsHandler) DwCube(c *gin.Context)   { h.proxy(http.MethodGet, "/dw/cube", true)(c) }
func (h *AnalyticsHandler) DwAliran(c *gin.Context) { h.proxy(http.MethodGet, "/dw/aliran", true)(c) }
func (h *AnalyticsHandler) DwSesi(c *gin.Context)   { h.proxy(http.MethodGet, "/dw/sesi", true)(c) }
func (h *AnalyticsHandler) DwKategori(c *gin.Context) {
	h.proxy(http.MethodGet, "/dw/kategori", true)(c)
}
func (h *AnalyticsHandler) DwKewajiban(c *gin.Context) {
	h.proxy(http.MethodGet, "/dw/kewajiban", true)(c)
}
func (h *AnalyticsHandler) DwRefresh(c *gin.Context) {
	h.proxy(http.MethodPost, "/dw/refresh", false)(c)
}

// --- Model ML lama tetap tersedia sebagai cadangan sampai model baru siap.
func (h *AnalyticsHandler) MlMetrics(c *gin.Context) {
	h.proxy(http.MethodGet, "/ml/metrics", false)(c)
}
func (h *AnalyticsHandler) MlOpsi(c *gin.Context) { h.proxy(http.MethodGet, "/ml/opsi", false)(c) }
func (h *AnalyticsHandler) MlPredict(c *gin.Context) {
	h.proxy(http.MethodPost, "/ml/predict", false)(c)
}
