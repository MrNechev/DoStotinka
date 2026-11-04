import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseSync } from 'vite';
import { describe, expect, it } from 'vitest';

/**
 * Finds English text written directly into JSX (`<p>3 records</p>`, `title="Close"`), which the
 * translation test cannot see because it is not wrapped in `t()`.
 */
const SRC = path.resolve(__dirname, '..');
const TEXT_ATTRIBUTES = new Set([
  'title',
  'placeholder',
  'aria-label',
  'alt',
  'label',
  'description',
  'hint',
  'emptyTitle',
  'emptyDescription',
  'confirmLabel',
]);
const MESSAGE_CALLS = new Set([
  'toast.success',
  'toast.error',
  'toast.info',
  'toast.warning',
  'toast.message',
  'toast',
  'setError',
]);
/** Words that are the same in every language (names, formats, units). */
const ALLOWED =
  /^(Slavotax|PDF|CSV|JSON|API|ntfy|Gotify|Discord|Slack|Wallet|ECB|IBAN|KB|MB|URL|cURL|OpenAPI|ID|[A-Z]{3}|[A-Za-z]{1})$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) && !name.includes('.test.') && dir !== path.join(SRC, 'i18n')
      ? [full]
      : [];
  });
}

const hasWords = (text: string) =>
  text
    .split(/[^A-Za-z]+/)
    .filter((w) => w.length > 1)
    .some((w) => !ALLOWED.test(w));

type Node = { type?: string; start?: number; [key: string]: unknown };

/** Strings an expression can render as is: `'Done'`, `a ? 'Done' : 'Select'`, `${n} records`. */
function shownTexts(expr: Node | undefined): { node: Node; text: string }[] {
  if (!expr) return [];
  switch (expr.type) {
    case 'Literal':
      return typeof expr.value === 'string' ? [{ node: expr, text: expr.value }] : [];
    case 'TemplateLiteral':
      return (expr.quasis as Node[]).map((q) => ({
        node: q,
        text: String((q.value as { cooked?: string }).cooked ?? ''),
      }));
    case 'ConditionalExpression':
      return [...shownTexts(expr.consequent as Node), ...shownTexts(expr.alternate as Node)];
    case 'LogicalExpression':
      return shownTexts(expr.right as Node);
    case 'ParenthesizedExpression':
      return shownTexts(expr.expression as Node);
    default:
      return [];
  }
}

function findings(file: string): string[] {
  const code = readFileSync(file, 'utf8');
  const { program } = parseSync(file, code);
  const out: string[] = [];
  const lineOf = (pos = 0) => code.slice(0, pos).split('\n').length;
  const report = (node: Node, text: string) =>
    out.push(`${path.relative(SRC, file)}:${lineOf(node.start)} ${JSON.stringify(text.trim())}`);

  const visit = (node: unknown, parent?: Node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, parent);
      return;
    }
    const n = node as Node;
    if (n.type === 'JSXText' && hasWords(String(n.value))) report(n, String(n.value));
    if (n.type === 'JSXAttribute') {
      const name = (n.name as Node)?.name as string | undefined;
      const value = n.value as Node | null;
      if (name && TEXT_ATTRIBUTES.has(name)) {
        const expr = value?.type === 'JSXExpressionContainer' ? (value.expression as Node) : value;
        for (const lit of shownTexts(expr ?? undefined)) {
          if (hasWords(lit.text)) report(lit.node, lit.text);
        }
      }
    }
    // Messages shown through toasts or error states: toast.success('Saved'), setError('…').
    if (n.type === 'CallExpression') {
      const callee = n.callee as Node;
      const name =
        callee.type === 'MemberExpression'
          ? `${(callee.object as Node).name}.${(callee.property as Node).name}`
          : (callee.name as string | undefined);
      if (name && MESSAGE_CALLS.has(name)) {
        for (const lit of shownTexts((n.arguments as Node[])[0])) {
          if (hasWords(lit.text)) report(lit.node, lit.text);
        }
      }
    }
    if (n.type === 'JSXElement' || n.type === 'JSXFragment') {
      for (const child of n.children as Node[]) {
        if (child.type !== 'JSXExpressionContainer') continue;
        for (const lit of shownTexts(child.expression as Node)) {
          if (hasWords(lit.text)) report(lit.node, lit.text);
        }
      }
    }
    for (const [key, value] of Object.entries(n)) {
      if (key !== 'parent') visit(value, n);
    }
  };
  visit(program);
  return out;
}

describe('JSX text', () => {
  it('is always translated', () => {
    const all = sourceFiles(SRC).flatMap(findings);
    expect(all).toEqual([]);
  });
});
