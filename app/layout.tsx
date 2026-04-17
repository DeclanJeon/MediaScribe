import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MediaScribe',
  description: '깔끔한 로컬 전사 워크플로우를 제공하는 faster-whisper 데스크톱 앱.',
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
