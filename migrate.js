/**
 * migrate.js — 一次性迁移：
 * 1) 把 user.password 放宽到 VARCHAR(255)（scrypt 哈希约 170 字符）
 * 2) 把历史明文密码改写为 scrypt 哈希（明文密码本身不变，用户照常登录）
 *
 * 用法：node migrate.js
 */

const pool = require('./db');
const { hashPassword, isHashed } = require('./auth');

(async () => {
  try {
    await pool.query('ALTER TABLE user MODIFY password VARCHAR(255) NOT NULL');
    console.log('[migrate] password 列已调整为 VARCHAR(255)');

    const [cols] = await pool.query("SHOW COLUMNS FROM user LIKE 'token_valid_after'");
    if (cols.length === 0) {
      await pool.query('ALTER TABLE user ADD COLUMN token_valid_after DATETIME NULL');
      console.log('[migrate] 已新增 token_valid_after 列');
    }

    const [rows] = await pool.query('SELECT id, username, password FROM user');
    let changed = 0;
    for (const u of rows) {
      if (!isHashed(u.password)) {
        await pool.query('UPDATE user SET password = ? WHERE id = ?', [hashPassword(u.password), u.id]);
        changed += 1;
        console.log(`[migrate] 已哈希 user_id=${u.id} (${u.username})`);
      }
    }
    console.log(`[migrate] 完成：${changed}/${rows.length} 条明文密码已升级`);
  } catch (err) {
    console.error('[migrate] 失败:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
