import { performance } from 'node:perf_hooks';
import { trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { AlwaysOnSampler, BatchSpanProcessor } from '@opentelemetry/sdk-trace';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { requireCondition } from '@oms/contracts';
import { collectorEndpoint, correlationHash } from './telemetry-policy.js';
import type { Observation, ObservationPort } from '@oms/contracts';
export class RuntimeTelemetry implements ObservationPort {
  private readonly sdk: NodeSDK;
  private readonly processor: BatchSpanProcessor;
  private readonly reader: PeriodicExportingMetricReader;
  private readonly meterProvider: MeterProvider;
  private generated = 0;
  private completed = 0;
  private exportFailures = 0;
  private exported = 0;
  private metricExportFailures = 0;
  readonly limits = Object.freeze({
    queue: 512,
    batch: 64,
    flushMilliseconds: 1000,
    exporterMilliseconds: 1000,
    metricCardinality: 256,
  });
  constructor(
    endpoint: string,
    synthetic: boolean,
    private readonly registeredOperations: ReadonlySet<string>,
  ) {
    const origin = collectorEndpoint(endpoint, synthetic);
    const traceExporter = new OTLPTraceExporter({
      url: origin + '/v1/traces',
      headers: {},
      timeoutMillis: 1000,
    });
    const exportOriginal = traceExporter.export.bind(traceExporter);
    traceExporter.export = (spans, callback) =>
      exportOriginal(spans, (result) => {
        if (result.code !== 0) this.exportFailures++;
        else this.exported += spans.length;
        callback(result);
      });
    const metricExporter = new OTLPMetricExporter({
      url: origin + '/v1/metrics',
      headers: {},
      timeoutMillis: 1000,
    });
    const metricExportOriginal = metricExporter.export.bind(metricExporter);
    metricExporter.export = (data, callback) =>
      metricExportOriginal(data, (result) => {
        if (result.code !== 0) this.metricExportFailures++;
        callback(result);
      });
    this.reader = new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 1000,
      exportTimeoutMillis: 1000,
      cardinalityLimits: { default: 256 },
      maxExportBatchSize: 64,
    });
    this.meterProvider = new MeterProvider({ readers: [this.reader] });
    this.processor = new BatchSpanProcessor({
      exporter: traceExporter,
      maxQueueSize: 512,
      maxExportBatchSize: 64,
      scheduledDelayMillis: 1000,
      exportTimeoutMillis: 1000,
      selfObsMeterProvider: this.meterProvider,
    });
    this.sdk = new NodeSDK({
      serviceName: 'oms-u1',
      autoDetectResources: false,
      sampler: new AlwaysOnSampler(),
      spanProcessors: [this.processor],
      metricReaders: [],
      instrumentations: [],
      spanLimits: {
        attributeCountLimit: 16,
        attributeValueLengthLimit: 128,
        eventCountLimit: 0,
        linkCountLimit: 0,
      },
    });
    this.sdk.start();
  }
  begin(
    role: 'api' | 'worker' | 'customer-web' | 'staff-web',
    audience: string,
    operation: string,
    correlationId: string,
  ): Observation {
    requireCondition(
      ['api', 'worker', 'customer-web', 'staff-web'].includes(role) &&
        ['CUSTOMER', 'STAFF', 'SYSTEM', 'PRE_IDENTITY'].includes(audience) &&
        this.registeredOperations.has(operation),
      503,
      'TELEMETRY_LABEL',
      '등록된 최소 관측 문맥이 필요합니다.',
    );
    const correlation = correlationHash(correlationId);
    this.generated++;
    const start = performance.now();
    const span = trace.getTracer('oms-u1', '1').startSpan(operation, {
      kind: role === 'worker' ? SpanKind.CONSUMER : SpanKind.SERVER,
      attributes: {
        'oms.role': role,
        'oms.audience': audience,
        'oms.operation': operation,
        'oms.correlation_hash': correlation,
      },
    });
    let finished = false;
    return {
      finish: (metadata) => {
        if (finished) return;
        requireCondition(
          metadata !== null &&
            typeof metadata === 'object' &&
            Object.keys(metadata).every((key) =>
              ['outcome', 'status', 'knowledge', 'eligibleDelayMilliseconds'].includes(key),
            ) &&
            [
              'SUCCESS',
              'ACCEPTED_NOT_COMPLETED',
              'ACCESS_REFUSAL',
              'BUSINESS_REFUSAL',
              'NON_DISCLOSURE',
              'OVERLOADED',
              'TECHNICAL_FAILURE',
              'UNKNOWN_EXTERNAL',
            ].includes(metadata.outcome) &&
            (metadata.status === undefined ||
              (Number.isInteger(metadata.status) &&
                metadata.status >= 0 &&
                metadata.status <= 999)) &&
            (metadata.knowledge === undefined ||
              (Array.isArray(metadata.knowledge) &&
                metadata.knowledge.length <= 4 &&
                metadata.knowledge.every((value) =>
                  ['KNOWN', 'UNKNOWN', 'CONFLICT', 'UNAVAILABLE'].includes(value),
                ))) &&
            (metadata.eligibleDelayMilliseconds === undefined ||
              (Number.isFinite(metadata.eligibleDelayMilliseconds) &&
                metadata.eligibleDelayMilliseconds >= 0)),
          503,
          'TELEMETRY_METADATA',
          '등록된 최소관측 결과만 허용합니다.',
        );
        finished = true;
        this.completed++;
        const attributes = { role, audience, operation, outcome: metadata.outcome };
        const meter = this.meterProvider.getMeter('oms-u1', '1');
        meter.createCounter('oms.operation.first_results').add(1, attributes);
        meter
          .createHistogram('oms.operation.duration_ms')
          .record(performance.now() - start, attributes);
        span.setAttribute('oms.outcome', metadata.outcome);
        if (metadata.status !== undefined)
          span.setAttribute('http.response.status_code', metadata.status);
        for (const knowledge of metadata.knowledge ?? [])
          if (['KNOWN', 'UNKNOWN', 'CONFLICT', 'UNAVAILABLE'].includes(knowledge))
            meter.createCounter('oms.source.knowledge').add(1, { role, operation, knowledge });
        if (metadata.eligibleDelayMilliseconds !== undefined)
          meter
            .createHistogram('oms.worker.first_durable_start_delay_ms')
            .record(metadata.eligibleDelayMilliseconds, { role, operation });
        span.setStatus({
          code: ['TECHNICAL_FAILURE', 'UNKNOWN_EXTERNAL'].includes(metadata.outcome)
            ? SpanStatusCode.ERROR
            : SpanStatusCode.OK,
        });
        span.end();
      },
    };
  }
  snapshot() {
    return {
      generated: this.generated,
      completed: this.completed,
      unfinished: this.generated - this.completed,
      exported: this.exported,
      pendingOrDroppedOrFailed: this.completed - this.exported,
      exportFailures: this.exportFailures,
      metricExportFailures: this.metricExportFailures,
      deliveryConfirmed: false,
      limits: this.limits,
    };
  }
  async flush(): Promise<void> {
    await Promise.all([
      this.processor.forceFlush(),
      this.reader.forceFlush({ timeoutMillis: 3000 }),
    ]);
  }
  async close(): Promise<void> {
    await Promise.all([this.sdk.shutdown(), this.meterProvider.shutdown()]);
  }
}
