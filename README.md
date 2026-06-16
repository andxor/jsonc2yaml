# jsonc2yaml

Convert **JSONC** (JSON with `//` and `/* */` comments) to clean **YAML** — preserving comments as `#` comments.

- Block-style YAML, 2-space indent, minimal key quoting
- `//` line comments and `/* */` block comments are carried over
- `//` inside string values (e.g. URLs) is handled correctly
- Works as a CLI or a library

## Install

```bash
npm install -g jsonc2yaml   # CLI
# or
npm install jsonc2yaml      # library
```

## CLI

```bash
jsonc2yaml config.jsonc                 # YAML to stdout
jsonc2yaml config.jsonc -o config.yaml  # write to a file
cat config.jsonc | jsonc2yaml           # read from stdin
```

## Library

```js
import { jsoncToYaml } from 'jsonc2yaml';
import { readFileSync } from 'node:fs';

const yaml = jsoncToYaml(readFileSync('config.jsonc', 'utf8'));
```

## Notes

- Leading comments become `#` lines above the key; same-line comments stay as trailing `#` comments.
- A standalone comment after the last item in a block is attached as a trailing comment on the container (YAML has no slot for it otherwise).
- Multi-line `/* */` comments used as inline trailers are collapsed to one line.
- The underlying JSONC parser is lenient and recovers from some malformed input, so this is not a strict validator.

## License

ISC
