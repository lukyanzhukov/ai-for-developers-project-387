import test from "node:test";
import assert from "node:assert/strict";
import { browserProfile } from "../../scripts/review-policy.cjs";

test("keyboard profile is opt-in and other labels preserve ordinary search checks", () => {
  assert.equal(browserProfile([]), "search");
  assert.equal(browserProfile([{ name: "enhancement" }]), "search");
  assert.equal(
    browserProfile([{ name: "enhancement" }, { name: "browser:keyboard" }]),
    "keyboard-search",
  );
  assert.throws(() => browserProfile([{ name: "browser:keybord" }]), /Unknown browser profile/);
});

test("meeting type filter profile is opt-in and keeps the other profiles unchanged", () => {
  assert.equal(browserProfile([{ name: "browser:type-filter" }]), "type-filter");
  assert.equal(
    browserProfile([{ name: "enhancement" }, { name: "browser:type-filter" }]),
    "type-filter",
  );
  assert.equal(browserProfile([{ name: "browser:keyboard" }]), "keyboard-search");
  for (const name of ["browser:type-filters", "browser:typefilter", "browser:"])
    assert.throws(() => browserProfile([{ name }]), /Unknown browser profile/);
});
