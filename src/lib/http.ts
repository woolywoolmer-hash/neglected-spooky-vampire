import { NextRequest, NextResponse } from 'next/server';
export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (origin && new URL(origin).host !== host)
    throw new Error('Cross-origin requests are not allowed.');
}
export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Request failed.';
  const unauth =
    /unauthenticated|unauthorized|sign in|not authenticated|authentication required/i.test(message);
  return NextResponse.json(
    { error: message },
    {
      status: unauth
        ? 401
        : /conflict|modified by someone else/i.test(message)
          ? 409
          : /permission|forbidden|not allowed|administrator|read.only|staff can only|staff may|role required/i.test(
                message
              )
            ? 403
            : 400,
    }
  );
}
export function text(value: unknown, max = 10000): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}
export function integer(value: unknown, min: number, max: number, fallback = 0) {
  const n = Number(value ?? fallback);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`Enter a whole number between ${min} and ${max}.`);
  return n;
}
