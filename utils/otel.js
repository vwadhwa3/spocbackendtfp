// 'use strict';

// const { NodeSDK } = require('@opentelemetry/sdk-node');
// const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
// const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
// const { trace } = require('@opentelemetry/api');

// if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
//   console.log('🔕 OpenTelemetry disabled (no OTLP endpoint)');
//   module.exports = {};
//   return;
// }

// // 🔴 Proper header parsing
// let headers = {};

// if (process.env.OTEL_EXPORTER_OTLP_HEADERS) {
//   const headerString = process.env.OTEL_EXPORTER_OTLP_HEADERS;

//   // Expected format:
//   // Authorization=Basic XXXXX
//   const index = headerString.indexOf('=');

//   if (index > -1) {
//     const key = headerString.substring(0, index);
//     const value = headerString.substring(index + 1);
//     headers[key] = value;
//   }
// }

// const exporter = new OTLPTraceExporter({
//   url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
//   headers,
// });

// const sdk = new NodeSDK({
//   traceExporter: exporter,
//   instrumentations: [getNodeAutoInstrumentations()],
// });

// sdk.start();
// console.log('✅ OpenTelemetry initialized');

// // Test span
// setTimeout(() => {
//   const tracer = trace.getTracer('sanity-check');
//   const span = tracer.startSpan('grafana-ingestion-test');
//   span.end();
//   console.log('🧪 Test span sent to Grafana');
// }, 3000);

// module.exports = sdk;
'use strict';

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { trace } = require('@opentelemetry/api');

if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  console.log('🔕 OpenTelemetry disabled (no OTLP endpoint)');
  module.exports = {};
  return;
}

const exporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
    ? Object.fromEntries(
        process.env.OTEL_EXPORTER_OTLP_HEADERS
          .split(',')
          .map(h => h.split('='))
      )
    : {},
});

const resource = resourceFromAttributes({
  [SemanticResourceAttributes.SERVICE_NAME]: 'flying-panda-api-v2',
  [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: 'production',
});

const sdk = new NodeSDK({
  traceExporter: exporter,
  instrumentations: [getNodeAutoInstrumentations()],
  resource,
});

sdk.start();
console.log('✅ OpenTelemetry initialized');

// 🧪 Test span
setTimeout(() => {
  const tracer = trace.getTracer('sanity-check');
  const span = tracer.startSpan('grafana-ingestion-test');
  span.end();
  console.log('🧪 Test span sent to Grafana');
}, 3000);

module.exports = sdk;









