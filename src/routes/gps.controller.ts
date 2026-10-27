import type { LocalCollection } from "../lib/LocalField";
import type { LocationDocument, MessageDocument, } from "../type/interface";
import { Controller, Get, } from "../lib/decorators";

@Controller("/gps")
export class GPSController {
    constructor(
        private readonly messages: LocalCollection<MessageDocument>,
        private readonly locations: LocalCollection<LocationDocument>,
    ) { }

    @Get("")
    public getStatus() {
        return {
            name: "GPS303 Server",
            status: "online",
        };
    }

    @Get("/messages")
    public async getMessages() {
        const data = await this.messages.Find();

        return {
            total: data.length,
            data,
        };
    }

    @Get("/latest")
    public async getLatest() {
        const data = await this.messages.Find();
        const latest = data.at(-1);

        if (!latest) {
            return {
                status: 404,
                body: {
                    message: "Ainda não foram recebidas mensagens GPS",
                },
            };
        }

        return latest;
    }

    @Get("/locations")
    public async getLocations() {
        const data = await this.locations.Find();

        return {
            total: data.length,
            data,
        };
    }

    @Get("/location/:imei")
    public async getLocation(req: import("express").Request) {
        const imei = String(req.params.imei);
        const location = await this.locations.FindOne({ imei });

        if (!location) {
            return {
                status: 404,
                body: {
                    message: "Localização não encontrada",
                },
            };
        }

        return {
            ...location,
            googleMapsUrl:
                `https://www.google.com/maps?q=${location.latitude},${location.longitude}`,
        };
    }
}
