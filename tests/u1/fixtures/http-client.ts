import type { Ref } from '@oms/contracts';
import { syntheticPassword, syntheticFactor } from './identity.js';
export interface HttpTestBody {
  disposition: string;
  receipt: { requestId: string };
  csrfToken: string;
  challengeId: string;
  phase: string;
  setId: string;
  sessionToken?: string;
  requestId: string;
  requestState: string;
  targetRef: Ref;
  resultRefs: Ref[];
  data: { accountRef: Ref; state: string; confirmation: string };
  status: number;
  detail: string;
  type: string;
}
export class SyntheticHttpClient {
  private readonly cookies = new Map<string, string>();
  private csrf = '';
  constructor(
    readonly origin: string,
    private readonly credentials = { password: syntheticPassword, factor: syntheticFactor },
    private readonly prefix = '',
  ) {}
  async request<T = HttpTestBody>(
    path: string,
    data?: unknown,
    additional: Record<string, string> = {},
  ) {
    const response = await fetch(this.origin + this.prefix + path, {
      method: data === undefined ? 'GET' : 'POST',
      signal: AbortSignal.timeout(data === undefined ? 5000 : 10000),
      headers: {
        Cookie: [...this.cookies].map(([name, value]) => name + '=' + value).join('; '),
        Origin: this.origin,
        'X-CSRF-Token': this.csrf,
        ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...additional,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    for (const value of response.headers.getSetCookie()) {
      const [name, token] = value.split(';')[0]!.split('=');
      this.cookies.set(name!, token!);
    }
    return { response, body: (await response.json()) as T };
  }
  cookieSnapshot(): { name: string; value: string }[] {
    return [...this.cookies].map(([name, value]) => ({ name, value }));
  }
  async refreshCsrf(): Promise<void> {
    const result = await this.request('/security/csrf');
    if (result.response.status !== 200) throw new Error('합성 HTTP CSRF 준비 실패');
    this.csrf = result.body.csrfToken;
  }
  async authenticate(accountId: string): Promise<void> {
    await this.refreshCsrf();
    const start = await this.request('/identity/challenges', {
      loginIdentifier: accountId + '@example.invalid',
    });
    if (start.response.status !== 200) throw new Error('로그인 준비 실패');
    const password = await this.request(
      '/identity/challenges/' + start.body.challengeId + '/responses',
      { challengeId: start.body.challengeId, response: this.credentials.password },
    );
    if (password.response.status !== 200) throw new Error('Password 확인 실패');
    await this.refreshCsrf();
    const id = password.body.challengeId;
    const factor = await this.request('/identity/challenges/' + id + '/responses', {
      challengeId: id,
      response: this.credentials.factor,
    });
    if (factor.response.status !== 200) throw new Error('MFA 확인 실패');
    if (factor.body.phase === 'MFA_VERIFIED') {
      await this.refreshCsrf();
      return;
    }
    const issued = await this.request('/identity/challenges/' + id + '/recovery-code-issues', {
      challengeId: id,
    });
    if (issued.response.status !== 200) throw new Error('복구 코드 발급 실패');
    const finished = await this.request(
      '/identity/challenges/' + id + '/recovery-code-acknowledgements',
      { challengeId: id, setId: issued.body.setId, stored: true },
    );
    if (finished.response.status !== 200 || finished.body.phase !== 'MFA_VERIFIED')
      throw new Error('보관 확인 실패');
    await this.refreshCsrf();
  }
}
