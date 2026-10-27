// Hand-written response shape map derived from docs/reference/api-contract.md.
// Props: key -> type string ('string','number','boolean','object','array','any', joined by '|' with 'null')
// or nested { props } / { type: 'array', items }. A trailing '?' on the key marks it optional.

const UUID = 'string';
const topicRef = { props: { id: UUID, title: 'string', topicDate: 'string' } };
const page = (listKey, item) => ({
  props: { currentPage: 'number', pageSize: 'number', hasNext: 'boolean', 'randomSeed?': 'string|null', [listKey]: { type: 'array', items: item } },
});
const tokens = { accessToken: 'string', expiresIn: 'number', refreshToken: 'string', refreshTokenExpiresIn: 'number' };

const socialLogin = {
  props: { status: 'string', 'userId?': 'string', 'accessToken?': 'string', 'expiresIn?': 'number', 'refreshToken?': 'string', 'refreshTokenExpiresIn?': 'number' },
  extra(body) {
    if (body.status !== 'LOGIN_SUCCESS') return [];
    return ['userId', ...Object.keys(tokens)].filter((k) => body[k] === undefined).map((k) => `$.${k}: required for LOGIN_SUCCESS`);
  },
};

const aiReview = {
  props: { status: 'string', 'requestedAt?': 'string|null', 'completedAt?': 'string|null', 'result?': 'object|null', canRequestAgain: 'boolean' },
};

const postListItem = {
  props: {
    id: UUID, authorId: UUID, originalImageUrl: 'string', 'thumbnailImageUrl?': 'string|null', signatureOriginalImageUrl: 'string',
    'signatureThumbnailImageUrl?': 'string|null', 'title?': 'string|null', submittedAt: 'string', likeCount: 'number', isLiked: 'boolean', isMine: 'boolean',
  },
};

const notificationItem = {
  props: { id: UUID, type: 'string', 'sourceType?': 'string|null', 'sourceId?': 'string|null', title: 'string', body: 'string', 'thumbnailImageUrl?': 'string|null', readAt: 'string|null', createdAt: 'string' },
};

export const ROUTE_SCHEMAS = [
  { name: 'social-login', method: 'POST', pattern: /^\/api\/v1\/auth\/social-login$/, statuses: [200], schema: socialLogin },
  { name: 'refresh', method: 'POST', pattern: /^\/api\/v1\/auth\/refresh$/, statuses: [200], schema: { props: tokens } },
  { name: 'posts-today', method: 'GET', pattern: /^\/api\/v1\/posts\/today$/, statuses: [200], schema: { props: { topicDate: 'string', isPosted: 'boolean', postId: 'string|null', moderationStatus: 'string|null' } } },
  { name: 'posts-calendar', method: 'GET', pattern: /^\/api\/v1\/posts\/calendar$/, statuses: [200], schema: { props: { year: 'number', month: 'number', posts: { type: 'array', items: { props: { topicDate: 'string', postId: UUID, thumbnailImageUrl: 'string|null', status: 'string' } } } } } },
  { name: 'posts-uploads', method: 'POST', pattern: /^\/api\/v1\/posts\/uploads$/, statuses: [200], schema: { props: { uploadId: UUID, uploadUrl: 'string', expiresInSeconds: 'number', contentType: 'string', maxBytes: 'number' } } },
  { name: 'posts-list', method: 'GET', pattern: /^\/api\/v1\/posts$/, statuses: [200], schema: page('posts', postListItem) },
  { name: 'post-detail', method: 'GET', pattern: /^\/api\/v1\/posts\/[0-9a-f-]{36}$/, statuses: [200], schema: { props: { id: UUID, authorId: UUID, topic: topicRef, originalImageUrl: 'string', 'thumbnailImageUrl?': 'string|null', signatureOriginalImageUrl: 'string', 'title?': 'string|null', likeCount: 'number', isLiked: 'boolean' } } },
  { name: 'ai-review', method: 'GET', pattern: /^\/api\/v1\/posts\/[0-9a-f-]{36}\/ai-review$/, statuses: [200], schema: aiReview },
  { name: 'ai-review-request', method: 'POST', pattern: /^\/api\/v1\/posts\/[0-9a-f-]{36}\/ai-review$/, statuses: [200, 202], schema: aiReview },
  { name: 'topic', method: 'GET', pattern: /^\/api\/v1\/topics$/, statuses: [200], schema: { props: { id: UUID, title: 'string', topicDate: 'string', startsAt: 'string', endsAt: 'string', phase: 'string' } } },
  { name: 'banners', method: 'GET', pattern: /^\/api\/v1\/banners$/, statuses: [200], schema: page('banners', { props: { id: UUID, title: 'string', 'subtitle?': 'string|null', webViewUrl: 'string', thumbnailUrl: 'string', createdAt: 'string' } }) },
  { name: 'notifications', method: 'GET', pattern: /^\/api\/v1\/notifications$/, statuses: [200], schema: page('notifications', notificationItem) },
  { name: 'unread-status', method: 'GET', pattern: /^\/api\/v1\/notifications\/unread-status$/, statuses: [200], schema: { props: { hasUnread: 'boolean' } } },
];

export function findSchema(method, path, status) {
  const route = ROUTE_SCHEMAS.find((r) => r.method === method && r.pattern.test(path) && r.statuses.includes(status));
  return route ? { ...route.schema, name: route.name } : null;
}

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const matchesType = (v, spec) => spec.split('|').some((t) => t === 'any' || t === typeOf(v));

function checkValue(value, spec, at) {
  if (typeof spec === 'string') return matchesType(value, spec) ? [] : [`${at}: expected ${spec}, got ${typeOf(value)}`];
  if (spec.type === 'array') return checkArray(value, spec, at);
  return checkObject(value, spec, at);
}

function checkArray(value, spec, at) {
  if (!Array.isArray(value)) return [`${at}: expected array, got ${typeOf(value)}`];
  return value.flatMap((item, i) => checkValue(item, spec.items, `${at}[${i}]`));
}

function checkObject(value, spec, at) {
  if (typeOf(value) !== 'object') return [`${at}: expected object, got ${typeOf(value)}`];
  const errors = [];
  for (const [rawKey, sub] of Object.entries(spec.props)) {
    const optional = rawKey.endsWith('?');
    const key = optional ? rawKey.slice(0, -1) : rawKey;
    if (value[key] === undefined) {
      if (!optional) errors.push(`${at}.${key}: required key missing`);
      continue;
    }
    errors.push(...checkValue(value[key], sub, `${at}.${key}`));
  }
  if (spec.extra) errors.push(...spec.extra(value).map((m) => m.replace(/^\$/, at)));
  return errors;
}

/** Returns a list of human-readable shape errors (empty when valid). */
export function validateShape(body, schema) {
  return checkValue(body, schema.type ? schema : { props: schema.props, extra: schema.extra }, '$');
}
