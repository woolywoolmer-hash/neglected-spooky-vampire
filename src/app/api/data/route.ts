import { NextResponse } from 'next/server';
import { getActor, getMode } from '@/lib/auth';
import { getData } from '@/lib/db';
import { apiError } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const actor = await getActor();
    return NextResponse.json(
      { ...(await getData(actor)), actor, mode: getMode() },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    return apiError(e);
  }
}
