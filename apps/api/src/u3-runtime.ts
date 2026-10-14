import { requireCondition } from '@oms/contracts';

// 운영 소유자 등록을 추정하지 않는다. 이 선택은 미등록 경계를 가진 서버 host만 켠다.
export function u3RuntimeRequested(environment: NodeJS.ProcessEnv): boolean {
  const profile = environment.OMS_U3_RUNTIME_PROFILE;
  requireCondition(
    !Object.keys(environment).some(
      (key) => key.startsWith('OMS_U3_') && key !== 'OMS_U3_RUNTIME_PROFILE',
    ),
    503,
    'U3_RUNTIME_CONFIGURATION',
    '지원하는 명시 서버 구성만 사용할 수 있습니다.',
  );
  if (profile === undefined) return false;
  requireCondition(
    profile === 'UNREGISTERED',
    503,
    'U3_RUNTIME_CONFIGURATION',
    '실제 소유자 확인 없이 운영 등록을 주장할 수 없습니다.',
  );
  return true;
}
