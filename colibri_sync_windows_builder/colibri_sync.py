import json
import os
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path

try:
    import requests
except Exception:
    print('Falta requests')
    raise

try:
    from dbfread import DBF
except Exception:
    DBF = None

APP_DIR = Path(os.getenv('APPDATA', Path.home())) / 'ColibriSync'
APP_DIR.mkdir(parents=True, exist_ok=True)
CONFIG_FILE = APP_DIR / 'config.json'
LOG_FILE = APP_DIR / 'sync.log'
STATE_FILE = APP_DIR / 'state.json'

DEFAULT_CONFIG = {
    'supabase_url': 'https://xccyaoziutlxxklcofrw.supabase.co',
    'supabase_anon_key': 'PEGA_AQUI_TU_ANON_KEY',
    'numier_datos_path': r'C:\NUMIER\DATOS',
    'sync_interval_seconds': 60,
    'dry_run': False
}


def log(msg):
    line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line)
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(line + '\n')


def load_config():
    if not CONFIG_FILE.exists():
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(DEFAULT_CONFIG, f, indent=2, ensure_ascii=False)
        log(f'Config creada en {CONFIG_FILE}. Edita la anon key antes de sincronizar.')
        return DEFAULT_CONFIG
    with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_state():
    if STATE_FILE.exists():
        with open(STATE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'last_files': {}, 'tickets_sent': []}


def save_state(state):
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(state, f, indent=2, ensure_ascii=False)


def supabase_insert(config, table, rows):
    if not rows:
        return True
    if config.get('dry_run'):
        log(f'DRY RUN: insertaria {len(rows)} filas en {table}')
        return True
    url = config['supabase_url'].rstrip('/') + f'/rest/v1/{table}'
    headers = {
        'apikey': config['supabase_anon_key'],
        'Authorization': 'Bearer ' + config['supabase_anon_key'],
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
    }
    r = requests.post(url, headers=headers, data=json.dumps(rows, ensure_ascii=False), timeout=30)
    if r.status_code not in (200, 201, 204):
        log(f'ERROR Supabase {table}: {r.status_code} {r.text[:500]}')
        return False
    return True


def read_dbf_records(path, limit=None):
    if DBF is None:
        raise RuntimeError('dbfread no esta instalado')
    table = DBF(str(path), encoding='latin-1', char_decode_errors='ignore', load=False)
    out = []
    for i, rec in enumerate(table):
        if limit and i >= limit:
            break
        clean = {}
        for k, v in dict(rec).items():
            if isinstance(v, (datetime,)):
                v = v.isoformat()
            elif hasattr(v, 'isoformat'):
                try:
                    v = v.isoformat()
                except Exception:
                    v = str(v)
            clean[str(k).lower()] = v
        out.append(clean)
    return out


def sync_numier(config):
    datos = Path(config['numier_datos_path'])
    if not datos.exists():
        log(f'No existe la carpeta NUMIER: {datos}')
        return

    state = load_state()
    dbf_files = list(datos.glob('*.DBF')) + list(datos.glob('*.dbf'))
    if not dbf_files:
        log('No se encontraron archivos DBF.')
        return

    changed = []
    for p in dbf_files:
        stat = p.stat()
        key = p.name.lower()
        sig = f"{stat.st_mtime_ns}:{stat.st_size}"
        if state['last_files'].get(key) != sig:
            changed.append(p)
            state['last_files'][key] = sig

    if not changed:
        log('Sin cambios en NUMIER.')
        return

    log('Archivos modificados: ' + ', '.join(p.name for p in changed))

    # Sincronizacion inicial ligera: sube metadatos de archivos modificados.
    # La importacion detallada de tickets se mapeara segun los nombres reales de CAB/DET de tu instalacion.
    rows = []
    for p in changed:
        stat = p.stat()
        rows.append({
            'source_file': p.name,
            'file_size': stat.st_size,
            'modified_at_numier': datetime.fromtimestamp(stat.st_mtime).isoformat(),
            'synced_at': datetime.utcnow().isoformat(),
            'status': 'detected'
        })
    ok = supabase_insert(config, 'numier_sync_log', rows)
    if ok:
        log(f'Sincronizados metadatos de {len(rows)} archivos.')
        save_state(state)


def main():
    config = load_config()
    if 'PEGA_AQUI' in config.get('supabase_anon_key', ''):
        log(f'Edita primero la anon key en: {CONFIG_FILE}')
        input('Pulsa Enter para salir...')
        return
    log('Colibri Sync iniciado')
    sync_numier(config)
    input('Sincronizacion finalizada. Pulsa Enter para salir...')

if __name__ == '__main__':
    try:
        main()
    except Exception:
        log('ERROR GENERAL:\n' + traceback.format_exc())
        input('Pulsa Enter para salir...')
