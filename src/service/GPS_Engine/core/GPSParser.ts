import type { GPSLocation } from "../../../type/interface"

export abstract class GPSParser {
    public abstract Parse(): boolean;
    public abstract GetData(): GPSLocation | null;
}