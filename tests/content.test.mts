import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { setupTempDb } from "./helpers.mjs";

setupTempDb("content");

const { getDb } = await import("../src/lib/db");
const { listContentPieces, getContentPiece } = await import("../src/lib/queries");
const { CONTENT_PIPELINE, nextContentStatus, isContentStatus, isContentDimension } = await import(
  "../src/lib/taxonomy"
);

const db = await getDb();

// Inserted deliberately out of pipeline order, and with shoot dates that
// disagree with insertion order, so the board-order sort is actually tested.
await db.query(
  `INSERT INTO foundery.content_pieces (title, status, platform, dimension, script, shoot_date)
   VALUES ('Cut me', 'editing', 'instagram_reel', '9x16', 'HOOK — hello', NULL)`,
);
await db.query(
  `INSERT INTO foundery.content_pieces (title, status, platform, dimension, shoot_date)
   VALUES ('Shoot me later', 'shoot_due', 'youtube_short', '4x5', '2026-09-20')`,
);
await db.query(
  `INSERT INTO foundery.content_pieces (title, status, platform, dimension, shoot_date)
   VALUES ('Shoot me first', 'shoot_due', 'instagram_reel', '9x16', '2026-09-01')`,
);
await db.query(
  `INSERT INTO foundery.content_pieces (title, status, platform, dimension)
   VALUES ('Just an idea', 'concept', 'linkedin', '1x1')`,
);
// A hand-edited row with vocabulary the app doesn't know.
await db.query(
  `INSERT INTO foundery.content_pieces (title, status, platform, dimension)
   VALUES ('Mystery row', 'binned', 'myspace', '3x7')`,
);

describe("pipeline vocabulary", () => {
  test("the pipeline walks concept to posted and stops", () => {
    assert.equal(nextContentStatus("concept"), "scripting");
    assert.equal(nextContentStatus("scripting"), "shoot_due");
    assert.equal(nextContentStatus("shoot_due"), "shot");
    assert.equal(nextContentStatus("shot"), "editing");
    assert.equal(nextContentStatus("editing"), "ready");
    assert.equal(nextContentStatus("ready"), "posted");
    assert.equal(nextContentStatus("posted"), null);
  });

  test("every stage except the last carries an advance verb", () => {
    for (const stage of CONTENT_PIPELINE) {
      if (stage.key === "posted") assert.equal(stage.advance, "");
      else assert.ok(stage.advance.length > 0, `${stage.key} needs an advance label`);
    }
  });

  test("guards accept the vocabulary and nothing else", () => {
    assert.ok(isContentStatus("shoot_due"));
    assert.ok(!isContentStatus("binned"));
    assert.ok(isContentDimension("16x9"));
    assert.ok(!isContentDimension("3x7"));
  });
});

describe("content queries", () => {
  test("the board lists in pipeline order, nearest shoot first inside a stage", async () => {
    const pieces = await listContentPieces();
    const titles = pieces.map((piece) => piece.title);
    // concept first (the unknown-status row falls back to concept too),
    // then the two shoots by date, then the edit.
    assert.deepEqual(titles.slice(0, 2).sort(), ["Just an idea", "Mystery row"]);
    assert.deepEqual(titles.slice(2), ["Shoot me first", "Shoot me later", "Cut me"]);
  });

  test("unknown vocabulary falls back instead of leaking through", async () => {
    const pieces = await listContentPieces();
    const mystery = pieces.find((piece) => piece.title === "Mystery row")!;
    assert.equal(mystery.status, "concept");
    assert.equal(mystery.platform, "other");
    assert.equal(mystery.dimension, "9x16");
  });

  test("a single piece comes back whole, and a missing id comes back null", async () => {
    const pieces = await listContentPieces();
    const editing = pieces.find((piece) => piece.title === "Cut me")!;
    const fetched = await getContentPiece(editing.id);
    assert.equal(fetched?.script, "HOOK — hello");
    assert.equal(fetched?.status, "editing");
    assert.equal(await getContentPiece(999_999), null);
  });
});
