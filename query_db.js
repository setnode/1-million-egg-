require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');

async function main() {
  const sql = postgres(process.env.DATABASE_URL);
  const rows = await sql`SELECT * FROM "1_million_egg_main_Season"`;
  console.log(rows);
}
main().catch(console.error).finally(() => process.exit(0));
