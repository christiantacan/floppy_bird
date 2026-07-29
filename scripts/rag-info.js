const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const targets = [
  'app/page.tsx',
  'app/layout.tsx',
  'app/globals.css',
  'styles/globals.css',
  'package.json',
  'next.config.js',
  'RAG.md'
];

const constantsToFind = [
  'gravity',
  'flapImpulse',
  'flapSpin',
  'pipeSpeed',
  'pipeGap',
  'pipeSpacing',
  'pipeWidth',
  'groundHeight',
  'highScoreKey'
];

function readFileSafe(p) {
  try {
    return fs.readFileSync(path.join(root, p), 'utf8');
  } catch (e) {
    return null;
  }
}

function statSafe(p) {
  try {
    return fs.statSync(path.join(root, p));
  } catch (e) {
    return null;
  }
}

const results = { root, generatedAt: new Date().toISOString(), files: {} };

for (const t of targets) {
  const content = readFileSafe(t);
  const stat = statSafe(t);
  results.files[t] = {
    exists: !!content,
    mtime: stat ? stat.mtime.toISOString() : null,
    size: stat ? stat.size : null
  };

  if (t === 'app/page.tsx' && content) {
    const found = {};
    for (const name of constantsToFind) {
      const re = new RegExp("(?:const|let|var)\\s+" + name + "\\s*=\\s*([^;\n]+)", 'm');
      const m = content.match(re);
      if (m) {
        found[name] = m[1].trim();
      }
    }
    results.constants = found;

    // also list exported functions and top-level helpers (simple heuristic)
    const funcMatches = Array.from(content.matchAll(/function\s+([A-Za-z0-9_]+)\s*\(/g)).map(m => m[1]);
    const arrowMatches = Array.from(content.matchAll(/const\s+([A-Za-z0-9_]+)\s*=\s*\(/g)).map(m => m[1]);
    results.topLevelFunctions = Array.from(new Set([...funcMatches, ...arrowMatches]));
  }
}

// Pretty print
console.log('RAG info for project:', root);
console.log('Generated at:', results.generatedAt);
console.log('\nFiles:');
for (const [k, v] of Object.entries(results.files)) {
  console.log(`- ${k}: exists=${v.exists} mtime=${v.mtime} size=${v.size}`);
}

if (results.constants) {
  console.log('\nDetected constants in app/page.tsx:');
  for (const [k, v] of Object.entries(results.constants)) {
    console.log(`  ${k}: ${v}`);
  }
}

if (results.topLevelFunctions) {
  console.log('\nTop-level functions/helpers detected (heuristic):');
  console.log(' ', results.topLevelFunctions.join(', '));
}

console.log('\nTip: include the output of this script in a new session to help the assistant avoid reading whole files.');

// Also write a JSON cache for automation
try {
  fs.writeFileSync(path.join(root, 'rag-info.json'), JSON.stringify(results, null, 2), 'utf8');
  console.log('\nWrote rag-info.json');
} catch (e) {
  // ignore
}
