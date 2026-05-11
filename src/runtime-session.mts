import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type RunningSession = {
  version: 1;
  pid: number;
  host: string;
  port: number;
  url: string;
  token: string;
  startedAt: string;
};

export function createSessionToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function readRunningSession(): Promise<RunningSession | undefined> {
  try {
    const raw = await readFile(sessionFilePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<RunningSession>;

    if (
      parsed.version !== 1
      || typeof parsed.pid !== "number"
      || typeof parsed.host !== "string"
      || typeof parsed.port !== "number"
      || typeof parsed.url !== "string"
      || typeof parsed.token !== "string"
      || typeof parsed.startedAt !== "string"
    ) {
      return undefined;
    }

    return parsed as RunningSession;
  } catch {
    return undefined;
  }
}

export async function writeRunningSession(session: RunningSession): Promise<void> {
  const filePath = sessionFilePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(session, null, 2)}\n`, {
    mode: 0o600,
  });
}

export async function clearRunningSession(session?: RunningSession): Promise<void> {
  const current = await readRunningSession();

  if (session && current && current.token !== session.token) {
    return;
  }

  await rm(sessionFilePath(), { force: true });
}

export async function probeRunningSession(
  session: RunningSession,
): Promise<boolean> {
  try {
    const response = await fetch(new URL("/api/session", session.url), {
      headers: {
        "x-vo-token": session.token,
      },
      signal: AbortSignal.timeout(500),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function addToRunningSession(
  session: RunningSession,
  input: {
    cwd: string;
    paths: string[];
    recursive: boolean;
    watch: boolean;
  },
): Promise<unknown> {
  const response = await fetch(new URL("/api/session/add", session.url), {
    body: JSON.stringify(input),
    headers: {
      "content-type": "application/json",
      "x-vo-token": session.token,
    },
    method: "POST",
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`existing vo session rejected add request: ${response.status}`);
  }

  return response.json();
}

function sessionFilePath(): string {
  if (process.env.VO_SESSION_FILE) {
    return process.env.VO_SESSION_FILE;
  }

  const uid = typeof process.getuid === "function" ? process.getuid() : "user";
  return path.join(os.tmpdir(), `vo-session-${uid}.json`);
}
