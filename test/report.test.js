import test from "node:test"
import assert from "node:assert/strict"

import { toMarkdown } from "../src/report.js"

function countUnescapedPipes(line) {
	let count = 0
	for (let i = 0; i < line.length; i++) {
		if (line[i] === "\\") {
			i++
			continue
		}
		if (line[i] === "|") count++
	}
	return count
}

test("toMarkdown preserves ordinary sorting and structure", () => {
	const enums = [
		{
			name: "RouterError",
			file: "contracts/router.rs",
			line: 1,
			variants: [
				{ name: "Later", value: 200, line: 4 },
				{ name: "Implicit", value: null, line: 5 },
				{ name: "Earlier", value: 100, line: 3 },
			],
		},
	]
	const output = toMarkdown(enums, [])
	const lines = output.split("\n")

	assert.equal(lines[2], "| Code | Enum | Variant | Source |")
	assert.equal(lines[4], "| 100 | `RouterError` | `Earlier` | contracts/router.rs:3 |")
	assert.equal(lines[5], "| 200 | `RouterError` | `Later` | contracts/router.rs:4 |")
	assert.equal(lines[6], "| _implicit_ | `RouterError` | `Implicit` | contracts/router.rs:5 |")
	assert.equal(lines[10], "No issues found.")
})

test("toMarkdown escapes pipes, backslashes, and line breaks in registry and finding rows", () => {
	const enums = [
		{
			name: "WeirdError",
			file: "contracts\\dir|v1\nerr\r\npath\\",
			line: 2,
			variants: [{ name: "Bad", value: 42, line: 3 }],
		},
	]
	const findings = [
		{
			rule: "code-collision",
			severity: "error",
			file: "contracts\\dir|v1\nerr\\",
			line: 2,
			message: "Line 1\nLine 2 | C:\\path\\",
		},
	]

	const output = toMarkdown(enums, findings)
	const lines = output.split("\n")

	// Registry header + separator + 1 data row, blank, ## Findings, blank, header + separator + 1 finding row
	assert.equal(lines.length, 11)

	const registryRow = lines[4]
	assert.equal(countUnescapedPipes(registryRow), 5)
	assert.equal(
		registryRow,
		"| 42 | `WeirdError` | `Bad` | contracts\\\\dir\\|v1 err path\\\\:3 |",
	)

	const findingRow = lines[10]
	assert.equal(countUnescapedPipes(findingRow), 5)
	assert.equal(
		findingRow,
		"| error | `code-collision` | contracts\\\\dir\\|v1 err\\\\:2 | Line 1 Line 2 \\| C:\\\\path\\\\ |",
	)
})
