const DEFAULT_UPSTREAM_ORIGIN = "https://nuaa-guide.pages.dev";
const DEFAULT_PROXY_HOSTNAME = "guide-origin.nuaa.cc";
const STATIC_PREFIXES = ["/css/", "/js/", "/images/"];
const HOP_BY_HOP_HEADERS = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade"
]);

export default {
    async fetch(request, env) {
        const upstreamOrigin = getUpstreamOrigin(env);
        const proxyHost = getProxyHostname(env);
        const upstreamUrl = buildUpstreamUrl(request.url, upstreamOrigin);
        const upstreamHost = upstreamUrl.hostname;
        const requestHeaders = copyRequestHeaders(request, upstreamHost, proxyHost);

        const response = await fetch(upstreamUrl.toString(), {
            method: request.method,
            headers: requestHeaders,
            body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
            redirect: "manual",
            cf: {
                cacheEverything: false
            }
        });

        return withCachePolicy(new URL(request.url), new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: rewriteResponseHeaders(response.headers, upstreamOrigin, proxyHost)
        }));
    }
};

function getUpstreamOrigin(env) {
    const raw = typeof env?.UPSTREAM_ORIGIN === "string" ? env.UPSTREAM_ORIGIN.trim() : "";
    return raw || DEFAULT_UPSTREAM_ORIGIN;
}

function getProxyHostname(env) {
    const raw = typeof env?.PROXY_HOSTNAME === "string" ? env.PROXY_HOSTNAME.trim() : "";
    return raw || DEFAULT_PROXY_HOSTNAME;
}

function buildUpstreamUrl(requestUrl, upstreamOrigin) {
    const incoming = new URL(requestUrl);
    const upstream = new URL(upstreamOrigin);
    upstream.pathname = incoming.pathname;
    upstream.search = incoming.search;
    return upstream;
}

function copyRequestHeaders(request, upstreamHost, proxyHost) {
    const headers = new Headers(request.headers);
    for (const header of HOP_BY_HOP_HEADERS) {
        headers.delete(header);
    }
    headers.set("Host", upstreamHost);
    headers.set("X-Forwarded-Host", proxyHost);
    headers.set("X-Forwarded-Proto", "https");
    headers.set("X-NUAA-Origin-Proxy", "guide");
    return headers;
}

function rewriteResponseHeaders(sourceHeaders, upstreamOrigin, proxyHost) {
    const headers = new Headers(sourceHeaders);
    for (const header of HOP_BY_HOP_HEADERS) {
        headers.delete(header);
    }

    const location = headers.get("Location");
    if (location) {
        try {
            const rewritten = new URL(location, upstreamOrigin);
            const upstream = new URL(upstreamOrigin);
            if (rewritten.hostname === upstream.hostname) {
                rewritten.hostname = proxyHost;
                rewritten.protocol = "https:";
                headers.set("Location", rewritten.toString());
            }
        } catch {
            // Ignore invalid upstream redirect targets.
        }
    }

    headers.set("X-NUAA-Origin-Proxy", "guide");
    headers.delete("Set-Cookie");
    return headers;
}

function withCachePolicy(url, response) {
    const headers = new Headers(response.headers);
    const path = url.pathname;

    if (STATIC_PREFIXES.some((prefix) => path.startsWith(prefix))) {
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
        headers.set("CDN-Cache-Control", "public, max-age=31536000");
    } else if (path.startsWith("/data/")) {
        headers.set("Cache-Control", "public, max-age=1800, stale-while-revalidate=86400");
        headers.set("CDN-Cache-Control", "public, max-age=21600");
    } else {
        headers.set("Cache-Control", "public, max-age=60, stale-while-revalidate=600");
        headers.set("CDN-Cache-Control", "public, max-age=600");
    }

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}
