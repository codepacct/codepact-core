/** Output formats for the registry and its findings. */

import { summarize } from "./analyze.js"

/**
 * Human readable output for a terminal.
 *
 * @param {import("./parse.js").ErrorEnum[]} enums
 * @param {import("./analyze.js").Finding[]} findings
 */
export function toText(enums, findings) {
	const lines = []

	if (enums.length === 0) {
		return "No #[contracterror] enums found."
	}

	for (const declaration of enums) {
		lines.push(`${declaration.name}  (${declaration.file}:${declaration.line})`)
		for (const variant of declaration.variants) {
			const code = variant.value === null ? (variant.valueState === "unresolved" ? "unresolved" : "implicit") : String(variant.value)
			lines.push(`  ${code.padStart(8)}  ${variant.name}`)
		}
		lines.push("")
	}

	const unresolved = enums.flatMap((declaration) => declaration.variants).filter((variant) => variant.valueState === "unresolved").length
	if (unresolved > 0) lines.push(`${unresolved} explicit discriminant(s) could not be resolved and were not checked.`, "")

	for (const finding of findings) {
		lines.push(`${finding.severity}: ${finding.file}:${finding.line}  [${finding.rule}]`)
		lines.push(`  ${finding.message}`)
	}

	const counts = summarize(findings)
	lines.push("")
	lines.push(
		`${enums.length} enum(s), ${counts.errors} error(s), ${counts.warnings} warning(s).`,
	)

	return lines.join("\n")
}

/**
 * Escape and normalize a value for safe inclusion inside a Markdown table cell.
 *
 * Line breaks (`\r\n`, `\r`, `\n`) are collapsed to single spaces and
 * backslashes (`\`) and pipes (`|`) are backslash-escaped so unusual file
 * paths or finding messages cannot break table rows or split columns.
 *
 * @param {string} value
 */
function escapeMarkdownCell(value) {
	return String(value)
		.replace(/\r\n|\r|\n/g, " ")
		.replace(/\\/g, "\\\\")
		.replace(/\|/g, "\\|")
}

/**
 * Normalize a value rendered inside backticks within a Markdown table cell.
 *
 * @param {string} value
 */
function escapeMarkdownCodeCell(value) {
	return String(value)
		.replace(/\r\n|\r|\n/g, " ")
		.replace(/\|/g, "\\|")
}

/**
 * Markdown suitable for committing as a generated error-code registry.
 *
 * Table cells collapse line breaks (`\r\n`, `\r`, `\n`) to single spaces and
 * escape backslashes (`\`) and pipes (`|`) without modifying underlying data.
 *
 * @param {import("./parse.js").ErrorEnum[]} enums
 * @param {import("./analyze.js").Finding[]} findings
 */
export function toMarkdown(enums, findings) {
	const lines = ["# Contract error registry", ""]

	if (enums.length === 0) {
		lines.push("No `#[contracterror]` enums found.")
		return lines.join("\n")
	}

	lines.push("| Code | Enum | Variant | Source |")
	lines.push("| ---: | --- | --- | --- |")

	const rows = []
	for (const declaration of enums) {
		for (const variant of declaration.variants) {
			rows.push({
				value: variant.value,
				code: variant.value === null ? (variant.valueState === "unresolved" ? "_unresolved_" : "_implicit_") : String(variant.value),
				enumName: declaration.name,
				variant: variant.name,
				source: `${declaration.file}:${variant.line}`,
			})
		}
	}

	rows.sort((a, b) => {
		if (a.value === null) return 1
		if (b.value === null) return -1
		return a.value - b.value
	})

	for (const row of rows) {
		lines.push(
			`| ${row.code} | \`${escapeMarkdownCodeCell(row.enumName)}\` | \`${escapeMarkdownCodeCell(row.variant)}\` | ${escapeMarkdownCell(row.source)} |`,
		)
	}

	lines.push("")
	const unresolved = enums.flatMap((declaration) => declaration.variants).filter((variant) => variant.valueState === "unresolved").length
	if (unresolved > 0) lines.push(`${unresolved} explicit discriminant(s) could not be resolved and were not checked.`, "")
	lines.push("## Findings")
	lines.push("")

	if (findings.length === 0) {
		lines.push(unresolved > 0 ? "No issues found in resolved codes." : "No issues found.")
	} else {
		lines.push("| Severity | Rule | Location | Detail |")
		lines.push("| --- | --- | --- | --- |")
		for (const finding of findings) {
			lines.push(
				`| ${escapeMarkdownCell(finding.severity)} | \`${escapeMarkdownCodeCell(finding.rule)}\` | ${escapeMarkdownCell(`${finding.file}:${finding.line}`)} | ${escapeMarkdownCell(finding.message)} |`,
			)
		}
	}

	return lines.join("\n")
}
