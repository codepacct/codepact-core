#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync, realpathSync } from "node:fs"
import { join, relative, resolve, dirname, basename } from "node:path"

import { parseContractErrors } from "../src/parse.js"
import { analyze, summarize } from "../src/analyze.js"
import { toText, toMarkdown, toGithubAnnotations } from "../src/report.js"
import { createBaseline, compareBaseline } from "../src/baseline.js"
import { loadConfig } from "../src/config.js"

const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "target", "dist", "build"])
const VALID_FORMATS = new Set(["text", "json", "markdown", "github"])
const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version

const USAGE = `codepact [options] [paths...]

Checks that a Soroban workspace keeps its error-code contract. Scans Rust
sources for #[contracterror] enums and reports duplicate discriminants,
cross-contract code collisions and overlapping code ranges.

Options:
  --json             Emit machine readable JSON instead of text.
  --markdown         Emit a Markdown registry table instead of text.
  --format <name>    Output format: text, json, markdown, or github.
  --out <file>       Write the report to a file instead of stdout.
  --config <file>    JSON config with "ranges" and/or "ignore" keys.
  --strict           Treat warnings as failures.
  --write-baseline <file>  Record current findings as accepted.
  --baseline <file>  Report and fail only on findings not in the baseline.
  -v, --version      Print the Codepact version and exit.
  -h, --help         Show this message.

Exit codes:
  0  no errors (and no warnings when --strict is set)
  1  at least one finding failed the run
  2  the tool could not run (bad arguments, unreadable file)
`

function validateFormat(value) {
	if (!VALID_FORMATS.has(value)) {
		throw new Error(`Unknown format: ${value} (expected text, json, markdown, or github)`)
	}
	return value
}

function parseArguments(argv) {
	const options = {
		paths: [],
		json: false,
		markdown: false,
		format: null,
		out: null,
		config: null,
		strict: false,
		baseline: null,
		writeBaseline: null,
		version: false,
		help: false,
	}

	for (let i = 0; i < argv.length; i++) {
		const argument = argv[i]
		switch (argument) {
			case "-h":
			case "--help":
				options.help = true
				break
			case "-v":
			case "--version":
				options.version = true
				break
			case "--json":
				options.json = true
				break
			case "--markdown":
				options.markdown = true
				break
			case "--format": {
				const value = argv[++i]
				if (!value || value.startsWith("-")) throw new Error("--format requires a format name")
				options.format = validateFormat(value)
				break
			}
			case "--strict":
				options.strict = true
				break
			case "--baseline":
				options.baseline = argv[++i]
				if (!options.baseline || options.baseline.startsWith("-")) throw new Error("--baseline requires a file path")
				break
			case "--write-baseline":
				options.writeBaseline = argv[++i]
				if (!options.writeBaseline || options.writeBaseline.startsWith("-")) throw new Error("--write-baseline requires a file path")
				break
			case "--out":
				options.out = argv[++i]
				if (!options.out) throw new Error("--out requires a file path")
				break
			case "--config":
				options.config = argv[++i]
				if (!options.config) throw new Error("--config requires a file path")
				break
			default:
				if (argument.startsWith("--format=")) {
					const value = argument.slice("--format=".length)
					if (!value) throw new Error("--format requires a format name")
					options.format = validateFormat(value)
					break
				}
				if (argument.startsWith("-")) throw new Error(`Unknown option: ${argument}`)
				options.paths.push(argument)
		}
	}

	if (options.baseline && options.writeBaseline) throw new Error("--baseline and --write-baseline cannot be combined")
	if (options.out && (options.writeBaseline || options.baseline)) {
		const baselineFile = options.writeBaseline || options.baseline
		let same = resolve(options.out) === resolve(baselineFile)
		try {
			const canonical = (path) => join(realpathSync(dirname(resolve(path))), basename(path))
			same ||= canonical(options.out) === canonical(baselineFile)
			const a = statSync(options.out)
			const b = statSync(baselineFile)
			same ||= a.dev === b.dev && a.ino === b.ino
		} catch (error) {
			if (error.code !== "ENOENT") throw error
		}
		if (same) throw new Error("--out and the baseline must use different files")
	}
	if (options.json && options.markdown) {
		throw new Error("--json and --markdown cannot be combined")
	}
	if (options.format && (options.json || options.markdown)) {
		throw new Error("--format cannot be combined with --json or --markdown")
	}
	if (options.paths.length === 0) options.paths.push(".")

	return options
}

function collectRustFiles(root) {
	const found = []
	const stack = [root]

	while (stack.length > 0) {
		const current = stack.pop()
		const stats = statSync(current)

		if (stats.isDirectory()) {
			for (const entry of readdirSync(current)) {
				if (SKIPPED_DIRECTORIES.has(entry)) continue
				stack.push(join(current, entry))
			}
			continue
		}

		if (current.endsWith(".rs")) found.push(current)
	}

	return found.sort()
}

function main() {
	const options = parseArguments(process.argv.slice(2))

	if (options.help) {
		process.stdout.write(USAGE)
		return 0
	}

	if (options.version) {
		process.stdout.write(`${VERSION}\n`)
		return 0
	}

	const config = options.config ? loadConfig(options.config) : {}

	// Deduplicate by resolved real path (following symlinks) so overlapping or
	// repeated scan targets never double-count enums or collide with themselves,
	// while keeping the first-seen relative path for display.
	const seenFiles = new Set()
	const enums = []
	for (const path of options.paths) {
		for (const file of collectRustFiles(path)) {
			const canonical = realpathSync(file)
			if (seenFiles.has(canonical)) continue
			seenFiles.add(canonical)
			const source = readFileSync(file, "utf8")
			enums.push(...parseContractErrors(source, relative(process.cwd(), file) || file))
		}
	}

	let findings = analyze(enums, config)
	let baselineStatus = null
	if (options.writeBaseline) {
		const baseline = createBaseline(findings)
		writeFileSync(options.writeBaseline, JSON.stringify(baseline, null, 2) + "\n", { flag: "wx" })
		baselineStatus = { written: baseline.findings.length, accepted: 0, stale: [] }
	} else if (options.baseline) {
		const result = compareBaseline(findings, JSON.parse(readFileSync(options.baseline, "utf8")))
		findings = result.findings
		baselineStatus = { accepted: result.accepted, stale: result.stale }
	}

	const format = options.format ?? (options.json ? "json" : options.markdown ? "markdown" : null)
	const emitGithub = format === "github" || (format === null && process.env.GITHUB_ACTIONS === "true")

	let output
	if (format === "json") output = JSON.stringify({ enums, findings, ...(baselineStatus ? { baseline: baselineStatus } : {}) }, null, 2)
	else {
		output = format === "markdown" ? toMarkdown(enums, findings) : toText(enums, findings)
		if (baselineStatus) {
			const message = `Baseline: ${baselineStatus.accepted} accepted, ${baselineStatus.stale.length} stale` +
				(baselineStatus.written === undefined ? "." : `; ${baselineStatus.written} recorded.`)
			output += `\n\n${message}`
			for (const identity of baselineStatus.stale) output += `\nStale: ${JSON.stringify(identity)}`
		}
	}

	const annotations = emitGithub && findings.length > 0 ? toGithubAnnotations(findings) : ""
	if (options.out) {
		writeFileSync(options.out, `${output}\n`)
		if (annotations) process.stdout.write(`${annotations}\n`)
	} else {
		const rendered = annotations ? `${output}\n\n${annotations}` : output
		process.stdout.write(`${rendered}\n`)
	}

	const counts = summarize(findings)
	const failed = counts.errors > 0 || (options.strict && counts.warnings > 0)
	return !options.writeBaseline && failed ? 1 : 0
}

try {
	process.exit(main())
} catch (error) {
	process.stderr.write(`codepact: ${error.message}\n`)
	process.exit(2)
}
