import {
  Stack,
  Duration,
  RemovalPolicy,
  CfnOutput,
  Tags,
  aws_sqs as sqs,
  aws_cognito as cognito,
  aws_sns as sns,
  aws_s3 as s3,
  aws_dynamodb as dynamodb,
  aws_kms as kms,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { validateInfrastructureProfile } from './profile.js';
import type { InfrastructureProfile } from './profile.js';
import { foundationNetwork } from './network.js';
import { foundationStorage } from './storage.js';
import { foundationCompute } from './compute.js';
import type { IdentityResources } from './runtime-binding.js';
export class OmsFoundationStack extends Stack {
  constructor(scope: Construct, id: string, profile: InfrastructureProfile) {
    validateInfrastructureProfile(profile);
    super(scope, id, {
      env: { account: profile.account, region: profile.region },
      description: 'U1 합성 offline synth. 실제 계정/망/자격/운영 준비 미검증: 배포 금지.',
    });
    Tags.of(this).add('oms.unit', 'u1-integrated-foundation');
    Tags.of(this).add('oms.profile', profile.mode);
    const network = foundationNetwork(this, profile);
    const storage = foundationStorage(this, network, profile);
    const key = new kms.Key(this, 'DeliveryKey', {
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const dlq = new sqs.Queue(this, 'NoticeConsumerDlq', {
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: key,
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const queue = new sqs.Queue(this, 'NoticeStandardQueue', {
      fifo: false,
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: key,
      visibilityTimeout: Duration.seconds(30),
      retentionPeriod: Duration.days(4),
      receiveMessageWaitTime: Duration.seconds(20),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 5 },
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const identity = {} as IdentityResources;
    for (const audience of ['Customer', 'Staff']) {
      const pool = new cognito.UserPool(this, audience + 'Pool', {
        selfSignUpEnabled: false,
        signInAliases: { email: true },
        mfa: cognito.Mfa.REQUIRED,
        mfaSecondFactor: { sms: false, otp: true },
        passwordPolicy: {
          minLength: 14,
          requireDigits: true,
          requireLowercase: true,
          requireUppercase: true,
          requireSymbols: true,
        },
        accountRecovery: cognito.AccountRecovery.NONE,
        removalPolicy: RemovalPolicy.RETAIN,
      });
      const client = pool.addClient(audience + 'ServerClient', {
        authFlows: { userPassword: true },
        generateSecret: true,
        preventUserExistenceErrors: true,
        accessTokenValidity: Duration.minutes(5),
        idTokenValidity: Duration.minutes(5),
        refreshTokenValidity: Duration.hours(8),
      });
      identity[audience === 'Customer' ? 'CUSTOMER' : 'STAFF'] = { pool, client };
    }
    const u2Queues: Record<string, sqs.Queue> = {};
    if (profile.u2Modules)
      for (const [variable, name] of [
        ['OMS_IDENTITY_QUEUE_URL', 'Identity'],
        ['OMS_HANDOFF_QUEUE_URL', 'Handoff'],
        ['OMS_INVITATION_QUEUE_URL', 'Invitation'],
      ]) {
        const dead = new sqs.Queue(this, name + 'ConsumerDlq', {
          encryption: sqs.QueueEncryption.KMS,
          encryptionMasterKey: key,
          retentionPeriod: Duration.days(14),
          enforceSSL: true,
          removalPolicy: RemovalPolicy.RETAIN,
        });
        u2Queues[variable!] = new sqs.Queue(this, name + 'StandardQueue', {
          fifo: false,
          encryption: sqs.QueueEncryption.KMS,
          encryptionMasterKey: key,
          visibilityTimeout: Duration.seconds(30),
          retentionPeriod: Duration.days(4),
          receiveMessageWaitTime: Duration.seconds(20),
          deadLetterQueue: { queue: dead, maxReceiveCount: 5 },
          enforceSSL: true,
          removalPolicy: RemovalPolicy.RETAIN,
        });
      }
    foundationCompute(this, network, storage, profile, queue, identity, u2Queues);
    new sns.Topic(this, 'OperationalEmailTopic', { masterKey: key }); // Actual recipients and subscription confirmation are unverified.
    new dynamodb.Table(this, 'OperationalMetadata', {
      partitionKey: { name: 'incidentId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'recordId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: key,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });
    new s3.Bucket(this, 'VerificationEvidence', {
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: key,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });
    new CfnOutput(this, 'ActivationState', {
      value:
        'UNVERIFIED_NO_DEPLOY: 계정/AZ/CIDR/TLS/DB-role/provider/수신/관측/보관/부하/복구 검증 필요',
    });
  }
}
