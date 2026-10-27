export type GPSLocation = {
    imei: string;
    latitude: number | null;
    longitude: number | null;
    speed: number | null;
    timestamp: string | null;
    receivedAt: string | null;
    valid: boolean | null;
    batteryLevel: number | null;
};

export type MessageDocument = {
    message: string;
    receivedAt: string;
    remoteAddress: string;
};

export type LocationDocument = {
    imei: string;
    latitude: number;
    longitude: number;
    speed: number;
    batteryLevel: number | null;
    timestamp: string;
    receivedAt: string;
    valid: boolean;
};