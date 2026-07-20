const postgres = require('postgres');

const sql = postgres(process.env.DATABASE_URL);

async function main() {
  try {
    const res = await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
    console.log("TABLES:", res.map(r => r.tablename));

    const metaRes = await sql`SELECT key, value FROM _ponder_meta`;
    console.log("PONDER META:", metaRes);
  } catch (err) {
    console.error(err);
  } finally {
    await sql.end();
  }
}
main();
