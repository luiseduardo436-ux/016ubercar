const fs = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('pg');

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL é obrigatória para executar a migração');
  const sql = await fs.readFile(path.join(__dirname, 'database', 'schema.sql'), 'utf8');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(sql);
    console.log('Database migration completed');
  } finally {
    await client.end();
  }
}

if (require.main === module) migrate().catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = { migrate };