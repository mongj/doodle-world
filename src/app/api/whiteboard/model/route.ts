import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_HOSTS = new Set(['assets.meshy.ai']);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid url parameter' }, { status: 400 });
  }

  if (!ALLOWED_HOSTS.has(parsed.host)) {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
  }

  const upstreamResponse = await fetch(parsed.toString(), {
    headers: {
      Accept: 'application/octet-stream',
    },
    cache: 'no-store',
  });

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    const errorPayload = await upstreamResponse
      .clone()
      .json()
      .catch(() => undefined);
    return NextResponse.json(
      { error: 'Failed to fetch upstream asset', details: errorPayload },
      { status: upstreamResponse.status || 502 },
    );
  }

  const headers = new Headers();
  const contentType = upstreamResponse.headers.get('content-type') || 'application/octet-stream';
  headers.set('Content-Type', contentType);
  const contentLength = upstreamResponse.headers.get('content-length');
  if (contentLength) headers.set('Content-Length', contentLength);

  return new NextResponse(upstreamResponse.body, {
    status: 200,
    headers,
  });
}
