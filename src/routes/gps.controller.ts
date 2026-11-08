import { Controller, Delete, Get, Patch, Post } from "../lib/decorators";
import { query } from "../database";

type LocationRow = {
    imei: string;
    latitude: number;
    longitude: number;
    speed: number | null;
    battery_level: number | null;
    recorded_at: Date;
    received_at: Date;
    valid: boolean;
};

type AllowedDeviceRow = {
    imei: string;
    name: string | null;
    description: string | null;
    enabled: boolean;
    created_at: Date;
    updated_at: Date;
    last_connected_at: Date | null;
    last_remote_address: string | null;
};

@Controller("/gps")
export class GPSController {
    /**
     * Lista dispositivos autorizados.
     * GET /gps/allowed-devices?limit=100&offset=0&enabled=true
     */
    @Get("/allowed-devices")
    public async getAllowedDevices(req: import("express").Request) {
        const limit = this.parseLimit(req.query.limit);
        const offset = this.parseOffset(req.query.offset);
        const enabled = this.parseBoolean(req.query.enabled);

        if (req.query.enabled !== undefined && enabled === null) {
            return { status: 400, body: { message: "Parâmetro 'enabled' deve ser true ou false." } };
        }

        const result = await query<AllowedDeviceRow>(
            `SELECT imei, name, description, enabled, created_at, updated_at,
                    last_connected_at, last_remote_address
             FROM allow_imei
             WHERE ($1::boolean IS NULL OR enabled = $1)
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [enabled, limit, offset],
        );
        const count = await query<{ total: string }>(
            `SELECT COUNT(*) AS total
             FROM allow_imei
             WHERE ($1::boolean IS NULL OR enabled = $1)`,
            [enabled],
        );

        return {
            total: Number(count.rows[0]?.total ?? 0),
            limit,
            offset,
            data: result.rows.map((row) => this.formatAllowedDevice(row)),
        };
    }

    /** Regista um novo dispositivo autorizado. POST /gps/allowed-devices */
    @Post("/allowed-devices")
    public async createAllowedDevice(req: import("express").Request) {
        const body = req.body as Record<string, unknown> | undefined;
        const imei = typeof body?.imei === "string" ? body.imei.trim() : "";
        const name = typeof body?.name === "string" ? body.name.trim() : null;
        const description = typeof body?.description === "string" ? body.description.trim() : null;
        const enabled = body?.enabled === undefined ? true : body.enabled;

        if (!/^\d{15}$/.test(imei)) {
            return { status: 400, body: { message: "IMEI inválido. Deve conter exatamente 15 dígitos." } };
        }
        if (body?.name !== undefined && (typeof body.name !== "string" || body.name.trim().length > 120)) {
            return { status: 400, body: { message: "O nome deve ser um texto com até 120 caracteres." } };
        }
        if (body?.description !== undefined && body.description !== null && typeof body.description !== "string") {
            return { status: 400, body: { message: "A descrição deve ser um texto." } };
        }
        if (typeof enabled !== "boolean") {
            return { status: 400, body: { message: "'enabled' deve ser boolean." } };
        }

        const result = await query<AllowedDeviceRow>(
            `INSERT INTO allow_imei (imei, name, description, enabled)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (imei) DO NOTHING
             RETURNING imei, name, description, enabled, created_at, updated_at,
                       last_connected_at, last_remote_address`,
            [imei, name, description, enabled],
        );

        if (!result.rows[0]) {
            return { status: 409, body: { message: "Este IMEI já está registado na lista de dispositivos." } };
        }

        return { status: 201, body: this.formatAllowedDevice(result.rows[0]) };
    }

    /** Consulta um dispositivo pelo IMEI. GET /gps/allowed-devices/:imei */
    @Get("/allowed-devices/:imei")
    public async getAllowedDevice(req: import("express").Request) {
        const imei = String(req.params.imei);
        if (!/^\d{15}$/.test(imei)) {
            return { status: 400, body: { message: "IMEI inválido." } };
        }

        const result = await query<AllowedDeviceRow>(
            `SELECT imei, name, description, enabled, created_at, updated_at,
                    last_connected_at, last_remote_address
             FROM allow_imei WHERE imei = $1 LIMIT 1`,
            [imei],
        );

        if (!result.rows[0]) {
            return { status: 404, body: { message: "Dispositivo não encontrado." } };
        }

        return this.formatAllowedDevice(result.rows[0]);
    }

    /** Atualiza nome, descrição ou estado de autorização. PATCH /gps/allowed-devices/:imei */
    @Patch("/allowed-devices/:imei")
    public async updateAllowedDevice(req: import("express").Request) {
        const imei = String(req.params.imei);
        const body = req.body as Record<string, unknown> | undefined;

        if (!/^\d{15}$/.test(imei)) {
            return { status: 400, body: { message: "IMEI inválido." } };
        }
        if (!body || Object.keys(body).length === 0) {
            return { status: 400, body: { message: "Indica pelo menos um campo para atualizar." } };
        }
        if ("imei" in body) {
            return { status: 400, body: { message: "O IMEI é a identificação do dispositivo e não pode ser alterado." } };
        }
        if (Object.keys(body).some((key) => !["name", "description", "enabled"].includes(key))) {
            return { status: 400, body: { message: "Campos permitidos: name, description e enabled." } };
        }
        if ("name" in body && (typeof body.name !== "string" || body.name.trim().length > 120)) {
            return { status: 400, body: { message: "O nome deve ser um texto com até 120 caracteres." } };
        }
        if ("description" in body && body.description !== null && typeof body.description !== "string") {
            return { status: 400, body: { message: "A descrição deve ser um texto ou null." } };
        }
        if ("enabled" in body && typeof body.enabled !== "boolean") {
            return { status: 400, body: { message: "'enabled' deve ser boolean." } };
        }

        const result = await query<AllowedDeviceRow>(
            `UPDATE allow_imei
             SET name = CASE WHEN $2::boolean THEN $3::varchar ELSE name END,
                 description = CASE WHEN $4::boolean THEN $5::text ELSE description END,
                 enabled = CASE WHEN $6::boolean THEN $7::boolean ELSE enabled END,
                 updated_at = NOW()
             WHERE imei = $1
             RETURNING imei, name, description, enabled, created_at, updated_at,
                       last_connected_at, last_remote_address`,
            [
                imei,
                "name" in body, "name" in body ? (body.name as string).trim() : null,
                "description" in body, "description" in body ? body.description : null,
                "enabled" in body, "enabled" in body ? body.enabled : null,
            ],
        );

        if (!result.rows[0]) {
            return { status: 404, body: { message: "Dispositivo não encontrado." } };
        }

        return this.formatAllowedDevice(result.rows[0]);
    }

    /** Remove um dispositivo da lista de permissões. DELETE /gps/allowed-devices/:imei */
    @Delete("/allowed-devices/:imei")
    public async deleteAllowedDevice(req: import("express").Request) {
        const imei = String(req.params.imei);
        if (!/^\d{15}$/.test(imei)) {
            return { status: 400, body: { message: "IMEI inválido." } };
        }

        const result = await query<{ imei: string }>(
            "DELETE FROM allow_imei WHERE imei = $1 RETURNING imei",
            [imei],
        );

        if (!result.rows[0]) {
            return { status: 404, body: { message: "Dispositivo não encontrado." } };
        }

        return { message: "Dispositivo removido da lista de permissões.", imei };
    }

    @Get("")
    public async getStatus() {
        const result = await query<{ total_devices: string; total_points: string }>(
            `SELECT
                (SELECT COUNT(*) FROM gps_latest_locations) AS total_devices,
                (SELECT COUNT(*) FROM gps_locations) AS total_points`,
        );

        return {
            name: "GPS303 Server",
            status: "online",
            storage: "PostgreSQL + TimescaleDB",
            ...result.rows[0],
        };
    }

    @Get("/messages")
    public async getMessages(req: import("express").Request) {
        const limit = this.parseLimit(req.query.limit);
        const offset = this.parseOffset(req.query.offset);
        const result = await query(
            `SELECT id, message, imei, remote_address, received_at
             FROM gps_messages
             ORDER BY received_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset],
        );

        return { total: result.rowCount ?? 0, limit, offset, data: result.rows };
    }

    @Get("/latest")
    public async getLatest() {
        const result = await query(
            `SELECT id, message, imei, remote_address, received_at
             FROM gps_messages ORDER BY received_at DESC LIMIT 1`,
        );

        if (!result.rows[0]) {
            return { status: 404, body: { message: "Ainda não foram recebidas mensagens GPS" } };
        }

        return result.rows[0];
    }

    @Get("/locations")
    public async getLocations(req: import("express").Request) {
        const limit = this.parseLimit(req.query.limit);
        const offset = this.parseOffset(req.query.offset);
        const result = await query<LocationRow>(
            `SELECT imei, latitude, longitude, speed, battery_level,
                    recorded_at, received_at, valid
             FROM gps_latest_locations
             ORDER BY received_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset],
        );

        return {
            total: result.rowCount ?? 0,
            limit,
            offset,
            data: result.rows.map((row) => this.formatLocation(row)),
        };
    }

    @Get("/location/:imei")
    public async getLocation(req: import("express").Request) {
        const imei = String(req.params.imei);
        const result = await query<LocationRow>(
            `SELECT imei, latitude, longitude, speed, battery_level,
                    recorded_at, received_at, valid
             FROM gps_latest_locations WHERE imei = $1 LIMIT 1`,
            [imei],
        );

        const location = result.rows[0];
        if (!location) {
            return { status: 404, body: { message: "Localização não encontrada" } };
        }

        return this.formatLocation(location);
    }

    @Get("/history/:imei")
    public async getHistory(req: import("express").Request) {
        const imei = String(req.params.imei);
        const limit = this.parseLimit(req.query.limit);
        const from = this.parseDate(req.query.from);
        const to = this.parseDate(req.query.to);

        if (req.query.from && !from) {
            return { status: 400, body: { message: "Parâmetro 'from' deve ser uma data ISO válida." } };
        }
        if (req.query.to && !to) {
            return { status: 400, body: { message: "Parâmetro 'to' deve ser uma data ISO válida." } };
        }
        if (from && to && from > to) {
            return { status: 400, body: { message: "'from' não pode ser posterior a 'to'." } };
        }

        const result = await query<LocationRow>(
            `SELECT imei, latitude, longitude, speed, battery_level,
                    recorded_at, received_at, valid
             FROM gps_locations
             WHERE imei = $1
               AND ($2::timestamptz IS NULL OR recorded_at >= $2)
               AND ($3::timestamptz IS NULL OR recorded_at <= $3)
             ORDER BY recorded_at DESC
             LIMIT $4`,
            [imei, from, to, limit],
        );

        return {
            imei,
            total: result.rowCount ?? 0,
            data: result.rows.map((row) => this.formatLocation(row)),
        };
    }

    private formatAllowedDevice(row: AllowedDeviceRow) {
        return {
            imei: row.imei,
            name: row.name,
            description: row.description,
            enabled: row.enabled,
            createdAt: new Date(row.created_at).toISOString(),
            updatedAt: new Date(row.updated_at).toISOString(),
            lastConnectedAt: row.last_connected_at
                ? new Date(row.last_connected_at).toISOString()
                : null,
            lastRemoteAddress: row.last_remote_address,
        };
    }

    private parseBoolean(value: unknown): boolean | null {
        if (value === undefined) return null;
        if (value === "true") return true;
        if (value === "false") return false;
        return null;
    }

    private formatLocation(row: LocationRow) {
        return {
            imei: row.imei,
            latitude: Number(row.latitude),
            longitude: Number(row.longitude),
            speed: row.speed === null ? null : Number(row.speed),
            batteryLevel: row.battery_level === null ? null : Number(row.battery_level),
            timestamp: new Date(row.recorded_at).toISOString(),
            receivedAt: new Date(row.received_at).toISOString(),
            valid: row.valid,
            googleMapsUrl: `https://www.google.com/maps?q=${row.latitude},${row.longitude}`,
        };
    }

    private parseLimit(value: unknown): number {
        const parsed = Number(value ?? 100);
        return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), 1000) : 100;
    }

    private parseOffset(value: unknown): number {
        const parsed = Number(value ?? 0);
        return Number.isInteger(parsed) ? Math.max(parsed, 0) : 0;
    }

    private parseDate(value: unknown): Date | null {
        if (typeof value !== "string" || !value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }
}
