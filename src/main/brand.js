'use strict';

const path = require('node:path');
const packageMetadata = require('../../package.json');

const BRAND_ICON_PATH = path.join(__dirname, '..', 'assets', 'brand-icon.svg');
const BRAND_NATIVE_ICON_PATH = path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'brand-icon.ico' : 'brand-icon.png');
const BRAND_NAME = '简约指纹';
const DEFAULT_BRAND_DESCRIPTION = '本地隔离浏览器环境与连接节点管理';

function generateBrandDescription(source = packageMetadata.description) {
  const normalized = String(source || '')
    .replace(/Chromium\s+profile/gi, '浏览器环境')
    .replace(/代理节点工作台/g, '连接节点管理')
    .replace(/本地优先/g, '本地隔离')
    .replace(/\s+/g, '')
    .trim();
  const description = Array.from(normalized || DEFAULT_BRAND_DESCRIPTION).slice(0, 30).join('');
  return description || DEFAULT_BRAND_DESCRIPTION;
}

const BRAND_DESCRIPTION = generateBrandDescription();

module.exports = {
  BRAND_NAME,
  BRAND_DESCRIPTION,
  BRAND_ICON_PATH,
  BRAND_NATIVE_ICON_PATH,
  DEFAULT_BRAND_DESCRIPTION,
  generateBrandDescription,
};
