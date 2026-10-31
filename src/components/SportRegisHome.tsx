'use client';

import Link from 'next/link';
import { CalendarCheck } from 'lucide-react';
import Workspace from './Workspace';

export default function SportRegisHome() {
  return (
    <>
      <Workspace />
      <Link
        href="/block-booking"
        style={{
          position: 'fixed',
          right: 22,
          bottom: 22,
          zIndex: 80,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          borderRadius: 999,
          background: '#18243f',
          color: '#fff',
          fontWeight: 800,
          boxShadow: '0 10px 30px rgba(24,36,63,.25)',
        }}
      >
        <CalendarCheck size={18} /> Block booking checker
      </Link>
    </>
  );
}
