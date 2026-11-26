/** Stable, conservative baselines for explicitly accepted findings. */
import { RULES } from "./analyze.js"

const knownRules = new Set(RULES.map((rule) => rule.id))

function encoded(identity) { return JSON.stringify(identity) }

function validateIdentity(identity) {
	if (!Array.isArray(identity) || identity.length < 3 ||
		identity.some((part) => typeof part !== "string" || part.length === 0) ||
		!knownRules.has(identity[0])) {
		throw new Error("Invalid baseline finding identity")
	}
}

function uniqueFindings(findings) {
	const keys = new Set()
	for (const finding of findings) {
		validateIdentity(finding.identity)
		const key = encoded(finding.identity)
		if (keys.has(key)) throw new Error("Ambiguous duplicate finding identity; baseline cannot safely distinguish findings")
		keys.add(key)
	}
	return keys
}

export function createBaseline(findings) {
	const keys = uniqueFindings(findings)
	return { version: 1, findings: [...keys].sort().map((key) => JSON.parse(key)) }
}

export function compareBaseline(findings, baseline) {
	if (!baseline || typeof baseline !== "object" || Array.isArray(baseline) || baseline.version !== 1 || !Array.isArray(baseline.findings) || Object.keys(baseline).some((key) => key !== "version" && key !== "findings")) {
		throw new Error("Invalid baseline: expected version 1 and a findings array")
	}
	const accepted = new Set()
	for (const identity of baseline.findings) {
		validateIdentity(identity)
		const key = encoded(identity)
		if (accepted.has(key)) throw new Error("Invalid baseline: duplicate finding identity")
		accepted.add(key)
	}
	const current = uniqueFindings(findings)
	return {
		findings: findings.filter((finding) => !accepted.has(encoded(finding.identity))),
		accepted: [...current].filter((key) => accepted.has(key)).length,
		stale: [...accepted].filter((key) => !current.has(key)).sort().map((key) => JSON.parse(key)),
	}
}
