import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export type OrbitIdentity = {
  userId: string;
  email: string;
  displayName: string;
  fullName: string | null;
};
export type AccessSettings = {
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
};
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export function accessSettings(settings: AccessSettings) {
  const issuer = (settings.CF_ACCESS_TEAM_DOMAIN ?? "").replace(/\/$/, "");
  const audience = settings.CF_ACCESS_AUD?.trim();
  if (
    !/^https:\/\/[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$/.test(issuer) ||
    !audience
  )
    throw new Error("Cloudflare Access is not configured.");
  return { issuer, audience };
}
export async function verifyAccessIdentity(
  token: string | null,
  settings: AccessSettings,
  key?: JWTVerifyGetKey,
): Promise<OrbitIdentity> {
  const { issuer, audience } = accessSettings(settings);
  if (!token || token.length > 16384) throw new Error("Sign in is required.");
  if (!key) {
    if (!keySets.has(issuer))
      keySets.set(
        issuer,
        createRemoteJWKSet(new URL(issuer + "/cdn-cgi/access/certs"), {
          timeoutDuration: 5000,
          cooldownDuration: 30000,
        }),
      );
    key = keySets.get(issuer)!;
  }
  const { payload } = await jwtVerify(token, key, {
    issuer,
    audience,
    algorithms: ["RS256"],
    requiredClaims: ["sub", "email", "iat", "exp", "iss", "aud"],
    clockTolerance: 5,
  });
  if (
    typeof payload.sub !== "string" ||
    !payload.sub ||
    typeof payload.email !== "string" ||
    !/^\S+@\S+\.\S+$/.test(payload.email)
  )
    throw new Error("A verified person account is required.");
  const email = payload.email.toLowerCase();
  const fullName =
    typeof payload.name === "string" && payload.name.trim()
      ? payload.name.trim()
      : null;
  return {
    userId: "access:" + payload.sub,
    email,
    fullName,
    displayName: fullName ?? email.split("@")[0],
  };
}
export function identityRequest(
  request: Request,
  identity: OrbitIdentity,
): Request {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()])
    if (
      name.startsWith("x-orbit-user-") ||
      name.startsWith("oai-authenticated-user-")
    )
      headers.delete(name);
  headers.set("x-orbit-user-id", identity.userId);
  headers.set("x-orbit-user-email", identity.email);
  headers.set("x-orbit-user-name", encodeURIComponent(identity.displayName));
  return new Request(request, { headers });
}
