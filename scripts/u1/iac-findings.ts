interface Resource {
  Type: string;
  Properties?: Record<string, unknown>;
}
export interface Finding {
  ID: string;
  Severity: string;
  Status?: string;
  CauseMetadata?: { Resource?: string };
}
export function classifyInfrastructureFinding(
  finding: Finding,
  resources: Record<string, Resource>,
): {
  classification: 'FALSE_POSITIVE' | 'APPROVED_EXPOSURE_ACTIVATION_BLOCKED' | 'ACTIONABLE';
  reason: string;
} {
  const resourceName = finding.CauseMetadata?.Resource ?? '';
  const resource = resources[resourceName];
  // The scanner associates EFS's rule with a whole TaskDefinition location.
  if (finding.ID === 'AWS-0035' && resourceName.includes('.template.json:')) {
    const tasks = Object.values(resources).filter((row) => row.Type === 'AWS::ECS::TaskDefinition');
    if (
      tasks.length === 4 &&
      tasks.every(
        (row) =>
          Array.isArray(row.Properties?.Volumes) &&
          (row.Properties.Volumes as Record<string, unknown>[]).every(
            (volume) => Object.keys(volume).length === 1 && volume.Name === 'RuntimeTmp',
          ),
      )
    )
      return {
        classification: 'FALSE_POSITIVE',
        reason:
          '4개 task volume은 이름만 있는 Fargate 임시 저장이며 EFSVolumeConfiguration이 없습니다. EFS가 추가되면 이 판정은 적용되지 않습니다.',
      };
  }
  if (
    finding.ID === 'AWS-0053' &&
    resourceName.startsWith('CustomerNlb') &&
    resource?.Type === 'AWS::ElasticLoadBalancingV2::LoadBalancer' &&
    resource.Properties?.Scheme === 'internet-facing'
  ) {
    const listeners = Object.values(resources).filter(
      (row) => row.Type === 'AWS::ElasticLoadBalancingV2::Listener',
    );
    const edges = Object.values(resources).filter(
      (row) => row.Type === 'AWS::ElasticLoadBalancingV2::LoadBalancer',
    );
    if (
      edges.length === 2 &&
      edges.filter((row) => row.Properties?.Scheme === 'internet-facing').length === 1 &&
      listeners.length === 3 &&
      listeners.every(
        (row) =>
          row.Properties?.Protocol === 'TCP' && [443, 8443].includes(Number(row.Properties?.Port)),
      )
    )
      return {
        classification: 'APPROVED_EXPOSURE_ACTIVATION_BLOCKED',
        reason:
          '승인 NI-01의 고객 공개 TLS edge입니다. 내부 NLB/task 공개 허가가 아니며 실제 TLS/망/접속 증거 전 배포는 차단됩니다.',
      };
  }
  if (
    finding.ID === 'AWS-0104' &&
    /^(Customer|Staff|Api|Worker)TaskSg/.test(resourceName) &&
    resource?.Type === 'AWS::EC2::SecurityGroup'
  ) {
    const egress = resource.Properties?.SecurityGroupEgress as
      Record<string, unknown>[] | undefined;
    const inbound = resource.Properties?.SecurityGroupIngress as
      Record<string, unknown>[] | undefined;
    if (
      egress?.length &&
      egress.every(
        (row) =>
          (row.CidrIp !== '0.0.0.0/0' && row.CidrIpv6 !== '::/0') ||
          (row.IpProtocol === 'tcp' && row.FromPort === 443 && row.ToPort === 443),
      ) &&
      !inbound?.some((row) => row.CidrIp === '0.0.0.0/0' || row.CidrIpv6 === '::/0')
    )
      return {
        classification: 'APPROVED_EXPOSURE_ACTIVATION_BLOCKED',
        reason:
          '승인된 NAT 없는 task HTTPS443 송신 후보이며 임의 포트/inbound는 거절합니다. 실제 endpoint/국내 처리 경로 증거 전 운영 활성화를 차단합니다.',
      };
  }
  return {
    classification: 'ACTIONABLE',
    reason: '상위 승인과 실제 구성의 좁은 일치가 확인되지 않은 검사 결과입니다.',
  };
}
