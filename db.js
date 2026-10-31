const mysql = require('mysql2/promise');

// 支持环境变量（云端部署）与本地默认值（本机开发）
const sslEnabled = String(process.env.DB_SSL || '').toLowerCase() === 'true';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'blog_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  // Aiven / 部分云厂商强制 TLS：DB_SSL=true 时启用
  ...(sslEnabled ? { ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: false } } : {}),
});

module.exports = pool;
