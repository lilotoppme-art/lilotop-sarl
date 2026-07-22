const { radarConfig } = require("./config");

let pool;

function getPool() {
  const { databaseUrl } = radarConfig();
  if (!databaseUrl) throw Object.assign(new Error("DATABASE_URL is not configured"), { code: "DATABASE_NOT_CONFIGURED" });
  if (!pool) {
    const { Pool } = require("pg");
    pool = new Pool({ connectionString: databaseUrl, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 });
  }
  return pool;
}

async function query(text, values = []) {
  return getPool().query(text, values);
}

async function transaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { query, transaction };
