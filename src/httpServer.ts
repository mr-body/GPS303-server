
import express from "express";
import type { LocalCollection } from "./lib/LocalField";

type MessageDocument = {
    message: string;
    receivedAt: string;
    remoteAddress: string;
};

type LocationDocument = {
    imei: string;
    latitude: number;
    longitude: number;
    speed: number;
    batteryLevel: number | null;
    timestamp: string;
    receivedAt: string;
    valid: boolean;
};

export class HTTPServer {
    private readonly app = express();

    constructor(
        private readonly port: number,
        private readonly messages: LocalCollection<MessageDocument>,
        private readonly locations: LocalCollection<LocationDocument>,
        private readonly host = "0.0.0.0",
    ) {
        this.app.use(express.json());
        this.RegisterRoutes();
    }

    private RegisterRoutes(): void {
        this.app.get("/", (_req, res) => {
            res.json({
                name: "GPS303 Server",
                status: "online",
                httpPort: this.port,
            });
        });

        this.app.get("/gps/messages", async (_req, res) => {
            try {
                const data = await this.messages.Find();

                res.json({
                    total: data.length,
                    data,
                });
            } catch (error) {
                console.error("[HTTP] Erro:", error);

                res.status(500).json({
                    message: "Erro ao consultar mensagens",
                });
            }
        });

        this.app.get("/gps/latest", async (_req, res) => {
            try {
                const data = await this.messages.Find();
                const latest = data.at(-1);

                if (!latest) {
                    res.status(404).json({
                        message: "Ainda não foram recebidas mensagens GPS",
                    });
                    return;
                }

                res.json(latest);
            } catch (error) {
                console.error("[HTTP] Erro:", error);

                res.status(500).json({
                    message: "Erro ao consultar a última mensagem",
                });
            }
        });

        this.app.get("/gps/locations", async (_req, res) => {
            try {
                const data = await this.locations.Find();

                res.json({
                    total: data.length,
                    data,
                });
            } catch (error) {
                console.error("[HTTP] Erro:", error);

                res.status(500).json({
                    message: "Erro ao consultar localizações",
                });
            }
        });

        this.app.get("/gps/location/:imei", async (req, res) => {
            try {
                const imei = String(req.params.imei);
                const location = await this.locations.FindOne({ imei });

                if (!location) {
                    res.status(404).json({
                        message: "Localização não encontrada",
                    });
                    return;
                }

                res.json({
                    ...location,
                    googleMapsUrl:
                        `https://www.google.com/maps?q=${location.latitude},${location.longitude}`,
                });
            } catch (error) {
                console.error("[HTTP] Erro:", error);

                res.status(500).json({
                    message: "Erro ao consultar localização",
                });
            }
        });
    }

    public Start(): void {
        this.app.listen(this.port, this.host, () => {
            console.log(
                `[HTTP] API disponível em http://${this.host}:${this.port}`,
            );
        });
    }
}
