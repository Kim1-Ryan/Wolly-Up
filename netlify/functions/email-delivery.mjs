import { pool } from '../../server/db.js';
import { processEmailQueue } from '../../server/mail.js';
export default async () => {
  await processEmailQueue(pool,{limit:2});
};
export const config = { schedule:'* * * * *' };
