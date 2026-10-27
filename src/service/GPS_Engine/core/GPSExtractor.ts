export class GPSExtractor {
    protected message: string
    protected imei: string = ""
    protected latitude: number | null = null
    protected longitude: number | null = null
    protected speed: number | null = null
    protected timestamp: string | null = null
    protected receivedAt: string = ""
    protected valid: boolean | null = null
    protected batteryLevel: number | null = null

    constructor(message: string) {
        this.message = message
    }

    public get GetIMEI(): string {
        return this.imei
    }

    public get GetLatitude(): number | null {
        return this.latitude
    }

    public get GetLongitude(): number | null {
        return this.longitude
    }

    public get GetSpeed(): number | null {
        return this.speed
    }

    public get GetBatteryLevel(): number | null {
        return this.batteryLevel
    }

    public get GetTimestamp(): string | null {
        return this.timestamp
    }

    public get GetReceivedAt(): string {
        return this.receivedAt
    }

    public get IsValid(): boolean | null {
        return this.valid
    }
}