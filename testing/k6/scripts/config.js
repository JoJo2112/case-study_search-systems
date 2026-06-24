export const HOST = 'host.docker.internal';

export const TYPESENSE = {
  baseUrl: `http://${HOST}:8108`,
  apiKey: 'xyz',
  headers: {
    'X-TYPESENSE-API-KEY': 'xyz',
    'Content-Type': 'application/json',
  },
};

export const MEILISEARCH = {
  baseUrl: `http://${HOST}:7700`,
  apiKey: 'xyz',
  headers: {
    Authorization: 'Bearer xyz',
    'Content-Type': 'application/json',
  },
};

export const ELASTICSEARCH = {
  baseUrl: `http://${HOST}:9200`,
  headers: {
    Authorization: 'Basic ZWxhc3RpYzp4eXo=',
    'Content-Type': 'application/json',
  },
};

export const DATASET = '/testdata/wiki_100000_documents.jsonl';
export const SEARCH_TERMS_FILE = '/data/queries.jsonl';
export const INDEX_NAME = 'wiki';

export const DOCS_PER_BATCH = 10000;

export const INGEST_THRESHOLDS = {
  http_req_failed: ['rate<0.01'],
};

// open-loop
// used by the *-search.js scripts
export const CAPACITY_STAGES = [
  { duration: '30s', target: 50 }, // warm-up
  { duration: '1m', target: 200 },
  { duration: '1m', target: 500 },
  { duration: '1m', target: 1000 },
  { duration: '1m', target: 2000 },
  { duration: '30s', target: 0 }, // ramp-down
];

// statistics reported by every search test.
export const LATENCY_TREND_STATS = [
  'min',
  'med',
  'avg',
  'p(95)',
  'p(99)',
  'p(99.9)',
  'max',
];
