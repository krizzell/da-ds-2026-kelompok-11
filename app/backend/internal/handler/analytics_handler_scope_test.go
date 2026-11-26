package handler

import (
	"encoding/json"
	"testing"
)

func TestScopeWarehouseResponse(t *testing.T) {
	in := []byte(`{"available":true,"data":[{"idHuria":"H-1","nominal":100},{"idHuria":"H-2","nominal":200}]}`)
	out, err := scopeWarehouseResponse(in, "H-1")
	if err != nil {
		t.Fatal(err)
	}
	var result struct {
		Data []struct {
			ID      string `json:"idHuria"`
			Nominal int    `json:"nominal"`
		} `json:"data"`
	}
	if err := json.Unmarshal(out, &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Data) != 1 || result.Data[0].ID != "H-1" || result.Data[0].Nominal != 100 {
		t.Fatalf("response tidak tersaring: %s", out)
	}
}

func TestScopeRejectsMissingIdentity(t *testing.T) {
	_, err := scopeWarehouseResponse([]byte(`{"data":[{"nominal":100}]}`), "H-1")
	if err == nil {
		t.Fatal("baris tanpa idHuria wajib ditolak")
	}
}

func TestRestrictAnalyticsBody(t *testing.T) {
	input := []byte(`{"idHuria":["H-2"],"mulai":"2026-01-01"}`)
	out, err := restrictAnalyticsBody(input, "H-1")
	if err != nil {
		t.Fatal(err)
	}
	var result struct {
		IDs   []string `json:"idHuria"`
		Mulai string   `json:"mulai"`
	}
	if err := json.Unmarshal(out, &result); err != nil {
		t.Fatal(err)
	}
	if len(result.IDs) != 1 || result.IDs[0] != "H-1" || result.Mulai != "2026-01-01" {
		t.Fatalf("request tidak dibatasi: %s", out)
	}
}
