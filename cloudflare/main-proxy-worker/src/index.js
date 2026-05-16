const GUIDE_ORIGIN = "nuaa-guide.pages.dev";
const GUIDE_HOSTS = new Set(["www.nuaaguide.online", "source.nuaa.cc"]);
const STATIC_PREFIXES = ["/css/", "/js/", "/images/"];
const EDGE_CACHE_VERSION = "2026-05-17-v2";

const SITE_ORIGINS = {
    "www.nuaaguide.online": GUIDE_ORIGIN,
    "source.nuaa.cc": GUIDE_ORIGIN,
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

        if (!GUIDE_HOSTS.has(hostname) || (request.method !== "GET" && request.method !== "HEAD")) {
            return fetchOrigin(request, origin);
        }

        const cache = caches.default;
        const cacheUrl = new URL(url.toString());
        cacheUrl.searchParams.set("__nuaa_edge_cache", EDGE_CACHE_VERSION);
        const cacheKey = new Request(cacheUrl.toString(), request);
        const cached = await cache.match(cacheKey);
        if (cached) {
            return withHeader(cached, "X-NUAA-Edge-Cache", "HIT");
        }

        const originResponse = await fetchOrigin(request, origin);
        const response = withGuideCachePolicy(url, originResponse);
        if (isCacheable(response)) {
            ctx.waitUntil(cache.put(cacheKey, response.clone()));
        }
        return withHeader(response, "X-NUAA-Edge-Cache", "MISS");
    }
};

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

function withGuideCachePolicy(url, response) {
    const headers = new Headers(response.headers);
    const path = url.pathname;

    headers.set("X-NUAA-Origin", GUIDE_ORIGIN);
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
