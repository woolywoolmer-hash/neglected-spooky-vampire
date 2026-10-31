import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getActor } from '@/lib/auth';
import { mutate } from '@/lib/db';
import { apiError, sameOrigin, text } from '@/lib/http';
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const actor = await getActor();
    if (!['administrator', 'manager'].includes(actor.role))
      throw new Error('You do not have permission to manage customers.');
    const { customer: c } = await request.json();
    if (!c || !text(c.organisation)) throw new Error('Organisation is required.');
    const discount = Number(c.discount || 0);
    if (!Number.isFinite(discount) || discount < 0 || discount > 100)
      throw new Error('Discount must be between 0 and 100 percent.');
    const customer = {
      id: text(c.id) || randomUUID(),
      organisation: text(c.organisation, 250),
      contactName: text(c.contactName, 250),
      address: text(c.address),
      telephone: text(c.telephone, 100),
      email: text(c.email, 320),
      billingInfo: text(c.billingInfo),
      discount,
      notes: text(c.notes),
      active: c.active !== false,
    };
    await mutate('save-customer', customer, actor);
    return NextResponse.json({ customer });
  } catch (e) {
    return apiError(e);
  }
}
