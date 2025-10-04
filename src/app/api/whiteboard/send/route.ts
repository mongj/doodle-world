import { create } from 'domain';
import { NextRequest, NextResponse } from 'next/server';
const fs = require('fs');
const path = require('path');

const MESHY_API_KEY = process.env.MESHY_API_KEY;
const CREATE_URL = process.env.MESHY_IMAGE_TO_3D_URL;
const STATUS_TEMPLATE = process.env.MESHY_JOB_STATUS_URL_TEMPLATE || `${CREATE_URL}/{id}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: NextRequest) {
  try {
    const { image_url } = await request.json();

    if (!image_url) {
      return NextResponse.json({ error: 'Missing image_url' }, { status: 400 });
    }

    if (!MESHY_API_KEY || !CREATE_URL) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    }

    // Create Meshy task
    const createRes = await fetch(CREATE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MESHY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image_url }),
    });

    const createJson = await createRes.json();

    console.log('Meshy create response:', createJson);
    if (!createRes.ok) {
      return NextResponse.json(
        { error: createJson?.error || 'Meshy create failed' },
        { status: createRes.status || 500 }
      );
    }

    const id: string | undefined = createJson?.result;
    if (!id) {
      return NextResponse.json({ error: createJson?.error || JSON.stringify(createJson) }, { status: 502 });
    }

    // Simple polling for status
    const maxTries = 120; // ~600s at 5s/try
    const delayMs = 5000;
    for (let i = 0; i < maxTries; i++) {
      const statusUrl = (STATUS_TEMPLATE || '').replace('{id}', id);
      console.log(`[Meshy Poll] Attempt ${i + 1}/${maxTries} -> ${statusUrl}`);
      const statusRes = await fetch(statusUrl, {
        headers: { Authorization: `Bearer ${MESHY_API_KEY}` },
      });
      const statusJson = await statusRes.json();

      // Save statusJson to a local JSON file
      const outputPath = path.join(process.cwd(), 'meshy_status.json');
      fs.writeFileSync(outputPath, JSON.stringify(statusJson, null, 2));

      if (!statusRes.ok) {
        return NextResponse.json(
          { error: statusJson?.error || 'Meshy status failed' },
          { status: statusRes.status || 500 }
        );
      }

      const status = statusJson?.status;
      if (status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELED') {
        return NextResponse.json(statusJson);
      }

      await sleep(delayMs);
    }

    return NextResponse.json({ id, status: 'TIMEOUT' }, { status: 202 });
  } catch (error) {
    console.error('Error processing image:', error);
    return NextResponse.json({ error: 'Failed to process image' }, { status: 500 });
  }
}
