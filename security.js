/**
 * security.js — 轻量安全中间件
 *
 * rateLimit：按 IP + 路由计数的滑动窗口限流，内存实现，无需额外依赖。
 * 适用于单进程的小站；多进程部署时应换成 Redis 方案。
 */

function rateLimit({ windowMs = 10 * 60 * 1000, max = 10, message = '尝试过于频繁，请稍后再试' } = {}) {
  const hits = new Map(); // key -> { count, resetAt }

  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs).unref();

  return function (req, res, next) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${ip}:${req.method}:${req.path}`;
    const now = Date.now();
    let rec = hits.get(key);

    if (!rec || rec.resetAt <= now) {
      rec = { count: 0, resetAt: now + windowMs };
      hits.set(key, rec);
    }

    rec.count += 1;
    if (rec.count > max) {
      const retry = Math.ceil((rec.resetAt - now) / 1000);
      res.set('Retry-After', String(retry));
      return res.status(429).json({ code: 429, msg: `${message}（约 ${retry} 秒后重试）` });
    }
    next();
  };
}

module.exports = { rateLimit };
