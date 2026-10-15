import { pool } from '../server/db.js';
import { processEmailQueue } from '../server/mail.js';
try { console.log(await processEmailQueue(pool)); }
finally { await pool.end(); }
