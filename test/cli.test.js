import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const cli = fileURLToPath(new URL("../bin/codepact.js", import.meta.url))
const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version
const cleanExample = fileURLToPath(new URL("../examples/clean", import.meta.url))
const brokenExample = fileURLToPath(new URL("../examples/broken", import.meta.url))

function trySymlink(target, path, type) {
	try {
		symlinkSync(target, path, type)
		return true
	} catch (error) {
		if (error.code === "EPERM" || error.code === "EACCES") return false
		throw error
	}
}

test("CLI reports --help with usage and exit code 0", () => {
	for (const flag of ["--help", "-h"]) {
		const result = spawnSync(process.execPath, [cli, flag], { encoding: "utf8" })
		assert.equal(result.status, 0, result.stderr)
		assert.match(result.stdout, /codepact \[options\]/)
		assert.equal(result.stderr, "")
	}
})

test("CLI scans clean and broken example fixtures with expected exit codes and formats", () => {
	const dir = mkdtempSync(join(tmpdir(), "codepact-e2e-"))
	try {
		const cleanJson = spawnSync(process.execPath, [cli, "--json", "--strict", cleanExample], {
			encoding: "utf8",
		})
		assert.equal(cleanJson.status, 0, cleanJson.stderr)
		const parsedClean = JSON.parse(cleanJson.stdout)
		assert.ok(parsedClean.enums.length > 0)
		assert.deepEqual(parsedClean.findings, [])

		const outMarkdown = join(dir, "registry.md")
		const brokenMarkdown = spawnSync(
			process.execPath,
			[cli, "--markdown", "--out", outMarkdown, brokenExample],
			{ encoding: "utf8" },
		)
		assert.equal(brokenMarkdown.status, 1, brokenMarkdown.stderr)
		assert.equal(brokenMarkdown.stdout, "")
		const markdown = readFileSync(outMarkdown, "utf8")
		assert.match(markdown, /^# Contract error registry/m)
		assert.match(markdown, /code-collision/)

		const outJson = join(dir, "report.json")
		const brokenJson = spawnSync(process.execPath, [cli, "--json", "--out", outJson, brokenExample], {
			encoding: "utf8",
		})
		assert.equal(brokenJson.status, 1, brokenJson.stderr)
		assert.equal(brokenJson.stdout, "")
		const parsedBroken = JSON.parse(readFileSync(outJson, "utf8"))
		assert.ok(parsedBroken.findings.some((finding) => finding.severity === "error"))
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
})

test("CLI handles warning-only workspaces differently with and without --strict", () => {
	const dir = mkdtempSync(join(tmpdir(), "codepact-strict-"))
	try {
		writeFileSync(
			join(dir, "errors.rs"),
			["#[contracterror]", "pub enum WarnOnlyError { First = 100, Second }"].join("\n"),
		)

		const relaxed = spawnSync(process.execPath, [cli, "--json", dir], { encoding: "utf8" })
		assert.equal(relaxed.status, 0, relaxed.stderr)
		const relaxedReport = JSON.parse(relaxed.stdout)
		assert.equal(relaxedReport.findings.length, 1)
		assert.equal(relaxedReport.findings[0].severity, "warning")
		assert.equal(relaxedReport.findings[0].rule, "implicit-discriminant")

		const strict = spawnSync(process.execPath, [cli, "--strict", dir], { encoding: "utf8" })
		assert.equal(strict.status, 1, strict.stderr)
		assert.match(strict.stdout, /implicit-discriminant/)
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
})

test("CLI exits 2 on bad arguments, unreadable paths, and malformed config files", () => {
	const dir = mkdtempSync(join(tmpdir(), "codepact-err-"))
	try {
		const unknownFlag = spawnSync(process.execPath, [cli, "--not-a-flag"], { encoding: "utf8" })
		assert.equal(unknownFlag.status, 2)
		assert.match(unknownFlag.stderr, /Unknown option/)

		const conflictFlags = spawnSync(process.execPath, [cli, "--json", "--markdown", cleanExample], {
			encoding: "utf8",
		})
		assert.equal(conflictFlags.status, 2)
		assert.match(conflictFlags.stderr, /cannot be combined/)

		const missingOutArg = spawnSync(process.execPath, [cli, "--out"], { encoding: "utf8" })
		assert.equal(missingOutArg.status, 2)
		assert.match(missingOutArg.stderr, /--out requires a file path/)

		const missingConfig = spawnSync(
			process.execPath,
			[cli, "--config", join(dir, "missing.json"), cleanExample],
			{ encoding: "utf8" },
		)
		assert.equal(missingConfig.status, 2)
		assert.match(missingConfig.stderr, /^codepact:/m)

		const invalidConfig = join(dir, "bad-config.json")
		writeFileSync(invalidConfig, "{ not valid json")
		const malformedConfig = spawnSync(
			process.execPath,
			[cli, "--config", invalidConfig, cleanExample],
			{ encoding: "utf8" },
		)
		assert.equal(malformedConfig.status, 2)
		assert.match(malformedConfig.stderr, /^codepact:/m)
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
})

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

test("CLI deduplicates repeated, overlapping, and symlinked scan paths", () => {
	const dir = mkdtempSync(join(tmpdir(), "codepact-dedupe-"))
	try {
		const contracts = join(dir, "contracts")
		mkdirSync(contracts)
		const tokenFile = join(contracts, "token.rs")
		writeFileSync(
			tokenFile,
			["#[contracterror]", "pub enum TokenError { NotInit = 100 }"].join("\n"),
		)
		const symlinkFile = join(dir, "token_link.rs")
		const linked = trySymlink(tokenFile, symlinkFile)
		const paths = [contracts, tokenFile, join(contracts, "..", "contracts", "token.rs")]
		if (linked) paths.push(symlinkFile)

		const result = spawnSync(process.execPath, [cli, "--json", ...paths], {
			cwd: dir,
			encoding: "utf8",
		})
		assert.equal(result.status, 0, result.stderr)
		const report = JSON.parse(result.stdout)
		assert.equal(report.enums.length, 1)
		assert.equal(report.enums[0].file.replaceAll("\\", "/"), "contracts/token.rs")
		assert.deepEqual(report.findings, [])
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
})

test("CLI prints its version for both aliases", () => {
	for (const flag of ["--version", "-v"]) {
		const result = spawnSync(process.execPath, [cli, flag], { encoding: "utf8" })
		assert.equal(result.status, 0, result.stderr)
		assert.equal(result.stdout, `${version}\n`)
		assert.equal(result.stderr, "")
	}
})

test("CLI rejects a malformed config with the file name", () => {
	const dir = mkdtempSync(join(tmpdir(), "codepact-config-"))
	try {
		const config = join(dir, "codepact.config.json")
		writeFileSync(config, JSON.stringify({ ranges: { TokenError: [200, 100] } }))
		const result = spawnSync(process.execPath, [cli, "--config", config, dir], { encoding: "utf8" })
		assert.equal(result.status, 2)
		assert.match(result.stderr, /Invalid config/)
		assert.match(result.stderr, /codepact\.config\.json/)
		assert.match(result.stderr, /inverted/)
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
})

test("CLI still reports real collisions across distinct files when paths overlap", () => {
	const dir = mkdtempSync(join(tmpdir(), "codepact-collision-"))
	try {
		const contracts = join(dir, "contracts")
		mkdirSync(contracts)
		const first = join(contracts, "first.rs")
		const second = join(contracts, "second.rs")
		writeFileSync(first, ["#[contracterror]", "pub enum FirstError { Boom = 300 }"].join("\n"))
		writeFileSync(second, ["#[contracterror]", "pub enum SecondError { Crash = 300 }"].join("\n"))

		const result = spawnSync(process.execPath, [cli, "--json", contracts, first], {
			cwd: dir,
			encoding: "utf8",
		})
		assert.equal(result.status, 1, result.stderr)
		const report = JSON.parse(result.stdout)
		assert.equal(report.enums.length, 2)
		assert.equal(report.findings.filter((f) => f.rule === "code-collision").length, 1)
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
})
