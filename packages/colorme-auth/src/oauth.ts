const AUTHORIZATION_URL = "https://api.shop-pro.jp/oauth/authorize";
const TOKEN_URL = "https://api.shop-pro.jp/oauth/token";

export const REQUIRED_COLORME_SCOPES = ["read_products", "write_products"] as const;

export interface OAuthTokenResponse {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  scope: string[];
  expiresAt: Date | null;
}

export function oauthRedirectUri(): string {
  const configured = process.env.COLORME_REDIRECT_URI?.trim();
  if (configured) return configured;
  const base = process.env.APP_BASE_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/auth/colorme/callback`;
}

export function buildAuthorizationUrl(state: string, redirectUri = oauthRedirectUri()): string {
  const clientId = process.env.COLORME_CLIENT_ID;
  if (!clientId) throw new Error("COLORME_CLIENT_ID is required");
  const url = new URL(AUTHORIZATION_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  const configuredScopes = (process.env.COLORME_SCOPES || REQUIRED_COLORME_SCOPES.join(" ")).split(/\s+/).filter(Boolean);
  if (!REQUIRED_COLORME_SCOPES.every((scope) => configuredScopes.includes(scope))) throw new Error("COLORME_SCOPES must include read_products and write_products");
  // Keep the requested grant minimal even if an environment file contains an
  // accidental extra scope.
  url.searchParams.set("scope", REQUIRED_COLORME_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeAuthorizationCode(code: string, redirectUri = oauthRedirectUri()): Promise<OAuthTokenResponse> {
  const clientId = process.env.COLORME_CLIENT_ID;
  const clientSecret = process.env.COLORME_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("COLORME_CLIENT_ID and COLORME_CLIENT_SECRET are required");
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri });
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
      signal: AbortSignal.timeout(30_000)
    });
  } catch {
    throw new Error("カラーミーショップの認可サーバーに接続できませんでした。");
  }
  const text = await response.text();
  if (!response.ok) throw new Error("カラーミーショップの認可に失敗しました。");
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(text) as Record<string, unknown>; } catch { throw new Error("カラーミーショップから不正な認可応答を受け取りました。"); }
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  if (!accessToken) throw new Error("アクセストークンを取得できませんでした。");
  const expiresIn = Number(payload.expires_in);
  const configuredScopes = [...REQUIRED_COLORME_SCOPES];
  return {
    accessToken,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : null,
    tokenType: typeof payload.token_type === "string" ? payload.token_type : "bearer",
    scope: typeof payload.scope === "string" ? payload.scope.split(/\s+/).filter(Boolean) : configuredScopes,
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null
  };
}
