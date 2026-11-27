# Rules

Codepact reports five rule ids. Each finding carries the rule id, a severity, a
stable identity and a message that names the affected enum and variant.

## `duplicate-discriminant` (error)

Two variants of one enum resolve to the same numeric code.

```rust
#[contracterror]
pub enum RouterError {
    PairNotFound = 300,
    IdenticalAddresses = 300,
}
```

`rustc` reports this as E0081. Codepact reports it before a Rust build starts and
names both variants.

## `code-collision` (error)

Two different error enums define the same code.

```rust
#[contracterror]
pub enum FactoryError {
    NotInitialized = 300,
}

#[contracterror]
pub enum RouterError {
    PairNotFound = 300,
}
```

A caller that only receives the number cannot tell which contract rejected the
call. The fix is an allocation decision: give each contract its own block in
`codepact.config.json`.

## `range-violation` (error)

A variant falls outside the block reserved for its enum.

```json
{
  "ranges": {
    "TokenError": [100, 199]
  }
}
```

A `TokenError` variant with code `250` is reported. This rule only runs when the
enum has a configured block.

## `range-overlap` (warning)

Two enums occupy overlapping spans even when no code currently collides.

```text
TokenError  occupies 100-180
RouterError occupies 170-250
```

The next variant added to either enum is likely to collide. This is a warning
because an overlap can be intentional during a migration; `--strict` turns it
into a failing check.

## `implicit-discriminant` (warning)

A variant has no explicit code, so its value depends on declaration order.

```rust
#[contracterror]
pub enum TokenError {
    NotInitialized = 100,
    Unauthorized,          // 101 today, 102 after an insertion above it
}
```

Give every published variant an explicit code. `--strict` turns this warning into
a failure.

## Unresolved expressions

The parser resolves same-scope `const` declarations and `+` or `-` expressions.
It does not resolve imported constants, macro output, function calls or complex
expressions. Those variants are reported as `_unresolved_` and excluded from
collision and range checks. A clean report does not prove an unresolved code is
safe.

## Suppressing a rule

Add the rule id to `ignore`:

```json
{
  "ignore": ["implicit-discriminant"]
}
```

Suppressing an error rule hides a real collision class. Prefer fixing the
allocation or using a reviewed baseline for known findings.

## Baseline versus ignore

- `ignore` silences a rule everywhere, for every run.
- A baseline accepts specific findings today and still fails on new ones.

Use `ignore` for a rule the project has deliberately decided not to enforce. Use
a baseline when adopting Codepact on an existing workspace.
