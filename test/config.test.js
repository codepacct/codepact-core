import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { KNOWN_RULES, loadConfig, validateConfig } from "../src/config.js"

test("accepts an empty configuration", () => {
	assert.deepEqual(validateConfig({}), [])
})

test("accepts ranges, ignore and a schema reference", () => {
	const errors = validateConfig({
		$schema: "https://example.test/schema.json",
		ranges: { TokenError: [100, 199], RouterError: [200, 299] },
		ignore: ["implicit-discriminant"],
	})
	assert.deepEqual(errors, [])
})

test("rejects an unknown top-level key", () => {
	const errors = validateConfig({ range: {} })
	assert.equal(errors.length, 1)
	assert.match(errors[0], /Unknown top-level key "range"/)
})

test("rejects an unknown rule id", () => {
	const errors = validateConfig({ ignore: ["not-a-rule"] })
	assert.equal(errors.length, 1)
	assert.match(errors[0], /not a known rule id/)
	assert.match(errors[0], new RegExp(KNOWN_RULES[0]))
})

test("rejects duplicate rule ids", () => {
	const errors = validateConfig({ ignore: ["range-overlap", "range-overlap"] })
	assert.equal(errors.length, 1)
	assert.match(errors[0], /more than once/)
})

test("rejects malformed and inverted ranges", () => {
	assert.match(validateConfig({ ranges: { A: [1] } })[0], /two element array/)
	assert.match(validateConfig({ ranges: { A: [10, 1] } })[0], /inverted/)
	assert.match(validateConfig({ ranges: { A: [-1, 10] } })[0], /u32/)
	assert.match(validateConfig({ ranges: { A: [1.5, 10] } })[0], /integers/)
})

test("loads a valid file", () => {
	const dir = mkdtempSync(join(tmpdir(), "codepact-load-"))
	try {
		const file = join(dir, "codepact.config.json")
		writeFileSync(file, JSON.stringify({ ranges: { TokenError: [100, 199] } }))
		assert.deepEqual(loadConfig(file), { ranges: { TokenError: [100, 199] } })
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
})

test("reports the file name for missing and malformed files", () => {
	const dir = mkdtempSync(join(tmpdir(), "codepact-load-"))
	try {
		const missing = join(dir, "missing.json")
		assert.throws(() => loadConfig(missing), /Could not read config ".*missing\.json"/)

		const malformed = join(dir, "malformed.json")
		writeFileSync(malformed, "{")
		assert.throws(() => loadConfig(malformed), /Could not parse config ".*malformed\.json"/)

		const invalid = join(dir, "invalid.json")
		writeFileSync(invalid, JSON.stringify({ ignore: ["nope"] }))
		assert.throws(() => loadConfig(invalid), /Invalid config ".*invalid\.json"/)
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
})
