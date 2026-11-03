#!/usr/bin/env node
// Probe node:sqlite + FTS5 inside Electron's Node (ELECTRON_RUN_AS_NODE=1).
'use strict'

const { DatabaseSync } = require('node:sqlite')

const db = new DatabaseSync(':memory:')
db.exec('CREATE VIRTUAL TABLE docs USING fts5(content)')
db.prepare('INSERT INTO docs(content) VALUES (?)').run('olá mundo')
const row = db.prepare('SELECT count(*) AS n FROM docs WHERE docs MATCH ?').get('olá mundo')
db.close()

const payload = {
  node: process.versions.node,
  electron: process.versions.electron ?? null,
  sqlite: process.versions.sqlite ?? null,
  fts5: Number(row?.n ?? 0),
}

process.stdout.write(`${JSON.stringify(payload)}\n`)
