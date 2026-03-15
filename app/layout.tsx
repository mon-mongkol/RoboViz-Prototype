'use client';

import { useState } from 'react';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { ROSProvider } from '@/app/context/ROSContext';
import Sidebar from '@/app/componets/Sidebar';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// ❗ metadata ใช้ไม่ได้ใน client component
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ROSProvider>
          {/* Toggle button */}
          <button
            onClick={() => setOpen(!open)}
            className="fixed top-4 left-4 z-50 bg-gray-800 text-white p-2 rounded"
          >
            ☰
          </button>

          <Sidebar open={open} />

          <main
            className={`transition-all duration-300
              ${open ? 'ml-64' : 'ml-16'}
              p-6 bg-gray-100 min-h-screen
            `}
          >
            {children}
          </main>
        </ROSProvider>
      </body>
    </html>
  );
}