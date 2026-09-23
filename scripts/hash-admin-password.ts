import {
  escapePasswordHashForEnv,
  hashPassword,
} from "../server/auth/password-verifier";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

const password = await readStdin();

if (password.length === 0) {
  console.error("Enter a password on stdin.");
  process.exit(1);
}

const encoded = escapePasswordHashForEnv(await hashPassword(password));
process.stdout.write(`${encoded}\n`);
