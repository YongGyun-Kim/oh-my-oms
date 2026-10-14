import { createApi } from '@oms/api';
import type { ApiOwners } from '@oms/api';
import { randomBytes } from 'node:crypto';

export async function u3HttpHost(
  owners: ApiOwners,
  options: { audience?: 'CUSTOMER' | 'STAFF'; admitted?: boolean; port?: number } = {},
) {
  const { audience = 'CUSTOMER', admitted = true, port = 34783 } = options;
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('합성 HTTP의 명시적인 유한 port가 필요합니다.');
  const url = 'http://127.0.0.1:' + port;
  const host = await createApi(owners, {
    audience,
    origin: url,
    cookieKey: randomBytes(32),
    localSynthetic: true,
    staffAdmission: async () => (admitted ? 'synthetic-private-ingress' : null),
  });
  await host.app.listen(port, '127.0.0.1');
  return { ...host, url };
}
