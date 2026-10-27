export function convertCoordinate(value: string, hemisphere: string): number | null {
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