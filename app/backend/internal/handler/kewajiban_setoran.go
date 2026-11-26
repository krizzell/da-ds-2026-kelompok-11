package handler

import (
	"HKBP/internal/domain"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func (h *WilayahHandler) GetKewajibanSetoran(c *gin.Context) {
	id := h.getHuriaID(c)
	rows, err := h.svc.GetRingkasanKewajibanSetoran(c.Request.Context(), id, c.Query("asOf"), h.getCurrentUser(c))
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "Akses ditolak") || strings.Contains(err.Error(), "Forbidden") {
			status = http.StatusForbidden
		}
		if strings.Contains(err.Error(), "Unauthorized") {
			status = http.StatusUnauthorized
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows, "mode": "monitoring_bukan_prediksi_ml"})
}

func (h *WilayahHandler) UpsertJadwalSetoran(c *gin.Context) {
	var body domain.JadwalSetoran
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Payload jadwal bukan JSON yang valid"})
		return
	}
	err := h.svc.UpsertJadwalSetoran(c.Request.Context(), h.getHuriaID(c), c.Param("periode"), body, h.getCurrentUser(c))
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "Akses ditolak") || strings.Contains(err.Error(), "Forbidden") {
			status = http.StatusForbidden
		}
		if strings.Contains(err.Error(), "Unauthorized") {
			status = http.StatusUnauthorized
		}
		if strings.Contains(err.Error(), "konflik") {
			status = http.StatusConflict
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Jadwal kewajiban berhasil disimpan", "periode": c.Param("periode")})
}
