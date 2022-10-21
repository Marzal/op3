import { setIntersect } from './deps.ts';

export function computeServerUrl(url: string): string {
    const { serverUrl = url } = tryParseClientParams(url) ?? {};
    return serverUrl;
}

export function tryParseUlid(url: string): string | undefined {
    const { clientParams = {} } = tryParseClientParams(url) ?? {};
    const { _ulid: ulid } = clientParams;
    return typeof ulid === 'string' && ulid.length > 0 ? ulid : undefined;
}

export function tryParseClientParams(url: string): { serverUrl: string, clientParams: Record<string, string> } | undefined {
    if (!/^https?:\/\//i.test(url)) return undefined;
    if (url.includes('%3F_from') && !url.includes('?')) url = url.replace('%3F_from', '?_from');
    const i = url.indexOf('?');
    if (i < 0) return undefined;

    const oldQp = url.substring(i + 1);
    const queryParams = new URLSearchParams(oldQp);
    const clientParams: Record<string, string> = {};
    const queryParamKeys = new Set([...queryParams.keys()]);
    const tunein = setIntersect(queryParamKeys, TUNEIN).size === 3;
    const valueless = new Set<string>();
    for (const [ name, value ] of [...queryParams]) {
        if (name.startsWith('_') || tunein && TUNEIN.has(name) || OTHERS.has(name) || name === 'download' && value === 'true' || isAdsWizz(name)) {
            clientParams[name] = value;
            queryParams.delete(name);
        } else if (value === '') {
            if (!oldQp.includes(name + '=')) {
                const stub = crypto.randomUUID();
                valueless.add(stub);
                queryParams.set(name, stub);
            }
        }
    }
    let qp = queryParams.toString();
    for (const stub of valueless) {
        qp = qp.replace(`=${stub}`, '');
    }
    const serverUrl = url.substring(0, i) + (qp === '' ? '' : `?${qp}`);
    return { serverUrl, clientParams };
}

//

const TUNEIN = new Set([ 'DIST', 'TGT', 'maxServers' ]); // ?DIST=TuneIn&TGT=TuneIn&maxServers=2

const OTHERS = new Set(['played_on', 'source', 'client_source', 'referrer', 'ref', 'from', 'src', 'acid', 'av', 'lo', 'consumer_key', 'country' ]);

const isAdsWizz = (v: string) => [ 'companionAds', 'calendar', 'sdkiad' ].includes(v) || v.startsWith('aw_');
