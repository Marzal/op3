import { Blobs, GetOpts, ListBlobsResponse, ListOpts, Multiput } from '../backend/blobs.ts';
import { Bytes } from '../deps.ts';

export class InMemoryBlobs implements Blobs {
    private readonly data = new Map<string, Uint8Array>();

    async put(key: string, body: string | ArrayBuffer | ReadableStream<Uint8Array>): Promise<{ etag: string }> {
        const arr = await toByteArray(body);
        this.data.set(key, arr);
        const etag = (await new Bytes(arr).sha1()).hex();
        return { etag };
    }

    get(key: string, as: 'stream', opts?: GetOpts): Promise<ReadableStream<Uint8Array> | undefined>;
    get(key: string, as: 'buffer', opts?: GetOpts): Promise<ArrayBuffer | undefined>;
    get(key: string, as: 'text', opts?: GetOpts): Promise<string | undefined>;
    async get(key: string, as: 'stream' | 'buffer' | 'text', opts: GetOpts = {}): Promise<string | ArrayBuffer | ReadableStream<Uint8Array> | undefined> {
        await Promise.resolve();
        if (Object.keys(opts).length > 0) throw new Error(`Unsupported get opts: ${JSON.stringify(opts)}`);
        const arr = this.data.get(key);
        if (arr === undefined) return undefined;
        if (as === 'stream') return new Blob([ arr ]).stream();
        if (as === 'buffer') return arr.buffer;
        if (as === 'text') return new TextDecoder().decode(arr);
        
        throw new Error();
    }

    async delete(key: string): Promise<void> {
        await Promise.resolve();
        this.data.delete(key);
    }

    async has(key: string): Promise<boolean> {
        await Promise.resolve();
        return this.data.has(key);
    }

    async list(opts: ListOpts = {}): Promise<ListBlobsResponse> {
        await Promise.resolve();
        const { keyPrefix, afterKey } = opts;
        const keys = [...this.data.keys()]
            .sort()
            .filter(v => keyPrefix === undefined || v.startsWith(keyPrefix))
            .filter(v => afterKey === undefined || v > afterKey)
            ;
        return { keys };
    }

    async startMultiput(key: string): Promise<Multiput> {
        await Promise.resolve();
        return new InMemoryMultiput(key, this.data);
    }

}

//

class InMemoryMultiput implements Multiput {
    private readonly key: string;
    private readonly data: Map<string, Uint8Array>;

    private combined = Bytes.EMPTY;
    private parts = 0;
    private done = false;

    constructor(key: string, data: Map<string, Uint8Array>) {
        this.key = key;
        this.data = data;
    }

    async putPart(body: ReadableStream<Uint8Array> | ArrayBuffer | string): Promise<{ etag: string }> {
        if (this.done) throw new Error(`Already done!`);
        await Promise.resolve();
        if (this.done) throw new Error(`Already done!`);
        const arr = await toByteArray(body);
        this.combined = this.combined.concat(new Bytes(arr));
        this.parts++;
        const etag = (await new Bytes(arr).sha1()).hex();
        return { etag };
    }

    async complete(): Promise<{ parts: number, etag: string }> {
        await Promise.resolve();
        if (this.done) throw new Error(`Already done!`);
        const { parts, key, combined } = this;
        if (parts === 0) throw new Error(`No parts!`);
        this.data.set(key, combined.array());
        this.done = true;
        const etag = (await combined.sha1()).hex();
        return { parts, etag };
    }

    async abort(): Promise<void> {
        await Promise.resolve();
        if (this.done) throw new Error(`Already done!`);
        this.done = true;
    }

}

//

async function toByteArray(body: string | ArrayBuffer | ReadableStream<Uint8Array>): Promise<Uint8Array> {
    return typeof body === 'string' ? new TextEncoder().encode(body)
        : body instanceof ArrayBuffer ? new Uint8Array(body)
        : new Uint8Array(await new Response(body).arrayBuffer())
}
