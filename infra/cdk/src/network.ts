import { aws_ec2 as ec2, aws_elasticloadbalancingv2 as elb } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { InfrastructureProfile } from './profile.js';
export function foundationNetwork(scope: Construct, profile: InfrastructureProfile) {
  const vpc = new ec2.Vpc(scope, 'Vpc', {
    availabilityZones: profile.azNames,
    ipAddresses: ec2.IpAddresses.cidr('10.40.0.0/16'),
    natGateways: 0,
    subnetConfiguration: [
      { name: 'TaskEgress', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
      { name: 'Storage', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
    ],
  });
  // Only explicitly configured Fargate egress tasks get a public address;
  // newly launched unrelated instances never inherit a subnet-wide default.
  for (const subnet of vpc.publicSubnets)
    (subnet.node.defaultChild as ec2.CfnSubnet).mapPublicIpOnLaunch = false;
  const group = (name: string) =>
    new ec2.SecurityGroup(scope, name, { vpc, allowAllOutbound: false });
  const customer = group('CustomerTaskSg');
  const staff = group('StaffTaskSg');
  const api = group('ApiTaskSg');
  const worker = group('WorkerTaskSg');
  const primary = group('PrimaryDbSg');
  const journal = group('JournalDbSg');
  const publicEdge = group('CustomerNlbSg');
  const privateEdge = group('PrivateNlbSg');
  publicEdge.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));
  for (const cidr of profile.companyCidrs)
    privateEdge.addIngressRule(ec2.Peer.ipv4(cidr), ec2.Port.tcp(443));
  for (const bff of [customer, staff]) {
    privateEdge.addIngressRule(bff, ec2.Port.tcp(8443));
    bff.addEgressRule(privateEdge, ec2.Port.tcp(8443));
  }
  customer.addIngressRule(publicEdge, ec2.Port.tcp(8443));
  publicEdge.addEgressRule(customer, ec2.Port.tcp(8443));
  staff.addIngressRule(privateEdge, ec2.Port.tcp(8443));
  api.addIngressRule(privateEdge, ec2.Port.tcp(8443));
  privateEdge.addEgressRule(staff, ec2.Port.tcp(8443));
  privateEdge.addEgressRule(api, ec2.Port.tcp(8443));
  for (const task of [api, worker])
    for (const db of [primary, journal]) {
      task.addEgressRule(db, ec2.Port.tcp(5432));
      db.addIngressRule(task, ec2.Port.tcp(5432));
    }
  // SG permits endpoint-class HTTPS only; actual destination/provider and domestic path
  // evidence remain activation gates. No arbitrary inbound task public-IP rule exists.
  for (const task of [customer, staff, api, worker])
    task.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));
  const publicNlb = new elb.NetworkLoadBalancer(scope, 'CustomerNlb', {
    vpc,
    internetFacing: true,
    securityGroups: [publicEdge],
    crossZoneEnabled: true,
    vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
  });
  const privateNlb = new elb.NetworkLoadBalancer(scope, 'PrivateNlb', {
    vpc,
    internetFacing: false,
    securityGroups: [privateEdge],
    crossZoneEnabled: true,
    vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
  });
  return { vpc, customer, staff, api, worker, primary, journal, publicNlb, privateNlb };
}
