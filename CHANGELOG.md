# Changelog

All notable changes to this project are documented here. The format follows
Keep a Changelog, and the project uses semantic versioning once a package is
published.

## [Unreleased]

### Added

- `--version` and `-v` print the package version and exit without scanning.
- Configuration validation with file-named errors for unknown keys, unknown
  rule ids, duplicate ignores, malformed ranges and inverted blocks.
- `docs/RULES.md`, `docs/CONFIG.md` and `docs/ARCHITECTURE.md`.
- Repository governance files, issue templates and pull request template.
- Windows-friendly test paths and link assertions.

### Changed

- The CLI loads configuration through `src/config.js` instead of parsing it
  inline.

### Fixed

- Tests that used a URL pathname no longer fail on Windows paths with spaces.
- Symbolic link and hard link assertions skip when the operating system denies
  link creation.

## [0.1.0] - 2026-08-05

### Added

- Lexical parser for `#[contracterror]` enums, including qualified attributes.
- Rules for duplicate discriminants, code collisions, range overlap, implicit
  discriminants and range violations.
- Same-scope constant resolution for simple discriminant expressions.
- Text, JSON and Markdown output.
- Reviewed baseline creation and comparison.
- GitHub Action integration in the companion repository.
- MIT license.
