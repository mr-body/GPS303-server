import { HTTPServer } from "./src/httpServer";
import { LocalField } from "./src/lib/LocalField";
import { GPSController } from "./src/routes/gps.controller";
import { GPSMetrics } from "./src/service/GPS_Metrics";
import { TCPServer } from "./src/tcpServer";
import type { LocationDocument, MessageDocument } from "./src/type/interface";

const TCP_PORT = 5001;
const HTTP_PORT = 3000;

async function main(): Promise<void> {
    // 1. Criar e conectar a base de dados.
    const db = new LocalField("./data/database.json");
    await db.Connect();

    // 2. Criar as coleções.
    const messages = db.Collection<MessageDocument>("messages", {
        message: "",
        receivedAt: "",
        remoteAddress: "",
    });

    const locations = db.Collection<LocationDocument>("locations", {
        imei: "",
        latitude: 0,
        longitude: 0,
        speed: 0,
        batteryLevel: null,
        timestamp: "",
        receivedAt: "",
        valid: false,
    });

    // 3. Injetar as dependências no servidor TCP.
    const tcpServer = new TCPServer(
        TCP_PORT,
        (socket) => new GPSMetrics(socket, messages, locations),
    );

    // 4. Injetar as coleções no servidor HTTP.
    const httpServer = new HTTPServer(
        HTTP_PORT,
        new GPSController(messages, locations),
    );

    // 5. Iniciar os servidores.
    tcpServer.Start();
    httpServer.Start();
}

main().catch((error: unknown) => {
    console.error("[SERVER] Falha ao iniciar:", error);
    process.exitCode = 1;
});
