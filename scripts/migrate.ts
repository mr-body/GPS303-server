import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pool } from "../src/database";

try {
    const schema = await readFile(resolve("database/schema.sql"), "utf8");
    await pool.query(schema);
    console.log("[MIGRATION] Schema PostgreSQL + TimescaleDB aplicado com sucesso.");
} catch (error) {
    console.error("[MIGRATION] Falha ao aplicar schema:", error);
    process.exitCode = 1;
} finally {
    await pool.end();
}
