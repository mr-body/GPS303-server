import { convertCoordinate } from "../../util/convertCoordinate";
import { GPSExtractor } from "./core/GPSExtractor";
import type { GPSLocation } from "../../type/interface";
import { GPSParser } from "./core/GPSParser";

export class GPSTrackerParser extends GPSExtractor implements GPSParser {

    constructor(message: string) {
        super(message);
    }

    public Parse(): boolean {
        const fields = this.message.replace(/;$/, "").split(",");

        try {
            if (fields[1] !== "tracker" || fields[4] !== "F")
                return false;

            if (!fields || fields.length < 19)
                throw Error("Invalid GPS Message")

            this.imei = (fields[0] as string).replace("imei:", "");

            if (!/^\d{15}$/.test(this.imei))
                throw Error("Invalid IMEI")

            this.latitude = convertCoordinate(fields[7] as string, fields[8] as string);
            this.longitude = convertCoordinate(fields[9] as string, fields[10] as string);

            if (this.latitude === null || this.longitude === null)
                throw Error("Invalid Latitude or Longitude")

            this.timestamp = fields[2] as string;
            this.batteryLevel = Number((fields[3] as string).replace("%", "")) || null;
            this.speed = Number(fields[11]) || 0;
            this.receivedAt = new Date().toISOString();
            this.valid = fields[6] === "A";
            return true;
        }
        catch (error: any) {
            console.error("[GPS] Erro:", error.message);
            return false;
        }
    }

    public GetData(): GPSLocation | null {
        if (this.Parse()) {
            return {
                imei: this.imei,
                latitude: this.latitude,
                longitude: this.longitude,
                speed: this.speed,
                batteryLevel: this.batteryLevel,
                timestamp: this.timestamp,
                receivedAt: this.receivedAt,
                valid: this.valid,
            }
        }
        return null;
    }
}