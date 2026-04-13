import { NextResponse } from "next/server";

export function requireManagerApiKey(request: Request): NextResponse | null {
  const configuredKey = process.env.MANAGER_GPT_API_KEY;

  if (!configuredKey) {
    return NextResponse.json({ error: "MANAGER_GPT_API_KEY is not configured." }, { status: 500 });
  }

  const authorization = request.headers.get("authorization");
  const expected = `Bearer ${configuredKey}`;

  if (authorization !== expected) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return null;
}
