import { db } from './src/services/db';
import { sql } from 'drizzle-orm';
import { getPonderPrefix } from './src/utils/ponder';

async function main() {
  const prefix = await getPonderPrefix();
  const rows = await db.execute(sql.raw(`SELECT * FROM "${prefix}Season"`));
  console.log(rows);
  process.exit(0);
}
main().catch(console.error);
