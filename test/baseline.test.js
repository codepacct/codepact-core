import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, writeFileSync, rmSync, linkSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { analyze } from "../src/analyze.js"
import { parseContractErrors } from "../src/parse.js"
import { createBaseline, compareBaseline } from "../src/baseline.js"

const cli = resolve("bin/codepact.js")
const source = `#[contracterror]\nenum A { X = 100, Y = 100, Implicit, }\n#[contracterror]\nenum B { Z = 100, }\n`
function fixture(t) {
	const dir = mkdtempSync(join(tmpdir(), "codepact-baseline-"))
	t.after(() => rmSync(dir, { recursive: true, force: true }))
	writeFileSync(join(dir, "input.rs"), source)
	const run = (...args) => spawnSync(process.execPath, [cli, "input.rs", ...args], { cwd: dir, encoding: "utf8" })
	return { dir, run }
}

test("baseline filters known findings after line shifts and reports new and stale findings", (t) => {
	const { dir, run } = fixture(t)
	let r = run("--write-baseline", "baseline.json", "--json")
	assert.equal(r.status, 0, r.stderr)
	assert.equal(JSON.parse(r.stdout).baseline.written, 3)
	assert.equal(JSON.parse(readFileSync(join(dir, "baseline.json"))).findings.length, 3)
	writeFileSync(join(dir, "input.rs"), `\n\n${source}`)
	r = run("--baseline", "baseline.json", "--json", "--strict")
	assert.equal(r.status, 0, r.stderr)
	assert.equal(JSON.parse(r.stdout).baseline.accepted, 3)
	assert.equal(JSON.parse(r.stdout).findings.length, 0)
	writeFileSync(join(dir, "input.rs"), source.replace("Implicit,", "Implicit, Added,"))
	r = run("--baseline", "baseline.json", "--strict", "--json")
	assert.equal(r.status, 1)
	assert.deepEqual(JSON.parse(r.stdout).findings.map((f) => f.identity[3]), ["Added"])
	writeFileSync(join(dir, "input.rs"), source.replace("Y = 100", "Y = 101"))
	r = run("--baseline", "baseline.json", "--json")
	assert.equal(r.status, 1) // the remaining collision changed identity
	assert.equal(JSON.parse(r.stdout).baseline.stale.length, 2) // duplicate and changed collision
})

test("changed error is not suppressed and strict only affects new warnings", (t) => {
	const { dir, run } = fixture(t)
	assert.equal(run("--write-baseline", "b.json").status, 0)
	writeFileSync(join(dir, "input.rs"), source.replaceAll("= 100", "= 101"))
	const r = run("--baseline", "b.json", "--json")
	assert.equal(r.status, 1)
	const report = JSON.parse(r.stdout)
	assert.equal(report.findings.some((f) => f.rule === "range-overlap"), false)
	// Add a distinct duplicate error in the existing enum.
	writeFileSync(join(dir, "input.rs"), source.replace("Implicit,", "Another = 100, Implicit,"))
	assert.equal(run("--baseline", "b.json").status, 1)
})

test("malformed, duplicate, ambiguous and conflicting baselines fail closed", (t) => {
	const { dir, run } = fixture(t)
	assert.equal(run("--baseline").status, 2)
	assert.equal(run("--write-baseline").status, 2)
	assert.equal(run("--baseline", "a", "--write-baseline", "b").status, 2)
	for (const invalid of ["not json", JSON.stringify({version: 2, findings: []}), JSON.stringify({version: 1, findings: [["not-a-rule", "x", "y"]]}), JSON.stringify({version: 1, findings: [["implicit-discriminant", "f", "E"], ["implicit-discriminant", "f", "E"]]})]) {
		writeFileSync(join(dir, "bad.json"), invalid)
		assert.equal(run("--baseline", "bad.json").status, 2)
	}
	writeFileSync(join(dir, "input.rs"), `#[contracterror] enum A { X, }\n#[contracterror] enum A { X, }`)
	assert.equal(run("--write-baseline", "ambiguous.json").status, 2)
})

test("baseline files cannot be overwritten, including via aliases and hard links", (t) => {
	const { dir, run } = fixture(t)
	assert.equal(run("--write-baseline", "b.json").status, 0)
	const original = readFileSync(join(dir, "b.json"), "utf8")
	assert.equal(run("--write-baseline", "b.json").status, 2)
	assert.equal(run("--baseline", "b.json", "--out", "./b.json").status, 2)
	linkSync(join(dir, "b.json"), join(dir, "alias.json"))
	assert.equal(run("--baseline", "b.json", "--out", "alias.json").status, 2)
	assert.equal(readFileSync(join(dir, "b.json"), "utf8"), original)
	assert.equal(run("--write-baseline", "new.json", "--out", "./new.json").status, 2)
	symlinkSync(dir, join(dir, "alias-dir"), "dir")
	assert.equal(run("--write-baseline", "new.json", "--out", "alias-dir/new.json").status, 2)
})

test("output formats and ignore config apply consistently", (t) => {
	const { dir, run } = fixture(t)
	writeFileSync(join(dir, "config.json"), JSON.stringify({ignore: ["implicit-discriminant"]}))
	assert.equal(run("--config", "config.json", "--write-baseline", "b.json").status, 0)
	const r = run("--config", "config.json", "--baseline", "b.json", "--markdown", "--out", "report.md")
	assert.equal(r.status, 0, r.stderr)
	assert.match(readFileSync(join(dir, "report.md"), "utf8"), /Baseline: 2 accepted, 0 stale/)
	assert.equal(run("--baseline", "b.json", "--strict").status, 1)
})

test("collision identity does not depend on enum order or line number", () => {
	const a = parseContractErrors(source, "contract.rs")
	const first = analyze(a)
	const baseline = createBaseline(first)
	const reversed = analyze([...a].reverse().map((e) => ({...e, line: e.line + 10})))
	assert.equal(compareBaseline(reversed, baseline).findings.length, 0)
})


test("baseline tracks resolved constants in qualified enums without hiding changed collisions", (t) => {
	const { dir, run } = fixture(t)
	const input = "const BASE: u32 = 100;\n#[soroban_sdk::contracterror]\nenum A { X = BASE, Y = BASE }"
	writeFileSync(join(dir, "input.rs"), input)
	assert.equal(run("--write-baseline", "b.json").status, 0)
	assert.equal(run("--baseline", "b.json", "--strict").status, 0)
	writeFileSync(join(dir, "input.rs"), input.replace("BASE: u32 = 100", "BASE: u32 = 101"))
	const r = run("--baseline", "b.json", "--json")
	assert.equal(r.status, 1)
	assert.equal(JSON.parse(r.stdout).findings[0].rule, "duplicate-discriminant")
	assert.equal(JSON.parse(r.stdout).baseline.stale.length, 1)
})
