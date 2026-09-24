// Local, read-only heuristic secret scan. Reports locations only, never values.
import { execFileSync } from "node:child_process";
const objects = execFileSync("git", ["rev-list", "--objects", "--all"], { encoding: "utf8" }).trim().split("\n");
const paths = new Map(objects.map((line) => { const i = line.indexOf(" "); return [i < 0 ? line : line.slice(0, i), i < 0 ? "" : line.slice(i + 1)]; }));
const stream = execFileSync("git", ["cat-file", "--batch"], { input: [...paths.keys()].join("\n") + "\n", maxBuffer: 256 * 1024 * 1024 });
const rules = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["github-token", /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})/],
  ["aws-access-key", /AKIA[0-9A-Z]{16}/],
  ["credential-url", /(?:postgres(?:ql)?|https?):\/\/[^\s/:]+:[^\s@/]{8,}@/],
  ["jwt", /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],
  ["populated-secret", /(?:JUPITER_API_KEY|DATABASE_URL|PRIVATE_KEY|SEED_PHRASE|SUPABASE_SERVICE_ROLE_KEY|VERCEL_TOKEN)\s*[=:]\s*["']?[A-Za-z0-9_+/.-]{32,}/],
];
let offset = 0, blobs = 0;
const findings = [];
while (offset < stream.length) {
  const end = stream.indexOf(10, offset);
  const [oid, type, sizeText] = stream.subarray(offset, end).toString().split(" ");
  const size = Number(sizeText);
  if (!Number.isFinite(size)) throw new Error("Invalid Git batch record");
  offset = end + 1;
  if (type === "blob") {
    blobs++;
    const bytes = stream.subarray(offset, offset + size);
    if (!bytes.includes(0)) {
      const lines = bytes.toString().split("\n");
      for (let i = 0; i < lines.length; i++) for (const [rule, pattern] of rules) if (pattern.test(lines[i])) findings.push({ blob: oid.slice(0, 12), path: paths.get(oid), line: i + 1, rule });
    }
  }
  offset += size + 1;
}
console.log(JSON.stringify({ reachableObjects: paths.size, blobsScanned: blobs, findings }, null, 2));
if (findings.length) process.exitCode = 1;
