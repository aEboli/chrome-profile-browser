const MAX_SERVICE_LENGTH = 120;
const MAX_ACCOUNT_LENGTH = 256;
const MAX_WEBSITE_LENGTH = 2048;
const MAX_PASSWORD_LENGTH = 4096;
const MAX_NOTES_LENGTH = 1000;
const MAX_PROFILE_ID_LENGTH = 128;

function text(value, label, limit, { required = false } = {}) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (required && !result) throw new Error(`${label}不能为空`);
  if (result.length > limit) throw new Error(`${label}不能超过 ${limit} 个字符`);
  return result;
}

function normalizeWebsite(value) {
  const website = text(value, '登录地址', MAX_WEBSITE_LENGTH);
  if (!website) return '';
  try {
    const parsed = new URL(website);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
    return parsed.toString();
  } catch {
    throw new Error('登录地址必须是有效的 HTTP 或 HTTPS 地址');
  }
}

function requirePasswordProfile(profiles, profileId) {
  const normalizedId = text(profileId, '环境编号', MAX_PROFILE_ID_LENGTH, { required: true });
  if (!Array.isArray(profiles) || !profiles.some((profile) => profile?.id === normalizedId)) {
    throw new Error('浏览器环境不存在');
  }
  return normalizedId;
}

function publicPasswordEntry(entry) {
  return {
    id: text(entry?.id, '记录编号', 128),
    profileId: text(entry?.profileId, '环境编号', MAX_PROFILE_ID_LENGTH, { required: true }),
    service: text(entry?.service, '服务名称', MAX_SERVICE_LENGTH),
    account: text(entry?.account, '账号', MAX_ACCOUNT_LENGTH),
    website: text(entry?.website, '登录地址', MAX_WEBSITE_LENGTH),
    notes: text(entry?.notes, '备注', MAX_NOTES_LENGTH),
    updatedAt: text(entry?.updatedAt, '更新时间', 64),
  };
}

function savePasswordEntry(entries, input, { profileId, makeId, protectSecret, now = () => new Date().toISOString() }) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('密码记录无效');
  const normalizedProfileId = text(profileId, '环境编号', MAX_PROFILE_ID_LENGTH, { required: true });
  const current = Array.isArray(entries) ? entries : [];
  const entryId = text(input.id, '记录编号', 128);
  const index = entryId ? current.findIndex((entry) => entry?.id === entryId) : -1;
  if (entryId && index < 0) throw new Error('密码记录不存在');
  const existing = index >= 0 ? current[index] : null;
  if (existing && existing.profileId !== normalizedProfileId) throw new Error('密码记录不属于所选浏览器环境');
  const password = typeof input.password === 'string' ? input.password : '';
  if (!existing && !password) throw new Error('密码不能为空');
  if (password.length > MAX_PASSWORD_LENGTH) throw new Error(`密码不能超过 ${MAX_PASSWORD_LENGTH} 个字符`);

  const record = {
    id: existing?.id || makeId(),
    profileId: normalizedProfileId,
    service: text(input.service, '服务名称', MAX_SERVICE_LENGTH, { required: true }),
    account: text(input.account, '账号', MAX_ACCOUNT_LENGTH, { required: true }),
    website: normalizeWebsite(input.website),
    notes: text(input.notes, '备注', MAX_NOTES_LENGTH),
    password: password ? protectSecret(password) : existing.password,
    updatedAt: now(),
  };
  if (index < 0) return [record, ...current];
  return current.map((entry, itemIndex) => itemIndex === index ? record : entry);
}

function getPasswordEntry(entries, profileId, entryId, revealSecret) {
  const normalizedProfileId = text(profileId, '环境编号', MAX_PROFILE_ID_LENGTH, { required: true });
  const normalizedId = text(entryId, '记录编号', 128, { required: true });
  const entry = (Array.isArray(entries) ? entries : []).find((item) => (
    item?.id === normalizedId && item?.profileId === normalizedProfileId
  ));
  if (!entry) throw new Error('密码记录不存在');
  const password = revealSecret(entry.password);
  if (!password) throw new Error('密码无法读取，请检查系统密钥环');
  return password;
}

function deletePasswordEntry(entries, profileId, entryId) {
  const normalizedProfileId = text(profileId, '环境编号', MAX_PROFILE_ID_LENGTH, { required: true });
  const normalizedId = text(entryId, '记录编号', 128, { required: true });
  const current = Array.isArray(entries) ? entries : [];
  if (!current.some((entry) => entry?.id === normalizedId && entry?.profileId === normalizedProfileId)) {
    throw new Error('密码记录不存在');
  }
  return current.filter((entry) => !(entry?.id === normalizedId && entry?.profileId === normalizedProfileId));
}

module.exports = {
  deletePasswordEntry,
  getPasswordEntry,
  publicPasswordEntry,
  requirePasswordProfile,
  savePasswordEntry,
};
