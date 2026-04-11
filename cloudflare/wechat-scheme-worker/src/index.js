const DEFAULT_ALLOWED_HOST_SUFFIX = ".nuaa.cc";
const LOCAL_ORIGINS = new Set([
  "http://localhost:1313",
  "http://127.0.0.1:1313",
]);

let tokenCache = null;
let schemeCache = null;

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
      const openlink = await getScheme(env);
      return jsonResponse(
        {
          url: openlink,
          openlink,
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

  try {
    const { hostname, protocol } = new URL(origin);
    const suffix = env.ALLOWED_HOST_SUFFIX || DEFAULT_ALLOWED_HOST_SUFFIX;
    return protocol === "https:" && (hostname === suffix.slice(1) || hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

async function getScheme(env) {
  const now = Math.floor(Date.now() / 1000);
  if (schemeCache && schemeCache.expiresAt > now + 60) {
    return schemeCache.openlink;
  }

  const accessToken = await getAccessToken(env);
  const endpoint = `https://api.weixin.qq.com/wxa/generatescheme?access_token=${encodeURIComponent(accessToken)}`;
  const path = env.WECHAT_SCHEME_PATH || "pages/index/index";
  const query = env.WECHAT_SCHEME_QUERY || "";
  const envVersion = env.WECHAT_ENV_VERSION || "release";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jump_wxa: {
        path,
        query,
        env_version: envVersion,
      },
      is_expire: false,
    }),
  });

  const data = await response.json();
  if (!response.ok || data.errcode !== 0 || !data.openlink) {
    throw new Error(`generate scheme failed: ${data.errcode ?? response.status} ${data.errmsg ?? response.statusText}`);
  }

  schemeCache = {
    openlink: data.openlink,
    expiresAt: now + 3600,
  };

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
