import { DurableObjectNamespace } from './deps.ts';
import { AdminDataRequest, AdminDataResponse, AlarmRequest, GetKeyRequest, GetKeyResponse, GetNewRawRequestsRequest, GetNewRawRequestsResponse, isRpcResponse, OkResponse, RawRequestsNotificationRequest, RegisterDORequest, RpcClient, RpcRequest, RpcResponse, SaveRawRequestsRequest, Unkinded } from './rpc_model.ts';

export class CloudflareRpcClient implements RpcClient {
    private readonly backendNamespace: DurableObjectNamespace;

    constructor(backendNamespace: DurableObjectNamespace) {
        this.backendNamespace = backendNamespace;
    }

    async executeAdminDataQuery(request: Unkinded<AdminDataRequest>, target: string): Promise<AdminDataResponse> {
        return await sendRpc<AdminDataResponse>({ kind: 'admin-data', ...request }, 'admin-data', { doName: target, backendNamespace: this.backendNamespace });
    }

    async registerDO(request: Unkinded<RegisterDORequest>, target: string): Promise<OkResponse> {
        return await sendRpc<OkResponse>({ kind: 'register-do', ...request }, 'ok', { doName: target, backendNamespace: this.backendNamespace });
    }

    async getKey(request: Unkinded<GetKeyRequest>, target: string): Promise<GetKeyResponse> {
        return await sendRpc<GetKeyResponse>({ kind: 'get-key', ...request }, 'get-key', { doName: target, backendNamespace: this.backendNamespace });
    }

    async sendRawRequestsNotification(request: Unkinded<RawRequestsNotificationRequest>, target: string): Promise<OkResponse> {
        return await sendRpc<OkResponse>({ kind: 'raw-requests-notification', ...request }, 'ok', { doName: target, backendNamespace: this.backendNamespace });
    }

    async saveRawRequests(request: Unkinded<SaveRawRequestsRequest>, target: string): Promise<OkResponse> {
        return await sendRpc<OkResponse>({ kind: 'save-raw-requests', ...request }, 'ok', { doName: target, backendNamespace: this.backendNamespace });
    }

    async sendAlarm(request: Unkinded<AlarmRequest>, target: string): Promise<OkResponse> {
        return await sendRpc<OkResponse>({ kind: 'alarm', ...request }, 'ok', { doName: target, backendNamespace: this.backendNamespace });
    }

    async getNewRawRequests(request: Unkinded<GetNewRawRequestsRequest>, target: string): Promise<GetNewRawRequestsResponse> {
        return await sendRpc<GetNewRawRequestsResponse>({ kind: 'get-new-raw-requests', ...request }, 'get-new-raw-requests', { doName: target, backendNamespace: this.backendNamespace });
    }

}

//

async function sendRpc<T extends RpcResponse>(request: RpcRequest, expectedResponseKind: string, opts: { doName: string, backendNamespace: DurableObjectNamespace }): Promise<T> {
    const { doName, backendNamespace } = opts;

    // TODO: retry on known transient DO errors
    const stub = backendNamespace.get(backendNamespace.idFromName(doName));
    const res = await stub.fetch('https://backend/rpc', { method: 'POST', body: JSON.stringify(request), headers: { 'do-name': doName } });

    if (res.status !== 200) throw new Error(`Bad rpc status: ${res.status}, body=${await res.text()}`);
    const contentType = res.headers.get('content-type');
    if (contentType !== 'application/json') throw new Error(`Bad content-type: ${contentType}`);
    const obj = await res.json();
    if (!isRpcResponse(obj)) throw new Error(`Bad rpc response: ${JSON.stringify(obj)}`);
    if (obj.kind === 'error') throw new Error(`Rpc error: ${obj.message}`);
    if (obj.kind !== expectedResponseKind) throw new Error(`Unexpected rpc response: ${JSON.stringify(obj)}`);
    // deno-lint-ignore no-explicit-any
    return obj as any;
}
