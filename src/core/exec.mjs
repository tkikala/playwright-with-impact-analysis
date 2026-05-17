import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execCallback);

export async function run(command, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = { ...process.env, ...(options.env ?? {}) };
  if (options.log !== false) {
    console.log(`$ ${options.displayCommand ?? command}`);
  }
  const child = exec(command, {
    cwd,
    env,
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 20
  });

  try {
    const result = await child;
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    return result;
  } catch (error) {
    if (error.stdout) process.stdout.write(error.stdout);
    if (error.stderr) process.stderr.write(error.stderr);
    throw error;
  }
}

export async function capture(command, options = {}) {
  const result = await exec(command, {
    cwd: options.cwd ?? process.cwd(),
    env: { ...process.env, ...(options.env ?? {}) },
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 20
  });
  return result.stdout.trim();
}
