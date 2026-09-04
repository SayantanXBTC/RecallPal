/**
 * /api/add-person — Next.js route handler
 *
 * Why this exists instead of a next.config.js rewrite:
 * Rewrites use a Node HTTP proxy that times out after ~60 s. Face
 * enrolment (insightface + quality filter + N Supabase inserts) can
 * take 30–90 s and occasionally longer on cold pods, so we forward
 * the request through a route handler that has no proxy timeout.
 */

import { NextRequest, NextResponse } from 'next/server';

const FLASK = process.env.BACKEND_URL || 'http://localhost:5000';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const body = await req.text();

  let flaskRes: Response;
  try {
    flaskRes = await fetch(`${FLASK}/api/add-person`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': auth,
      },
      body,
      // 10-minute hard cap — enrollment should never exceed 5 min
      signal: AbortSignal.timeout(600_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { status: 'error', message: `Flask unreachable: ${msg}` },
      { status: 502 },
    );
  }

  const data = await flaskRes.json();
  return NextResponse.json(data, { status: flaskRes.status });
}
