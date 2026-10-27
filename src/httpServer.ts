
import express from "express";
import { registerController } from "./lib/decorators";
import type { GPSController } from "./routes/gps.controller";

export class HTTPServer {
    private readonly app = express();

    constructor(
        private readonly port: number,
        controller: GPSController,
        private readonly host = "0.0.0.0",
    ) {
        this.app.use(express.json());

        const router = express.Router();
        registerController(router, controller);

        this.app.use(router);
    }

    public Start(): void {
        this.app.listen(this.port, this.host, () => {
            console.log(
                `[HTTP] API disponível em http://${this.host}:${this.port}`,
            );
        });
    }
}