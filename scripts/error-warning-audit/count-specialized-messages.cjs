#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

// Read-only source audit. It does not prove that a mapper branch is reachable,
// that a remedy URL is permitted for every role, or that production has this build.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const i18nRoot = path.join(root, 'apps/portal/src/lib/i18n');
const actionRoots = [
  path.join(root, 'apps/portal/src/lib/server/actions'),
  path.join(root, 'apps/portal/src/routes'),
];
const sharedProblemFactories = [path.join(root, 'apps/portal/src/lib/server/supplier-context.ts')];

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : entry.name.endsWith('.ts') ? [file] : [];
  });
}

function literal(node) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : null;
}

function property(object, name, source) {
  return object.properties.find(
    (entry) =>
      ts.isPropertyAssignment(entry) &&
      entry.name.getText(source).replace(/^['"]|['"]$/g, '') === name,
  );
}

function objectMaps(file, names) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const maps = {};
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      names.includes(node.name.getText(source)) &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      const values = {};
      for (const entry of node.initializer.properties) {
        if (!ts.isPropertyAssignment(entry)) continue;
        const key = entry.name.getText(source).replace(/^['"]|['"]$/g, '');
        const value = entry.initializer;
        values[key] = ts.isArrayLiteralExpression(value)
          ? value.elements.map(literal)
          : literal(value);
      }
      maps[node.name.getText(source)] = values;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return maps;
}

const rows = [];
for (const file of [...actionRoots.flatMap(sourceFiles), ...sharedProblemFactories]) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const add = (code, messageKey, node, shape, remedy, fallbackMessage) => {
    if (!code || !messageKey?.startsWith('problem.')) return;
    rows.push({
      code,
      messageKey,
      shape,
      remedy: remedy || null,
      fallbackMessage: fallbackMessage || null,
      source: path.relative(root, file),
      line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    });
  };
  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      add(
        literal(property(node, 'code', source)?.initializer),
        literal(property(node, 'messageKey', source)?.initializer) ||
          literal(property(node, 'key', source)?.initializer),
        node,
        'object',
        literal(property(node, 'remedy', source)?.initializer),
        literal(property(node, 'message', source)?.initializer),
      );
    }
    if (ts.isArrayLiteralExpression(node) && node.elements.length >= 2) {
      const code = literal(node.elements[0]);
      if (code && /^[A-Z0-9_]+$/.test(code)) {
        add(
          code,
          literal(node.elements[1]),
          node,
          'tuple',
          literal(node.elements[3]),
          literal(node.elements[2]),
        );
      }
    }
    if (
      ts.isCallExpression(node) &&
      node.arguments.length >= 2 &&
      ['actionFail', 'actionFailure'].includes(node.expression.getText(source))
    ) {
      const options = node.arguments.find(
        (argument) => ts.isObjectLiteralExpression(argument) && property(argument, 'code', source),
      );
      if (options) {
        add(
          literal(property(options, 'code', source)?.initializer),
          literal(node.arguments[1]),
          node,
          'call',
          null,
          literal(node.arguments[3]),
        );
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

const distinct = [...new Map(rows.map((row) => [`${row.code}|${row.messageKey}`, row])).values()];
const coverage = objectMaps(path.join(i18nRoot, 'coverage-translations.ts'), [
  'exact',
  'extraExact',
  'problemEnglish',
]);
const catalog = objectMaps(path.join(i18nRoot, 'catalog.ts'), ['en', 'es', 'pt']);
const audited = distinct.map((row) => {
  const translated = coverage.exact?.[row.messageKey] || coverage.extraExact?.[row.messageKey];
  const en = coverage.problemEnglish?.[row.messageKey] || catalog.en?.[row.messageKey];
  const es = translated?.[0] || catalog.es?.[row.messageKey];
  const pt = translated?.[1] || catalog.pt?.[row.messageKey];
  return { ...row, en: en || null, es: es || null, pt: pt || null };
});
const byCode = new Map();
for (const row of audited) {
  byCode.set(row.code, [...(byCode.get(row.code) || []), row]);
}
const collisions = [...byCode].filter(([, matches]) => matches.length > 1);
const stateSpecificWithRemedy = audited.filter(
  (row) => row.remedy && !/(?:INVALID|FIELDS|INPUT|REQUEST)/.test(row.code),
);
const unambiguous = stateSpecificWithRemedy.filter((row) => byCode.get(row.code).length === 1);
const nonSupplierUnambiguous = unambiguous.filter(
  (row) => row.messageKey.split('.')[1] !== 'supplier',
);
const summary = {
  sourceOccurrences: rows.length,
  uniqueCodeMessagePairs: audited.length,
  uniqueCodes: byCode.size,
  fullyTranslatedCodeMessagePairs: audited.filter((row) => row.en && row.es && row.pt).length,
  explicitRemedyPairs: audited.filter((row) => row.remedy).length,
  stateSpecificExplicitRemedyPairs: stateSpecificWithRemedy.length,
  unambiguousStateSpecificCodes: unambiguous.length,
  nonSupplierUnambiguousCodes: nonSupplierUnambiguous.length,
  nonSupplierDistinctEnglishText: new Set(nonSupplierUnambiguous.map((row) => row.en)).size,
  codeCollisions: collisions.map(([code, matches]) => ({
    code,
    messageKeys: matches.map((match) => match.messageKey),
  })),
  untranslated: audited
    .filter((row) => !row.en || !row.es || !row.pt)
    .map(({ code, messageKey }) => ({ code, messageKey })),
};

if (process.argv.includes('--rows-json')) {
  process.stdout.write(`${JSON.stringify({ summary, rows: audited }, null, 2)}\n`);
} else {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}
