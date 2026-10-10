import { request } from 'node:https';
export class ContainerClient {
  private readonly cookies = new Map<string, string>();
  private csrf = '';
  constructor(
    readonly audience: 'customer' | 'staff',
    private readonly port: number,
    private readonly ca: string,
    private readonly credentials: { password: string; factor: string },
  ) {}
  async request<T = Record<string, unknown>>(
    path: string,
    data?: unknown,
    extra: Record<string, string> = {},
  ) {
    const body = data === undefined ? undefined : JSON.stringify(data);
    return new Promise<{ status: number; body: T; cookies: string[] }>((done, reject) => {
      const req = request(
        {
          hostname: this.audience + '.example.invalid',
          servername: this.audience + '.example.invalid',
          port: this.port,
          path: '/api' + path,
          ca: this.ca,
          rejectUnauthorized: true,
          family: 4,
          lookup: (_host, _options, callback) => callback(null, '127.0.0.1', 4),
          method: body === undefined ? 'GET' : 'POST',
          headers: {
            Host: this.audience + '.example.invalid',
            Origin: 'https://' + this.audience + '.example.invalid',
            Cookie: [...this.cookies].map(([key, value]) => key + '=' + value).join('; '),
            'X-CSRF-Token': this.csrf,
            ...(body
              ? {
                  'Content-Type': 'application/json',
                  'Content-Length': String(Buffer.byteLength(body)),
                }
              : {}),
            ...extra,
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          let size = 0;
          response.on('data', (chunk) => {
            size += chunk.length;
            if (size > 4 * 1024 * 1024) req.destroy(new Error('컨테이너 응답 한도'));
            else chunks.push(chunk);
          });
          response.once('error', reject);
          response.on('end', () => {
            try {
              const cookies = response.headers['set-cookie'] ?? [];
              for (const cookie of cookies) {
                const [name, value] = cookie.split(';')[0]!.split('=');
                this.cookies.set(name!, value!);
              }
              done({
                status: response.statusCode!,
                body: JSON.parse(Buffer.concat(chunks).toString()) as T,
                cookies,
              });
            } catch (error) {
              reject(error);
            }
          });
        },
      );
      req.setTimeout(body === undefined ? 5000 : 10000, () =>
        req.destroy(new Error('컨테이너 요청 기한')),
      );
      req.once('error', reject);
      req.end(body);
    });
  }
  async refresh() {
    const value = await this.request<{ csrfToken: string }>('/security/csrf');
    if (value.status !== 200) throw new Error('실제 TLS BFF CSRF 준비 실패');
    this.csrf = value.body.csrfToken;
  }
  async authenticate(id: string) {
    await this.refresh();
    const start = await this.request<{ challengeId: string }>('/identity/challenges', {
      loginIdentifier: id + '@example.invalid',
    });
    if (start.status !== 200) throw new Error('TLS 인증 시작 실패');
    const password = await this.request<{ challengeId: string }>(
      '/identity/challenges/' + start.body.challengeId + '/responses',
      { challengeId: start.body.challengeId, response: this.credentials.password },
    );
    if (password.status !== 200) throw new Error('TLS password 실패');
    await this.refresh();
    const idMfa = password.body.challengeId;
    const factor = await this.request<{ phase: string }>(
      '/identity/challenges/' + idMfa + '/responses',
      { challengeId: idMfa, response: this.credentials.factor },
    );
    if (factor.status !== 200)
      throw new Error(
        'TLS MFA 실패 status=' +
          factor.status +
          ' problem=' +
          String((factor.body as { type?: string }).type ?? 'unknown'),
      );
    if (factor.body.phase !== 'MFA_VERIFIED') {
      const codes = await this.request<{ setId: string }>(
        '/identity/challenges/' + idMfa + '/recovery-code-issues',
        { challengeId: idMfa },
      );
      if (codes.status !== 200) throw new Error('TLS 복구 코드 준비 실패');
      const result = await this.request<{ phase: string }>(
        '/identity/challenges/' + idMfa + '/recovery-code-acknowledgements',
        { challengeId: idMfa, setId: codes.body.setId, stored: true },
      );
      if (result.status !== 200 || result.body.phase !== 'MFA_VERIFIED')
        throw new Error('TLS 별도 보관 확인 실패');
    }
    await this.refresh();
    const current = await this.request<{ data: { accountRef: { id: string } } }>('/identity');
    if (current.status !== 200 || current.body.data.accountRef.id !== id)
      throw new Error('TLS 현재 identity 실패');
  }
}
