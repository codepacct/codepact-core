# Contributing to Codepact

Thanks for taking the time. This project is small, dependency-free and easy to
work on: if you have Node.js 20 you already have everything you need.

## Getting set up

```bash
git clone https://github.com/codepacct/codepact-core.git
cd codepact-core
npm test
```

There is no install step. Tests use the built-in `node:test` runner.

## The rules of the repo

1. **Every change lands through a pull request**, including the maintainer's
   own. Nothing is pushed straight to `main`.
2. **Every behaviour change needs a test.** Parser changes go in
   `test/parse.test.js`, rule changes in `test/analyze.test.js`, configuration
   changes in `test/config.test.js`, and CLI changes in `test/cli.test.js`.
3. **No runtime dependencies.** The tool has to run inside a contract CI job
   with nothing installed. Dev-only tooling is discussed in an issue first.
4. **Keep findings actionable.** A message should say what is wrong, where, and
   why it matters to a caller. Compare the existing messages before writing a
   new one.
5. **New rules need a stable id** added to `RULES` in `src/analyze.js`, so a
   project can silence one rule without silencing the tool.
6. **One concern per pull request.** If a change needs a new rule and a new
   output format, split it.

## Before you open a pull request

```bash
npm test
npm run check:clean    # must exit 0
npm run check:broken   # must exit non-zero
```

CI runs the same commands on Node 20 and 22.

## Picking an issue

Issues labelled `good first issue` are bounded changes with an obvious place to
add a test. Issues labelled `help wanted` are larger or need design discussion.
Comment on the issue before starting so work is not duplicated.

Every issue includes:

- context for why the change matters
- the files or modules involved
- acceptance criteria
- a verification command
- an estimated complexity

## Pull request description

Keep it short and factual:

- **What** the change does
- **Why** it is needed, ideally with a real contract that hits the problem
- **Scope** - what you deliberately did not touch
- `Closes #N`

## Reporting a false positive

A false positive is a bug and is treated as one. Open an issue with the
smallest Rust snippet that reproduces it and the output you got.

## Code of conduct

Participation is covered by [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
