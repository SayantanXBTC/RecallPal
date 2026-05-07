import { NextRequest, NextResponse } from 'next/server';

const FLASK = 'http://localhost:5000';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const body = await req.text();

  let flaskRes: Response;
  try {
    flaskRes = await fetch(`${FLASK}/api/delete-person`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': auth },
      body,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: 'error', message: `Flask unreachable: ${msg}` }, { status: 502 });
  }

  const contentType = flaskRes.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const data = await flaskRes.json();
    return NextResponse.json(data, { status: flaskRes.status });
  }

  // Flask returned HTML (404 page, unhandled exception, etc.)
  const text = await flaskRes.text();
  return NextResponse.json(
    { status: 'error', message: `Flask error (${flaskRes.status})`, detail: text.slice(0, 300) },
    { status: flaskRes.status < 500 ? flaskRes.status : 502 },
  );
}
