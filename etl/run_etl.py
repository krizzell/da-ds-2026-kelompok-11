"""Entrypoint ETL wajib di akar repositori HKBP.

Implementasi asli tetap ada di app/analytics/etl/build_warehouse.py untuk
menjaga import Python FastAPI dan pengujian lama tidak berubah.

Contoh dari akar HKBP:
    python etl/run_etl.py --source json
    python etl/run_etl.py --source mongo
    python etl/run_etl.py --source json --json-path app/backend/wilayah.json
"""
from __future__ import annotations
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ANALYTICS_ROOT = PROJECT_ROOT / "app" / "analytics"
sys.path.insert(0, str(ANALYTICS_ROOT))

from etl.build_warehouse import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
