import type { Metadata, Viewport } from 'next';
import { DM_Sans, Fraunces } from 'next/font/google';
import './globals.css';
import { AppProviders } from './providers';
import { brand } from '@/shared/brand';

const body = DM_Sans({ subsets: ['latin'], variable: '--font-body' });
const headline = Fraunces({ subsets: ['latin'], variable: '--font-headline' });

export const metadata: Metadata = {
  title: brand.metaTitle,
  description: brand.metaDescription,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: brand.themeColor,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${body.variable} ${headline.variable} antialiased`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
