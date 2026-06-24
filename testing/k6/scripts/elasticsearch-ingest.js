import http from 'k6/http';
import { check, fail } from 'k6';
import {
  ELASTICSEARCH,
  INDEX_NAME,
  DATASET,
  DOCS_PER_BATCH,
  INGEST_THRESHOLDS,
} from './config.js';

const lines = open(DATASET).trim().split('\n');
const expectedDocs = lines.length;

export const options = {
  scenarios: {
    ingest: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '1h',
    },
  },
  thresholds: INGEST_THRESHOLDS,
};

export function setup() {
  http.del(`${ELASTICSEARCH.baseUrl}/${INDEX_NAME}`, null, {
    headers: ELASTICSEARCH.headers,
    responseCallback: http.expectedStatuses(200, 404),
  });

  const body = JSON.stringify({
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0,
    },
    mappings: {
      properties: {
        id: { type: 'keyword' },
        title: { type: 'text' },
        text: { type: 'text' },
        metadata: { type: 'object', enabled: false },
      },
    },
  });

  const res = http.put(`${ELASTICSEARCH.baseUrl}/${INDEX_NAME}`, body, {
    headers: ELASTICSEARCH.headers,
  });
  check(res, { 'index created': (r) => r.status === 200 });
}

export default function () {
  for (let i = 0; i < lines.length; i += DOCS_PER_BATCH) {
    // The bulk api expects alternating action/document lines.
    const batch =
      lines
        .slice(i, i + DOCS_PER_BATCH)
        .flatMap((documentLine) => [
          JSON.stringify({ index: { _id: JSON.parse(documentLine).id } }),
          documentLine,
        ])
        .join('\n') + '\n';

    const res = http.post(
      `${ELASTICSEARCH.baseUrl}/${INDEX_NAME}/_bulk`,
      batch,
      {
        headers: {
          ...ELASTICSEARCH.headers,
          'Content-Type': 'application/x-ndjson',
        },
        timeout: '600s',
      },
    );

    const hasErrors = res.status === 200 ? res.json('errors') : true;
    check(res, {
      'bulk status 200': (r) => r.status === 200,
      'bulk no errors': () => hasErrors === false,
    });

    if (res.status !== 200 || hasErrors !== false) {
      fail(`Bulk ingest failed: ${res.status} ${res.body.slice(0, 1000)}`);
    }
  }

  const refresh = http.post(
    `${ELASTICSEARCH.baseUrl}/${INDEX_NAME}/_refresh`,
    null,
    {
      headers: ELASTICSEARCH.headers,
    },
  );
  check(refresh, { 'index refreshed': (r) => r.status === 200 });

  const count = http.get(`${ELASTICSEARCH.baseUrl}/${INDEX_NAME}/_count`, {
    headers: ELASTICSEARCH.headers,
  });
  const actual = count.json('count');
  console.log(`expected ${expectedDocs} docs, index reports ${actual}`);
  check(count, {
    'doc count matches': () => actual === expectedDocs,
  });
}
