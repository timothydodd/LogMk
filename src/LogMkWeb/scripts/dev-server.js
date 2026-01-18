#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const libOutputPath = path.join(__dirname, '../dist/rd-ui/package.json');

/**
 * Spawns a command and returns the child process
 */
function runCommand(name, command, args = []) {
  console.log(`[${name}] Starting: ${command} ${args.join(' ')}`);
  const proc = spawn(command, args, {
    stdio: 'inherit',
    shell: true,
    cwd: path.join(__dirname, '..')
  });

  proc.on('error', (err) => {
    console.error(`[${name}] Error:`, err);
  });

  return proc;
}

/**
 * Waits for a file to exist, checking at regular intervals
 */
function waitForFile(filePath, interval = 500, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkFile = () => {
      if (fs.existsSync(filePath)) {
        console.log(`✓ File found: ${filePath}`);
        resolve();
      } else if (Date.now() - startTime > timeout) {
        reject(new Error(`Timeout waiting for ${filePath}`));
      } else {
        setTimeout(checkFile, interval);
      }
    };

    checkFile();
  });
}

/**
 * Main orchestrator function
 */
async function main() {
  const args = process.argv.slice(2);
  const config = args[0] || 'development'; // development, local, production

  const processes = [];

  try {
    // Build lib first (one-time build to ensure dist exists)
    console.log('\n📦 Building rd-ui library...\n');
    const libBuildProc = spawn('npm', ['run', 'lib:build'], {
      stdio: 'inherit',
      shell: true,
      cwd: path.join(__dirname, '..')
    });

    await new Promise((resolve, reject) => {
      libBuildProc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Library build failed with code ${code}`));
      });
    });
    console.log('\n✓ rd-ui library build complete!\n');

    // Start lib watch for incremental builds
    // Note: lib:watch rebuilds from scratch, so we need to wait for it
    console.log('\n👀 Starting rd-ui library watch mode...\n');

    // Delete the marker file so we can detect when lib:watch finishes its rebuild
    if (fs.existsSync(libOutputPath)) {
      fs.unlinkSync(libOutputPath);
    }

    const libProc = runCommand('rd-ui', 'npm', ['run', 'lib:watch']);
    processes.push(libProc);

    // Wait for lib:watch to complete its first build
    console.log('⏳ Waiting for library watch to complete initial build...\n');
    await waitForFile(libOutputPath);

    // Extra delay to ensure all files are fully written
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('✓ Library ready!\n');

    // Start the dev server with the appropriate configuration
    console.log(`🚀 Starting LogMk dev server (${config})...\n`);
    processes.push(runCommand('LogMk', 'ng', ['serve', '--configuration', config]));

    // Handle graceful shutdown
    const cleanup = () => {
      console.log('\n\n🛑 Shutting down dev servers...\n');
      processes.forEach(proc => {
        if (!proc.killed) {
          proc.kill('SIGTERM');
        }
      });
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Wait for all processes
    await Promise.all(
      processes.map(proc => new Promise(resolve => {
        proc.on('close', resolve);
      }))
    );

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    processes.forEach(proc => {
      if (!proc.killed) {
        proc.kill('SIGTERM');
      }
    });
    process.exit(1);
  }
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
