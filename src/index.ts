import express from "express";
import net from "node:net";

const TCP_PORT = 5001;
const HTTP_PORT = 3000;

const app = express();
app.use(express.json());

// Armazenamento temporário, apenas em memória.
const messages: {
    message: string;
    receivedAt: string;
    remoteAddress: string;
}[] = [];

const MAX_MESSAGES = 100;

type GPSLocation = {
    imei: string;
    latitude: number;
    longitude: number;
    speed: number;
    timestamp: string;
    receivedAt: string;
    valid: boolean;
};

const locations = new Map<string, GPSLocation>();

function convertCoordinate(
    value: string,
    hemisphere: string,
): number | null {
    const raw = Number(value);

    if (!Number.isFinite(raw) || raw <= 0) {
        return null;
    }

    const degrees = Math.floor(raw / 100);
    const minutes = raw - degrees * 100;

    if (minutes >= 60) {
        return null;
    }

    let result = degrees + minutes / 60;

    if (hemisphere === "S" || hemisphere === "W") {
        result = -result;
    } else if (hemisphere !== "N" && hemisphere !== "E") {
        return null;
    }

    return result;
}

function parseGPSLocation(message: string): GPSLocation | null {
    const fields = message.replace(/;$/, "").split(",");

    if (fields[1] !== "tracker" || fields[4] !== "F") {
        return null;
    }

    const imei = fields[0].replace("imei:", "");

    if (!/^\d{15}$/.test(imei)) {
        return null;
    }

    const latitude = convertCoordinate(fields[7], fields[8]);
    const longitude = convertCoordinate(fields[9], fields[10]);

    if (latitude === null || longitude === null) {
        return null;
    }

    const valid = fields[6] === "A";

    // O campo da hora do pacote contém a data e a hora do rastreador.
    const rawTimestamp = fields[2];

    return {
        imei,
        latitude,
        longitude,
        speed: Number(fields[11]) || 0,
        timestamp: rawTimestamp,
        receivedAt: new Date().toISOString(),
        valid,
    };
}

const tcpServer = net.createServer((socket) => {
    const remoteAddress = `${socket.remoteAddress}:${socket.remotePort}`;

    console.log(`[GPS] Conectado: ${remoteAddress}`);

    let buffer = "";

    socket.setEncoding("utf8");

    socket.on("data", (chunk: Buffer) => {
        console.log("[GPS RAW]", chunk.toString("utf8"));

        buffer += chunk;


        if (buffer.length > 8192) {
            console.error("[GPS] Buffer demasiado grande");
            socket.destroy();
            return;
        }

        let separator: number;

        while ((separator = buffer.indexOf(";")) !== -1) {
            const message = buffer.slice(0, separator + 1).trim();
            const location = parseGPSLocation(message);

            if (location) {
                locations.set(location.imei, location);

                console.log("[GPS] Localização:", {
                    imei: location.imei,
                    latitude: location.latitude,
                    longitude: location.longitude,
                    valid: location.valid,
                });
            }

            buffer = buffer.slice(separator + 1);

            if (!message) continue;

            const entry = {
                message,
                receivedAt: new Date().toISOString(),
                remoteAddress,
            };

            messages.push(entry);

            if (messages.length > MAX_MESSAGES) {
                messages.shift();
            }

            if (message.startsWith("##,imei:")) {
                console.log("[GPS] Login recebido:", message);

                socket.write("LOAD\r\n");

                console.log("[GPS] Resposta enviada: LOAD");
                continue;
            }

            console.log("\n========== GPS RECEBIDO ==========");
            console.log("Origem:", remoteAddress);
            console.log("Mensagem:", message);
            console.log("Data:", entry.receivedAt);
            console.log("==================================\n");
        }
    });

    socket.on("error", (error) => {
        console.error("[GPS] Erro:", error.message);
    });

    socket.on("close", () => {
        console.log(`[GPS] Desconectado: ${remoteAddress}`);
    });
});

// API HTTP
app.get("/", (_req, res) => {
    res.json({
        name: "GPS303 Server",
        status: "online",
        tcpPort: TCP_PORT,
        httpPort: HTTP_PORT,
    });
});

app.get("/gps/messages", (_req, res) => {
    res.json({
        total: messages.length,
        data: messages,
    });
});

app.get("/gps/latest", (_req, res) => {
    const latest = messages.at(-1);

    if (!latest) {
        res.status(404).json({
            message: "Ainda não foram recebidas mensagens GPS",
        });
        return;
    }

    res.json(latest);
});

app.get("/gps/location/:imei", (req, res) => {
    const location = locations.get(req.params.imei);

    if (!location) {
        res.status(404).json({
            message: "Ainda não existe localização para este IMEI",
        });
        return;
    }

    res.json({
        ...location,
        googleMapsUrl:
            `https://www.google.com/maps?q=${location.latitude},${location.longitude}`,
    });
});

// Iniciar os dois servidores
tcpServer.listen(TCP_PORT, "0.0.0.0", () => {
    console.log(`[TCP] À espera de GPS na porta ${TCP_PORT}`);
});

app.listen(HTTP_PORT, "0.0.0.0", () => {
    console.log(`[HTTP] API disponível na porta ${HTTP_PORT}`);
});
