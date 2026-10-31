/**
 * auth.js — 密码哈希与登录令牌
 *
 * 密码：scrypt + 每用户随机盐，存储格式 `scrypt$<salt>$<hash>`。
 * 令牌：HMAC-SHA256 签名的无状态 token，形如 `<payload>.<sig>`，默认 24 小时过期。
 * 密钥：优先读环境变量 AUTH_SECRET，否则读/建项目根目录的 .auth-secret。
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEYLEN = 64;
const TOKEN_TTL_SEC = 24 * 60 * 60;

function loadSecret() {
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 16) {
    return process.env.AUTH_SECRET;
  }
  const file = path.join(__dirname, '.auth-secret');
  try {
    const s = fs.readFileSync(file, 'utf8').trim();
    if (s.length >= 32) return s;
  } catch (e) {
    /* 首次运行，下面生成 */
  }
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, s, { mode: 0o600 });
  return s;
}

const SECRET = loadSecret();

/* ---------------- 密码 ---------------- */

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function isHashed(stored) {
  return typeof stored === 'string' && stored.startsWith('scrypt$');
}

/**
 * 校验密码。返回值里的 legacy=true 表示数据库里还是明文，
 * 调用方应在校验成功后立刻改写成哈希。
 */
function verifyPassword(password, stored) {
  if (!isHashed(stored)) {
    return { ok: String(password) === String(stored), legacy: true };
  }
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return { ok: false, legacy: false };
  const calc = crypto.scryptSync(String(password), salt, KEYLEN);
  const known = Buffer.from(hash, 'hex');
  const ok = known.length === calc.length && crypto.timingSafeEqual(known, calc);
  return { ok, legacy: false };
}

/* ---------------- 令牌 ---------------- */

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function signToken(user, ttlSec = TOKEN_TTL_SEC) {
  const payload = {
    uid: user.id,
    role: user.role || 'user',
    name: user.username,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch (e) {
    return null;
  }
  if (!payload || !payload.uid || !payload.exp) return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

module.exports = {
  hashPassword,
  isHashed,
  verifyPassword,
  signToken,
  verifyToken,
  TOKEN_TTL_SEC,
};
