#!/usr/bin/env node
// jsonc2yaml — convert JSONC (with // and /* */ comments) to clean YAML,
// preserving comments as `#` comments.
//
// Usage:
//   jsonc2yaml input.jsonc            # write YAML to stdout
//   jsonc2yaml input.jsonc -o out.yaml
//   cat input.jsonc | jsonc2yaml      # read from stdin
//
// Deps: comment-json, yaml

import { parse } from 'comment-json';
import { Document } from 'yaml';
import { readFileSync, writeFileSync } from 'node:fs';

// --- comment text normalization -------------------------------------------
// yaml renders a comment as `#` + the string verbatim, so we make each line
// start with a single space -> `# text`. Multi-line block comments become
// multiple `#` lines.
function normalizeBlock(tokens) {
  // tokens: array of comment-json comment objects -> multi-line string
  const lines = [];
  for (const t of tokens) {
    for (const raw of String(t.value).split('\n')) {
      const s = raw.trim();
      lines.push(s ? ' ' + s : '');
    }
  }
  return lines.join('\n');
}

function normalizeInline(tokens) {
  // trailing comments must stay on one line
  const parts = [];
  for (const t of tokens) {
    for (const raw of String(t.value).split('\n')) {
      const s = raw.trim();
      if (s) parts.push(s);
    }
  }
  return parts.length ? ' ' + parts.join(' ') : '';
}

const sym = (k) => Object.getOwnPropertySymbols(k); // helper not strictly needed
function getComments(container, slot) {
  // slot like 'before:name' / 'after:0' / 'before-all' / 'after-all'
  const s = Symbol.for(slot);
  const v = container[s];
  return Array.isArray(v) ? v : null;
}

function prependCommentBefore(node, text) {
  if (!text) return;
  node.commentBefore = node.commentBefore ? text + '\n' + node.commentBefore : text;
}
function appendComment(node, text) {
  if (!text) return;
  node.comment = node.comment ? node.comment + ' ' + text : text;
}

// Apply the before/after comments stored on `srcContainer` for child `key`
// onto the child's yaml nodes.
function applyChildComments(srcContainer, key, leadingNode, trailingNode, containerNode) {
  const before = getComments(srcContainer, `before:${key}`);
  if (before) prependCommentBefore(leadingNode, normalizeBlock(before));

  const after = getComments(srcContainer, `after:${key}`);
  if (after) {
    const inline = after.filter((t) => t.inline);
    const standalone = after.filter((t) => !t.inline);
    if (inline.length) appendComment(trailingNode, normalizeInline(inline));
    // standalone trailing comments (typically after the last sibling) have no
    // natural slot in YAML's model -> attach after the whole container.
    if (standalone.length) appendComment(containerNode, normalizeBlock(standalone));
  }
}

function applyContainerComments(srcContainer, node) {
  const beforeAll = getComments(srcContainer, 'before-all');
  if (beforeAll) prependCommentBefore(node, normalizeBlock(beforeAll));
  const afterAll = getComments(srcContainer, 'after-all');
  if (afterAll) appendComment(node, normalizeBlock(afterAll));
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isArr = (v) => Array.isArray(v);

// Walk parsed source and the yaml node tree in parallel.
function walk(src, node) {
  if (isObj(src)) {
    applyContainerComments(src, node);
    const keys = Object.keys(src);
    node.items.forEach((pair, i) => {
      const key = keys[i];
      const childSrc = src[key];
      // leading comment -> before the key; trailing inline -> after the value
      applyChildComments(src, key, pair.key, pair.value, node);
      walk(childSrc, pair.value);
    });
  } else if (isArr(src)) {
    applyContainerComments(src, node);
    node.items.forEach((item, i) => {
      applyChildComments(src, i, item, item, node);
      walk(src[i], item);
    });
  }
  // scalars: nothing to recurse into
}

export function jsoncToYaml(text) {
  const data = parse(text); // throws on invalid JSONC
  const doc = new Document(data);
  // document-level comments live on the root container as before-all/after-all
  if (data !== null && typeof data === 'object') {
    const beforeAll = getComments(data, 'before-all');
    const afterAll = getComments(data, 'after-all');
    if (beforeAll) {
      doc.commentBefore = normalizeBlock(beforeAll);
      delete data[Symbol.for('before-all')]; // avoid double-applying in walk
    }
    if (afterAll) {
      doc.comment = normalizeBlock(afterAll);
      delete data[Symbol.for('after-all')];
    }
  }
  walk(data, doc.contents);
  return doc.toString({ lineWidth: 0, indent: 2 });
}

// --- CLI -------------------------------------------------------------------
function main() {
  const argv = process.argv.slice(2);
  let inFile = null;
  let outFile = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o' || a === '--output') outFile = argv[++i];
    else if (a === '-h' || a === '--help') {
      console.log('Usage: jsonc2yaml [input.jsonc] [-o output.yaml]   (reads stdin if no input file)');
      return;
    } else if (!inFile) inFile = a;
  }
  const text = inFile ? readFileSync(inFile, 'utf8') : readFileSync(0, 'utf8');
  let yaml;
  try {
    yaml = jsoncToYaml(text);
  } catch (err) {
    console.error('jsonc2yaml: failed to parse input as JSONC:', err.message);
    process.exit(1);
  }
  if (outFile) writeFileSync(outFile, yaml);
  else process.stdout.write(yaml);
}

// run as CLI when executed directly
if (import.meta.url === `file://${process.argv[1]}`) main();
