import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAuthorizationUrl, decryptSecret, encryptSecret, verifyHmacSha256Base64 } from "@sale-scheduler/colorme-auth";
import { createHmac, randomBytes } from "node:crypto";

afterEach(() => vi.unstubAllEnvs());

describe("authentication safety", () => {
  it("requests only the two product scopes", () => {
    vi.stubEnv("COLORME_CLIENT_ID", "client-id-for-test");
    vi.stubEnv("COLORME_SCOPES", "read_products write_products read_orders");
    const url = new URL(buildAuthorizationUrl("state"));
    expect(url.searchParams.get("scope")).toBe("read_products write_products");
  });

  it("encrypts and decrypts an OAuth secret without storing plaintext", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
    const encrypted = encryptSecret("oauth-access-token");
    expect(encrypted).not.toContain("oauth-access-token");
    expect(decryptSecret(encrypted)).toBe("oauth-access-token");
  });

  it("verifies webhook HMAC using base64", () => {
    const body = "{\"account_id\":\"test\"}";
    const secret = "webhook-secret-for-test";
    const signature = createHmac("sha256", secret).update(body).digest("base64");
    expect(verifyHmacSha256Base64(body, signature, secret)).toBe(true);
    expect(verifyHmacSha256Base64(body, `${signature}x`, secret)).toBe(false);
  });
});
