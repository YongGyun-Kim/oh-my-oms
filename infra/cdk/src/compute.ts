import {
  Duration,
  RemovalPolicy,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_ecr as ecr,
  aws_iam as iam,
  aws_logs as logs,
  aws_elasticloadbalancingv2 as elb,
  aws_secretsmanager as secrets,
  aws_sqs as sqs,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { InfrastructureProfile } from './profile.js';
import { runtimePoolBudget } from './profile.js';
import type { foundationNetwork } from './network.js';
import type { foundationStorage } from './storage.js';
import { bindRoleRuntime } from './runtime-binding.js';
import type { IdentityResources } from './runtime-binding.js';
export function foundationCompute(
  scope: Construct,
  network: ReturnType<typeof foundationNetwork>,
  storage: ReturnType<typeof foundationStorage>,
  profile: InfrastructureProfile,
  queue: sqs.Queue,
  identity: IdentityResources,
  u2Queues: Record<string, sqs.Queue> = {},
) {
  runtimePoolBudget();
  const cluster = new ecs.Cluster(scope, 'Cluster', {
    vpc: network.vpc,
    containerInsightsV2: ecs.ContainerInsights.DISABLED,
  });
  const services: Record<string, ecs.FargateService> = {};
  for (const role of ['customer-web', 'staff-web', 'api', 'worker'] as const) {
    const ui = role.endsWith('web');
    const taskRole = new iam.Role(scope, role + 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    const executionRole = new iam.Role(scope, role + 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });
    const repository = new ecr.Repository(scope, role + 'Repository', {
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const task = new ecs.FargateTaskDefinition(scope, role + 'Task', {
      cpu: ui ? 256 : 512,
      memoryLimitMiB: ui ? 512 : 1024,
      taskRole,
      executionRole,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
      ephemeralStorageGiB: 21,
    });
    const logGroup = new logs.LogGroup(scope, role + 'Logs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const tls = new secrets.Secret(scope, role + 'TlsSecret', { secretName: undefined });
    tls.applyRemovalPolicy(RemovalPolicy.RETAIN);
    const environment: Record<string, string> = {
      NODE_ENV: 'production',
      OMS_ROLE: role,
      PORT: '8443',
      OMS_READINESS: 'REAL_ACTIVATION_UNVERIFIED',
      ...(profile.u2Modules ? { OMS_U2_RUNTIME_PROFILE: 'UNREGISTERED' } : {}),
    };
    const values: Record<string, ecs.Secret> = {};
    const runtime = bindRoleRuntime(scope, role, taskRole, identity, profile.u2Modules === true);
    Object.assign(environment, runtime.environment);
    Object.assign(values, runtime.values);
    if (role !== 'worker') {
      values.OMS_TLS_KEY_PEM = ecs.Secret.fromSecretsManager(tls, 'key');
      values.OMS_TLS_CERT_PEM = ecs.Secret.fromSecretsManager(tls, 'cert');
    }
    if (!ui) {
      values.OMS_PRIMARY_DATABASE_URL = ecs.Secret.fromSecretsManager(
        storage.primary.appSecret,
        profile.u2Modules ? (role === 'worker' ? 'workerUrl' : 'apiUrl') : 'url',
      );
      values.OMS_JOURNAL_DATABASE_URL = ecs.Secret.fromSecretsManager(
        storage.journal.appSecret,
        profile.u2Modules ? (role === 'worker' ? 'workerAppendUrl' : 'apiAppendUrl') : 'url',
      );
      if (profile.u2Modules)
        values.OMS_U2_VAULT_DATABASE_URL = ecs.Secret.fromSecretsManager(
          storage.journal.appSecret,
          role === 'worker' ? 'workerVaultUrl' : 'apiVaultUrl',
        );
      environment.OMS_DATABASE_CA_FILE = '/app/infra/cdk/assets/rds-ca-ap-northeast-2.pem';
    }
    if (role === 'worker') {
      environment.OMS_NOTICE_QUEUE_URL = queue.queueUrl;
      queue.grantSendMessages(taskRole);
      queue.grantConsumeMessages(taskRole);
      for (const [name, u2Queue] of Object.entries(u2Queues)) {
        environment[name] = u2Queue.queueUrl;
        u2Queue.grantSendMessages(taskRole);
        u2Queue.grantConsumeMessages(taskRole);
      }
    }
    const container = task.addContainer(role, {
      image: ecs.ContainerImage.fromEcrRepository(repository, profile.imageDigest),
      user: '1000:1000',
      readonlyRootFilesystem: true,
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: role, logGroup }),
      environment,
      secrets: values,
      stopTimeout: Duration.seconds(30),
      command: ui
        ? ['node', '--import', 'tsx', 'apps/' + role + '/server.ts']
        : ['node', '--import', 'tsx', 'apps/' + role + '/src/main.ts'],
    });
    task.addVolume({ name: 'RuntimeTmp' });
    container.addMountPoints({
      containerPath: '/tmp',
      sourceVolume: 'RuntimeTmp',
      readOnly: false,
    });
    if (role !== 'worker')
      container.addPortMappings({ containerPort: 8443, protocol: ecs.Protocol.TCP });
    const securityGroup =
      role === 'customer-web'
        ? network.customer
        : role === 'staff-web'
          ? network.staff
          : role === 'api'
            ? network.api
            : network.worker;
    const service = new ecs.FargateService(scope, role + 'Service', {
      cluster,
      taskDefinition: task,
      desiredCount: 1,
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [securityGroup],
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      circuitBreaker: { rollback: false },
      enableExecuteCommand: false,
    });
    const scaling = service.autoScaleTaskCount({
      minCapacity: 1,
      // maxReplicas includes old+new rolling tasks. With 200% deployment the
      // steady cap1 reserves two simultaneous API/worker replicas, not four.
      maxCapacity: 1,
    });
    void scaling; // No unmeasured CPU-only scaling policy.
    services[role] = service;
    if (role !== 'worker') {
      const nlb = role === 'customer-web' ? network.publicNlb : network.privateNlb;
      const listener = nlb.addListener(role + 'Tcp', {
        port: role === 'api' ? 8443 : 443,
        protocol: elb.Protocol.TCP,
      });
      listener.addTargets(role + 'Targets', {
        port: 8443,
        protocol: elb.Protocol.TCP,
        targets: [service],
        deregistrationDelay: Duration.seconds(30),
        preserveClientIp: true,
        healthCheck: { protocol: elb.Protocol.TCP, port: '8443' },
      });
    }
  }
  return { cluster, services };
}
