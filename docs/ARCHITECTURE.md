# Architecture

Codepact has four small layers. Each one can be tested without a Rust toolchain
and without network access.

## 1. Source cleanup

`src/comments.js` blanks comments, string literals, raw strings and character
literals while preserving offsets. Blanking rather than deleting keeps line
numbers stable, so every later finding points at the original source.

## 2. Parsing

`src/parse.js` scans the cleaned text for `#[contracterror]` attributes and the
enum declaration that follows each one. It reads variants, explicit
discriminants, implicit discriminants and same-scope `const` expressions.

The parser is lexical by design. It does not build an AST and it does not need a
valid crate. That is what lets it run on a workspace that currently does not
compile.

## 3. Rules

`src/analyze.js` receives parsed enums and an optional config. It emits findings
with:

- `rule`: a stable id
- `severity`: `error` or `warning`
- `file` and `line`
- `identity`: a line-independent key used by baselines
- `message`: a human readable explanation

Rules do not read files or write output. They are pure functions over data.

## 4. Output

`src/report.js` formats the registry and findings as text or Markdown.
`src/baseline.js` creates and compares reviewed baselines. `bin/codepact.js`
owns argument parsing, filesystem access and exit codes.

`src/config.js` validates configuration at the command boundary. The analyzer
itself remains tolerant of a partial object so library callers can build one in
memory.

## Invariants

- A finding identity never contains a line number.
- A clean scan with unresolved variants says so.
- A baseline write refuses to overwrite an existing file.
- A configuration error is exit code `2`, not a finding.
- The tool has no runtime dependencies.

## Testing

`node --test` runs the suites without an install step. Fixtures live in
`examples/` and temporary directories are created per test. Tests that need
symbolic links skip the link-specific assertion when the operating system denies
link creation, so the suite runs on Windows as well as Linux and macOS.
