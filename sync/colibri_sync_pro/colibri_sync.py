import json
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from dbfread import DBF

CONFIG_PATH = Path(__file__).with_name("config.json")


def load_config() -> Dict[str, Any]:
    if not CONFIG_PATH.exists():
        raise FileNotFoundError("No existe config.json. Copia config.example.json y rellena la anon key.")
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def clean_value(value: Any) -> Any:
    if isinstance(value, (datetime,)):
        return value.isoformat()
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("latin1", errors="ignore").strip()
    return value


def normalize_record(record: Dict[str, Any]) -> Dict[str, Any]:
    return {str(k).upper(): clean_value(v) for k, v in record.items()}


def pick(record: Dict[str, Any], candidates: List[str]) -> Optional[Any]:
    for key in candidates:
        if key in record and record[key] not in (None, ""):
            return record[key]
    return None


def detect_total(record: Dict[str, Any]) -> Optional[float]:
    value = pick(record, ["TOTAL", "CAB_TOTAL", "IMPORTE", "CAB_IMPOR", "CAB_TOTALI", "TOTIVA", "TOTALIVA"])
    try:
        return float(value) if value is not None else None
    except Exception:
        return None


def detect_date(record: Dict[str, Any]) -> Optional[str]:
    value = pick(record, ["FECHA", "CAB_FECHA", "FECHAHORA", "HORA", "CAB_HORA", "DATE"])
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return clean_value(value)


def detect_payment(record: Dict[str, Any]) -> Optional[str]:
    raw = pick(record, ["FORMA", "PAGO", "CAB_FPAGO", "CAB_FORPA", "CAB_TIPO", "TIPOPAGO"])
    if raw is None:
        return None
    raw = str(raw).strip().upper()
    return {"E": "efectivo", "T": "tarjeta", "A": "ambas", "G": "gasto"}.get(raw, raw)


def read_cab_dbf(data_path: Path) -> List[Dict[str, Any]]:
    candidates = ["CAB.DBF", "CABECERA.DBF", "TICKETS.DBF"]
    cab_path = next((data_path / name for name in candidates if (data_path / name).exists()), None)
    if cab_path is None:
        raise FileNotFoundError(f"No encuentro CAB.DBF en {data_path}")

    rows: List[Dict[str, Any]] = []
    table = DBF(str(cab_path), load=True, encoding="latin1", ignore_missing_memofile=True)
    for r in table:
        rec = normalize_record(dict(r))
        cab_id = pick(rec, ["CAB_ID", "ID", "NUM", "CODIGO"])
        numdoc = pick(rec, ["NUMDOC", "DOCUMENTO", "TICKET", "N_TICKET"])
        identifier = str(cab_id or numdoc or f"row-{len(rows)+1}")
        rows.append({
            "id": f"numier-{identifier}",
            "cab_id": str(cab_id) if cab_id is not None else None,
            "numdoc": str(numdoc) if numdoc is not None else None,
            "ticket_date": detect_date(rec),
            "total": detect_total(rec),
            "payment_method": detect_payment(rec),
            "raw": rec,
        })
    return rows


def supabase_headers(config: Dict[str, Any]) -> Dict[str, str]:
    key = config["supabase_anon_key"]
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }


def upsert_tickets(config: Dict[str, Any], tickets: List[Dict[str, Any]]) -> None:
    if not tickets:
        return
    url = config["supabase_url"].rstrip("/") + f"/rest/v1/{config['tables']['tickets']}?on_conflict=id"
    headers = supabase_headers(config)
    payload = []
    for t in tickets:
        x = dict(t)
        x["restaurant_id"] = config.get("restaurant_id", "braseria-el-colibri")
        payload.append(x)
    for i in range(0, len(payload), 500):
        resp = requests.post(url, headers=headers, data=json.dumps(payload[i:i+500], ensure_ascii=False), timeout=60)
        if resp.status_code not in (200, 201, 204):
            raise RuntimeError(f"Supabase error {resp.status_code}: {resp.text}")


def log_sync(config: Dict[str, Any], status: str, message: str, processed: int = 0) -> None:
    url = config["supabase_url"].rstrip("/") + f"/rest/v1/{config['tables']['sync_log']}"
    headers = supabase_headers(config)
    body = {
        "restaurant_id": config.get("restaurant_id", "braseria-el-colibri"),
        "status": status,
        "message": message[:1000],
        "tickets_processed": processed,
    }
    try:
        requests.post(url, headers=headers, json=body, timeout=20)
    except Exception:
        pass


def sync_once() -> int:
    config = load_config()
    data_path = Path(config["numier_data_path"])
    if not data_path.exists():
        raise FileNotFoundError(f"No existe la carpeta NUMIER: {data_path}")
    tickets = read_cab_dbf(data_path)
    upsert_tickets(config, tickets)
    log_sync(config, "ok", "Sincronización completada", len(tickets))
    return len(tickets)


def main() -> None:
    print("Colibrí Sync PRO")
    try:
        count = sync_once()
        print(f"OK: {count} tickets procesados")
    except Exception as exc:
        try:
            config = load_config()
            log_sync(config, "error", str(exc), 0)
        except Exception:
            pass
        print(f"ERROR: {exc}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
