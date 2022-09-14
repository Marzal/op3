import { tryParseInt } from '../check.ts';

export function tryParseRedirectRequest(requestUrl: string): RedirectRequest | undefined {
    // parse path by hand instead of using URL.pathname, we need to be robust to any and all input
    const m = /^https?:\/\/[a-zA-Z0-9.-]+(:\d+)?\/e\/(https?:\/\/)?(.*?)$/.exec(requestUrl);
    if (!m) return undefined;
    const [ _, _optPort, optPrefix, suffix ] = m;
    if (/^https?:\/\//.test(suffix)) return { kind: 'invalid' }; // /e/https://
    if (!isValidSuffix(suffix))  return { kind: 'invalid' };
    const prefix = optPrefix ?? 'https://';
    const targetUrl = `${prefix}${suffix}`;
    return { kind: 'valid', targetUrl };
}

export function computeRedirectResponse(request: ValidRedirectRequest): Response {
    return new Response(undefined, {
        // Temporary redirect: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/302
        status: 302,
        headers: {
            // ensure the redirect is never cached, we want to be notified of every request
            // even though the spec discourages user agents from caching these, it is not prohibited, 
            // and many CDNS like cloudflare will cache them for a short period of time
            'cache-control': 'private, no-cache',

            // specify the target of the redirect
            'location': request.targetUrl,
        }
    })
}

//

export type RedirectRequest = ValidRedirectRequest | InvalidRedirectRequest;

export interface ValidRedirectRequest {
    readonly kind: 'valid';
    readonly targetUrl: string;
}

export interface InvalidRedirectRequest {
    readonly kind: 'invalid';
}

//

function isValidSuffix(suffix: string): boolean {
    const slash = suffix.indexOf('/');
    if (slash < 0) return false;
    const path = suffix.substring(slash);
    if (path.length === 1) return false;
    const authority = suffix.substring(0, slash);
    const m = /^([a-zA-Z0-9.-]+)(:(\d+))?$/.exec(authority);
    if (!m) return false;
    const [ _, hostname, __, portStr ] = m;
    const port = tryParseInt(portStr);
    if (portStr !== undefined && (port === undefined || port === 0 || port > 65535)) return false;
    if (hostname.startsWith('.') || hostname.startsWith('-') || hostname.endsWith('-')) return false;
    if (hostname.includes('..')) return false;
    if (hostname === 'localhost') return false;
    return true;
}
