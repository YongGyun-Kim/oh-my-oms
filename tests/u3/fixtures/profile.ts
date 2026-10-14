// Configuration loaders must not pull database or application runtime modules in.
export function assertU3DatabaseProfile(value = process.env.OMS_U3_DATABASE_PROFILE): void {
  if (value !== 'verification-isolated')
    throw new Error('명시적인 verification-isolated U3 합성 DB profile이 필요합니다.');
}
