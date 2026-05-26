const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

async function main() {
  try {
    const stdin = fs.readFileSync(0, 'utf-8');
    const input = JSON.parse(stdin);
    const transcriptPath = input.transcript_path || '';

    if (!transcriptPath) {
      process.exit(0);
    }

    const remeDir = process.env.REME_DIR;
    if (!remeDir) process.exit(0);
    const remePy = path.join(remeDir, "reme.py");

    execSync(`python "${remePy}" session-end "${transcriptPath}"`, {
      timeout: 120000,
      cwd: remeDir,
      stdio: 'pipe'
    });
  } catch (error) {
    process.exit(1);
  }
}
main();
