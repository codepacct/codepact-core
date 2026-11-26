# Support

## Questions and design discussion

Open a GitHub issue with the `question` label. Include the Codepact version
(`node bin/codepact.js --version`), the command you ran, and the smallest source
snippet that reproduces the behaviour.

## Bug reports

Use the bug report issue template. A useful report contains:

- the version
- the command and configuration
- the source snippet or a link to it
- the output you expected and the output you received

## Security reports

Do not open a public issue. Follow [`SECURITY.md`](SECURITY.md).

## Scope

Codepact is a lexical analyzer for `#[contracterror]` enums. It is not a Rust
compiler, a security audit, or a replacement for `cargo test`. Reports about
unsupported Rust syntax are welcome, but the parser is intentionally limited to
the shapes documented in the README.

## Response expectations

Maintainers aim to reply to new issues within three working days. Issues with a
clear reproduction and a failing test are reviewed first.
