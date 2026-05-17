const GUIDE_UPSTREAM_ORIGIN = "https://guide-origin.nuaa.cc";
const GUIDE_PUBLIC_HOST = "www.nuaaguide.online";
const GUIDE_HOSTS = new Set(["www.nuaaguide.online", "source.nuaa.cc", "guide-edge.nuaa.cc"]);
const STATIC_PREFIXES = ["/css/", "/js/", "/images/"];
const EDGE_CACHE_VERSION = "2026-05-18-v2";
const OVERRIDE_QUERY_KEY = "__nuaa_pool";
const OVERRIDE_COOKIE_KEY = "nuaa_pool";
const CAMPUS_POOL = [
    { id: "campus-1", pool: "campus", resolveOverride: "guide-origin-campus-1.nuaa.cc" },
    { id: "campus-2", pool: "campus", resolveOverride: "guide-origin-campus-2.nuaa.cc" },
    { id: "campus-3", pool: "campus", resolveOverride: "guide-origin-campus-3.nuaa.cc" }
];
const MOBILE_POOL = [
    { id: "mobile-1", pool: "mobile", resolveOverride: "guide-origin-mobile-1.nuaa.cc" },
    { id: "mobile-2", pool: "mobile", resolveOverride: "guide-origin-mobile-2.nuaa.cc" },
    { id: "mobile-3", pool: "mobile", resolveOverride: "guide-origin-mobile-3.nuaa.cc" }
];
const STANDARD_FALLBACK = { id: "standard-origin", pool: "standard", resolveOverride: null };
const FAILOVER_STATUS_CODES = new Set([403, 408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 530]);
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

const SITE_ORIGINS = {
    "www.nuaaguide.shop": "1231-4hk.pages.dev",
    "nuaaguide.shop": "1231-4hk.pages.dev",
    "www.nuaaguide.icu": "totoro-test.pages.dev",
    "nuaaguide.icu": "totoro-test.pages.dev"
};

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const hostname = url.hostname.toLowerCase();

        if (hostname === "nuaaguide.online") {
            const target = new URL(request.url);
            target.hostname = "www.nuaaguide.online";
            return new Response(null, {
                status: 301,
                headers: {
                    Location: target.toString(),
                    "Cache-Control": "public, max-age=3600"
                }
            });
        }

        if (hostname === "nuaaguide.shop") {
            return redirectToWww(url, "www.nuaaguide.shop");
        }
        if (hostname === "nuaaguide.icu") {
            return redirectToWww(url, "www.nuaaguide.icu");
        }

        if (GUIDE_HOSTS.has(hostname)) {
            return fetchGuide(request, ctx, hostname);
        }

        const origin = SITE_ORIGINS[hostname];
        if (!origin) {
            return new Response("Site not found in router config.", {
                status: 404,
                headers: {
                    "Content-Type": "text/plain; charset=utf-8",
                    "Cache-Control": "public, max-age=60"
                }
            });
        }

        return fetchOrigin(request, origin);
    }
};

async function fetchGuide(request, ctx, hostname) {
    const override = getPoolOverride(request.url, request.headers);
    const selectedPool = detectPreferredPool(request, override);
    const cacheableMethod = request.method === "GET" || request.method === "HEAD";

    if (cacheableMethod) {
        const cache = caches.default;
        const cacheUrl = new URL(request.url);
        cacheUrl.searchParams.set("__nuaa_edge_cache", EDGE_CACHE_VERSION);
        cacheUrl.searchParams.set("__nuaa_pool_key", selectedPool);
        const cacheKey = new Request(cacheUrl.toString(), request);
        const cached = await cache.match(cacheKey);
        if (cached) {
            return withHeader(cached, "X-NUAA-Edge-Cache", "HIT");
        }
    }

    const url = new URL(request.url);
    const candidates = buildCandidateList(selectedPool);
    const errors = [];

    for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        try {
            const originResponse = await fetchGuideCandidate(request, candidate, hostname, selectedPool);
            if (index < candidates.length - 1 && shouldFailover(originResponse.status)) {
                errors.push(`${candidate.id}:${originResponse.status}`);
                continue;
            }

            let response = withGuideCachePolicy(url, originResponse);
            response = withGuideRouteHeaders(response, {
                selectedPool,
                finalPool: candidate.pool,
                routeId: candidate.id,
                attempts: index + 1,
                failovers: errors,
                upstreamKind: "pages"
            });
            if (override?.persist) {
                response = withPoolCookie(response, selectedPool);
            }

            if (cacheableMethod && isCacheable(response)) {
                const cache = caches.default;
                const cacheUrl = new URL(request.url);
                cacheUrl.searchParams.set("__nuaa_edge_cache", EDGE_CACHE_VERSION);
                cacheUrl.searchParams.set("__nuaa_pool_key", selectedPool);
                const cacheKey = new Request(cacheUrl.toString(), request);
                ctx.waitUntil(cache.put(cacheKey, response.clone()));
            }
            return withHeader(response, "X-NUAA-Edge-Cache", "MISS");
        } catch {
            errors.push(`${candidate.id}:fetch_failed`);
        }
    }

    return new Response("NUAA Guide upstream unavailable.", {
        status: 523,
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=30",
            "X-NUAA-Proxy": "main",
            "X-NUAA-Selected-Pool": selectedPool,
            "X-NUAA-Failovers": errors.join(","),
            "X-NUAA-Upstream-Kind": "pages"
        }
    });
}

function redirectToWww(url, host) {
    const target = new URL(url.toString());
    target.hostname = host;
    return new Response(null, {
        status: 301,
        headers: {
            Location: target.toString(),
            "Cache-Control": "public, max-age=3600"
        }
    });
}

function fetchOrigin(request, origin) {
    const target = new URL(request.url);
    target.hostname = origin;
    return fetch(new Request(target.toString(), request));
}

function fetchGuideCandidate(request, candidate, requestHost, selectedPool) {
    const upstreamUrl = buildGuideUpstreamUrl(request.url);
    const upstreamHost = upstreamUrl.hostname;
    const headers = copyGuideRequestHeaders(request, upstreamHost, requestHost, selectedPool, candidate.id);
    const cf = { cacheEverything: false };
    if (candidate.resolveOverride) {
        cf.resolveOverride = candidate.resolveOverride;
    }

    return fetch(upstreamUrl.toString(), {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
        redirect: "manual",
        cf
    });
}

function buildGuideUpstreamUrl(requestUrl) {
    const incoming = new URL(requestUrl);
    incoming.searchParams.delete(OVERRIDE_QUERY_KEY);
    incoming.searchParams.delete("__nuaa_pool_key");
    incoming.searchParams.delete("__nuaa_edge_cache");
    if (incoming.pathname.startsWith("/data/")) {
        incoming.searchParams.set("__nuaa_origin_cache", EDGE_CACHE_VERSION);
    }
    const upstream = new URL(GUIDE_UPSTREAM_ORIGIN);
    upstream.pathname = incoming.pathname;
    upstream.search = incoming.search;
    return upstream;
}

function copyGuideRequestHeaders(request, upstreamHost, requestHost, selectedPool, routeId) {
    const headers = new Headers(request.headers);
    for (const header of HOP_BY_HOP_HEADERS) {
        headers.delete(header);
    }
    headers.set("Host", upstreamHost);
    headers.set("X-Forwarded-Host", requestHost === "guide-edge.nuaa.cc" ? GUIDE_PUBLIC_HOST : requestHost);
    headers.set("X-Forwarded-Proto", "https");
    headers.set("X-NUAA-Proxy", "main");
    headers.set("X-NUAA-Pool", selectedPool);
    headers.set("X-NUAA-Route", routeId);
    return headers;
}

function normalizePoolName(value) {
    if (typeof value !== "string") return null;
    const normalized = value.trim().toLowerCase();
    return normalized === "campus" || normalized === "mobile" || normalized === "standard" ? normalized : null;
}

function parseCookies(cookieHeader) {
    const out = new Map();
    if (!cookieHeader) return out;
    for (const rawPart of cookieHeader.split(";")) {
        const index = rawPart.indexOf("=");
        if (index <= 0) continue;
        const key = rawPart.slice(0, index).trim();
        const value = rawPart.slice(index + 1).trim();
        if (key) out.set(key, value);
    }
    return out;
}

function getPoolOverride(requestUrl, requestHeaders) {
    const url = new URL(requestUrl);
    const queryOverride = normalizePoolName(url.searchParams.get(OVERRIDE_QUERY_KEY));
    if (queryOverride) return { value: queryOverride, persist: true };

    const cookieOverride = normalizePoolName(parseCookies(requestHeaders.get("Cookie")).get(OVERRIDE_COOKIE_KEY));
    if (cookieOverride) return { value: cookieOverride, persist: false };

    const headerOverride = normalizePoolName(requestHeaders.get("X-NUAA-Pool"));
    if (headerOverride) return { value: headerOverride, persist: false };

    return null;
}

function isCampusOrganization(value) {
    return /cernet|education|university|college|campus|edu\b|research network|jiaoyu|gaoxiao/i.test(value);
}

function detectPreferredPool(request, override) {
    if (override?.value) return override.value;

    const cf = request.cf || {};
    const asOrganization = String(cf.asOrganization || "");
    const asn = Number(cf.asn || 0);
    if (asn === 4538 || asn === 23910 || isCampusOrganization(asOrganization)) return "campus";
    return "mobile";
}

function buildCandidateList(preferredPool) {
    if (preferredPool === "standard") return [STANDARD_FALLBACK];
    const primary = preferredPool === "campus" ? CAMPUS_POOL : MOBILE_POOL;
    const secondary = preferredPool === "campus" ? MOBILE_POOL : CAMPUS_POOL;
    return [...primary, ...secondary, STANDARD_FALLBACK];
}

function shouldFailover(status) {
    return FAILOVER_STATUS_CODES.has(status);
}

function withGuideCachePolicy(url, response) {
    const headers = new Headers(response.headers);
    const path = url.pathname;

    headers.set("X-NUAA-Origin", GUIDE_UPSTREAM_ORIGIN);
    headers.delete("Set-Cookie");

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

function withGuideRouteHeaders(response, routeInfo) {
    const headers = new Headers(response.headers);
    headers.set("X-NUAA-Proxy", "main");
    headers.set("X-NUAA-Selected-Pool", routeInfo.selectedPool);
    headers.set("X-NUAA-Final-Pool", routeInfo.finalPool);
    headers.set("X-NUAA-Route", routeInfo.routeId);
    headers.set("X-NUAA-Attempts", String(routeInfo.attempts));
    headers.set("X-NUAA-Upstream-Kind", routeInfo.upstreamKind);
    if (routeInfo.failovers.length > 0) {
        headers.set("X-NUAA-Failovers", routeInfo.failovers.join(","));
    }
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}

function withPoolCookie(response, poolName) {
    const headers = new Headers(response.headers);
    headers.append("Set-Cookie", `${OVERRIDE_COOKIE_KEY}=${poolName}; Max-Age=1800; Path=/; Secure; SameSite=Lax`);
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}

function isCacheable(response) {
    return [200, 301, 302, 404].includes(response.status) && !response.headers.has("Set-Cookie");
}

function withHeader(response, name, value) {
    const headers = new Headers(response.headers);
    headers.set(name, value);
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}
