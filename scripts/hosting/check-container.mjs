import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"

const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
const name = `personal-finance-check-${process.pid}`
const image = process.argv[2] ?? "personal-finance:ci"
const probe = `
  const response = await fetch('http://127.0.0.1:4317/api/health');
  if (response.status !== 200 || (await response.json()).status !== 'ok') process.exit(1);
  if (!response.headers.get('cache-control')?.includes('no-store')) process.exit(1);
`

async function ready() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      docker("exec", name, "node", "--input-type=module", "-e", probe)
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw new Error("Container did not become healthy")
}

try {
  // No network, no public port, no live credentials and no database access.
  docker(
    "run",
    "--detach",
    "--name",
    name,
    "--network",
    "none",
    "--env",
    "PORT=4317",
    "--env",
    "DATABASE_URL=postgresql://test:test@127.0.0.1:9/synthetic",
    "--env",
    "NEON_AUTH_BASE_URL=https://auth.example.invalid/auth",
    "--env",
    `NEON_AUTH_COOKIE_SECRET=${"synthetic".repeat(8)}`,
    image
  )
  await ready()
  assert.notEqual(docker("exec", name, "id", "-u"), "0")
  docker(
    "exec",
    name,
    "node",
    "--input-type=module",
    "-e",
    `
    import { readdir } from 'node:fs/promises';
    const files = await readdir('.next/static', { recursive: true });
    for (const suffix of ['.js', '.css', '.woff2']) {
      const asset = files.find((file) => file.endsWith(suffix));
      if (!asset) throw new Error('Missing runtime asset ' + suffix);
      const response = await fetch('http://127.0.0.1:4317/_next/static/' + asset);
      if (!response.ok || !(await response.arrayBuffer()).byteLength) throw new Error('Asset unavailable');
    }
  `
  )
  docker("stop", "--time", "30", name)
  assert.equal(docker("inspect", "--format", "{{.State.ExitCode}}", name), "0")
  docker("start", name)
  await ready()
  console.log(
    JSON.stringify({
      event: "container.smoke",
      status: "passed",
      checks: [
        "liveness",
        "custom-port",
        "non-root",
        "js-css-font",
        "sigterm",
        "restart",
      ],
    })
  )
} finally {
  try {
    docker("rm", "--force", name)
  } catch {
    /* Nothing to clean up if creation failed. */
  }
}
