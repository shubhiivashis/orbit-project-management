import { test, before } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from "jose";
import {
  verifyAccessIdentity,
  identityRequest,
  accessSettings,
} from "../lib/access-auth.ts";
const config = {
  CF_ACCESS_TEAM_DOMAIN: "https://orbit-test.cloudflareaccess.com",
  CF_ACCESS_AUD: "orbit-audience",
};
let privateKey, key;
before(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  key = createLocalJWKSet({
    keys: [{ ...jwk, alg: "RS256", kid: "test", use: "sig" }],
  });
});
async function token(overrides = {}) {
  return new SignJWT({
    email: "Owner@Orbit.Example",
    name: "Orbit owner",
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setSubject("user-123")
    .setIssuer(config.CF_ACCESS_TEAM_DOMAIN)
    .setAudience(config.CF_ACCESS_AUD)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}
test("valid signed email identity is normalized", async () => {
  const user = await verifyAccessIdentity(await token(), config, key);
  assert.equal(user.userId, "access:user-123");
  assert.equal(user.email, "owner@orbit.example");
  assert.equal(user.displayName, "Orbit owner");
});
test("missing and unsigned identity tokens are rejected", async () => {
  await assert.rejects(verifyAccessIdentity(null, config, key));
  await assert.rejects(verifyAccessIdentity("e30.e30.", config, key));
});
test("a token signed by another key is rejected", async () => {
  const other = await generateKeyPair("RS256");
  const signed = await new SignJWT({ email: "owner@orbit.example" })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setSubject("attacker")
    .setIssuer(config.CF_ACCESS_TEAM_DOMAIN)
    .setAudience(config.CF_ACCESS_AUD)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(other.privateKey);
  await assert.rejects(verifyAccessIdentity(signed, config, key));
});
test("wrong audience, issuer, and expired tokens are rejected", async () => {
  for (const mode of ["audience", "issuer", "expiry"]) {
    let jwt = new SignJWT({ email: "owner@orbit.example" })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setSubject("person")
      .setIssuer(
        mode === "issuer"
          ? "https://other.cloudflareaccess.com"
          : config.CF_ACCESS_TEAM_DOMAIN,
      )
      .setAudience(mode === "audience" ? "wrong" : config.CF_ACCESS_AUD)
      .setIssuedAt();
    jwt = jwt.setExpirationTime(
      mode === "expiry" ? Math.floor(Date.now() / 1000) - 60 : "5m",
    );
    await assert.rejects(
      verifyAccessIdentity(await jwt.sign(privateKey), config, key),
    );
  }
});
test("service accounts without a person email cannot sign in", async () => {
  await assert.rejects(
    verifyAccessIdentity(await token({ email: undefined }), config, key),
  );
});
test("untrusted JWKS domains and missing audience are refused", () => {
  assert.throws(() =>
    accessSettings({
      ...config,
      CF_ACCESS_TEAM_DOMAIN: "https://attacker.example",
    }),
  );
  assert.throws(() => accessSettings({ ...config, CF_ACCESS_AUD: "" }));
});
test("verified identity replaces all spoofed application headers", async () => {
  const request = new Request("https://orbit.example/api/workspace", {
    method: "POST",
    headers: {
      "x-orbit-user-id": "attacker",
      "x-orbit-user-email": "attacker@example.com",
      "oai-authenticated-user-id": "owner",
      "content-type": "application/json",
    },
    body: '{"action":"test"}',
  });
  const verified = identityRequest(request, {
    userId: "access:real",
    email: "real@orbit.example",
    displayName: "Real person",
    fullName: null,
  });
  assert.equal(verified.headers.get("x-orbit-user-id"), "access:real");
  assert.equal(
    verified.headers.get("x-orbit-user-email"),
    "real@orbit.example",
  );
  assert.equal(verified.headers.get("oai-authenticated-user-id"), null);
  assert.equal(await verified.text(), '{"action":"test"}');
});
