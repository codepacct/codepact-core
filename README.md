<p align="center">
  <img src="assets/codepact-banner.svg" alt="Codepact" width="860">
</p>

<p align="center">
  <em>A deployed contract only ever hands a caller a number. Codepact makes sure that number means one thing.</em>
</p>

<p align="center">
  <a href="https://github.com/codepacct/codepact-core/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/codepacct/codepact-core/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="Node 20 or newer" src="https://img.shields.io/badge/node-%3E%3D20-brightgreen">
</p>

# Codepact Core

**Codepact** is the error-code contract between a Soroban workspace and everyone
who calls it. If two contracts in the same protocol both return `300`, or a
variant quietly shifts because someone inserted a line above it, every
integrator downstream is silently broken and nothing in the build says so.

`codepact-core` is the analyzer and library at the centre of Codepact. It reads
the `#[contracterror]` enums across a workspace, builds one registry of every
numeric code, and fails the build when the workspace breaks its own pact.

## Why this exists

Every rule here comes from a bug that shipped in a real Stellar codebase:

| Rule | Real failure it would have caught |
| --- | --- |
| `duplicate-discriminant` | A contract enum assigning code `54` twice; `rustc` rejects it with E0081, but only after a long build. |
| `code-collision` | A Router and a Factory both defining `300`, so a caller could not tell which contract rejected the call. |
| `range-overlap` | Two enums growing toward each other with no reserved block between them. |
| `implicit-discriminant` | A variant with no explicit code, whose value silently changes when a variant is inserted above it. |
| `range-violation` | A code that escaped the block its contract was allocated. |

The rules are described in detail, with examples and false-positive guidance, in
[`docs/RULES.md`](docs/RULES.md).

## Install

Requires Node.js 20 or newer. There are no runtime dependencies, so it runs in
CI without a Rust toolchain and without a lockfile.

```bash
git clone https://github.com/codepacct/codepact-core.git
cd codepact-core
node bin/codepact.js --help
```

The package is prepared for npm as `@codepact/core`. Until the first registry
release, use the repository directly or pin the GitHub Action.

## Usage

```bash
# Check a workspace
node bin/codepact.js contracts/

# Enforce the code blocks each contract is allowed to use
node bin/codepact.js contracts/ --config codepact.config.json

# Generate a committed registry of every error code
node bin/codepact.js contracts/ --markdown --out docs/ERROR_CODES.md

# Emit GitHub Actions annotations alongside the text report
node bin/codepact.js contracts/ --format=github

# Fail on warnings too
node bin/codepact.js contracts/ --strict

# Print the version
node bin/codepact.js --version
```

In GitHub Actions (`GITHUB_ACTIONS=true`), Codepact automatically emits
`::error` and `::warning` workflow commands alongside the text report unless
`--json`, `--markdown`, or another `--format` is specified.

Exit codes: `0` clean, `1` findings failed the run, `2` the tool could not run.

### Configuration

`codepact.config.json` reserves a numeric block per enum and can silence rules:

```json
{
  "$schema": "https://raw.githubusercontent.com/codepacct/codepact-conventions/main/schema/codepact.config.schema.json",
  "ranges": {
    "TokenError": [100, 199],
    "RouterError": [200, 299],
    "FactoryError": [300, 399]
  },
  "ignore": ["implicit-discriminant"]
}
```

The file is validated before the scan starts. Unknown keys, unknown rule ids,
duplicate ignore entries, inverted ranges and bounds outside `u32` are rejected
with the configuration file name in the error. See
[`docs/CONFIG.md`](docs/CONFIG.md).

## Library API

```js
import { parseContractErrors, analyze, toMarkdown } from "@codepact/core"

const enums = parseContractErrors(source, "contracts/router/src/error.rs")
const findings = analyze(enums, { ranges: { RouterError: [200, 299] } })
console.log(toMarkdown(enums, findings))
```

`createBaseline` and `compareBaseline` are also exported for tools that need to
adopt an existing workspace without hiding new findings.

## What the parser understands

The parser is lexical, not a full Rust front end, so that it can run anywhere.
It recognises `#[contracterror]` and path-qualified attributes such as
`#[soroban_sdk::contracterror]` (including whitespace inside the brackets),
on enums with explicit decimal or hexadecimal
discriminants, implicit discriminants, per-variant attributes such as `#[cfg]`,
and trailing commas. It correctly ignores anything inside comments, string
literals, raw strings and character literals.

The parser resolves same-scope `const NAME: u32 = <literal>;` declarations and
`+` or `-` expressions using those constants and numeric literals. Imported,
ambiguous, or more complex expressions are shown as unresolved and excluded from
collision and range checks, so a clean report does not prove those codes safe.

## Repository layout

```
bin/codepact.js   CLI entry point
src/config.js     configuration loading and validation
src/comments.js   offset-preserving blanking of comments and literals
src/parse.js      #[contracterror] enum parser
src/analyze.js    rules and findings
src/baseline.js   reviewed baseline creation and comparison
src/report.js     text, Markdown, and GitHub Actions reporters
test/             node:test suites, no install required
examples/         a clean workspace and a deliberately broken one
docs/             rules, configuration and architecture notes
assets/           brand mark and banner
```

## Adoption path

Start with `--json` or `--markdown` to see the registry, then reserve blocks in
`codepact.config.json`. For an existing workspace with known findings, record a
reviewed baseline and fail only on new findings:

```bash
node bin/codepact.js contracts/ --config codepact.config.json --write-baseline codepact.baseline.json
node bin/codepact.js contracts/ --config codepact.config.json --baseline codepact.baseline.json --strict
```

A baseline records findings you intentionally accept today. Review the file
before committing it; it is not a fix and must not be used to hide new problems.
Use the same working directory, scan paths, and config in both commands so
finding file paths remain stable.

## Status

Core is at `0.1.0`. The analyzer, baseline support, configuration validation and
Markdown registry are usable today. The next milestones are a published npm
package, a stable `v1` Action tag, and a configuration check that compares a
config against the enums that actually exist.

See [`ROADMAP.md`](ROADMAP.md) and the [open issues](https://github.com/codepacct/codepact-core/issues).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Every change lands through a pull
request, including the maintainer's own. Small, focused issues are labelled
`good first issue` or `help wanted`.

This repository participates in Stellar Wave. Issues added to the program carry
the Wave label, and each issue states its scope, acceptance criteria and
verification command.

## Security

See [`SECURITY.md`](SECURITY.md) for the private reporting process.

## License

MIT
