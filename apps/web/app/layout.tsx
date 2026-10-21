import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '결 GYEOL — 취향이 이어지는 순간',
  description: '좋아하는 노래에서 새로운 취향으로. 장르와 분위기로 발견하는 나만의 플레이리스트.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
