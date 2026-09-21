import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
).split('\0').filter(Boolean);

const sensitiveNames = [
  /(^|\/)\.env(?:\.|$)/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)(?:id_rsa|id_ed25519)(?:\.|$)/i,
  /(^|\/)(?:secrets?|credentials?)(?:\.|$)/i,
  /sidenote-backup-\d{4}-\d{2}-\d{2}\.json$/i,
  /\.(?:pem|key|p12|pfx|jks|keystore)$/i,
];

const contentChecks = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g],
  ['OpenAI-style key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
  ['live Stripe secret', /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/g],
  ['credential-bearing URL', /https?:\/\/[^\s/:@]+:[^\s/@]+@[^\s/]+/gi],
  ['credential-like assignment', /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|secret)\s*[:=]\s*["'][^"'\r\n]{12,}["']/gi],
];

const findings = [];
for (const file of files) {
  if (sensitiveNames.some((pattern) => pattern.test(file))) {
    findings.push(`${file}: sensitive filename`);
    continue;
  }

  let bytes;
  try {
    bytes = readFileSync(file);
  } catch (error) {
    findings.push(`${file}: could not read (${error.message})`);
    continue;
  }
  if (bytes.length > 2_000_000 || bytes.includes(0)) continue;

  const text = bytes.toString('utf8');
  for (const [label, pattern] of contentChecks) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      // Reserved example domains are intentionally used in security tests.
      if (/https?:\/\/[^\s]+@example\.(?:com|org|net)\b/i.test(match[0])) continue;
      const line = text.slice(0, match.index).split('\n').length;
      findings.push(`${file}:${line}: possible ${label}`);
    }
  }
}

if (findings.length) {
  console.error('Potentially sensitive content found:\n');
  console.error(findings.map((finding) => `- ${finding}`).join('\n'));
  console.error('\nReview each finding before committing. If a real credential was ever committed, revoke it and clean the Git history.');
  process.exit(1);
}

console.log(`Public-repository check passed (${files.length} non-ignored files scanned).`);
console.log('This heuristic complements, but does not replace, reviewing staged changes and enabling repository secret scanning.');
