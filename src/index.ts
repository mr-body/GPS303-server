
import express from "express";
import net from "node:net";

const TCP_PORT = 5001;
const HTTP_PORT = 3000;

const app = express();

type GpsPacket = {
    receivedAt: string;
    remoteAddress: string;
    protocol: number;
    length: number;
    hex: string;
};

const packets: GpsPacket[] = [];
const MAX_PACKETS = 100;

function parsePackets(buffer: Buffer): {
    packets: Buffer[];
    remaining: Buffer;
} {
    const packets: Buffer[] = [];
    let offset = 0;

    while (offset + 5 <= buffer.length) {
        // GT06: cabeçalho 7878 ou 7979.
        const shortHeader =
            buffer[offset] === 0x78 && buffer[offset + 1] === 0x78;
        const longHeader =
            buffer[offset] === 0x79 && buffer[offset + 1] === 0x79;

        if (!shortHeader && !longHeader) {
            offset++;
            continue;
        }

        const headerLength = shortHeader ? 2 : 2;
        const lengthBytes = shortHeader ? 1 : 2;

        if (buffer.length < offset + headerLength + lengthBytes) {
            break;
        }

        const packetLength = shortHeader
            ? buffer[offset + 2]
            : buffer.readUInt16BE(offset + 2);

        // Tamanho declarado inclui protocolo, dados, serial e CRC.
        const totalLength = headerLength + lengthBytes + packetLength + 2;

        if (totalLength > 4096 || packetLength < 5) {
            offset++;
            continue;
        }

        if (buffer.length < offset + totalLength) {
            break;
        }

        packets.push(buffer.subarray(offset, offset + totalLength));
        offset += totalLength;
    }

    return {
        packets,
        remaining: buffer.subarray(offset),
    };
}

function getProtocol(packet: Buffer): number {
    const longHeader = packet[0] === 0x79 && packet[1] === 0x79;
    const protocolOffset = longHeader ? 4 : 3;

    return packet[protocolOffset];
}

const tcpServer = net.createServer((socket) => {
    const remoteAddress =
        `${socket.remoteAddress}:${socket.remotePort}`;

    console.log(`[TCP] Conexão: ${remoteAddress}`);

    let buffer = Buffer.alloc(0);

    socket.on("data", (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);

        if (buffer.length > 16384) {
            console.error("[TCP] Buffer demasiado grande");
            socket.destroy();
            return;
        }

        const result = parsePackets(buffer);
        buffer = result.remaining;

        for (const packet of result.packets) {
            const entry: GpsPacket = {
                receivedAt: new Date().toISOString(),
                remoteAddress,
                protocol: getProtocol(packet),
                length: packet.length,
                hex: packet.toString("hex").toUpperCase(),
            };

            packets.push(entry);

            if (packets.length > MAX_PACKETS) {
                packets.shift();
            }

            console.log("\n========== GT06 RECEBIDO ==========");
            console.log("Origem:", entry.remoteAddress);
            console.log("Protocolo:", `0x${entry.protocol.toString(16).padStart(2, "0")}`);
            console.log("Tamanho:", entry.length);
            console.log("HEX:", entry.hex);
            console.log("===================================\n");
        }
    });

    socket.on("error", (error) => {
        console.error(`[TCP] ${remoteAddress}: ${error.message}`);
    });

    socket.on("close", () => {
        console.log(`[TCP] Desconectado: ${remoteAddress}`);
    });
});

app.get("/", (_req, res) => {
    res.json({
        name: "GT06 GPS Server",
        status: "online",
        tcpPort: TCP_PORT,
        httpPort: HTTP_PORT,
    });
});

app.get("/gps/packets", (_req, res) => {
    res.json({
        total: packets.length,
        data: packets,
    });
});

app.get("/gps/latest", (_req, res) => {
    const latest = packets.at(-1);

    if (!latest) {
        res.status(404).json({
            message: "Ainda não foram recebidos pacotes GT06",
        });
        return;
    }

    res.json(latest);
});

tcpServer.on("error", (error) => {
    console.error("[TCP] Erro no servidor:", error);
});

tcpServer.listen(TCP_PORT, "0.0.0.0", () => {
    console.log(`[TCP] GT06 ativo na porta ${TCP_PORT}`);
});

app.listen(HTTP_PORT, "0.0.0.0", () => {
    console.log(`[HTTP] API ativa na porta ${HTTP_PORT}`);
});
