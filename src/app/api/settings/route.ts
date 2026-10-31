import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getActor } from '@/lib/auth';
import { mutate } from '@/lib/db';
import { apiError, sameOrigin, text, integer } from '@/lib/http';
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const actor = await getActor();
    if (actor.role !== 'administrator')
      throw new Error('Only an administrator can change facility settings, rates, and closures.');
    const { operation, value: v } = await request.json();
    if (!v || typeof v !== 'object') throw new Error('Details are required.');
    let value;
    if (operation === 'save-rate') {
      if (!text(v.name)) throw new Error('Rate name is required.');
      value = {
        id: text(v.id) || randomUUID(),
        name: text(v.name, 250),
        facilityId: text(v.facilityId) || null,
        exVat: integer(v.exVat, 0, 100000000),
        vat: integer(v.vat, 0, 100000000),
        total: integer(v.total, 0, 100000000),
      };
    } else if (operation === 'save-facility') {
      if (!text(v.name)) throw new Error('Facility name is required.');
      value = {
        id: text(v.id) || randomUUID(),
        name: text(v.name, 250),
        group: text(v.group, 100) || 'Other',
        parentId: text(v.parentId) || null,
        color: /^#[0-9a-f]{6}$/i.test(v.color) ? v.color : '#638b69',
        bufferBefore: integer(v.bufferBefore, 0, 1440),
        bufferAfter: integer(v.bufferAfter, 0, 1440),
        accessBefore: integer(v.accessBefore, 0, 1440),
        accessAfter: integer(v.accessAfter, 0, 1440),
        active: v.active !== false,
      };
    } else if (operation === 'save-closure') {
      if (
        ![
          'Maintenance',
          'School event',
          'Exams',
          'Private event',
          'Holiday',
          'Unplayable pitch',
          'Other',
        ].includes(v.reason)
      )
        throw new Error('Select a closure reason.');
      if (
        !v.facilityId ||
        !Number.isFinite(Date.parse(v.start)) ||
        !Number.isFinite(Date.parse(v.end)) ||
        Date.parse(v.end) <= Date.parse(v.start)
      )
        throw new Error('Valid facility and closure dates are required.');
      value = {
        id: text(v.id) || randomUUID(),
        facilityId: text(v.facilityId),
        start: new Date(v.start).toISOString(),
        end: new Date(v.end).toISOString(),
        reason: v.reason,
        notes: text(v.notes),
        createdBy: actor.id,
      };
    } else if (operation === 'delete-closure') {
      value = { id: text(v.id) };
      if (!value.id) throw new Error('Closure id is required.');
    } else throw new Error('Unsupported settings operation.');
    await mutate(operation, value, actor);
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError(e);
  }
}
