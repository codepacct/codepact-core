import test from "node:test"
import assert from "node:assert/strict"

import { parseContractErrors } from "../src/parse.js"

test("reads variant names, explicit codes and hexadecimal codes", () => {
	const source = [
		"use soroban_sdk::contracterror;",
		"",
		"#[contracterror]",
		"#[derive(Copy, Clone, Debug, Eq, PartialEq)]",
		"#[repr(u32)]",
		"pub enum LedgerError {",
		"    NotInitialized = 1,",
		"    AlreadyClosed = 0x10,",
		"    Unauthorized,",
		"}",
	].join("\n")

	const [declaration] = parseContractErrors(source, "ledger.rs")

	assert.equal(declaration.name, "LedgerError")
	assert.equal(declaration.file, "ledger.rs")
	assert.equal(declaration.line, 3)
	assert.deepEqual(
		declaration.variants.map((variant) => [variant.name, variant.value, variant.line]),
		[
			["NotInitialized", 1, 7],
			["AlreadyClosed", 16, 8],
			["Unauthorized", null, 9],
		],
	)
})

test("ignores the attribute inside comments", () => {
	const source = [
		"/// Historically this was #[contracterror] but it was removed.",
		"/*",
		" #[contracterror]",
		" pub enum Ghost { A = 1 }",
		"*/",
		"pub struct NotAnError;",
	].join("\n")

	assert.deepEqual(parseContractErrors(source, "ghost.rs"), [])
})

test("ignores the attribute inside string literals", () => {
	const source = [
		'pub const DOC: &str = "see #[contracterror] pub enum Fake { A = 1 }";',
		"",
		"#[contracterror]",
		"pub enum RealError {",
		"    Boom = 7,",
		"}",
	].join("\n")

	const declarations = parseContractErrors(source, "real.rs")

	assert.equal(declarations.length, 1)
	assert.equal(declarations[0].name, "RealError")
})

test("finds several enums in one file", () => {
	const source = [
		"#[contracterror]",
		"pub enum First {",
		"    A = 1,",
		"}",
		"",
		"#[contracterror]",
		"pub enum Second {",
		"    B = 2,",
		"}",
	].join("\n")

	assert.deepEqual(
		parseContractErrors(source, "pair.rs").map((declaration) => declaration.name),
		["First", "Second"],
	)
})

test("skips per-variant attributes", () => {
	const source = [
		"#[contracterror]",
		"pub enum Gated {",
		'    #[cfg(feature = "testutils")]',
		"    OnlyInTests = 900,",
		"    Always = 901,",
		"}",
	].join("\n")

	const [declaration] = parseContractErrors(source, "gated.rs")

	assert.deepEqual(
		declaration.variants.map((variant) => [variant.name, variant.value]),
		[
			["OnlyInTests", 900],
			["Always", 901],
		],
	)
})

test("a trailing comma does not produce an empty variant", () => {
	const withTrailingComma = parseContractErrors(
		["#[contracterror]", "pub enum E {", "    A = 1,", "}"].join("\n"),
	)
	const withoutTrailingComma = parseContractErrors(
		["#[contracterror]", "pub enum E {", "    A = 1", "}"].join("\n"),
	)

	assert.equal(withTrailingComma[0].variants.length, 1)
	assert.equal(withoutTrailingComma[0].variants.length, 1)
})

test("recognizes path-qualified and whitespace-padded contracterror attributes", () => {
	const source = [
		"#[soroban_sdk::contracterror]", "pub enum First { A = 1 }",
		"#[ contracterror ]", "pub enum Second { B = 2 }",
		"#[ ::foo :: bar :: contracterror ]", "pub enum Third { C = 3 }",
		"#[r#type::模块::contracterror]", "pub enum Fourth { D = 4 }",
	].join("\n")
	assert.deepEqual(parseContractErrors(source).map(({ name, line }) => [name, line]), [
		["First", 1], ["Second", 3], ["Third", 5], ["Fourth", 7],
	])
})

test("does not confuse similar attributes or quoted qualified attributes", () => {
	const source = [
		'const DOC: &str = "#[soroban_sdk::contracterror] pub enum Fake { A = 1 }";',
		"// #[other::contracterror]", "#[not_contracterror]", "enum NotAnError { A = 1 }",
		"#[contracterror_extra]", "enum AlsoNotAnError { B = 2 }",
	].join("\n")
	assert.deepEqual(parseContractErrors(source), [])
})

test("bounds a missing enum by the next qualified attribute", () => {
	const source = [
		"#[contracterror]", "struct NotAnEnum;",
		"#[soroban_sdk::contracterror]", "enum Real { A = 1 }",
	].join("\n")
	assert.deepEqual(parseContractErrors(source).map(({ name, line }) => [name, line]), [["Real", 3]])
})
