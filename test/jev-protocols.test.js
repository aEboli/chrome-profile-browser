const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DEFAULT_JEV_SETTINGS,
  PROVIDERS,
  authHeaders,
  buildJevRequest,
  endpointFor,
  normalizeBaseUrl,
  normalizeProvider,
  parseJevResponse,
} = require('../src/main/jev-protocols');

test('uses TypeSafe official JEV defaults and normalizes endpoints', () => {
  assert.equal(DEFAULT_JEV_SETTINGS.baseUrl, 'https://api.typesafe.ai');
  assert.deepEqual(PROVIDERS.map((provider) => provider.id), ['typesafe', 'custom']);
  assert.equal(normalizeProvider('official'), 'typesafe');
  assert.equal(normalizeProvider('openrouter'), 'custom');
  assert.equal(normalizeBaseUrl('https://api.typesafe.ai/v1/systemone', 'typesafe'), 'https://api.typesafe.ai');
  assert.equal(endpointFor('typesafe', ''), 'https://api.typesafe.ai/v1/systemone');
});

test('builds the official state/questions request and parses structured answers', () => {
  const request = buildJevRequest({
    provider: 'typesafe',
    baseUrl: 'https://api.typesafe.ai',
    model: 'jev-latest',
    token: 'typesafe-secret',
    state: { message: '用户要求退款' },
    questions: {
      refund: { type: 'noul', instructions: '是否要求退款？' },
    },
  });
  assert.equal(request.url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(request.headers.authorization, 'Bearer typesafe-secret');
  assert.deepEqual(request.body.questions.refund, { type: 'noul', instructions: '是否要求退款？' });

  const result = parseJevResponse({
    model: 'jev-1.13.0',
    answers: { refund: { type: 'noul', noul: 0.98 } },
    usage: { input_tokens: 12, output_tokens: 4 },
  });
  assert.equal(result.model, 'jev-1.13.0');
  assert.equal(result.answers.refund.noul, 0.98);
  assert.equal(result.usage.input_tokens, 12);
});

test('allows a custom JEV-compatible endpoint without changing the wire shape', () => {
  const request = buildJevRequest({
    provider: 'custom',
    baseUrl: 'https://jev.example.test/api/v1/models',
    model: 'custom-jev',
    token: 'custom-secret',
    state: 'hello',
    questions: { route: { type: 'choice', instructions: 'route', criteria: { a: 'a', b: 'b' } } },
  });
  assert.equal(request.url, 'https://jev.example.test/api/v1/systemone');
  assert.equal(request.headers.authorization, 'Bearer custom-secret');
  assert.equal(request.body.model, 'custom-jev');
});

test('rejects invalid JEV requests and unsafe base URLs', () => {
  assert.throws(() => buildJevRequest({ state: 'x', questions: {} }), /问题不能为空/);
  assert.throws(() => normalizeBaseUrl('file:///tmp/jev', 'custom'), /只支持 HTTP/);
  assert.equal(authHeaders('').authorization, undefined);
});
