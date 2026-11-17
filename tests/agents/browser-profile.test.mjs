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
