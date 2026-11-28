import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const cli = fileURLToPath(new URL("../bin/codepact.js", import.meta.url))
const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version

function trySymlink(target, path, type) {
	try {
		symlinkSync(target, path, type)
		return true
	} catch (error) {
		if (error.code === "EPERM" || error.code === "EACCES") return false
		throw error
	}
}

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

test("CLI emits GitHub annotations alongside text report for --format=github and GITHUB_ACTIONS=true", () => {
	const dir = mkdtempSync(join(tmpdir(), "codepact-github-"))
	try {
		writeFileSync(
			join(dir, "errors.rs"),
			[
				"#[contracterror]",
				"pub enum RouterError {",
				"  A = 300,",
				"  B = 300,",
				"  C,",
				"}",
			].join("\n"),
		)
		writeFileSync(
			join(dir, "clean.rs"),
			["#[contracterror]", "pub enum CleanError { Ok = 100 }"].join("\n"),
		)

		const localEnv = { ...process.env, GITHUB_ACTIONS: "" }
		const ciEnv = { ...process.env, GITHUB_ACTIONS: "true" }

		// Local run without --format=github prints only human-readable report
		const local = spawnSync(process.execPath, [cli, "errors.rs"], {
			cwd: dir,
			env: localEnv,
			encoding: "utf8",
		})
		assert.equal(local.status, 1, local.stderr)
		assert.match(local.stdout, /1 enum\(s\), 1 error\(s\), 1 warning\(s\)\./)
		assert.doesNotMatch(local.stdout, /^::(?:error|warning)/m)

		// Explicit --format=github and --format github emit annotations alongside text report
		const formattedEq = spawnSync(process.execPath, [cli, "--format=github", "errors.rs"], {
			cwd: dir,
			env: localEnv,
			encoding: "utf8",
		})
		const formattedSp = spawnSync(process.execPath, [cli, "--format", "github", "errors.rs"], {
			cwd: dir,
			env: localEnv,
			encoding: "utf8",
		})
		assert.equal(formattedEq.status, 1, formattedEq.stderr)
		assert.equal(formattedSp.status, 1, formattedSp.stderr)
		assert.equal(formattedSp.stdout, formattedEq.stdout)
		assert.match(formattedEq.stdout, /1 enum\(s\), 1 error\(s\), 1 warning\(s\)\./)
		assert.match(formattedEq.stdout, /^::error file=errors\.rs,line=4::RouterError::B reuses code 300/m)
		assert.match(formattedEq.stdout, /^::warning file=errors\.rs,line=5::RouterError::C has no explicit discriminant/m)

		// Clean run emits no annotations
		const clean = spawnSync(process.execPath, [cli, "--format=github", "clean.rs"], {
			cwd: dir,
			env: ciEnv,
			encoding: "utf8",
		})
		assert.equal(clean.status, 0, clean.stderr)
		assert.doesNotMatch(clean.stdout, /^::(?:error|warning)/m)

		// Auto-detection under GITHUB_ACTIONS=true emits the same annotations alongside text
		const autoCi = spawnSync(process.execPath, [cli, "errors.rs"], {
			cwd: dir,
			env: ciEnv,
			encoding: "utf8",
		})
		assert.equal(autoCi.status, 1, autoCi.stderr)
		assert.equal(autoCi.stdout, formattedEq.stdout)

		// Explicit --format=text, --json, and --markdown are never corrupted under GITHUB_ACTIONS=true
		const textInCi = spawnSync(process.execPath, [cli, "--format=text", "errors.rs"], {
			cwd: dir,
			env: ciEnv,
			encoding: "utf8",
		})
		assert.equal(textInCi.status, 1, textInCi.stderr)
		assert.equal(textInCi.stdout, local.stdout)

		const jsonInCi = spawnSync(process.execPath, [cli, "--json", "errors.rs"], {
			cwd: dir,
			env: ciEnv,
			encoding: "utf8",
		})
		assert.equal(jsonInCi.status, 1, jsonInCi.stderr)
		assert.equal(JSON.parse(jsonInCi.stdout).findings.length, 2)

		const mdInCi = spawnSync(process.execPath, [cli, "--markdown", "errors.rs"], {
			cwd: dir,
			env: ciEnv,
			encoding: "utf8",
		})
		assert.equal(mdInCi.status, 1, mdInCi.stderr)
		assert.doesNotMatch(mdInCi.stdout, /^::(?:error|warning)/m)

		// --out keeps report file clean while emitting annotations to stdout in CI
		const outPath = join(dir, "report.txt")
		const outInCi = spawnSync(process.execPath, [cli, "--out", outPath, "errors.rs"], {
			cwd: dir,
			env: ciEnv,
			encoding: "utf8",
		})
		assert.equal(outInCi.status, 1, outInCi.stderr)
		assert.equal(readFileSync(outPath, "utf8"), local.stdout)
		assert.match(outInCi.stdout, /^::error file=errors\.rs,line=4::/m)
		assert.match(outInCi.stdout, /^::warning file=errors\.rs,line=5::/m)
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
})

test("CLI rejects invalid and conflicting --format options with exit code 2", () => {
	for (const args of [
		["--format=xml"],
		["--format", "xml"],
		["--format"],
		["--format="],
		["--format=github", "--json"],
		["--format=github", "--markdown"],
	]) {
		const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" })
		assert.equal(result.status, 2, `Expected exit 2 for ${args.join(" ")}: ${result.stderr}`)
		assert.match(result.stderr, /^codepact: /)
	}
})
