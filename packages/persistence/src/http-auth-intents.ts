import { createHmac, randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { requireCondition } from '@oms/contracts';
export interface HttpAuthIntent {
  root: string;
  generation: string;
}
// Shared ephemeral response fence. No credentials, identity assertions or business authority.
export class HttpAuthIntents {
  constructor(
    private readonly source: DataSource,
    private readonly key: Buffer,
    private readonly audience: string,
  ) {
    requireCondition(
      key.length >= 32 && ['CUSTOMER', 'STAFF'].includes(audience),
      503,
      'AUTH_INTENT_CONFIGURATION',
      '인증 접점 키와 대상이 필요합니다.',
    );
  }
  private digest(kind: string, id: string): string {
    return createHmac('sha256', this.key)
      .update(this.audience + ':' + kind + ':' + id)
      .digest('hex');
  }
  private async capacity(manager: EntityManager, needed = 1): Promise<void> {
    await manager.query('SELECT singleton FROM u1_auth_capacity WHERE singleton=true FOR UPDATE');
    await manager.query('DELETE FROM u1_auth_intent WHERE expires_at<=clock_timestamp()');
    const rows = await manager.query('SELECT count(*)::integer AS count FROM u1_auth_intent');
    requireCondition(
      rows[0].count <= 2000 - needed,
      503,
      'AUTH_INTENT_CAPACITY',
      '인증을 잠시 후 다시 시작하세요.',
    );
  }
  async start(browser: string): Promise<HttpAuthIntent> {
    return this.source.transaction(async (manager) => {
      await this.capacity(manager, 2);
      const id = this.digest('browser', browser);
      const aliases = await manager.query(
        'SELECT root FROM u1_auth_intent WHERE id=$1 AND kind=$2',
        [id, 'BROWSER'],
      );
      const root = aliases[0]?.root ?? this.digest('root', randomUUID());
      const generation = randomUUID();
      await manager.query(
        `INSERT INTO u1_auth_intent(id,kind,root,generation,expires_at) VALUES($1,'ROOT',$1,$2,clock_timestamp()+interval '8 hours') ON CONFLICT(id) DO UPDATE SET generation=EXCLUDED.generation,expires_at=EXCLUDED.expires_at`,
        [root, generation],
      );
      await manager.query(
        `INSERT INTO u1_auth_intent(id,kind,root,generation,expires_at) VALUES($1,'BROWSER',$2,$3,clock_timestamp()+interval '8 hours') ON CONFLICT(id) DO UPDATE SET root=EXCLUDED.root,generation=EXCLUDED.generation,expires_at=EXCLUDED.expires_at`,
        [id, root, generation],
      );
      return { root, generation };
    });
  }
  async assertCurrent(intent: HttpAuthIntent): Promise<void> {
    const rows = await this.source.query(
      `SELECT id FROM u1_auth_intent WHERE id=$1 AND kind='ROOT' AND generation=$2 AND expires_at>clock_timestamp()`,
      [intent.root, intent.generation],
    );
    requireCondition(
      rows.length === 1,
      409,
      'AUTHENTICATION_SUPERSEDED',
      '현재 접점의 최신 인증을 확인하세요.',
    );
  }
  // 당사자 진행은 계정 로그인 세대를 바꾸지 않는다. 현재 접점의 응답 fence만 재사용한다.
  async purpose(browser: string): Promise<HttpAuthIntent> {
    return this.source.transaction(async (manager) => {
      await this.capacity(manager, 2);
      const id = this.digest('browser', browser);
      const rows = await manager.query(
        `SELECT r.id AS root,r.generation FROM u1_auth_intent b JOIN u1_auth_intent r ON r.id=b.root AND r.kind='ROOT' AND r.generation=b.generation WHERE b.id=$1 AND b.kind='BROWSER' AND b.expires_at>clock_timestamp() AND r.expires_at>clock_timestamp() FOR UPDATE OF r`,
        [id],
      );
      if (rows.length === 1) return rows[0] as HttpAuthIntent;
      const root = this.digest('root', randomUUID()),
        generation = randomUUID();
      await manager.query(
        `INSERT INTO u1_auth_intent(id,kind,root,generation,expires_at) VALUES($1,'ROOT',$1,$2,clock_timestamp()+interval '8 hours')`,
        [root, generation],
      );
      await manager.query(
        `INSERT INTO u1_auth_intent(id,kind,root,generation,expires_at) VALUES($1,'BROWSER',$2,$3,clock_timestamp()+interval '8 hours') ON CONFLICT(id) DO UPDATE SET root=EXCLUDED.root,generation=EXCLUDED.generation,expires_at=EXCLUDED.expires_at`,
        [id, root, generation],
      );
      return { root, generation };
    });
  }
  async challenge(challengeId: string, browser: string): Promise<HttpAuthIntent> {
    const rows = await this.source.query(
      `SELECT c.root,c.generation FROM u1_auth_intent c JOIN u1_auth_intent b ON b.root=c.root WHERE c.id=$1 AND c.kind='CHALLENGE' AND b.id=$2 AND b.kind='BROWSER' AND c.expires_at>clock_timestamp() AND b.expires_at>clock_timestamp()`,
      [this.digest('challenge', challengeId), this.digest('browser', browser)],
    );
    requireCondition(
      rows.length === 1,
      401,
      'CHALLENGE_BROWSER_MISMATCH',
      '현재 접점에서 인증을 다시 시작하세요.',
    );
    const intent = rows[0] as HttpAuthIntent;
    await this.assertCurrent(intent);
    return intent;
  }
  async assertSession(session: string, browser: string): Promise<void> {
    const rows = await this.source.query(
      `SELECT s.id FROM u1_auth_intent s JOIN u1_auth_intent r ON r.id=s.root AND r.kind='ROOT' AND r.generation=s.generation JOIN u1_auth_intent b ON b.root=s.root AND b.kind='BROWSER' WHERE s.id=$1 AND s.kind='SESSION' AND b.id=$2 AND s.expires_at>clock_timestamp() AND r.expires_at>clock_timestamp() AND b.expires_at>clock_timestamp()`,
      [this.digest('session', session), this.digest('browser', browser)],
    );
    requireCondition(
      rows.length === 1,
      401,
      'BROWSER_SESSION_SUPERSEDED',
      '이 접점의 최신 인증을 다시 확인하세요.',
    );
  }
  async attach(
    intent: HttpAuthIntent,
    kind: 'BROWSER' | 'CHALLENGE' | 'SESSION',
    value: string,
  ): Promise<void> {
    return this.attachAlias(intent, kind, value, kind === 'CHALLENGE' ? '5 minutes' : '8 hours');
  }
  // 소비/권위가 아닌 같은 browser의 원래 결과 응답 fence다.
  async attachPartyContinuation(intent: HttpAuthIntent, challengeId: string): Promise<void> {
    return this.attachAlias(intent, 'SESSION', 'u2-party:' + challengeId, '10 minutes');
  }
  private async attachAlias(
    intent: HttpAuthIntent,
    kind: 'BROWSER' | 'CHALLENGE' | 'SESSION',
    value: string,
    lifetime: string,
  ): Promise<void> {
    await this.source.transaction(async (manager) => {
      await this.capacity(manager);
      const current = await manager.query(
        `SELECT id FROM u1_auth_intent WHERE id=$1 AND kind='ROOT' AND generation=$2 AND expires_at>clock_timestamp() FOR UPDATE`,
        [intent.root, intent.generation],
      );
      requireCondition(
        current.length === 1,
        409,
        'AUTHENTICATION_SUPERSEDED',
        '최신 인증 의도를 확인하세요.',
      );
      await manager.query(
        `INSERT INTO u1_auth_intent(id,kind,root,generation,expires_at) VALUES($1,$2,$3,$4,clock_timestamp()+$5::interval) ON CONFLICT(id) DO UPDATE SET root=EXCLUDED.root,generation=EXCLUDED.generation,expires_at=EXCLUDED.expires_at`,
        [this.digest(kind.toLowerCase(), value), kind, intent.root, intent.generation, lifetime],
      );
    });
  }
}
