import { chmod, mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { backup } from 'node:sqlite';

export async function prepareStorage(db, directory) {
  await chmod(directory, 0o700);
  db.exec(`PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS integrations(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, provider TEXT NOT NULL, secret TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}', PRIMARY KEY(user_id,provider));
    CREATE TABLE IF NOT EXISTS automation_runs(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, automation_id TEXT NOT NULL, slot TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(automation_id,slot));
    CREATE TABLE IF NOT EXISTS deliveries(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, automation_id TEXT NOT NULL, run_id TEXT NOT NULL REFERENCES automation_runs(id), destination_id TEXT NOT NULL, content_id TEXT NOT NULL, channel TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, available_at TEXT NOT NULL, delivered_at TEXT, error TEXT, UNIQUE(run_id,destination_id,content_id));
    CREATE INDEX IF NOT EXISTS deliveries_due ON deliveries(status,available_at);
    CREATE INDEX IF NOT EXISTS deliveries_dedupe ON deliveries(automation_id,destination_id,content_id,delivered_at);
    CREATE TABLE IF NOT EXISTS runtime_state(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS api_tokens(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,scope TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS telegram_links(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,code_hash TEXT NOT NULL,expires_at TEXT NOT NULL,chat_id TEXT);
    CREATE TABLE IF NOT EXISTS smart_clicks(id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, group_id TEXT NOT NULL, created_at TEXT NOT NULL);
    INSERT OR IGNORE INTO migrations VALUES(1,datetime('now'));
    UPDATE deliveries SET status='uncertain',error='Servidor interrompido durante envio; confira o destino antes de reenviar.' WHERE status='sending';`);
  const keyPath = join(directory, 'encryption.key');
  let key;
  try { key = await readFile(keyPath); }
  catch (error) { if (error.code !== 'ENOENT') throw error;if(db.prepare('SELECT count(*) AS count FROM integrations').get().count)throw new Error('A chave encryption.key está ausente. Restaure a chave junto com o banco antes de iniciar.'); key = randomBytes(32); await writeFile(keyPath, key, { mode: 0o600, flag: 'wx' }); }
  if (key.length !== 32) throw new Error('Chave local de criptografia inválida.');
  await chmod(keyPath, 0o600);
  await chmod(join(directory, 'oferta.sqlite'), 0o600);
  return {
    encrypt(value) { const iv=randomBytes(12); const cipher=createCipheriv('aes-256-gcm',key,iv); const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]); return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64'); },
    decrypt(value) { const raw=Buffer.from(value,'base64'); const cipher=createDecipheriv('aes-256-gcm',key,raw.subarray(0,12)); cipher.setAuthTag(raw.subarray(12,28)); return Buffer.concat([cipher.update(raw.subarray(28)),cipher.final()]).toString('utf8'); },
  };
}

export async function backupDatabase(db, directory) {
  const target=join(directory,'backups'); await mkdir(target,{recursive:true,mode:0o700});
  const name=`oferta-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`;
  await backup(db,join(target,name)); await chmod(join(target,name),0o600);
  const files=(await readdir(target)).filter((file)=>/^oferta-\d{4}-[\dT-Z-]+\.sqlite$/.test(file)).sort().reverse();
  for (const file of files.slice(7)) await unlink(join(target,file));
  return {name,createdAt:new Date().toISOString()};
}
