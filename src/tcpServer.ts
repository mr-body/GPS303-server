
import net from "node:net";
import type { Socket } from "node:net";
import type { Conn } from "./service/conn";

export class TCPServer {
    private server: net.Server;

    constructor(
        private readonly port: number,
        private readonly createConnection: (socket: Socket) => Conn,
        private readonly host = "0.0.0.0",
    ) {
        this.server = net.createServer((socket) => {
            const connection = this.createConnection(socket);
            connection.Start();
        });
    }

    public Start(): void {
        this.server.listen(this.port, this.host, () => {
            console.log(
                `[TCP] À espera de GPS na porta ${this.port}`,
            );
        });

        this.server.on("error", (error) => {
            console.error("[TCP] Erro no servidor:", error.message);
        });
    }

    public Stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server.close((error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }
}
