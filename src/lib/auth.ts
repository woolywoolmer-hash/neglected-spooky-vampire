import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Actor, Role } from './types';

export function getMode(): 'demo' | 'supabase' {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (Boolean(url) !== Boolean(key))
    throw new Error('Set both NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  if (url && key) return 'supabase';
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO !== 'true')
    throw new Error(
      'Supabase is not configured. For a private demo only, explicitly set ALLOW_DEMO=true.'
    );
  return 'demo';
}

export async function getSupabaseServerClient() {
  if (getMode() !== 'supabase') throw new Error('Supabase is not configured.');
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return jar.getAll();
        },
        setAll(values) {
          try {
            values.forEach(({ name, value, options }) => jar.set(name, value, options));
          } catch {
            /* Server components cannot write cookies; route handlers can. */
          }
        },
      },
    }
  );
}

export async function getActor(): Promise<Actor> {
  if (getMode() === 'demo') {
    const jar = await cookies();
    const requested = jar.get('demo-role')?.value;
    const role: Role = ['administrator', 'manager', 'staff', 'readonly'].includes(requested ?? '')
      ? (requested as Role)
      : 'administrator';
    return {
      id: `demo-${role}`,
      name:
        role === 'administrator'
          ? 'Alex Morgan'
          : role === 'manager'
            ? 'Jordan Ellis'
            : role === 'staff'
              ? 'Sam Taylor'
              : 'Read only visitor',
      role,
    };
  }
  const client = await getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new Error('Authentication required');
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('id,name,role')
    .eq('id', user.id)
    .single();
  if (profileError || !profile) throw new Error('User profile is not configured');
  return { id: profile.id, name: profile.name, role: profile.role as Role };
}
