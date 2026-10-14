import {
  Duration,
  RemovalPolicy,
  aws_ec2 as ec2,
  aws_kms as kms,
  aws_rds as rds,
  aws_secretsmanager as secrets,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { InfrastructureProfile } from './profile.js';
import type { foundationNetwork } from './network.js';
export function foundationStorage(
  scope: Construct,
  network: ReturnType<typeof foundationNetwork>,
  profile: InfrastructureProfile,
) {
  const make = (name: string, az: string, group: ec2.ISecurityGroup, storage: number) => {
    const key = new kms.Key(scope, name + 'Key', {
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const db = new rds.DatabaseInstance(scope, name, {
      vpc: network.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      availabilityZone: az,
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.of('17.11', '17'),
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
      allocatedStorage: storage,
      maxAllocatedStorage: storage,
      storageType: rds.StorageType.GP3,
      multiAz: false,
      publiclyAccessible: false,
      securityGroups: [group],
      credentials: rds.Credentials.fromGeneratedSecret('u1_admin'),
      storageEncrypted: true,
      storageEncryptionKey: key,
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
      backupRetention: Duration.days(7),
      deleteAutomatedBackups: false,
      autoMinorVersionUpgrade: false,
      allowMajorVersionUpgrade: false,
      parameterGroup: new rds.ParameterGroup(scope, name + 'Parameters', {
        engine: rds.DatabaseInstanceEngine.postgres({
          version: rds.PostgresEngineVersion.of('17.11', '17'),
        }),
        parameters: { 'rds.force_ssl': '1', max_connections: String(profile.maximumDbConnections) },
      }),
    });
    const appSecret = new secrets.Secret(scope, name + 'AppSecret', {
      encryptionKey: key,
      generateSecretString: { passwordLength: 64, excludePunctuation: true },
    });
    appSecret.applyRemovalPolicy(RemovalPolicy.RETAIN);
    // DDL/owner/admin credential is NOT granted to API/worker. App URL/least DB role
    // provision and protected journal permissions are explicit manual migration steps.
    return { db, key, appSecret };
  };
  return {
    // These are distinct manually provisioned role credentials, never the RDS
    // owner/admin credential. No synthetic URL is generated into a template.
    runtimeUrlFields: profile.u2Modules
      ? {
          primary: ['apiUrl', 'workerUrl'],
          journal: ['apiAppendUrl', 'workerAppendUrl', 'apiVaultUrl', 'workerVaultUrl'],
        }
      : { primary: ['url'], journal: ['url'] },
    primary: make(
      'PrimaryDatabase',
      profile.azNames[0],
      network.primary,
      profile.primaryStorageGiB,
    ),
    journal: make(
      'ProtectedJournal',
      profile.azNames[1],
      network.journal,
      profile.journalStorageGiB,
    ),
  };
}
