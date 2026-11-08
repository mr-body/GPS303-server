import { HTTPServer } from "./src/httpServer";
import { closeDatabase, checkDatabase } from "./src/database";
import { GPSController } from "./src/routes/gps.controller";
import { GPSMetrics } from "./src/service/GPS_Metrics";
import { TCPServer } from "./src/tcpServer";

const TCP_PORT = Number(process.env.TCP_PORT ?? 5001);
const HTTP_PORT = Number(process.env.HTTP_PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";

async function main(): Promise<void> {
    await checkDatabase();
    console.log("[DB] PostgreSQL + TimescaleDB conectado.");

    const tcpServer = new TCPServer(
        TCP_PORT,
        (socket) => new GPSMetrics(socket),
        HOST,
    );

    const httpServer = new HTTPServer(
        HTTP_PORT,
        new GPSController(),
        HOST,
    );

    tcpServer.Start();
    httpServer.Start();

    const shutdown = async (signal: string) => {
        console.log(`[SERVER] ${signal} recebido; a encerrar...`);
        await tcpServer.Stop();
        await closeDatabase();
        process.exit(0);
    };

    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch(async (error: unknown) => {
    console.error("[SERVER] Falha ao iniciar:", error);
    await closeDatabase().catch(() => undefined);
    process.exitCode = 1;
});
