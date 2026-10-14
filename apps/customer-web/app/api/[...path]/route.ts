import { NextRequest } from 'next/server.js';
import { proxy } from '@oms/ui/bff';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
async function handle(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await context.params).path, 'CUSTOMER');
}
export const GET = handle;
export const POST = handle;
