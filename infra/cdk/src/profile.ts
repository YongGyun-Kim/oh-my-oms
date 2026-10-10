import { isIP } from 'node:net';
import { requireCondition } from '@oms/contracts';
export interface InfrastructureProfile {
  mode: 'SYNTHETIC_SYNTH';
  account: '000000000000';
  region: 'ap-northeast-2';
  azNames: [string, string];
  companyCidrs: string[];
  imageDigest: string;
  primaryStorageGiB: number;
  journalStorageGiB: number;
  maxReplicas: 2;
  maximumDbConnections: number;
  loggingDays: number;
  u2Modules?: true;
}
export function validateInfrastructureProfile(profile: InfrastructureProfile): void {
  requireCondition(
    profile.mode === 'SYNTHETIC_SYNTH' &&
      profile.account === '000000000000' &&
      profile.region === 'ap-northeast-2',
    503,
    'INFRA_REAL_PROFILE_UNVERIFIED',
    '실제 계정·AZ·망·운영 준비 검증 전에는 합성 synth만 허용합니다.',
  );
  requireCondition(
    profile.azNames.length === 2 &&
      profile.azNames[0] !== profile.azNames[1] &&
      profile.azNames.every((name) => /^ap-northeast-2[a-d]$/.test(name)),
    503,
    'AZ_PROFILE_REQUIRED',
    '서로 다른 두 AZ가 필요합니다.',
  );
  requireCondition(
    profile.companyCidrs.length > 0 &&
      profile.companyCidrs.length <= 8 &&
      profile.companyCidrs.every(
        (value) =>
          value.startsWith('10.') &&
          isIP(value.split('/')[0]!) === 4 &&
          /^\d{1,2}$/.test(value.split('/')[1] ?? '') &&
          Number(value.split('/')[1]) >= 8 &&
          Number(value.split('/')[1]) <= 32,
      ),
    503,
    'COMPANY_NETWORK_PROFILE',
    '명시적 합성 사설 CIDR 범위가 필요합니다.',
  );
  requireCondition(
    /^sha256:[a-f0-9]{64}$/.test(profile.imageDigest) &&
      profile.maxReplicas === 2 &&
      profile.maximumDbConnections >= 72 &&
      profile.maximumDbConnections <= 1000,
    503,
    'CAPACITY_PROFILE',
    'image digest와 rolling pool 합계를 확인해야 합니다.',
  );
  requireCondition(
    Number.isInteger(profile.primaryStorageGiB) &&
      profile.primaryStorageGiB >= 20 &&
      profile.primaryStorageGiB <= 1000 &&
      Number.isInteger(profile.journalStorageGiB) &&
      profile.journalStorageGiB >= 20 &&
      profile.journalStorageGiB <= 1000 &&
      Number.isInteger(profile.loggingDays) &&
      profile.loggingDays === 7,
    503,
    'FINITE_INFRA_PROFILE',
    '유한 저장/합성 로그 수명이 필요합니다.',
  );
}
export const syntheticInfrastructureProfile: InfrastructureProfile = {
  mode: 'SYNTHETIC_SYNTH',
  account: '000000000000',
  region: 'ap-northeast-2',
  azNames: ['ap-northeast-2a', 'ap-northeast-2c'],
  companyCidrs: ['10.80.0.0/16'],
  imageDigest: 'sha256:' + '0'.repeat(64),
  primaryStorageGiB: 20,
  journalStorageGiB: 20,
  maxReplicas: 2,
  maximumDbConnections: 100,
  loggingDays: 7,
};
export const syntheticU2InfrastructureProfile: InfrastructureProfile = {
  ...syntheticInfrastructureProfile,
  u2Modules: true,
};
export function runtimePoolBudget(steady: number = 1, maximumHealthyPercent: number = 200) {
  requireCondition(
    Number.isInteger(steady) && steady === 1 && maximumHealthyPercent === 200,
    503,
    'U2_ROLLING_CAPACITY',
    'steady1/rolling최대2의 공유 pool 예산이 필요합니다.',
  );
  const replicas = Math.ceil((steady * maximumHealthyPercent) / 100),
    normalPrimary = steady * (10 + 5) + 2,
    normalJournal = steady * (4 + 1 + 2 + 1) + 2,
    rollingPrimary = replicas * (10 + 5) + 2,
    rollingJournal = replicas * (4 + 1 + 2 + 1) + 2;
  requireCondition(
    rollingPrimary <= 32 && rollingJournal <= 32,
    503,
    'U2_POOL_BUDGET',
    '전체 primary/journal 각32 예산을 초과할 수 없습니다.',
  );
  return {
    steady,
    rollingReplicasPerRole: replicas,
    api: { primary: 10, append: 4, vault: 1 },
    worker: { primary: 5, append: 2, vault: 1 },
    administrativePerDatabase: 2,
    administrativeRoles: ['snapshot', 'control'],
    normal: { primary: normalPrimary, journal: normalJournal },
    rolling: { primary: rollingPrimary, journal: rollingJournal },
    budgets: { primary: 32, journal: 32 },
  };
}
