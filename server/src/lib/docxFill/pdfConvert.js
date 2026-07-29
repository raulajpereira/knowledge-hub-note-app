import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// Converts a .docx buffer to PDF via a headless LibreOffice, if installed.
// Each call gets its own temp profile dir so concurrent requests don't
// collide over LibreOffice's single-instance lock.
export async function convertDocxToPdf(docxBuffer, timeoutMs = 60_000) {
  const workDir = path.join(os.tmpdir(), `docx-pdf-${crypto.randomUUID()}`);
  const profileDir = path.join(workDir, 'profile');
  await fs.mkdir(profileDir, { recursive: true });
  const inputPath = path.join(workDir, 'input.docx');
  await fs.writeFile(inputPath, docxBuffer);

  try {
    await runSoffice([
      '--headless',
      '--norestore',
      `-env:UserInstallation=file://${profileDir}`,
      '--convert-to',
      'pdf',
      '--outdir',
      workDir,
      inputPath,
    ], timeoutMs);
    const pdfPath = path.join(workDir, 'input.pdf');
    return await fs.readFile(pdfPath);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function runSoffice(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn('soffice', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('PDF conversion timed out'));
    }, timeoutMs);

    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (err) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') reject(new Error('LibreOffice (soffice) is not installed on this server'));
      else reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`soffice exited with code ${code}: ${stderr.slice(0, 500)}`));
    });
  });
}
