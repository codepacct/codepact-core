/**
 * Loading and validation for codepact.config.json.
 *
 * The analyzer can run with a partial configuration, but a typo in a rule name
 * or a malformed range should never pass silently. This module keeps those
 * failures at the command boundary, where the file name can be reported.
 */

import { readFileSync } from "node:fs"

import { RULES } from "./analyze.js"

export const KNOWN_RULES = RULES.map((rule) => rule.id)
export const MAX_CODE = 0xffffffff

const ALLOWED_KEYS = new Set(["$schema", "ranges", "ignore"])

/**
 * Validate a parsed configuration object.
 *
 * @param {unknown} value
 * @returns {string[]} Human readable validation errors. Empty means valid.
 */
export function validateConfig(value) {
	const errors = []

	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return ["The configuration must be a JSON object."]
	}

	for (const key of Object.keys(value)) {
		if (!ALLOWED_KEYS.has(key)) {
			errors.push(`Unknown top-level key "${key}". Allowed keys are $schema, ranges and ignore.`)
		}
	}

	if (value.$schema !== undefined && typeof value.$schema !== "string") {
		errors.push('"$schema" must be a string.')
	}

	if (value.ignore !== undefined) {
		errors.push(...validateIgnore(value.ignore))
	}

	if (value.ranges !== undefined) {
		errors.push(...validateRanges(value.ranges))
	}

	return errors
}

function validateIgnore(ignore) {
	if (!Array.isArray(ignore)) return ['"ignore" must be an array of rule ids.']

	const errors = []
	const seen = new Set()

	for (const entry of ignore) {
		if (typeof entry !== "string") {
			errors.push('Every entry of "ignore" must be a rule id string.')
			continue
		}
		if (!KNOWN_RULES.includes(entry)) {
			errors.push(`"${entry}" is not a known rule id. Known ids: ${KNOWN_RULES.join(", ")}.`)
			continue
		}
		if (seen.has(entry)) errors.push(`"${entry}" is listed more than once in "ignore".`)
		seen.add(entry)
	}

	return errors
}

function validateRanges(ranges) {
	if (ranges === null || typeof ranges !== "object" || Array.isArray(ranges)) {
		return ['"ranges" must be an object mapping enum names to [low, high] blocks.']
	}

	const errors = []

	for (const [name, block] of Object.entries(ranges)) {
		if (name.trim() === "") {
			errors.push('Every key in "ranges" must be a non-empty enum name.')
			continue
		}
		if (!Array.isArray(block) || block.length !== 2) {
			errors.push(`"${name}" must be a two element array of the form [low, high].`)
			continue
		}
		const [low, high] = block
		if (!Number.isInteger(low) || !Number.isInteger(high)) {
			errors.push(`"${name}" bounds must be integers.`)
			continue
		}
		if (low < 0 || high < 0 || low > MAX_CODE || high > MAX_CODE) {
			errors.push(`"${name}" bounds must fit in a u32.`)
			continue
		}
		if (low > high) {
			errors.push(`"${name}" declares ${low}-${high}, which is inverted. Use [low, high].`)
		}
	}

	return errors
}

/**
 * Read, parse and validate a configuration file.
 *
 * @param {string} file
 * @param {typeof readFileSync} [read]
 * @returns {{$schema?: string, ranges?: Record<string, [number, number]>, ignore?: string[]}}
 */
export function loadConfig(file, read = readFileSync) {
	let text
	try {
		text = read(file, "utf8")
	} catch (error) {
		throw new Error(`Could not read config "${file}": ${error.message}`)
	}

	let parsed
	try {
		parsed = JSON.parse(text)
	} catch (error) {
		throw new Error(`Could not parse config "${file}" as JSON: ${error.message}`)
	}

	const errors = validateConfig(parsed)
	if (errors.length > 0) {
		throw new Error(`Invalid config "${file}":\n  - ${errors.join("\n  - ")}`)
	}

	return parsed
}
