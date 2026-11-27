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
