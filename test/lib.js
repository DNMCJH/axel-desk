'use strict';

/** Minimal assertion helpers shared by all suites. */

let passed = 0;
let failed = 0;
const failures = [];
let suite = '';

function group(name) {
  suite = name;
  console.log(`\n${name}`);
}

function ok(condition, label) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(`${suite} › ${label}`);
    console.log(`  FAIL  ${label}`);
  }
  return Boolean(condition);
}

function eq(actual, expected, label) {
  const same = actual === expected;
  if (!same) {
    failed += 1;
    failures.push(`${suite} › ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    console.log(`  FAIL  ${label}\n        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`);
    return false;
  }
  passed += 1;
  return true;
}

function deep(actual, expected, label) {
  return eq(JSON.stringify(actual), JSON.stringify(expected), label);
}

function report(name) {
  console.log(`\n${'-'.repeat(52)}`);
  console.log(`${name}: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((line) => console.log(`  · ${line}`));
  }
  return failed === 0;
}

function counts() { return { passed, failed }; }

module.exports = { group, ok, eq, deep, report, counts };
