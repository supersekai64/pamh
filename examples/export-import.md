# Export And Import Example

## Export

```bash
pam export backup.zip
pam export backup.json --format json
pam export backup.md --format markdown
pam export memory.sqlite --format sqlite
```

## Import

```bash
pam import backup.json --format json
pam import backup.zip --format zip
pam import memory.md --format markdown
```

## Audit After Import

```bash
pam audit
pam doctor check
```
