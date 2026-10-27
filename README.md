# Locknar's Inventory Report

A static web version of [d2-inventory-report](https://github.com/devinamar/d2-inventory-report):
log in with Bungie and your Destiny 2 inventory report is built in your browser. Work in progress.

`schema/` (the SQLite tables and views) and `templates/` (the report's Jinja templates, styles and
script) start as copies of d2-inventory-report at commit 0a4abe4. The SQL runs on
[sqlite-wasm](https://sqlite.org/wasm), opened through `src/db.ts`.

## Develop

```bash
npm install
npm test        # vitest
npm run check   # TypeScript
```
