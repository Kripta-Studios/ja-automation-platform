#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
// Conservative source audit: an absent literal is a review candidate, never proof of a UI leak.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const domains = path.join(root, 'packages/database/src/domains');
const portal = path.join(root, 'apps/portal/src');
const errorTypes = new Set([
  'ConflictError',
  'ValidationError',
  'AccessDeniedError',
  'V3ConflictError',
  'V3ValidationError',
  'V3AccessDeniedError',
]);

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.isFile() && /\.(?:ts|svelte)$/u.test(entry.name) ? [full] : [];
  });
}

const portalText = sourceFiles(portal)
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');
const rows = [];
for (const file of sourceFiles(domains).filter((item) => item.endsWith('.ts'))) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  function visit(node) {
    if (
      ts.isNewExpression(node) &&
      errorTypes.has(node.expression.getText(source)) &&
      node.arguments?.length &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      const message = node.arguments[0].text;
      const position = source.getLineAndCharacterOfPosition(node.getStart(source));
      rows.push({
        file: path.relative(root, file),
        line: position.line + 1,
        type: node.expression.getText(source),
        message,
        portalLiteralPresent: portalText.includes(message),
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

const grouped = new Map();
for (const row of rows) {
  const key = `${row.type}\0${row.message}`;
  const previous = grouped.get(key);
  if (previous) previous.occurrences.push(`${row.file}:${row.line}`);
  else
    grouped.set(key, {
      type: row.type,
      message: row.message,
      portalLiteralPresent: row.portalLiteralPresent,
      occurrences: [`${row.file}:${row.line}`],
    });
}
const candidates = [...grouped.values()]
  .filter((row) => !row.portalLiteralPresent)
  .sort((a, b) => a.occurrences[0].localeCompare(b.occurrences[0]));
const report = {
  note: 'Absent exact literals require mapper review. Regex, error-code, and delegated paths can still map them.',
  literalThrowOccurrences: rows.length,
  distinctLiteralErrors: grouped.size,
  absentExactPortalLiterals: candidates.length,
  candidates,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
