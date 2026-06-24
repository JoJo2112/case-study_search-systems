import http from 'k6/http';
import { check } from 'k6';
import {
  TYPESENSE,
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
  // Drop any previous run, then create a fresh collection
  http.del(`${TYPESENSE.baseUrl}/collections/${INDEX_NAME}`, null, {
    headers: TYPESENSE.headers,
    responseCallback: http.expectedStatuses(200, 404),
  });

  const schema = JSON.stringify({
    name: INDEX_NAME,
    // Required so the "metadata" object field below can be stored.
    enable_nested_fields: true,
    fields: [
      { name: 'title', type: 'string' },
      { name: 'text', type: 'string' },
      { name: 'metadata', type: 'object', index: false, optional: true },
    ],
  });

  const res = http.post(`${TYPESENSE.baseUrl}/collections`, schema, {
    headers: TYPESENSE.headers,
  });
  check(res, { 'collection created': (r) => r.status === 201 });
}

export default function () {
  const url =
    `${TYPESENSE.baseUrl}/collections/${INDEX_NAME}/documents/import` +
    `?action=create`;

  for (let i = 0; i < lines.length; i += DOCS_PER_BATCH) {
    const batch = lines.slice(i, i + DOCS_PER_BATCH).join('\n') + '\n';

    const res = http.post(url, batch, {
      headers: {
        'X-TYPESENSE-API-KEY': TYPESENSE.apiKey,
        'Content-Type': 'text/plain',
      },
      timeout: '600s',
    });
    check(res, { 'import status 200': (r) => r.status === 200 });
  }

  // Verify the collection contains exactly the number of documents we sent.
  const info = http.get(`${TYPESENSE.baseUrl}/collections/${INDEX_NAME}`, {
    headers: TYPESENSE.headers,
  });
  const actual = info.json('num_documents');
  console.log(`expected ${expectedDocs} docs, collection reports ${actual}`);
  check(info, { 'doc count matches': () => actual === expectedDocs });
}
