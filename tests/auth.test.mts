import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { setupTempDb } from "./helpers.mjs";

setupTempDb("auth");

const {
  issueToken, issueSession, verifyToken, verifySession, roleForPasscode, newPublicToken,
  safeEqual, SESSION_TTL_MS,
} =
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
    const [, email64, expiry, mac] = token.split(".");
    assert.equal(
      verifyToken(`founder.${email64}.${expiry}.${mac}`),
      null,
      "privilege escalation must fail",
    );
  });

  test("extending the expiry invalidates it", () => {
    const [role, email64, expiry, mac] = issueToken("founder").split(".");
    const later = String(Number(expiry) + 86_400_000);
    assert.equal(verifyToken(`${role}.${email64}.${later}.${mac}`), null);
  });

  test("a session carries the email it was issued with, tamper-proof", () => {
    const token = issueSession("operator", "ops@neuroidmedia.com");
    assert.deepEqual(verifySession(token), { role: "operator", email: "ops@neuroidmedia.com" });

    // Swapping in a different (validly encoded) email breaks the signature.
    const forgedEmail = Buffer.from("laksh@neuroidmedia.com").toString("base64url");
    const [role, , expiry, mac] = token.split(".");
    assert.equal(verifySession(`${role}.${forgedEmail}.${expiry}.${mac}`), null);
  });

  test("a passcode session has a role and no identity", () => {
    assert.deepEqual(verifySession(issueToken("founder")), { role: "founder", email: null });
  });

  test("a legacy three-part token still verifies until it expires", async () => {
    // What issueToken produced before sessions carried an email.
    const modern = issueSession("operator", null);
    const [role, , expiry] = modern.split(".");
    const crypto = await import("node:crypto");
    const legacyPayload = `${role}.${expiry}`;
    const mac = crypto
      .createHmac("sha256", process.env.FOUNDERY_SESSION_SECRET || "dev-only-insecure-secret-change-me")
      .update(legacyPayload)
      .digest("base64url");
    assert.deepEqual(verifySession(`${legacyPayload}.${mac}`), { role: "operator", email: null });
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

describe("email allowlists", () => {
  test("roles come from the lists, case-insensitively, and default founder works", async () => {
    const { roleForEmail } = await import("../src/lib/identity");

    delete process.env.FOUNDERY_FOUNDER_EMAILS;
    delete process.env.FOUNDERY_OPERATOR_EMAILS;
    assert.equal(roleForEmail("laksh@neuroidmedia.com"), "founder", "default founder");
    assert.equal(roleForEmail("LAKSH@NeuroidMedia.com"), "founder", "case-insensitive");
    assert.equal(roleForEmail("stranger@example.com"), null);

    process.env.FOUNDERY_FOUNDER_EMAILS = "boss@x.com";
    process.env.FOUNDERY_OPERATOR_EMAILS = "ops@x.com, second@x.com";
    assert.equal(roleForEmail("boss@x.com"), "founder");
    assert.equal(roleForEmail("ops@x.com"), "operator");
    assert.equal(roleForEmail("second@x.com"), "operator");
    assert.equal(roleForEmail("laksh@neuroidmedia.com"), null, "explicit list replaces the default");
    delete process.env.FOUNDERY_FOUNDER_EMAILS;
    delete process.env.FOUNDERY_OPERATOR_EMAILS;
  });
});

describe("own login codes", () => {
  test("a code round-trips once, then dies", async () => {
    const { createLoginCode, consumeLoginCode } = await import("../src/lib/login-codes");

    const created = await createLoginCode("boss@x.com");
    assert.ok("code" in created, "code created");
    const code = (created as { code: string }).code;
    assert.match(code, /^\d{6}$/);

    assert.equal(await consumeLoginCode("boss@x.com", "999999"), false, "wrong code fails");
    assert.equal(await consumeLoginCode("boss@x.com", code), true, "right code passes");
    assert.equal(await consumeLoginCode("boss@x.com", code), false, "single use");
  });

  test("sends are rate-limited per email", async () => {
    const { createLoginCode } = await import("../src/lib/login-codes");
    await createLoginCode("busy@x.com");
    await createLoginCode("busy@x.com");
    const third = await createLoginCode("busy@x.com");
    assert.ok("code" in third, "three sends allowed");
    const fourth = await createLoginCode("busy@x.com");
    assert.ok("error" in fourth, "fourth send within the window refused");
  });
});

describe("team table roles", () => {
  test("the table wins, the environment remains the floor", async () => {
    const { teamRoleForEmail } = await import("../src/lib/identity");
    const { getDb } = await import("../src/lib/db");
    const db = await getDb();

    delete process.env.FOUNDERY_FOUNDER_EMAILS;
    delete process.env.FOUNDERY_OPERATOR_EMAILS;

    assert.equal(await teamRoleForEmail("laksh@neuroidmedia.com"), "founder", "env default");
    assert.equal(await teamRoleForEmail("newops@x.com"), null);

    await db.query(
      `INSERT INTO foundery.team_members (email, role) VALUES ('newops@x.com', 'operator')`,
    );
    assert.equal(await teamRoleForEmail("NewOps@X.com"), "operator", "db row, case-insensitive");
    assert.equal(await teamRoleForEmail("laksh@neuroidmedia.com"), "founder", "default still works");

    await db.query(`DELETE FROM foundery.team_members WHERE email = 'newops@x.com'`);
    assert.equal(await teamRoleForEmail("newops@x.com"), null, "removal takes effect");
  });
});
