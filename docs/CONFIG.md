# Configuration

`codepact.config.json` is optional. Without it, Codepact reports duplicate
discriminants, cross-contract collisions, overlapping ranges and implicit
discriminants, but it cannot enforce an allocation block.

## Shape

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

| Key | Required | Description |
| --- | --- | --- |
| `$schema` | no | Editor completion and validation. Must be a string. |
| `ranges` | no | Object mapping an enum name to an inclusive `[low, high]` block. |
| `ignore` | no | Array of rule ids to suppress for every run. |

## Validation

The CLI validates the file before scanning. These are execution errors (exit
code `2`) because a configuration mistake must not look like a clean scan:

- the file cannot be read or parsed as JSON
- the top level is not an object
- an unknown top-level key is present
- `$schema` is not a string
- `ignore` is not an array, contains a non-string, contains an unknown rule id,
  or lists the same rule twice
- `ranges` is not an object
- an enum name is empty
- a block is not a two element array
- a bound is not an integer or does not fit in `u32`
- a block is inverted (`low > high`)

Every message includes the configuration file name and the offending key.

## Allocation guidance

The convention repository describes the rules behind these blocks, including the
reserved `0-99` range and the gap rule. See
[`codepact-conventions`](https://github.com/codepacct/codepact-conventions).

A practical starting point is a block of 100 codes per contract, with a small gap
between blocks so a contract can grow without renumbering a published code.

## Using the config in CI

```yaml
- uses: codepacct/codepact-action@main
  with:
    paths: contracts/
    config: codepact.config.json
    strict: true
```

The Action uses the same validation and reports a malformed config as an error
annotation rather than a silent pass.
