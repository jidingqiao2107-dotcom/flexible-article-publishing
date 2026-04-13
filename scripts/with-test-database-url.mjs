import { spawn } from "node:child_process";

const [, , command, ...args] = process.argv;

if (!process.env.TEST_DATABASE_URL) {
  console.error("TEST_DATABASE_URL is required for Prisma integration validation.");
  process.exit(1);
}

if (!command) {
  console.error("Usage: node scripts/with-test-database-url.mjs <command> [...args]");
  process.exit(1);
}

const child = spawn(command, args, {
  env: {
    ...process.env,
    DATABASE_URL: process.env.TEST_DATABASE_URL
  },
  shell: true,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Command terminated by signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});

