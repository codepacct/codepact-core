import test from "node:test"
import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"

import { analyze, summarize } from "../src/analyze.js"
import { parseContractErrors } from "../src/parse.js"

function declaration(name, file, variants) {
	return {
		name,
		file,
		line: 1,
		variants: variants.map(([variantName, value], index) => ({
			name: variantName,
			value,
			line: index + 2,
		})),
	}
}

test("flags a repeated code inside one enum", () => {
	const findings = analyze([
		declaration("PairError", "pair.rs", [
			["AlreadyInitialized", 54],
			["InsufficientLiquidity", 54],
		]),
	])

	assert.equal(findings.length, 1)
	assert.equal(findings[0].rule, "duplicate-discriminant")
	assert.equal(findings[0].severity, "error")
	assert.match(findings[0].message, /E0081/)
})

test("flags the same code defined by two different enums", () => {
	const findings = analyze([
		declaration("RouterError", "router.rs", [["PairNotFound", 300]]),
		declaration("FactoryError", "factory.rs", [["NotInitialized", 300]]),
	])

	assert.deepEqual(
		findings.map((finding) => finding.rule),
		["code-collision"],
	)
})

test("overlapping ranges without a shared code are a warning, not an error", () => {
	const findings = analyze([
		declaration("RouterError", "router.rs", [
			["A", 200],
			["B", 310],
		]),
		declaration("FactoryError", "factory.rs", [
			["C", 300],
			["D", 305],
		]),
	])

	assert.equal(findings.length, 1)
	assert.equal(findings[0].rule, "range-overlap")
	assert.equal(findings[0].severity, "warning")
})

test("disjoint ranges produce no findings", () => {
	const findings = analyze([
		declaration("PairError", "pair.rs", [
			["A", 100],
			["B", 120],
		]),
		declaration("RouterError", "router.rs", [
			["C", 200],
			["D", 220],
		]),
	])

	assert.deepEqual(findings, [])
})

test("an implicit discriminant is reported once per variant", () => {
	const findings = analyze([
		declaration("TokenError", "token.rs", [
			["A", 1],
			["B", null],
		]),
	])

	assert.equal(findings.length, 1)
	assert.equal(findings[0].rule, "implicit-discriminant")
	assert.equal(findings[0].line, 3)
})

test("a declared range is enforced", () => {
	const enums = [
		declaration("RouterError", "router.rs", [
			["InRange", 205],
			["OutOfRange", 300],
		]),
	]

	const findings = analyze(enums, { ranges: { RouterError: [200, 299] } })

	assert.equal(findings.length, 1)
	assert.equal(findings[0].rule, "range-violation")
	assert.match(findings[0].message, /OutOfRange/)
})

test("ignored rules are dropped", () => {
	const enums = [declaration("TokenError", "token.rs", [["A", null]])]

	assert.equal(analyze(enums).length, 1)
	assert.equal(analyze(enums, { ignore: ["implicit-discriminant"] }).length, 0)
})

test("summarize counts errors and warnings separately", () => {
	const findings = [
		{ severity: "error" },
		{ severity: "warning" },
		{ severity: "warning" },
	]

	assert.deepEqual(summarize(findings), { errors: 1, warnings: 2 })
})

test("end to end: parse then analyze a colliding pair of contracts", () => {
	const router = parseContractErrors(
		["#[contracterror]", "pub enum RouterError {", "    PairNotFound = 300,", "}"].join("\n"),
		"router.rs",
	)
	const factory = parseContractErrors(
		["#[contracterror]", "pub enum FactoryError {", "    NotInitialized = 300,", "}"].join("\n"),
		"factory.rs",
	)

	const findings = analyze([...router, ...factory])

	assert.equal(summarize(findings).errors, 1)
})

test("resolved constants participate in collisions while unresolved expressions are not implicit", () => {
	const source = ["const BASE: u32 = 200;", "#[contracterror]", "enum E { A = BASE, B = 200, C = unknown(), D }"].join("\n")
	const findings = analyze(parseContractErrors(source))
	assert.deepEqual(findings.map((finding) => finding.rule), ["duplicate-discriminant", "implicit-discriminant"])
	assert.match(findings[1].message, /E::D/)
})

test("reports unresolved expressions transparently in text and markdown", async () => {
	const { toText, toMarkdown } = await import("../src/report.js")
	const enums = parseContractErrors("#[contracterror]\nenum E { A = external::CODE }")
	const findings = analyze(enums)
	assert.deepEqual(findings, [])
	assert.match(toText(enums, findings), /unresolved/)
	assert.match(toText(enums, findings), /could not be resolved and were not checked/)
	assert.match(toMarkdown(enums, findings), /_unresolved_/)
	assert.match(toMarkdown(enums, findings), /No issues found in resolved codes/)
})

test("CLI finds collisions involving constants", async () => {
	const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs")
	const { tmpdir } = await import("node:os")
	const { join } = await import("node:path")
	const { spawnSync } = await import("node:child_process")
	const dir = mkdtempSync(join(tmpdir(), "codepact-const-"))
	try {
		writeFileSync(join(dir, "errors.rs"), "const BASE: u32 = 200;\n#[contracterror]\nenum A { X = BASE + 1 }\n#[contracterror]\nenum B { Y = 201 }")
		const result = spawnSync(process.execPath, [fileURLToPath(new URL("../bin/codepact.js", import.meta.url)), "--json", dir], { encoding: "utf8" })
		assert.equal(result.status, 1, result.stderr)
		assert.ok(JSON.parse(result.stdout).findings.some((finding) => finding.rule === "code-collision"))
	} finally { rmSync(dir, { recursive: true, force: true }) }
})
