import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import {
  MEILISEARCH,
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
  // Drop any previous run, then create a fresh index with a known primary key
  http.del(`${MEILISEARCH.baseUrl}/indexes/${INDEX_NAME}`, null, {
    headers: MEILISEARCH.headers,
  });

  const body = JSON.stringify({ uid: INDEX_NAME, primaryKey: 'id' });
  const res = http.post(`${MEILISEARCH.baseUrl}/indexes`, body, {
    headers: MEILISEARCH.headers,
  });
  check(res, { 'index enqueued': (r) => r.status === 202 });

  const searchable = http.put(
    `${MEILISEARCH.baseUrl}/indexes/${INDEX_NAME}/settings/searchable-attributes`,
    JSON.stringify(['title', 'text']),
    { headers: MEILISEARCH.headers },
  );
  check(searchable, {
    'searchable attributes enqueued': (r) => r.status === 202,
  });
}

export default function () {
  const url = `${MEILISEARCH.baseUrl}/indexes/${INDEX_NAME}/documents`;
  let lastTaskUid;

  for (let i = 0; i < lines.length; i += DOCS_PER_BATCH) {
    const batch = lines.slice(i, i + DOCS_PER_BATCH).join('\n') + '\n';

    const res = http.post(url, batch, {
      headers: {
        Authorization: `Bearer ${MEILISEARCH.apiKey}`,
        'Content-Type': 'application/x-ndjson',
      },
      timeout: '600s',
    });
    check(res, { 'ingest enqueued': (r) => r.status === 202 });

    lastTaskUid = res.json('taskUid');
    if (lastTaskUid === null || lastTaskUid === undefined) {
      fail(`No taskUid in response: ${res.status} ${res.body}`);
    }
  }

  // Meilisearch processes tasks sequentially in enqueue order, so polling the
  // last task until it finishes means all batches are done. This makes the
  // ingest duration cover the full indexing time, not just the enqueues.
  const taskUrl = `${MEILISEARCH.baseUrl}/tasks/${lastTaskUid}`;
  while (true) {
    const t = http.get(taskUrl, { headers: MEILISEARCH.headers });
    const status = t.json('status');

    if (status === 'succeeded') break;
    if (status === 'failed' || status === 'canceled') {
      fail(`Indexing task ${lastTaskUid} ${status}: ${t.body}`);
    }
    sleep(1);
  }

  // Verify the index contains exactly the number of documents we sent.
  // Catches silent data loss in any batch (parser dropping lines, primary-key
  // collisions, an earlier task failing, …) that the last task's status alone
  // would not reveal.
  const stats = http.get(`${MEILISEARCH.baseUrl}/indexes/${INDEX_NAME}/stats`, {
    headers: MEILISEARCH.headers,
  });
  const actual = stats.json('numberOfDocuments');
  console.log(`expected ${expectedDocs} docs, index reports ${actual}`);
  check(stats, {
    'doc count matches': () => actual === expectedDocs,
  });
}
