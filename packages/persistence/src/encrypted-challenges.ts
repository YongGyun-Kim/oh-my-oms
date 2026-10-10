import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { requireCondition } from '@oms/contracts';
interface ChallengeRow {
  id: string;
  ciphertext: string;
  iv: string;
  tag: string;
  deadline_at: Date;
  lease_id: string | null;
}
export interface ChallengeLease<T> {
  id: string;
  leaseId: string;
  value: T;
  consumed: boolean;
}
// Ephemeral encrypted authentication material: deliberately absent from business/Outbox/journal payloads.
export class EncryptedChallenges<T> {
  constructor(
    private readonly source: DataSource,
    private readonly key: Buffer,
  ) {
    requireCondition(
      key.length === 32,
      503,
      'CHALLENGE_KEY_REQUIRED',
      '인증 임시 자료 암호화 키가 필요합니다.',
    );
  }
  private seal(id: string, value: T) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv, { authTagLength: 16 });
    cipher.setAAD(Buffer.from('oms-auth-challenge:1:' + id));
    const serialized = JSON.stringify(value);
    requireCondition(
      Buffer.byteLength(serialized) <= 65536,
      503,
      'CHALLENGE_SIZE',
      '인증 임시 자료 크기를 초과했습니다.',
    );
    const ciphertext = Buffer.concat([cipher.update(serialized, 'utf8'), cipher.final()]);
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    };
  }
  private open(row: ChallengeRow): T {
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(row.iv, 'base64'), {
      authTagLength: 16,
    });
    decipher.setAAD(Buffer.from('oms-auth-challenge:1:' + row.id));
    decipher.setAuthTag(Buffer.from(row.tag, 'base64'));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(row.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8'),
    ) as T;
  }
  async create(id: string, value: T, deadline: Date): Promise<void> {
    const sealed = this.seal(id, value);
    await this.source.transaction(async (manager) => {
      await manager.query('SELECT singleton FROM u1_auth_capacity WHERE singleton=true FOR UPDATE');
      await manager.query(
        'DELETE FROM u1_auth_ephemeral WHERE deadline_at<=clock_timestamp() AND (lease_until IS NULL OR lease_until<=clock_timestamp())',
      );
      const counts = (await manager.query(
        'SELECT count(*)::integer AS count FROM u1_auth_ephemeral',
      )) as { count: number }[];
      requireCondition(
        counts[0]!.count < 1000,
        503,
        'CHALLENGE_CAPACITY',
        '인증을 잠시 후 다시 시도하세요.',
      );
      await manager.query(
        'INSERT INTO u1_auth_ephemeral(id,ciphertext,iv,tag,deadline_at) VALUES($1,$2,$3,$4,$5)',
        [id, sealed.ciphertext, sealed.iv, sealed.tag, deadline],
      );
    });
  }
  async inspect(id: string): Promise<T> {
    const rows = (await this.source.query(
      'SELECT * FROM u1_auth_ephemeral WHERE id=$1 AND deadline_at>clock_timestamp()',
      [id],
    )) as ChallengeRow[];
    requireCondition(rows[0], 401, 'CHALLENGE_EXPIRED', '인증을 현재 접점에서 다시 시작하세요.');
    return this.open(rows[0]);
  }
  async withLease<R>(id: string, operation: (lease: ChallengeLease<T>) => Promise<R>): Promise<R> {
    const leaseId = randomUUID();
    const found = (await this.source.query(
      `WITH claimed AS (UPDATE u1_auth_ephemeral SET lease_id=$2,lease_until=clock_timestamp()+interval '30 seconds' WHERE id=$1 AND deadline_at>clock_timestamp() AND (lease_until IS NULL OR lease_until<=clock_timestamp()) RETURNING *) SELECT * FROM claimed`,
      [id, leaseId],
    )) as ChallengeRow[];
    requireCondition(
      found[0],
      401,
      'CHALLENGE_EXPIRED',
      '인증을 다시 시작하거나 진행 중인 확인을 기다리세요.',
    );
    try {
      const lease: ChallengeLease<T> = { id, leaseId, value: this.open(found[0]), consumed: false };
      const result = await operation(lease);
      if (lease.consumed) {
        const removed = (await this.source.query(
          'WITH consumed AS (DELETE FROM u1_auth_ephemeral WHERE id=$1 AND lease_id=$2 AND lease_until>clock_timestamp() RETURNING id) SELECT * FROM consumed',
          [id, leaseId],
        )) as { id: string }[];
        requireCondition(
          removed.length === 1,
          503,
          'CHALLENGE_LEASE_LOST',
          '인증 원래 결과를 다시 확인하세요.',
        );
      } else {
        const sealed = this.seal(id, lease.value);
        const updated = (await this.source.query(
          'WITH saved AS (UPDATE u1_auth_ephemeral SET ciphertext=$3,iv=$4,tag=$5,lease_id=NULL,lease_until=NULL WHERE id=$1 AND lease_id=$2 AND lease_until>clock_timestamp() RETURNING id) SELECT * FROM saved',
          [id, leaseId, sealed.ciphertext, sealed.iv, sealed.tag],
        )) as { id: string }[];
        requireCondition(
          updated.length === 1,
          503,
          'CHALLENGE_LEASE_LOST',
          '인증 상태의 원래 결과를 다시 확인하세요.',
        );
      }
      return result;
    } finally {
      await this.source.query(
        'UPDATE u1_auth_ephemeral SET lease_id=NULL,lease_until=NULL WHERE id=$1 AND lease_id=$2',
        [id, leaseId],
      );
    }
  }
}
