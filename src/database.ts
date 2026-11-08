import { Pool, type PoolClient, type QueryResultRow } from "pg";

const rawConnectionString = process.env.DATABASE_URL;

if (!rawConnectionString) {
    throw new Error("DATABASE_URL não está definida no ambiente.");
}

// O URL do Timescale Cloud usa sslmode=require. Ativa a semântica libpq
// desse modo no pg-connection-string para evitar a interpretação como verify-full.
const databaseUrl = new URL(rawConnectionString);
if (databaseUrl.searchParams.get("sslmode") === "require") {
    databaseUrl.searchParams.set("uselibpqcompat", "true");
}

export const pool = new Pool({
    connectionString: databaseUrl.toString(),
    max: Number(process.env.DB_POOL_MAX ?? 20),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: "gps303-server",
});

pool.on("error", (error) => {
    console.error("[DB] Erro inesperado numa ligação inativa:", error);
});

export async function query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[] = [],
) {
    return pool.query<T>(text, values);
}

export async function withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
    const client = await pool.connect();

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

export async function checkDatabase(): Promise<void> {
    await query("SELECT 1");
}

export async function closeDatabase(): Promise<void> {
    await pool.end();
}
