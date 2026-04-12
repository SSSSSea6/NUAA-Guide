const DEFAULT_ALLOWED_HOST_SUFFIXES = [".nuaa.cc", ".nuaaguide.online"];
const DEFAULT_SCHEME_PATH = "pages/index/index";
const DEFAULT_ENV_VERSION = "release";
const SCHEME_CACHE_TTL_SECONDS = 3600;
const SCHEME_CACHE_PRUNE_LIMIT = 100;
const LOCAL_ORIGINS = new Set([
  "http://localhost:1313",
  "http://127.0.0.1:1313",
]);

let tokenCache = null;
const schemeCache = new Map();

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const corsHeaders = getCorsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    if (request.method !== "GET" || (url.pathname !== "/" && url.pathname !== "/scheme")) {
      return jsonResponse({ error: "not_found" }, 404, corsHeaders);
    }

    try {
      const schemeContext = resolveSchemeContext(url, env);
      const openlink = await getScheme(env, schemeContext);
      return jsonResponse(
        {
          url: openlink,
          openlink,
          context_path: schemeContext.sitePath,
        },
        200,
        {
          ...corsHeaders,
          "Cache-Control": "public, max-age=300",
        },
      );
    } catch (error) {
      return jsonResponse(
        {
          error: "wechat_scheme_failed",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        502,
        corsHeaders,
      );
    }
  },
};

function getCorsHeaders(origin, env) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };

  if (isAllowedOrigin(origin, env)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function isAllowedOrigin(origin, env) {
  if (!origin) {
    return false;
  }

  if (LOCAL_ORIGINS.has(origin)) {
    return true;
  }

  const explicitOrigins = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (explicitOrigins.includes(origin)) {
    return true;
  }

  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1")) {
      return true;
    }

    const suffixes = (env.ALLOWED_HOST_SUFFIX || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const allowedSuffixes = suffixes.length ? suffixes : DEFAULT_ALLOWED_HOST_SUFFIXES;
    return protocol === "https:" && allowedSuffixes.some((suffix) => hostname === suffix.replace(/^\./, "") || hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

function resolveSchemeContext(url, env) {
  const miniProgramPath =
    sanitizeMiniProgramPath(url.searchParams.get("mini_path")) ||
    (env.WECHAT_SCHEME_PATH || DEFAULT_SCHEME_PATH);
  const sitePath = sanitizeSitePath(url.searchParams.get("path"));
  const envQuery = sanitizeQuery(env.WECHAT_SCHEME_QUERY || "");
  const requestQuery = sanitizeQuery(url.searchParams.get("query"));
  const queryParts = [envQuery, requestQuery];

  if (sitePath) {
    queryParts.push(`path=${encodeURIComponent(sitePath)}`);
  }

  return {
    miniProgramPath,
    sitePath,
    query: queryParts.filter(Boolean).join("&"),
    envVersion:
      sanitizeEnvVersion(url.searchParams.get("env_version")) ||
      env.WECHAT_ENV_VERSION ||
      DEFAULT_ENV_VERSION,
  };
}

function sanitizeMiniProgramPath(rawPath) {
  if (typeof rawPath !== "string") {
    return "";
  }

  const value = rawPath.trim().replace(/^\/+/, "");
  if (!value || value.length > 256) {
    return "";
  }
  if (!/^[A-Za-z0-9/_-]+$/.test(value)) {
    return "";
  }

  return value;
}

function sanitizeSitePath(rawPath) {
  if (typeof rawPath !== "string") {
    return "";
  }

  const value = rawPath.trim();
  if (!value || value.length > 512) {
    return "";
  }
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "";
  }
  if (/[\r\n]/.test(value)) {
    return "";
  }

  return value;
}

function sanitizeQuery(rawQuery) {
  if (typeof rawQuery !== "string") {
    return "";
  }

  const value = rawQuery.trim().replace(/^\?/, "");
  if (!value || value.length > 512 || /[\r\n]/.test(value)) {
    return "";
  }

  return value;
}

function sanitizeEnvVersion(rawValue) {
  if (typeof rawValue !== "string") {
    return "";
  }

  const value = rawValue.trim();
  return ["develop", "trial", "release"].includes(value) ? value : "";
}

function pruneExpiredSchemeCache(now) {
  for (const [key, cached] of schemeCache.entries()) {
    if (!cached || cached.expiresAt <= now) {
      schemeCache.delete(key);
    }
  }

  while (schemeCache.size > SCHEME_CACHE_PRUNE_LIMIT) {
    const oldestKey = schemeCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    schemeCache.delete(oldestKey);
  }
}

async function getScheme(env, schemeContext) {
  const now = Math.floor(Date.now() / 1000);
  const cacheKey = JSON.stringify([
    schemeContext.miniProgramPath,
    schemeContext.query,
    schemeContext.envVersion,
  ]);
  const cached = schemeCache.get(cacheKey);
  if (cached && cached.expiresAt > now + 60) {
    return cached.openlink;
  }

  const accessToken = await getAccessToken(env);
  const endpoint = `https://api.weixin.qq.com/wxa/generatescheme?access_token=${encodeURIComponent(accessToken)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jump_wxa: {
        path: schemeContext.miniProgramPath,
        query: schemeContext.query,
        env_version: schemeContext.envVersion,
      },
      is_expire: false,
    }),
  });

  const data = await response.json();
  if (!response.ok || data.errcode !== 0 || !data.openlink) {
    throw new Error(`generate scheme failed: ${data.errcode ?? response.status} ${data.errmsg ?? response.statusText}`);
  }

  schemeCache.set(cacheKey, {
    openlink: data.openlink,
    expiresAt: now + SCHEME_CACHE_TTL_SECONDS,
  });
  pruneExpiredSchemeCache(now);

  return data.openlink;
}

async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.expiresAt > now + 300) {
    return tokenCache.accessToken;
  }

  if (!env.WECHAT_APP_ID || !env.WECHAT_APP_SECRET) {
    throw new Error("missing WeChat credentials");
  }

  const tokenUrl = new URL("https://api.weixin.qq.com/cgi-bin/token");
  tokenUrl.searchParams.set("grant_type", "client_credential");
  tokenUrl.searchParams.set("appid", env.WECHAT_APP_ID);
  tokenUrl.searchParams.set("secret", env.WECHAT_APP_SECRET);

  const response = await fetch(tokenUrl);
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(`get access token failed: ${data.errcode ?? response.status} ${data.errmsg ?? response.statusText}`);
  }

  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + Math.max(0, Number(data.expires_in || 7200) - 300),
  };

  return data.access_token;
}

function jsonResponse(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}
