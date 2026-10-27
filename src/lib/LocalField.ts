
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

type DocumentData = Record<string, unknown>;
type Filter<T> = Partial<T>;
type StoredDocument<T> = T & { _id: string };

export class LocalField {
    private database: string;
    private data: Record<string, DocumentData[]> = {};
    private connected = false;
    private writeQueue: Promise<void> = Promise.resolve();

    constructor(database = "./database.json") {
        this.database = database;
    }

    public async Connect(): Promise<void> {
        await mkdir(dirname(this.database), { recursive: true });

        try {
            const content = await readFile(this.database, "utf8");
            const parsed: unknown = JSON.parse(content);

            if (
                typeof parsed !== "object" ||
                parsed === null ||
                Array.isArray(parsed)
            ) {
                throw new Error("Invalid database JSON structure");
            }

            this.data = parsed as Record<string, DocumentData[]>;
        } catch (error) {
            if (
                error instanceof Error &&
                "code" in error &&
                error.code === "ENOENT"
            ) {
                this.data = {};
                await this.Save();
            } else {
                throw error;
            }
        }

        this.connected = true;
    }

    public Collection<T extends DocumentData>(
        name: string,
        template: T
    ): LocalCollection<T> {
        this.AssertConnected();

        if (!this.data[name]) {
            this.data[name] = [];
        }

        return new LocalCollection<T>(this, name, template);
    }

    public GetCollection(name: string): DocumentData[] {
        this.AssertConnected();
        return this.data[name] ?? [];
    }

    public async Insert<T extends DocumentData>(
        name: string,
        document: T
    ): Promise<StoredDocument<T>> {
        this.AssertConnected();

        const created = {
            ...document,
            _id: randomUUID(),
        } as StoredDocument<T>;

        this.data[name] ??= [];
        this.data[name]!.push(created);

        await this.Save();

        return created;
    }

    public async Modify<T extends DocumentData>(
        name: string,
        filter: Filter<T>,
        changes: Partial<T>
    ): Promise<number> {
        this.AssertConnected();

        const documents = this.GetCollection(name);
        let modified = 0;

        for (const document of documents) {
            if (this.Matches(document, filter)) {
                Object.assign(document, changes);
                modified++;
            }
        }

        if (modified > 0) {
            await this.Save();
        }

        return modified;
    }

    public async Remove<T extends DocumentData>(
        name: string,
        filter: Filter<T>
    ): Promise<number> {
        this.AssertConnected();

        const documents = this.GetCollection(name);
        const remaining = documents.filter(
            document => !this.Matches(document, filter)
        );

        const deleted = documents.length - remaining.length;

        if (deleted > 0) {
            this.data[name] = remaining;
            await this.Save();
        }

        return deleted;
    }

    public Matches<T extends DocumentData>(
        document: DocumentData,
        filter: Filter<T>
    ): boolean {
        return Object.entries(filter).every(
            ([key, value]) => document[key] === value
        );
    }

    private AssertConnected(): void {
        if (!this.connected) {
            throw new Error(
                "LocalField is not connected. Call await Connect() first."
            );
        }
    }

    private async Save(): Promise<void> {
        const snapshot = JSON.stringify(this.data, null, 2);

        this.writeQueue = this.writeQueue.then(() =>
            writeFile(this.database, snapshot, "utf8")
        );

        await this.writeQueue;
    }
}

export class LocalCollection<T extends DocumentData> {
    constructor(
        private readonly database: LocalField,
        private readonly name: string,
        public readonly template: T
    ) { }

    public async Create(
        document: T
    ): Promise<StoredDocument<T>> {
        return this.database.Insert(this.name, document);
    }


    public async Find(
        filter: Filter<T> = {}
    ): Promise<StoredDocument<T>[]> {
        const documents = this.database.GetCollection(this.name);

        return documents.filter(
            document => this.database.Matches(document, filter)
        ) as StoredDocument<T>[];
    }


    public async FindOne(
        filter: Filter<T>
    ): Promise<StoredDocument<T> | null> {
        return (
            (await this.Find(filter))[0] ?? null
        );
    }

    public async Update(
        filter: Filter<T>,
        changes: Partial<T>
    ): Promise<number> {
        return this.database.Modify(this.name, filter, changes);
    }

    public async Delete(
        filter: Filter<T>
    ): Promise<number> {
        return this.database.Remove(this.name, filter);
    }
}
