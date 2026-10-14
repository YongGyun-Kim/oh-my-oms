import { protectPage } from '@oms/ui/security-proxy';
export const proxy = protectPage;
export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'] };
