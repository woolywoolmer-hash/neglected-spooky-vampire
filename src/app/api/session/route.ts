import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getActor, getMode, getSupabaseServerClient } from '@/lib/auth';
import { apiError, sameOrigin } from '@/lib/http';
export async function GET() {
  try {
    return NextResponse.json({ actor: await getActor(), mode: getMode() });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const body = await request.json();
    if (getMode() === 'demo') {
      if (!['administrator', 'manager', 'staff', 'readonly'].includes(body.role))
        throw new Error('Select a valid demo role.');
      (await cookies()).set('demo-role', body.role, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      });
      return NextResponse.json({ success: true });
    }
    const client = await getSupabaseServerClient();
    const { error } = await client.auth.signInWithPassword({
      email: String(body.email || ''),
      password: String(body.password || ''),
    });
    if (error) throw new Error('Unable to sign in. Check your email and password.');
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(request: NextRequest) {
  try {
    sameOrigin(request);
    if (getMode() === 'supabase') {
      const client = await getSupabaseServerClient();
      await client.auth.signOut();
    }
    (await cookies()).delete('demo-role');
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError(e);
  }
}
