import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID, scryptSync } from 'node:crypto';
import process from 'node:process';
import { pool } from '../server/db.js';

const email = process.argv[2]?.trim().toLowerCase();
const file = '.password-reset.local';
let client;
try {
  if (!email) throw new Error('Provide the account email as the only argument.');
  const password = (await readFile(file, 'utf8')).replace(/\r?\n$/, '');
  if (password.length < 8 || /[\r\n]/.test(password)) {
    throw new Error('Enter a new password of at least 8 characters on one line in .password-reset.local.');
  }
  const salt = randomUUID();
  const hash = `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
  client = await pool.connect();
  await client.query('BEGIN');
  const result = await client.query('UPDATE profiles SET password_hash=$1 WHERE lower(email)=$2 RETURNING id', [hash, email]);
  if (result.rowCount !== 1) throw new Error('Exactly one matching account is required.');
  await client.query('DELETE FROM account_sessions WHERE user_id=$1', [result.rows[0].id]);
  await client.query('COMMIT');
  await writeFile(file, '');
  console.log('Password reset completed. Existing sessions revoked; all account data preserved.');
} catch (error) {
  if (client) await client.query('ROLLBACK').catch(() => {});
  console.error(error.code || error.message);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
