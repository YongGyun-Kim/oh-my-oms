import { readFileSync, statSync } from 'node:fs';
import { createPrivateKey, X509Certificate } from 'node:crypto';
import { requireCondition } from '@oms/contracts';
export function tlsConfiguration(
  env: NodeJS.ProcessEnv,
  hostname: string,
): { key: string; cert: string; minVersion: 'TLSv1.2'; maxVersion: 'TLSv1.3' } {
  const keyPath = env.OMS_TLS_KEY_FILE;
  const certPath = env.OMS_TLS_CERT_FILE;
  if (keyPath)
    requireCondition(
      (statSync(keyPath).mode & 0o077) === 0,
      503,
      'TLS_KEY_PERMISSIONS',
      '인증서 개인 키의 제한된 파일 권한이 필요합니다.',
    );
  const key = env.OMS_TLS_KEY_PEM ?? (keyPath ? readFileSync(keyPath, 'utf8') : '');
  const cert = env.OMS_TLS_CERT_PEM ?? (certPath ? readFileSync(certPath, 'utf8') : '');
  requireCondition(
    key.length > 0 && key.length <= 16384 && cert.length > 0 && cert.length <= 65536,
    503,
    'TLS_MATERIAL_REQUIRED',
    '실제 서버 인증서와 키가 필요합니다.',
  );
  const privateKey = createPrivateKey(key);
  const certificate = new X509Certificate(cert);
  requireCondition(
    certificate.checkPrivateKey(privateKey) &&
      certificate.checkHost(hostname) &&
      Date.parse(certificate.validFrom) <= Date.now() &&
      Date.parse(certificate.validTo) > Date.now(),
    503,
    'TLS_IDENTITY_CONFIGURATION',
    '현재 서버 이름·기간·키가 일치하는 인증서가 필요합니다.',
  );
  requireCondition(
    (privateKey.asymmetricKeyType === 'rsa' &&
      (privateKey.asymmetricKeyDetails?.modulusLength ?? 0) >= 2048) ||
      (privateKey.asymmetricKeyType === 'ec' &&
        ['prime256v1', 'secp384r1'].includes(privateKey.asymmetricKeyDetails?.namedCurve ?? '')),
    503,
    'TLS_KEY_CONFIGURATION',
    '지원되는 서버 암호 키가 필요합니다.',
  );
  return { key, cert, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.3' };
}
