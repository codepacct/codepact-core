# Security Policy

## Scope

Codepact is a static analyzer. It reads Rust source files and writes a report.
It makes no network calls, executes no code from the files it reads, and has no
runtime dependencies.

The security-relevant surface is therefore small but real:

- A crafted source file that causes the parser to hang or exhaust memory.
- A crafted config file or path argument that causes a write outside the
  intended output location.
- A **false negative**: a real code collision the analyzer fails to report. Since
  teams gate merges on this tool, a missed collision is treated as a security
  issue, not just a bug.

## Supported versions

The `main` branch is supported. Fixes are released from `main`.

## Reporting

Report privately through GitHub's **Report a vulnerability** button on the
Security tab of this repository. Please include the smallest input that
reproduces the problem.

Expect an acknowledgement within 72 hours and an assessment within 7 days. If a
fix is needed, the report stays private until the fix is on `main`, and you will
be credited in the release notes unless you ask otherwise.

Please do not open a public issue for anything in the list above.
