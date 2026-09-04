import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const date  = req.nextUrl.searchParams.get('date') ?? '';
  const auth  = req.headers.get('authorization') ?? '';
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  const base  = process.env.BACKEND_URL || 'http://localhost:5000';
  const url   = `${base}/api/summary/daily${query}`;

  try {
    const res         = await fetch(url, {
      headers: { ...(auth ? { authorization: auth } : {}) },
      cache:   'no-store',
    });
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        { status: 'error', message: 'Invalid response from backend' },
        { status: 502 }
      );
    }
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { status: 'error', message: `Backend unreachable: ${msg}` },
      { status: 503 }
    );
  }
}
