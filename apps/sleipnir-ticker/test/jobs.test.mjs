/**
 * Unit tests for the pure jobs helpers (field errors from a Sleipnir error, sequenced events).
 * Run: node --test test/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fieldErrorsOf, jobVariant } from "../src/jobs.mjs";

test("fieldErrorsOf reads the field-error map from a 400's details", () => {
    const error = {
        code: 400,
        message: "The analysis request is invalid.",
        category: "InvalidArgument",
        details: JSON.stringify({ label: ["The label is required."], points: ["Only 63 points are recorded so far."] }),
    };
    assert.deepEqual(fieldErrorsOf(error), {
        label: ["The label is required."],
        points: ["Only 63 points are recorded so far."],
    });
});

test("fieldErrorsOf returns null for anything that is not a field-error 400", () => {
    assert.equal(fieldErrorsOf(null), null);
    assert.equal(fieldErrorsOf(undefined), null);
    assert.equal(fieldErrorsOf({ code: 500, details: JSON.stringify({ label: ["x"] }) }), null);
    assert.equal(fieldErrorsOf({ code: 400, details: null }), null);
    assert.equal(fieldErrorsOf({ code: 400, details: "a stack trace" }), null);
    assert.equal(fieldErrorsOf({ code: 400, details: "[1,2]" }), null);
    assert.equal(fieldErrorsOf({ code: 400, details: "{}" }), null);
});

test("fieldErrorsOf skips entries that are not message lists", () => {
    assert.deepEqual(fieldErrorsOf({ code: 400, details: JSON.stringify({ label: "x", points: ["too few"] }) }), {
        points: ["too few"],
    });
});

test("jobVariant maps a job state to a Bootstrap color", () => {
    assert.equal(jobVariant("done"), "success");
    assert.equal(jobVariant("failed"), "danger");
    assert.equal(jobVariant("running"), "primary");
    assert.equal(jobVariant(undefined), "primary");
});
