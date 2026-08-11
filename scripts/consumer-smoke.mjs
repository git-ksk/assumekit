import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const tempRoot = mkdtempSync(join(tmpdir(), "assumekit-consumer-"));
const consumerDir = join(tempRoot, "consumer");

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    ...options,
  });
}

try {
  mkdirSync(consumerDir, { recursive: true });

  const packJson = execFileSync(
    "npm",
    ["pack", "--json", "--pack-destination", tempRoot],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const packResult = JSON.parse(packJson);
  const tarballName = packResult[0]?.filename;

  if (!tarballName) {
    throw new Error("npm pack did not return a tarball filename");
  }

  const tarballPath = join(tempRoot, tarballName);

  writeFileSync(
    join(consumerDir, "package.json"),
    `${JSON.stringify({ name: "assumekit-consumer-smoke", private: true, type: "module" }, null, 2)}\n`,
  );

  run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarballPath],
    { cwd: consumerDir },
  );

  writeFileSync(
    join(consumerDir, "consumer.mjs"),
    `import { createAwsFetch, gcpMetadataIdentity } from "assumekit";\n\nif (typeof createAwsFetch !== "function") throw new Error("createAwsFetch export missing");\nif (typeof gcpMetadataIdentity !== "function") throw new Error("gcpMetadataIdentity export missing");\n\nconst endpoint = new URL("https://example.execute-api.ap-northeast-1.amazonaws.com/health");\nconst awsFetch = createAwsFetch({\n  roleArn: "arn:aws:iam::123456789012:role/AssumeKitConsumerSmoke",\n  region: "ap-northeast-1",\n  service: "execute-api",\n  identity: gcpMetadataIdentity({ audience: "assumekit-consumer-smoke" }),\n  allowedHosts: [endpoint.host],\n});\n\nif (typeof awsFetch !== "function") throw new Error("createAwsFetch did not return a function");\n`,
  );

  writeFileSync(
    join(consumerDir, "consumer.ts"),
    `import { createAwsFetch, gcpMetadataIdentity } from "assumekit";\n\nconst endpoint = new URL("https://example.execute-api.ap-northeast-1.amazonaws.com/health");\nconst awsFetch = createAwsFetch({\n  roleArn: "arn:aws:iam::123456789012:role/AssumeKitConsumerSmoke",\n  region: "ap-northeast-1",\n  service: "execute-api",\n  identity: gcpMetadataIdentity({ audience: "assumekit-consumer-smoke" }),\n  allowedHosts: [endpoint.host],\n});\n\nconst response: Promise<Response> = awsFetch(endpoint);\nvoid response;\n`,
  );

  run(process.execPath, ["consumer.mjs"], { cwd: consumerDir });

  const tscPath = resolve(repoRoot, "node_modules/typescript/bin/tsc");
  run(
    process.execPath,
    [
      tscPath,
      "--noEmit",
      "--strict",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--lib",
      "ES2022,DOM,DOM.Iterable",
      "consumer.ts",
    ],
    { cwd: consumerDir },
  );

  console.log("Packed consumer smoke passed.");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
