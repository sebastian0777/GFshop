require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runSqlFile(fileName) {
  const filePath = path.join(__dirname, "..", fileName);
  const sql = fs.readFileSync(filePath, "utf-8");
  await pool.query(sql);
  console.log(`Executed ${fileName}`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  await runSqlFile("schema.sql");
  await runSqlFile("seed.sql");
  console.log("Database initialized");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
