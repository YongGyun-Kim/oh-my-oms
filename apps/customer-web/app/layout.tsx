import type { ReactNode } from 'react';
import '../../../packages/ui/src/portal.css';
export const metadata = { title: '고객 주문 관리', description: '기업 주문 신청과 확인' };
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
