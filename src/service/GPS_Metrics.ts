import type { Socket } from "node:net";
import type { LocalCollection } from "../lib/LocalField";
import { GPSTrackerParser } from "./GPS_Engine/GPSTrackerParser";
import type { LocationDocument, MessageDocument } from "../type/interface";

export class GPSMetrics {
    private buffer = "";
    private queue: Promise<void> = Promise.resolve();
    private readonly remoteAddress: string;

    constructor(
        private readonly socket: Socket,
        private readonly messages: LocalCollection<MessageDocument>,
        private readonly locations: LocalCollection<LocationDocument>,
    ) {
        this.remoteAddress =
            `${socket.remoteAddress}:${socket.remotePort}`;
    }

    public Start(): void {
        console.log(`[GPS] Conectado: ${this.remoteAddress}`);

        this.socket.setEncoding("utf8");

        this.socket.on("data", (chunk: string) => {
            this.buffer += chunk;

            if (this.buffer.length > 8192) {
                console.error("[GPS] Buffer demasiado grande");
                this.socket.destroy();
                return;
            }

            const batch: string[] = [];
            let separator: number;

            while ((separator = this.buffer.indexOf(";")) !== -1) {
                const message = this.buffer
                    .slice(0, separator + 1)
                    .trim();

                this.buffer = this.buffer.slice(separator + 1);

                if (message) batch.push(message);
            }

            // Preservar a ordem das mensagens da mesma conexão.
            this.queue = this.queue
                .then(async () => {
                    for (const message of batch) {
                        await this.ProcessMessage(message);
                    }
                })
                .catch((error: unknown) => {
                    console.error("[GPS] Erro na conexão:", error);
                });
        });

        this.socket.on("error", (error) => {
            console.error("[GPS] Erro no socket:", error.message);
        });

        this.socket.on("close", () => {
            console.log(`[GPS] Desconectado: ${this.remoteAddress}`);
        });
    }

    private async ProcessMessage(message: string): Promise<void> {
        const receivedAt = new Date().toISOString();

        await this.messages.Create({
            message,
            receivedAt,
            remoteAddress: this.remoteAddress,
        });

        // O login não é uma mensagem de localização.
        if (message.startsWith("##,imei:")) {
            console.log("[GPS] Login recebido:", message);

            if (!this.socket.destroyed) {
                this.socket.write("LOAD\r\n");
                console.log("[GPS] Resposta enviada: LOAD");
            }

            return;
        }

        console.log("[GPS RAW]", message);

        const gps = new GPSTrackerParser(message);
        const location = gps.GetData();

        if (!location) return;

        const document: LocationDocument = {
            imei: location.imei,
            latitude: location.latitude!,
            longitude: location.longitude!,
            speed: location.speed ?? 0,
            batteryLevel: location.batteryLevel,
            timestamp: location.timestamp ?? "",
            receivedAt: location.receivedAt,
            valid: location.valid ?? false,
        };

        const existing = await this.locations.FindOne({
            imei: document.imei,
        });

        if (existing) {
            await this.locations.Update(
                { imei: document.imei },
                {
                    latitude: document.latitude,
                    longitude: document.longitude,
                    speed: document.speed,
                    batteryLevel: document.batteryLevel,
                    timestamp: document.timestamp,
                    receivedAt: document.receivedAt,
                    valid: document.valid,
                },
            );
        } else {
            await this.locations.Create(document);
        }

        console.log("[GPS] Localização guardada:", {
            imei: document.imei,
            latitude: document.latitude,
            longitude: document.longitude,
            speed: document.speed,
            batteryLevel: document.batteryLevel,
            timestamp: document.timestamp,
            receivedAt: document.receivedAt,
            valid: document.valid,
        });
    }
}
