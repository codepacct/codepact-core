import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const cli = fileURLToPath(new URL("../bin/codepact.js", import.meta.url))

test("CLI scans qualified attributes and detects collisions", () => {
	const dir = mkdtempSync(join(tmpdir(), "codepact-"))
	try {
		writeFileSync(join(dir, "errors.rs"), [
			"#[soroban_sdk::contracterror]", "enum First { A = 1 }",
			"#[ contracterror ]", "enum Second { B = 1 }",
		].join("\n"))
		const result = spawnSync(process.execPath, [cli, "--json", dir], { encoding: "utf8" })
		assert.equal(result.status, 1, result.stderr)
		const report = JSON.parse(result.stdout)
		assert.deepEqual(report.enums.map((entry) => entry.name), ["First", "Second"])
		assert.ok(report.findings.some((finding) => finding.rule === "code-collision"))
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
})

for (const flag of ["--version", "-v"]) {
	test(`CLI ${flag} prints the package version without a scan path`, () => {
		const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
		const cwd = fileURLToPath(new URL("../examples/broken/", import.meta.url))
		const result = spawnSync(process.execPath, [cli, flag], { cwd, encoding: "utf8" })
		assert.equal(result.status, 0, result.stderr)
		assert.equal(result.stdout, `${version}\n`)
		assert.equal(result.stderr, "")
	})
}
