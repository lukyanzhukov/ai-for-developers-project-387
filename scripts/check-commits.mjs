import { execFileSync } from "node:child_process";

// Imported histories keep their original messages; validate commits after the migration baseline.
const adoption = "0c971649965f6d80ccccea9560890fc3dee6380f";
const to = process.env.COMMIT_TO || "HEAD";
const requestedFrom = process.env.COMMIT_FROM;
const from = requestedFrom && !/^0+$/.test(requestedFrom) ? requestedFrom : adoption;
const base = execFileSync("git", ["merge-base", from, to], { encoding: "utf8" }).trim();
execFileSync("pnpm", ["exec", "commitlint", "--from", base, "--to", to, "--strict"], {
  stdio: "inherit",
});
