import fs from 'node:fs';

export function getInput(name, defaultValue = '') {
  const rawEnvName = `INPUT_${name.replaceAll(' ', '_').toUpperCase()}`;
  const normalizedEnvName = `INPUT_${name.replaceAll(' ', '_').replaceAll('-', '_').toUpperCase()}`;
  const value = process.env[rawEnvName] ?? process.env[normalizedEnvName];
  return value === undefined || value === '' ? defaultValue : value;
}

export function setOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  const serialized = Array.isArray(value) ? value.join('\n') : String(value ?? '');
  if (outputPath) {
    fs.appendFileSync(outputPath, `${name}<<PW_IMPACT_OUTPUT\n${serialized}\nPW_IMPACT_OUTPUT\n`);
  } else {
    console.log(`${name}=${serialized}`);
  }
}

export function isPullRequestEvent() {
  return process.env.GITHUB_EVENT_NAME === 'pull_request'
    || process.env.GITHUB_EVENT_NAME === 'pull_request_target';
}

export function isMainLikePush() {
  const ref = process.env.GITHUB_REF ?? '';
  return process.env.GITHUB_EVENT_NAME === 'push'
    && (ref === 'refs/heads/main' || ref === 'refs/heads/master');
}
