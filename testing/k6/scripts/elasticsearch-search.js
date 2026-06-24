import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
import { SharedArray } from 'k6/data';
import {
  ELASTICSEARCH,
  INDEX_NAME,
  SEARCH_TERMS_FILE,
  CAPACITY_STAGES,
  LATENCY_TREND_STATS,
} from './config.js';

const terms = new SharedArray('terms', () =>
  open(SEARCH_TERMS_FILE)
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line).text),
);

export const options = {
  scenarios: {
    capacity: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 1000,
      stages: CAPACITY_STAGES,
    },
  },
  summaryTrendStats: LATENCY_TREND_STATS,
};

export default function () {
  // Round-robin over the term list so every run issues the same query mix.
  const term = terms[exec.scenario.iterationInTest % terms.length];
  const body = JSON.stringify({
    // fuzziness AUTO gives Levenshtein typo tolerance, comparable to the
    //  behaviour of Meilisearch and Typesense.
    query: {
      multi_match: {
        query: term,
        fields: ['title', 'text'],
        fuzziness: 'AUTO',
      },
    },
    size: 10,
  });

  const res = http.post(
    `${ELASTICSEARCH.baseUrl}/${INDEX_NAME}/_search`,
    body,
    { headers: ELASTICSEARCH.headers },
  );
  check(res, { 'status 200': (r) => r.status === 200 });
}
