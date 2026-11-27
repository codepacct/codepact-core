# Roadmap

The roadmap is a sequence of small, independently reviewable milestones. Each
item should be usable on its own before the next one starts.

## 0.2.0: a dependable command line

- [x] Validate configuration at the command boundary
- [x] Add `--version` and `-v`
- [ ] Add end-to-end tests for every output format and exit code
- [ ] Publish a packed tarball test that installs from a clean directory
- [ ] Add a documented ESM import test outside the repository

## 0.3.0: adoption on real workspaces

- [x] Reviewed baselines
- [ ] Report stale baseline entries in JSON with a stable schema
- [ ] Add a `--check-config` mode that compares a config with the enums found
- [ ] Document a migration example for a multi-contract workspace
- [ ] Add a generated registry example under `examples/`

## 0.4.0: integrations

- [ ] Stable `v1` Action tag
- [ ] SARIF output for code scanning
- [ ] GitHub annotation output from the core CLI
- [ ] A shared finding format with Soroban Forge

## Later

- Support `#[contracterror]` enums behind `cfg` attributes with explicit
  duplicate handling
- Compare two registries and report semantic changes between releases
- Provide a machine readable schema for baseline files
