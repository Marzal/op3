import { BackendDOColo } from './backend_do_colo.ts';
import { Bytes, DurableObjectNamespace, DurableObjectState, DurableObjectStorage } from './deps.ts';
import { checkDOInfo, DOInfo, GetKeyRequest, GetKeyResponse, isRpcRequest, KeyKind, RpcResponse } from './rpc.ts';
import { IsolateId } from './isolate_id.ts';
import { WorkerEnv } from './worker_env.ts';
import { IpAddressEncryptionFn, IpAddressHashingFn, RawRequestController } from './raw_request_controller.ts';
import { KeyClient, KeyFetcher } from './key_client.ts';
import { sendRpc } from './rpc_client.ts';
import { isValidIpAddressAesKeyScope, isValidIpAddressHmacKeyScope, KeyController } from './key_controller.ts';
import { encrypt, hmac, importAesKey, importHmacKey } from './crypto.ts';
import { listRegistry, register } from './registry_controller.ts';
import { checkDeleteDurableObjectAllowed } from './admin_api.ts';

export class BackendDO {
    private readonly state: DurableObjectState;
    private readonly env: WorkerEnv;

    private info?: DOInfo;

    private rawRequestController?: RawRequestController;
    private keyClient?: KeyClient;

    private keyController?: KeyController;

    constructor(state: DurableObjectState, env: WorkerEnv) {
        this.state = state;
        this.env = env;
    }

    async fetch(request: Request): Promise<Response> {
        IsolateId.log();
        console.log(request.url);
        const colo = await BackendDOColo.get();
        const durableObjectName = request.headers.get('do-name');
        console.log('logprops:', { colo, durableObjectClass: 'BackendDO', durableObjectId: this.state.id.toString(), durableObjectName });

        try {
            if (!durableObjectName) throw new Error(`Missing do-name header!`);
            await this.ensureInitialized({ colo, name: durableObjectName });

            const { method } = request;
            const { pathname } = new URL(request.url);
            if (method === 'POST' && pathname === '/rpc') {
                const obj = await request.json();
                if (!isRpcRequest(obj)) throw new Error(`Bad rpc request: ${JSON.stringify(obj)}`);
                const { storage } = this.state;
                if (obj.kind === 'save-raw-requests') {
                    // save raw requests to storage
                    if (!this.keyClient) this.keyClient = newKeyClient(this.env.backendNamespace);
                    const keyClient = this.keyClient;
                    const encryptIpAddress: IpAddressEncryptionFn = async (rawIpAddress, opts) => {
                        const key = await keyClient.getIpAddressAesKey(opts.timestamp);
                        const { encrypted, iv } = await encrypt(Bytes.ofUtf8(rawIpAddress), key);
                        return `1:${iv.hex()}:${encrypted.hex()}`;
                    }
                    const hashIpAddress: IpAddressHashingFn = async (rawIpAddress, opts) => {
                        const key = await keyClient.getIpAddressHmacKey(opts.timestamp);
                        const signature = await hmac(Bytes.ofUtf8(rawIpAddress), key);
                        return `1:${signature.hex()}`;
                    }
                    if (!this.rawRequestController) this.rawRequestController = new RawRequestController(storage, colo, encryptIpAddress, hashIpAddress);
                    await this.rawRequestController.save(obj.rawRequests);
                    
                    return newRpcResponse({ kind: 'ok' });
                } else if (obj.kind === 'get-key') {
                    // get or generate key
                    if (!this.keyController) this.keyController = new KeyController(storage);

                    const { keyKind, keyScope } = obj;
                    const rawKeyBase64 = (await this.keyController.getOrGenerateKey(keyKind, keyScope)).base64();

                    return newRpcResponse({ kind: 'get-key', rawKeyBase64 });
                } else if (obj.kind === 'register-do') {
                    await register(obj.info, storage);
                    return newRpcResponse({ kind: 'ok' });
                } else if (obj.kind === 'admin-data') {
                    const { operationKind, targetPath, dryRun = false } = obj;
                    if (operationKind === 'list' && targetPath === '/registry' && durableObjectName === 'registry') {
                        return newRpcResponse({ kind: 'admin-data', listResults: await listRegistry(storage) });
                    } else if (operationKind === 'list' && targetPath === '/keys' && durableObjectName === 'key-server') {
                        if (!this.keyController) this.keyController = new KeyController(storage);
                        return newRpcResponse({ kind: 'admin-data', listResults: await this.keyController.listKeys() });
                    } else if (operationKind === 'delete' && targetPath.startsWith('/durable-object/')) {
                        const doName = checkDeleteDurableObjectAllowed(targetPath);
                        if (doName !== durableObjectName) throw new Error(`Not allowed to delete ${doName}: routed to ${durableObjectName}`);
                        let message = '';
                        if (dryRun) {
                            message = `DRY RUN: Would delete all storage for ${doName}`;
                        } else {
                            console.log(`Deleting all storage for ${doName}`);
                            const start = Date.now();
                            await storage.deleteAll();
                            message = `Deleted all storage for ${doName} in ${Date.now() - start}ms`;
                        }
                        console.log(message);
                        return newRpcResponse({ kind: 'admin-data', message });
                    }
                } else {
                    throw new Error(`Unsupported rpc request: ${JSON.stringify(obj)}`);
                }
            }
            return new Response('not found', { status: 404 });
        } catch (e) {
            const msg = `Unhandled error in BackendDO.fetch: ${e.stack || e}`;
            console.error(msg);
            return new Response(msg, { status: 500 });
        }
    }

    //
    
    private async ensureInitialized(opts: { colo: string, name: string }): Promise<DOInfo> {
        if (this.info) return this.info;

        const { storage } = this.state;
        const { colo, name } = opts;
        const time = new Date().toISOString();
        const id = this.state.id.toString();

        let info = await loadDOInfo(storage);
        if (info) {
            console.log(`ensureInitialized: updating`);
            if (info.id !== id) {
                info = { ...info, id, changes: [ ...info.changes, { name: 'id', value: id, time }] };
            }
            if (info.name !== name) {
                info = { ...info, name, changes: [ ...info.changes, { name: 'name', value: name, time }] };
            }
            if (info.colo !== colo) {
                info = { ...info, colo, changes: [ ...info.changes, { name: 'colo', value: colo, time }] };
            }
            info = { ...info, lastSeen: time };
        } else {
            console.log(`ensureInitialized: adding`);
            info = { id, name, colo, firstSeen: time, lastSeen: time, changes: [
                { name: 'id', value: id, time },
                { name: 'name', value: name, time },
                { name: 'colo', value: colo, time },
            ] };
        }
        await saveDOInfo(info, storage);
        this.info = info;

        // register!
        const { backendNamespace } = this.env;
        (async () => {
            try {
                console.log(`ensureInitialized: registering`);
                await sendRpc({ kind: 'register-do', info }, 'ok', { doName: 'registry', backendNamespace });
                console.log(`ensureInitialized: registered`);
            } catch (e) {
                console.error(`Error registering do: ${e.stack || e}`);
                // not the end of the world, info is saved, we'll try again next time
            }
        })()

        return info;
    }

}

//

function newKeyClient(backendNamespace: DurableObjectNamespace): KeyClient {
    const keyFetcher: KeyFetcher = async (keyKind: KeyKind, keyScope: string) => {
        if (keyKind === 'ip-address-hmac') {
            return await getKey(keyKind, keyScope, isValidIpAddressHmacKeyScope, importHmacKey, backendNamespace);
        } else if (keyKind === 'ip-address-aes') {
            return await getKey(keyKind, keyScope, isValidIpAddressAesKeyScope, importAesKey, backendNamespace);
        }
        throw new Error(`Unsupported keyKind: ${keyKind}`);
    }
    return new KeyClient(keyFetcher);
}

async function getKey(keyKind: KeyKind, keyScope: string, isValid: (keyScope: string) => boolean, importKey: (bytes: Bytes) => Promise<CryptoKey>, backendNamespace: DurableObjectNamespace) {
    if (!isValid(keyScope)) throw new Error(`Unsupported keyKind for ${keyKind}: ${keyScope}`);

    const req: GetKeyRequest = { kind: 'get-key', keyKind, keyScope };
    const res = await sendRpc<GetKeyResponse>(req, 'get-key', { backendNamespace, doName: 'key-server' });
    return await importKey(Bytes.ofBase64(res.rawKeyBase64));
}

function newRpcResponse(rpcResponse: RpcResponse): Response {
    return new Response(JSON.stringify(rpcResponse), { headers: { 'content-type': 'application/json' } });
}

async function loadDOInfo(storage: DurableObjectStorage): Promise<DOInfo | undefined> {
    const obj = await storage.get('i.do');
    try {
        if (checkDOInfo(obj)) return obj;
    } catch (e) {
        console.error(`Error loading do info: ${e.stack || e}`);
    }
    return undefined;
}

async function saveDOInfo(info: DOInfo, storage: DurableObjectStorage) {
    await storage.put('i.do', info);
}
