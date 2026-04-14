import crypto from "node:crypto";
import type { Actor } from "@/domain/types";
import { findDemoAuthorById, getDefaultPreviewActor } from "@/persistence/demo-store";
import { prisma } from "@/persistence/prisma-client";
import { isPreviewMode } from "@/server/runtime-mode";

export const SESSION_COOKIE_NAME = "route_a_session";
const previewSessions = new Map<string, { authorId: string; revokedAt?: string }>();

export class IdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentityError";
  }
}

function parseCookieHeader(cookieHeader: string | null, cookieName: string): string | undefined {
  if (!cookieHeader) return undefined;

  const parts = cookieHeader.split(";").map((part) => part.trim());
  const match = parts.find((part) => part.startsWith(`${cookieName}=`));
  return match ? decodeURIComponent(match.slice(cookieName.length + 1)) : undefined;
}

export function getSessionTokenFromRequest(request: Request): string | undefined {
  return parseCookieHeader(request.headers.get("cookie"), SESSION_COOKIE_NAME);
}

export async function createDevelopmentSession(input: { authorId: string; label?: string }) {
  if (isPreviewMode()) {
    const author = await findDemoAuthorById(input.authorId);

    if (!author) {
      throw new IdentityError(`Author ${input.authorId} was not found.`);
    }

    const token = crypto.randomBytes(24).toString("hex");
    previewSessions.set(token, { authorId: author.id });
    return {
      token,
      sessionId: `preview_session_${token.slice(0, 8)}`,
      actor: {
        id: author.id,
        type: "human_author" as const,
        displayName: author.displayName
      }
    };
  }

  const author = await prisma.author.findUnique({
    where: { id: input.authorId }
  });

  if (!author) {
    throw new IdentityError(`Author ${input.authorId} was not found.`);
  }

  const token = crypto.randomBytes(24).toString("hex");
  const session = await prisma.actorSession.create({
    data: {
      token,
      authorId: author.id,
      label: input.label
    }
  });

  return {
    token,
    sessionId: session.id,
    actor: {
      id: author.id,
      type: "human_author" as const,
      displayName: author.displayName
    }
  };
}

export async function clearSessionByToken(token?: string) {
  if (isPreviewMode()) {
    if (token) {
      previewSessions.delete(token);
    }
    return;
  }

  if (!token) return;

  await prisma.actorSession.updateMany({
    where: {
      token,
      revokedAt: null
    },
    data: {
      revokedAt: new Date()
    }
  });
}

export async function resolveActorFromRequest(request: Request): Promise<Actor | null> {
  if (isPreviewMode()) {
    const token = getSessionTokenFromRequest(request);

    if (token) {
      const session = previewSessions.get(token);
      if (session) {
        const author = await findDemoAuthorById(session.authorId);
        if (author) {
          return {
            id: author.id,
            type: "human_author",
            displayName: author.displayName
          };
        }
      }
    }

    return getDefaultPreviewActor();
  }

  const token = getSessionTokenFromRequest(request);

  if (!token) return null;

  const session = await prisma.actorSession.findUnique({
    where: { token },
    include: { author: true }
  });

  if (!session || session.revokedAt || (session.expiresAt && session.expiresAt <= new Date())) {
    return null;
  }

  return {
    id: session.author.id,
    type: "human_author",
    displayName: session.author.displayName
  };
}

export async function requireResolvedActor(request: Request): Promise<Actor> {
  const actor = await resolveActorFromRequest(request);

  if (!actor) {
    throw new IdentityError("No active author session. Create a development session first.");
  }

  return actor;
}

export function assertNoActorOverride(payload: unknown): void {
  if (
    payload &&
    typeof payload === "object" &&
    "actorId" in payload &&
    (payload as Record<string, unknown>).actorId !== undefined
  ) {
    throw new IdentityError("actorId must not be provided for approval-critical requests; identity is resolved from the server session.");
  }
}

export function buildSessionCookie(token: string): string {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`;
}

export function buildExpiredSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
