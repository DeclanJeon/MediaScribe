import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MediaScribe',
  description: 'Desktop faster-whisper transcription app for audio and video files.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
