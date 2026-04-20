import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { env } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Dr. Tot — AI nutrition companion for GLP-1 users',
  description:
    'Text Dr. Tot for GLP-1-smart nutrition tips, protein tracking, and side-effect support. Not medical advice.',
  openGraph: {
    title: 'Dr. Tot',
    description: 'AI nutrition companion for GLP-1 meds. Text-first. Not medical advice.',
    url: 'https://doctortot.com',
    siteName: 'Dr. Tot',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {env.metaPixelId ? (
          <>
            <Script
              id="meta-pixel"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${env.metaPixelId}');fbq('track','PageView');`,
              }}
            />
            <noscript>
              <img
                height="1"
                width="1"
                style={{ display: 'none' }}
                src={`https://www.facebook.com/tr?id=${env.metaPixelId}&ev=PageView&noscript=1`}
                alt=""
              />
            </noscript>
          </>
        ) : null}
      </body>
    </html>
  );
}
