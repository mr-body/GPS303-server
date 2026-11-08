import type { Socket } from "node:net";
import { query } from "../database";
import { GPSTrackerParser } from "./GPS_Engine/GPSTrackerParser";

export class GPSMetrics {
    private buffer = "";
    private queue: Promise<void> = Promise.resolve();
    private readonly remoteAddress: string;
    private authenticatedImei: string | null = null;

    constructor(private readonly socket: Socket) {
        this.remoteAddress = `${socket.remoteAddress}:${socket.remotePort}`;
    }

    public Start(): void {
        console.log(`[GPS] Conectado: ${this.remoteAddress}`);
        this.socket.setEncoding("utf8");

        this.socket.on("data", (chunk: string) => {
            this.buffer += chunk;

            if (this.buffer.length > 8192) {
                console.error("[GPS] Buffer demasiado grande; conexão encerrada.");
                this.socket.destroy();
                return;
            }

            const batch: string[] = [];
            let separator: number;

            while ((separator = this.buffer.indexOf(";")) !== -1) {
                const message = this.buffer.slice(0, separator + 1).trim();
                this.buffer = this.buffer.slice(separator + 1);
                if (message) batch.push(message);
            }

            // Mantém a ordem dos pacotes recebidos na mesma ligação TCP.
            this.queue = this.queue
                .then(async () => {
                    for (const message of batch) {
                        await this.ProcessMessage(message);
                    }
                })
                .catch((error: unknown) => {
                    console.error("[GPS] Erro ao processar mensagens:", error);
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
        const receivedAt = new Date();
        const isLogin = message.startsWith("##,imei:");
        const imeiMatch = message.match(/imei:(\d{15})/i);
        const imei = imeiMatch?.[1] ?? null;

        // Regista todas as mensagens recebidas, incluindo tentativas não autorizadas.
        await query(
            `INSERT INTO gps_messages (message, imei, remote_address, received_at)
             VALUES ($1, $2, $3, $4)`,
            [message, imei, this.remoteAddress, receivedAt],
        );

        if (isLogin) {
            console.log("[GPS] Pedido de login:", imei ?? "IMEI desconhecido");

            if (!imei) {
                console.warn("[GPS] Login recusado: IMEI inválido.", this.remoteAddress);
                this.socket.destroy();
                return;
            }

            const allowed = await query<{ imei: string }>(
                `SELECT imei
                   FROM allow_imei
                  WHERE imei = $1 AND enabled = TRUE
                  LIMIT 1`,
                [imei],
            );

            if (allowed.rows.length === 0) {
                console.warn("[GPS] Dispositivo não autorizado:", imei, this.remoteAddress);
                this.socket.destroy();
                return;
            }

            this.authenticatedImei = imei;

            await query(
                `UPDATE allow_imei
                    SET last_connected_at = $2,
                        last_remote_address = $3,
                        updated_at = NOW()
                  WHERE imei = $1`,
                [imei, receivedAt, this.remoteAddress],
            );

            console.log("[GPS] Dispositivo autorizado:", imei);

            if (!this.socket.destroyed) {
                this.socket.write("LOAD\r\n");
                console.log("[GPS] Resposta enviada: LOAD");
            }
            return;
        }

        // Não processa pacotes de localização antes de um login autorizado.
        if (!this.authenticatedImei) {
            console.warn("[GPS] Pacote ignorado: ligação ainda não autenticada.", this.remoteAddress);
            this.socket.destroy();
            return;
        }

        const location = new GPSTrackerParser(message).GetData();
        if (!location || !location.imei || location.latitude === null || location.longitude === null) {
            return;
        }

        // Impede que uma ligação autenticada envie dados de outro IMEI.
        if (location.imei !== this.authenticatedImei) {
            console.warn("[GPS] IMEI divergente na ligação:", {
                authenticated: this.authenticatedImei,
                received: location.imei,
            });
            this.socket.destroy();
            return;
        }

        const recordedAt = this.parseDeviceTimestamp(location.timestamp) ?? receivedAt;

        await query(
            `INSERT INTO gps_locations (
                recorded_at, imei, latitude, longitude, speed,
                battery_level, valid, received_at, raw_message
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
                recordedAt,
                location.imei,
                location.latitude,
                location.longitude,
                location.speed,
                location.batteryLevel,
                location.valid ?? false,
                receivedAt,
                message,
            ],
        );

        // Só substitui a posição atual se o pacote for mais recente.
        await query(
            `INSERT INTO gps_latest_locations (
                imei, latitude, longitude, speed, battery_level,
                recorded_at, received_at, valid, raw_message
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (imei) DO UPDATE SET
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                speed = EXCLUDED.speed,
                battery_level = EXCLUDED.battery_level,
                recorded_at = EXCLUDED.recorded_at,
                received_at = EXCLUDED.received_at,
                valid = EXCLUDED.valid,
                raw_message = EXCLUDED.raw_message
             WHERE EXCLUDED.recorded_at >= gps_latest_locations.recorded_at`,
            [
                location.imei,
                location.latitude,
                location.longitude,
                location.speed,
                location.batteryLevel,
                recordedAt,
                receivedAt,
                location.valid ?? false,
                message,
            ],
        );

        console.log("[GPS] Posição persistida:", {
            imei: location.imei,
            latitude: location.latitude,
            longitude: location.longitude,
            speed: location.speed,
            recordedAt: recordedAt.toISOString(),
        });
    }

    private parseDeviceTimestamp(value: string | null): Date | null {
        // O formato recebido pelo GPS303 é AAMMDDHHMMSS (hora UTC).
        if (!value || !/^\d{12}$/.test(value)) return null;

        const year = 2000 + Number(value.slice(0, 2));
        const month = Number(value.slice(2, 4)) - 1;
        const day = Number(value.slice(4, 6));
        const hour = Number(value.slice(6, 8));
        const minute = Number(value.slice(8, 10));
        const second = Number(value.slice(10, 12));
        const date = new Date(Date.UTC(year, month, day, hour, minute, second));

        if (
            date.getUTCFullYear() !== year ||
            date.getUTCMonth() !== month ||
            date.getUTCDate() !== day ||
            date.getUTCHours() !== hour ||
            date.getUTCMinutes() !== minute ||
            date.getUTCSeconds() !== second
        ) return null;

        return date;
    }
}
