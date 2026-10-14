import {
  Stack,
  aws_cognito as cognito,
  aws_ecs as ecs,
  aws_iam as iam,
  aws_secretsmanager as secrets,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';
export interface IdentityResources {
  CUSTOMER: { pool: cognito.UserPool; client: cognito.UserPoolClient };
  STAFF: { pool: cognito.UserPool; client: cognito.UserPoolClient };
}
export function bindRoleRuntime(
  scope: Construct,
  role: 'customer-web' | 'staff-web' | 'api' | 'worker',
  taskRole: iam.Role,
  identity: IdentityResources,
  u2 = false,
) {
  // Values are manually verified console configuration, never generated fake
  // origins, MFA/identity grants or guessed company admission evidence.
  const name = Stack.of(scope).stackName + (u2 ? '/u2/' : '/u1/') + role + '/runtime';
  const configuration = secrets.Secret.fromSecretNameV2(scope, role + 'RuntimeConfiguration', name);
  const values: Record<string, ecs.Secret> = {},
    environment: Record<string, string> = {};
  const field = (variable: string, key: string) => {
    values[variable] = ecs.Secret.fromSecretsManager(configuration, key);
  };
  if (role.endsWith('web')) {
    field('OMS_WEB_ORIGIN', 'webOrigin');
    field('OMS_API_ORIGIN', 'apiOrigin');
  } else field('OMS_TELEMETRY_COLLECTOR_ORIGIN', 'telemetryCollectorOrigin');
  if (role === 'api') {
    for (const audience of ['CUSTOMER', 'STAFF'] as const) {
      const pool = identity[audience];
      environment['OMS_' + audience + '_POOL_ID'] = pool.pool.userPoolId;
      environment['OMS_' + audience + '_CLIENT_ID'] = pool.client.userPoolClientId;
      field('OMS_' + audience + '_CLIENT_SECRET', audience.toLowerCase() + 'ClientSecret');
      pool.pool.grant(taskRole, 'cognito-idp:AdminGetUser');
    }
    field('OMS_CUSTOMER_WEB_ORIGIN', 'customerWebOrigin');
    field('OMS_STAFF_WEB_ORIGIN', 'staffWebOrigin');
    field('OMS_CUSTOMER_COOKIE_KEY', 'customerCookieKey');
    field('OMS_STAFF_COOKIE_KEY', 'staffCookieKey');
    field('OMS_IDENTITY_VERIFIER_KEY', 'identityVerifierKey');
    field('OMS_TRANSPORT_HOST', 'transportHost');
  }
  if (u2 && (role === 'api' || role === 'worker')) {
    field('OMS_U2_PURPOSE_VERIFIER_KEY', 'purposeVerifierKey');
    field('OMS_U2_PURPOSE_VERIFIER_KEY_VERSION', 'purposeVerifierKeyVersion');
    field('OMS_U2_VAULT_KEY', 'vaultKey');
    field('OMS_U2_VAULT_KEY_VERSION', 'vaultKeyVersion');
    if (role === 'worker')
      for (const audience of ['CUSTOMER', 'STAFF'] as const) {
        const pool = identity[audience];
        environment['OMS_' + audience + '_POOL_ID'] = pool.pool.userPoolId;
        environment['OMS_' + audience + '_CLIENT_ID'] = pool.client.userPoolClientId;
        field('OMS_' + audience + '_CLIENT_SECRET', audience.toLowerCase() + 'ClientSecret');
        pool.pool.grant(
          taskRole,
          'cognito-idp:AdminGetUser',
          'cognito-idp:AdminDeleteSoftwareToken',
          'cognito-idp:AdminUserGlobalSignOut',
          'cognito-idp:AdminSetUserPassword',
        );
      }
  }
  return { values, environment, configurationName: name };
}
