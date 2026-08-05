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
   `test/parse.test.js`, rule changes in `test/analyze.test.js`.
3. **No runtime dependencies.** The tool has to run inside a contract CI job
   with nothing installed. Dev-only tooling is discussed in an issue first.
4. **Keep findings actionable.** A message should say what is wrong, where, and
   why it matters to a caller. Compare the existing messages before writing a
   new one.
5. **New rules need a stable id** added to `RULES` in `src/analyze.js`, so a
   project can silence one rule without silencing the tool.

## Before you open a pull request

```bash
npm test
npm run check:clean    # must exit 0
npm run check:broken   # must exit non-zero
```

CI runs the same three commands on Node 20 and 22.

## Pull request description

Keep it short and factual:

- **What** the change does
- **Why** it is needed, ideally with a real contract that hits the problem
- **Scope** - what you deliberately did not touch
- `Closes #N`

## Good first contributions

Issues labelled `good first issue` are parser gaps with a clear expected
behaviour and an obvious place to add a test. Picking one up needs no prior
knowledge of the codebase beyond `src/parse.js`.

## Reporting a false positive

A false positive is a bug and is treated as one. Open an issue with the
smallest Rust snippet that reproduces it and the output you got.
