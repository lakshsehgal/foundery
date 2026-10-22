import { test, describe } from "node:test";
import assert from "node:assert/strict";

const {
  STARTER_ROLES, collectAnswers, fieldsFromRows, fieldMissingOptions, isApplicantStage,
  isRelocation, parseOptions,
} = await import("../src/lib/hiring");

describe("starter roles", () => {
  test("ships the four roles the office opens with", () => {
    assert.equal(STARTER_ROLES.length, 4);
    assert.deepEqual(
      STARTER_ROLES.map((role) => role.slug).sort(),
      [
        "content-associate",
        "founders-office-associate",
        "hr-executive",
        "operations-admin-executive",
      ],
    );
  });

  test("every role asks real questions with unique keys", () => {
    for (const role of STARTER_ROLES) {
      assert.ok(role.fields.length >= 3, `${role.slug} has too few questions`);
      assert.ok(role.pitch.length > 40, `${role.slug} has no real pitch`);
      const keys = role.fields.map((field) => field.key);
      assert.equal(new Set(keys).size, keys.length, `${role.slug} repeats a question key`);
      // Salary expectations and start date are screening questions everywhere.
      assert.ok(keys.includes("expected_salary"), `${role.slug} never asks about salary`);
      assert.ok(keys.includes("start_date"), `${role.slug} never asks when they can start`);
    }
  });
});

describe("collectAnswers", () => {
  const fields = [
    { key: "why", label: "Why Neuroid?", type: "textarea" as const, required: true },
    { key: "portfolio", label: "Portfolio", type: "url" as const, required: false },
  ];
  const lookup = (posted: Record<string, string | string[]>) => (key: string) => {
    const value = posted[key];
    return value === undefined ? [] : Array.isArray(value) ? value : [value];
  };

  test("a missing required answer stops the submission and names the question", () => {
    const { error } = collectAnswers(fields, () => []);
    assert.match(error ?? "", /Why Neuroid\?/);
  });

  test("keeps declared answers, drops everything else", () => {
    const { answers, error } = collectAnswers(
      fields,
      lookup({
        q_why: "Because the work ships.",
        q_portfolio: "",
        q_injected: "<script>alert(1)</script>",
        stage: "hired",
      }),
    );
    assert.equal(error, undefined);
    assert.deepEqual(answers, { why: "Because the work ships." });
  });

  test("length-caps a hostile answer", () => {
    const { answers } = collectAnswers(fields, lookup({ q_why: "x".repeat(10000) }));
    assert.equal(answers.why.length, 4000);
  });

  const choiceFields = [
    {
      key: "mode", label: "Work mode", type: "select" as const, required: true,
      options: ["From the office", "Hybrid"],
    },
    {
      key: "skills", label: "Skills", type: "checkbox" as const, required: true,
      options: ["Scripting", "Shooting", "Editing"],
    },
  ];

  test("a dropdown only accepts one of its listed choices", () => {
    const { error } = collectAnswers(
      choiceFields,
      lookup({ q_mode: "Fully remote", q_skills: "Editing" }),
    );
    assert.match(error ?? "", /Work mode/);

    const ok = collectAnswers(
      choiceFields,
      lookup({ q_mode: "Hybrid", q_skills: "Editing" }),
    );
    assert.equal(ok.error, undefined);
    assert.equal(ok.answers.mode, "Hybrid");
  });

  test("checkboxes join the ticked choices and drop smuggled ones", () => {
    const { answers, error } = collectAnswers(
      choiceFields,
      lookup({ q_mode: "Hybrid", q_skills: ["Shooting", "Editing", "free text injection"] }),
    );
    assert.equal(error, undefined);
    assert.equal(answers.skills, "Shooting, Editing");
  });

  test("a required checkbox question with nothing ticked stops the submission", () => {
    const { error } = collectAnswers(choiceFields, lookup({ q_mode: "Hybrid" }));
    assert.match(error ?? "", /Skills/);
  });
});

describe("options", () => {
  test("parseOptions splits, trims, de-duplicates and caps", () => {
    assert.deepEqual(parseOptions(" Yes , No\nyes, Maybe ,,"), ["Yes", "No", "Maybe"]);
    assert.equal(parseOptions(Array.from({ length: 30 }, (_, i) => `o${i}`).join(",")).length, 20);
  });

  test("fieldMissingOptions flags a choice question with fewer than two", () => {
    const bad = fieldMissingOptions([
      { key: "a", label: "Pick", type: "select", required: true, options: ["Only one"] },
    ]);
    assert.equal(bad?.key, "a");
    assert.equal(
      fieldMissingOptions([
        { key: "a", label: "Pick", type: "select", required: true, options: ["Yes", "No"] },
        { key: "b", label: "Free", type: "text", required: false },
      ]),
      null,
    );
  });
});

describe("fieldsFromRows", () => {
  test("derives keys from labels and de-duplicates them", () => {
    const fields = fieldsFromRows({
      labels: ["Expected salary?", "Expected salary?", "  ", "Links to work"],
      types: ["text", "text", "text", "nonsense"],
      required: ["1", "0", "1", "1"],
      hints: ["", "second ask", "", ""],
    });
    assert.equal(fields.length, 3); // the blank label is skipped
    assert.equal(fields[0].key, "expected_salary");
    assert.equal(fields[1].key, "expected_salary_2");
    assert.equal(fields[0].required, true);
    assert.equal(fields[1].required, false);
    assert.equal(fields[1].hint, "second ask");
    // An unknown type falls back to a short answer rather than failing.
    assert.equal(fields[2].type, "text");
  });

  test("choices attach to dropdown and checkbox questions only", () => {
    const fields = fieldsFromRows({
      labels: ["Work mode", "Your name"],
      types: ["select", "text"],
      required: ["1", "1"],
      hints: ["", ""],
      options: ["Office, Hybrid, Remote", "ignored, for, text"],
    });
    assert.deepEqual(fields[0].options, ["Office", "Hybrid", "Remote"]);
    assert.equal(fields[1].options, undefined);
  });
});

describe("vocabulary guards", () => {
  test("stages and relocation answers reject junk from the wire", () => {
    assert.ok(isApplicantStage("hired"));
    assert.ok(!isApplicantStage("promoted"));
    assert.ok(isRelocation("relocate"));
    assert.ok(!isRelocation("maybe"));
  });
});
