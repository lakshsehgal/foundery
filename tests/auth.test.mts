import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "./helpers.mjs";

useTempDb("auth");

const { issueToken, verifyToken, roleForPasscode, newPublicToken, safeEqual, SESSION_TTL_MS } =
  await import("../src/lib/session");

describe("passcodes", () => {
  test("each passcode maps to its own role", () => {
    assert.equal(roleForPasscode("founder-pass"), "founder");
    assert.equal(roleForPasscode("operator-pass"), "operator");
  });

  test("a wrong or empty passcode gets nothing", () => {
    assert.equal(roleForPasscode("founder-pas"), null);
    assert.equal(roleForPasscode("FOUNDER-PASS"), null);
    assert.equal(roleForPasscode(""), null);
  });

  test("comparison survives a length mismatch instead of throwing", () => {
    assert.equal(safeEqual("a", "a-much-longer-string"), false);
    assert.equal(safeEqual("same", "same"), true);
  });
});

describe("session tokens", () => {
  test("a freshly issued token verifies to its role", () => {
    assert.equal(verifyToken(issueToken("founder")), "founder");
    assert.equal(verifyToken(issueToken("operator")), "operator");
  });

  test("editing the role in a token invalidates it", () => {
    const token = issueToken("operator");
    const [, expiry, mac] = token.split(".");
    assert.equal(verifyToken(`founder.${expiry}.${mac}`), null, "privilege escalation must fail");
  });

  test("extending the expiry invalidates it", () => {
    const [role, expiry, mac] = issueToken("founder").split(".");
    const later = String(Number(expiry) + 86_400_000);
    assert.equal(verifyToken(`${role}.${later}.${mac}`), null);
  });

  test("an expired token is refused even though it signs correctly", () => {
    const issuedYesterday = issueToken("founder", Date.now() - SESSION_TTL_MS - 1000);
    assert.equal(verifyToken(issuedYesterday), null, "a valid signature is not enough");
  });

  test("junk in the cookie is refused rather than crashing", () => {
    assert.equal(verifyToken(undefined), null);
    assert.equal(verifyToken(""), null);
    assert.equal(verifyToken("garbage"), null);
    assert.equal(verifyToken("founder.notanumber.abc"), null);
    assert.equal(verifyToken("founder..."), null);
  });

  test("a token signed with a different secret is refused", () => {
    const token = issueToken("founder");
    const original = process.env.FOUNDERY_SESSION_SECRET;
    process.env.FOUNDERY_SESSION_SECRET = "a-different-secret";
    assert.equal(verifyToken(token), null);
    process.env.FOUNDERY_SESSION_SECRET = original;
    assert.equal(verifyToken(token), "founder");
  });
});

describe("public onboarding links", () => {
  test("tokens are random, long and URL-safe", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newPublicToken()));
    assert.equal(tokens.size, 200, "no collisions");
    for (const token of tokens) {
      assert.ok(token.length >= 24, "long enough not to be guessed");
      assert.match(token, /^[A-Za-z0-9_-]+$/, "safe in a URL without encoding");
    }
  });
});
