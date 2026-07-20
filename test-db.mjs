import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.log("No DATABASE_URL provided. Exiting.");
  process.exit(1);
}

const client = postgres(connectionString);
const db = drizzle(client);

async function run() {
  try {
    const result = await db.execute(sql`SELECT 1 as num`);
    console.log("Result Type:", typeof result);
    console.log("Is Array?", Array.isArray(result));
    console.log("Result:", result);
  } catch (e) {
    console.error(e);
  } finally {
    client.end();
  }
}

run();
