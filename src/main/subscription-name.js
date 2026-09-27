'use strict';

const MAX_SUBSCRIPTION_NAME_LENGTH = 120;
const DEFAULT_SUBSCRIPTION_NAME = '在线订阅';

function normalizeSubscriptionName(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, MAX_SUBSCRIPTION_NAME_LENGTH);
}

function deriveSubscriptionName(value) {
  const source = typeof value === 'string' ? value.trim() : '';
  if (!source) return '';
  try {
    const url = new URL(source);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return '';
    return url.hostname.replace(/^\[|\]$/g, '');
  } catch {
    return '';
  }
}

function resolveSubscriptionName({ name, existingName, url } = {}) {
  const requested = normalizeSubscriptionName(name);
  if (requested) return requested;

  const previous = normalizeSubscriptionName(existingName);
  if (previous && previous !== DEFAULT_SUBSCRIPTION_NAME && !/^订阅\d+$/u.test(previous)) return previous;

  return deriveSubscriptionName(url) || previous || DEFAULT_SUBSCRIPTION_NAME;
}

module.exports = {
  DEFAULT_SUBSCRIPTION_NAME,
  MAX_SUBSCRIPTION_NAME_LENGTH,
  deriveSubscriptionName,
  normalizeSubscriptionName,
  resolveSubscriptionName,
};
