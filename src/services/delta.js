/**
 * Delta Validation Module
 *
 * Parses spec delta documents and checks the four rules that govern them, and
 * checks the baseline specs they are compared against for the rules of form.
 *
 * A delta groups requirements under ADDED, MODIFIED and REMOVED headings. The
 * rule that carries the weight is the fourth: a MODIFIED requirement replaces
 * the whole block in the target spec, so omitting a scenario the spec still
 * has silently deletes it.
 *
 * @module src/services/delta
 */

/**
 * Recognized delta operations.
 */
export const OPERATIONS = ['ADDED', 'MODIFIED', 'REMOVED'];

/**
 * Heading that opens an operation group.
 */
const OPERATION_HEADING = /^##\s+(ADDED|MODIFIED|REMOVED)\s+Requirements\s*$/;

/**
 * Heading that opens a requirement.
 */
const REQUIREMENT_HEADING = /^###\s+Requirement:\s*(.+?)\s*$/;

/**
 * Heading that opens a scenario, at the level the format mandates.
 */
const SCENARIO_HEADING = /^####\s+Scenario:\s*(.+?)\s*$/;

/**
 * Any heading that names a scenario, whatever its level.
 */
const ANY_SCENARIO_HEADING = /^(#+)\s+Scenario:\s*(.+?)\s*$/;

/**
 * Normative keywords a requirement must carry.
 */
const NORMATIVE = /\b(SHALL|MUST)\b/;

/**
 * Parses a spec or delta document into requirements.
 *
 * @param {string} markdown - Document contents.
 * @returns {Object} Parsed document as { requirements, scenarioHeadings }.
 */
export function parseSpec(markdown) {
  const lines = markdown.split(/\r?\n/);
  const requirements = [];
  const scenarioHeadings = [];

  let operation = null;
  let current = null;

  lines.forEach((line, index) => {
    const operationMatch = OPERATION_HEADING.exec(line);
    if (operationMatch) {
      operation = operationMatch[1];
      current = null;
      return;
    }

    const requirementMatch = REQUIREMENT_HEADING.exec(line);
    if (requirementMatch) {
      current = {
        name: requirementMatch[1],
        operation,
        line: index + 1,
        body: [],
        scenarios: []
      };
      requirements.push(current);
      return;
    }

    const anyScenario = ANY_SCENARIO_HEADING.exec(line);
    if (anyScenario) {
      scenarioHeadings.push({
        name: anyScenario[2],
        hashes: anyScenario[1].length,
        line: index + 1,
        requirement: current ? current.name : null
      });
      if (current && SCENARIO_HEADING.test(line)) {
        current.scenarios.push(anyScenario[2]);
      }
      return;
    }

    if (current) current.body.push(line);
  });

  return { requirements, scenarioHeadings };
}

/**
 * Builds a violation record.
 *
 * @param {string} rule - Rule identifier.
 * @param {number} line - 1-based line number.
 * @param {string} message - What is wrong.
 * @returns {Object} Violation record.
 */
function violation(rule, line, message) {
  return { rule, line, message };
}

/**
 * Checks that a requirement the delta modifies or removes exists verbatim.
 *
 * The name is the matching key and it is case sensitive: a header that does
 * not match exactly resolves to nothing, so the change silently applies to no
 * requirement at all.
 *
 * @param {Object} requirement - Delta requirement.
 * @param {Map<string, Object>} baseline - Baseline requirements by name.
 * @returns {Object[]} Violations found.
 */
function checkMatchingKey(requirement, baseline) {
  if (requirement.operation !== 'MODIFIED' && requirement.operation !== 'REMOVED') {
    return [];
  }
  if (baseline.has(requirement.name)) return [];

  const folded = requirement.name.toLowerCase();
  const nearMiss = [...baseline.keys()].find(name => name.toLowerCase() === folded);

  if (nearMiss) {
    return [
      violation(
        'matching-key',
        requirement.line,
        `${requirement.operation} "${requirement.name}" does not match the spec, which has "${nearMiss}". The requirement name is the matching key and is case sensitive.`
      )
    ];
  }

  return [
    violation(
      'matching-key',
      requirement.line,
      `${requirement.operation} "${requirement.name}" names a requirement the spec does not have.`
    )
  ];
}

/**
 * Checks that every scenario heading uses exactly four hashes.
 *
 * @param {Object[]} headings - Scenario headings found in the delta.
 * @returns {Object[]} Violations found.
 */
function checkScenarioDepth(headings) {
  return headings
    .filter(heading => heading.hashes !== 4)
    .map(heading =>
      violation(
        'scenario-depth',
        heading.line,
        `Scenario "${heading.name}" uses ${heading.hashes} hash(es); a scenario heading takes exactly four.`
      )
    );
}

/**
 * Checks that a requirement states a normative obligation.
 *
 * @param {Object} requirement - Delta requirement.
 * @returns {Object[]} Violations found.
 */
function checkNormativeKeyword(requirement) {
  if (requirement.operation === 'REMOVED') return [];
  if (NORMATIVE.test(requirement.body.join('\n'))) return [];

  return [
    violation(
      'normative-keyword',
      requirement.line,
      `${requirement.operation} "${requirement.name}" states no obligation; a requirement must contain SHALL or MUST.`
    )
  ];
}

/**
 * Checks that a modified block keeps every scenario the spec still has.
 *
 * @param {Object} requirement - Delta requirement.
 * @param {Map<string, Object>} baseline - Baseline requirements by name.
 * @returns {Object[]} Violations found.
 */
function checkModifiedCompleteness(requirement, baseline) {
  if (requirement.operation !== 'MODIFIED') return [];

  const existing = baseline.get(requirement.name);

  // An unmatched name was already reported by the matching-key rule. Without a
  // baseline requirement there is nothing to compare scenarios against, and
  // reporting an omission on top would be a cascade from one root cause.
  if (!existing) return [];

  const kept = new Set(requirement.scenarios);
  const dropped = existing.scenarios.filter(scenario => !kept.has(scenario));
  if (!dropped.length) return [];

  return [
    violation(
      'modified-completeness',
      requirement.line,
      `MODIFIED "${requirement.name}" omits scenario(s) the spec still has: ${dropped
        .map(name => `"${name}"`)
        .join(', ')}. A MODIFIED requirement replaces the whole block, so an omitted scenario is deleted.`
    )
  ];
}

/**
 * Checks a baseline spec against the rules of form a delta also follows.
 *
 * The delta rules read the baseline: a scenario heading at the wrong depth is
 * not counted as a scenario, so the completeness rule would stop noticing a
 * MODIFIED block that drops it. A baseline has no operation, so the rules that
 * belong to one (the operation group, the matching key, completeness) do not
 * apply here.
 *
 * @param {string} [baselineMarkdown=''] - Baseline spec contents.
 * @returns {Object[]} Violations, ordered by line.
 */
export function validateBaseline(baselineMarkdown = '') {
  const baseline = parseSpec(baselineMarkdown);
  const violations = [];

  for (const heading of baseline.scenarioHeadings) {
    if (heading.hashes === 4) continue;
    const owner = heading.requirement ? ` under requirement "${heading.requirement}"` : '';
    violations.push(
      violation(
        'scenario-depth',
        heading.line,
        `Baseline scenario "${heading.name}"${owner} uses ${heading.hashes} hash(es); a scenario heading takes exactly four, and a shallower or deeper one is not counted when a MODIFIED block is checked against it.`
      )
    );
  }

  for (const requirement of baseline.requirements) {
    if (NORMATIVE.test(requirement.body.join('\n'))) continue;
    violations.push(
      violation(
        'normative-keyword',
        requirement.line,
        `Baseline requirement "${requirement.name}" states no obligation; a requirement must contain SHALL or MUST.`
      )
    );
  }

  return violations.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}

/**
 * Validates a delta document against its baseline spec.
 *
 * @param {string} deltaMarkdown - Delta document contents.
 * @param {string} [baselineMarkdown=''] - Baseline spec contents.
 * @returns {Object[]} Violations, ordered by line.
 */
export function validateDelta(deltaMarkdown, baselineMarkdown = '') {
  const delta = parseSpec(deltaMarkdown);
  const baseline = new Map(parseSpec(baselineMarkdown).requirements.map(item => [item.name, item]));

  const violations = [...checkScenarioDepth(delta.scenarioHeadings)];

  for (const requirement of delta.requirements) {
    if (!requirement.operation) {
      violations.push(
        violation(
          'operation-group',
          requirement.line,
          `Requirement "${requirement.name}" sits outside an ADDED, MODIFIED or REMOVED group.`
        )
      );
      continue;
    }
    violations.push(...checkMatchingKey(requirement, baseline));
    violations.push(...checkNormativeKeyword(requirement));
    violations.push(...checkModifiedCompleteness(requirement, baseline));
  }

  return violations.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}

export default { OPERATIONS, parseSpec, validateDelta, validateBaseline };
