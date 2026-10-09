// Copias de seguridad de la base de datos.
//
// Si se pierde el fichero, un bar pierde su carta, sus mesas y sus pedidos. Por eso
// esto corre solo, sin que nadie se acuerde: una copia al arrancar y otra cada día.
// Se usa VACUUM INTO, que escribe una copia consistente aunque haya escrituras a la vez;
// copiar el fichero a pelo puede dar una base corrupta.
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDb, DATA_DIR } from './db.js';

export const BACKUP_DIR = resolve(DATA_DIR, 'backups');
const GUARDAR = Number(process.env.MAITRE_BACKUP_KEEP || 14);   // cuántas copias se conservan

const sello = (d = new Date()) => d.toISOString().replace(/[:.]/g, '-').slice(0, 19);

/** Hace una copia ahora y devuelve su nombre de fichero. */
export function backupNow() {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const nombre = `maitre-${sello()}.db`;
  const destino = resolve(BACKUP_DIR, nombre);
  // El literal va escapado a mano: VACUUM INTO no admite parámetros.
  getDb().exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  podar();
  return nombre;
}

/** Lista las copias, de la más reciente a la más antigua. */
export function listBackups() {
  try {
    return readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.db'))
      .map((f) => ({ name: f, size: statSync(resolve(BACKUP_DIR, f)).size, at: statSync(resolve(BACKUP_DIR, f)).mtime.toISOString() }))
      .sort((a, b) => b.name.localeCompare(a.name));
  } catch { return []; }
}

/** Se queda con las últimas GUARDAR y borra el resto. */
function podar() {
  for (const f of listBackups().slice(GUARDAR)) {
    try { unlinkSync(resolve(BACKUP_DIR, f.name)); } catch { /* ya no está */ }
  }
}

/** Arranca el ciclo: una copia ahora y otra cada 24 h. Devuelve el timer. */
export function startBackups() {
  const intentar = () => {
    try { console.log(`  Copia de seguridad: ${backupNow()}`); }
    catch (err) { console.warn('  ⚠ No se pudo hacer la copia de seguridad:', err.message); }
  };
  intentar();
  const t = setInterval(intentar, 24 * 3600 * 1000);
  t.unref?.();
  return t;
}
