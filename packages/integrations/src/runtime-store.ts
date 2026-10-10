import { createDataSource, materialSchemas, ProtectedStore } from '@oms/persistence';
import type { RuntimeConfiguration } from './runtime-configuration.js';
export async function runtimeStore(
  config: Pick<RuntimeConfiguration, 'primaryUrl' | 'journalUrl' | 'databaseCa'> & {
    vaultUrl?: string;
  },
  role: 'api' | 'worker',
) {
  const primary = createDataSource(
    {
      url: config.primaryUrl,
      ca: config.databaseCa,
      applicationName: 'oms-' + role,
      role: role === 'api' ? 'api-primary' : 'worker-primary',
    },
    materialSchemas(),
  );
  const journal = createDataSource({
    url: config.journalUrl,
    ca: config.databaseCa,
    applicationName: 'oms-' + role + '-journal',
    role: role === 'api' ? 'api-protection' : 'worker-protection',
    protectionMaterial: 'append',
  });
  await primary.initialize();
  const vault = config.vaultUrl
    ? createDataSource({
        url: config.vaultUrl,
        ca: config.databaseCa,
        applicationName: 'oms-' + role + '-vault',
        role: role === 'api' ? 'api-protection' : 'worker-protection',
        protectionMaterial: 'vault',
      })
    : null;
  try {
    await journal.initialize();
    if (vault) await vault.initialize();
  } catch (error) {
    if (vault?.isInitialized) await vault.destroy();
    if (journal.isInitialized) await journal.destroy();
    await primary.destroy();
    throw error;
  }
  const close = async () => {
    if (vault?.isInitialized) await vault.destroy();
    await primary.destroy();
    await journal.destroy();
  };
  return { store: new ProtectedStore(primary, journal), vault, close };
}
