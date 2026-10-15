-- ============================================
-- 博客项目完整初始化 SQL（安全版，可重复执行不报错）
-- 使用方法：DBeaver中全选执行即可
-- ============================================

-- 1. 创建数据库（仅1次）
CREATE DATABASE IF NOT EXISTS blog_db DEFAULT CHARACTER SET utf8mb4;
USE blog_db;

-- 2. 用户表 user
CREATE TABLE IF NOT EXISTS user(
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(100) NOT NULL,
  avatar_url VARCHAR(500) DEFAULT '',
  nickname VARCHAR(50) DEFAULT '',
  bio VARCHAR(200) DEFAULT '这个人很懒，什么都没写~'
);

-- 插入管理员账号（IGNORE避免重复插入）
INSERT IGNORE INTO user(username, password) VALUES('admin', '123456');

-- 3. 博客文章表 blog
CREATE TABLE IF NOT EXISTS blog(
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(100) NOT NULL,
  content TEXT,
  category VARCHAR(50) DEFAULT '未分类',
  tags VARCHAR(200) DEFAULT '',
  author_id INT DEFAULT 0,
  author_name VARCHAR(50) DEFAULT '匿名',
  views INT DEFAULT 0,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 插入3篇示例文章
INSERT IGNORE INTO blog (title, content, category, tags, author_id, author_name, views) VALUES
('我的第一篇博客', '这是我用Node.js + Express + MySQL写的第一篇博客文章！', '随笔', 'node.js,后端', 1, 'admin', 0),
('后端学习笔记', '今天学了Express框架，学会了写接口、连接数据库、增删改查。', '学习笔记', 'express,数据库', 1, 'admin', 0),
('为什么学编程', '编程是未来的语言，学会编程就能创造无限可能。', '随笔', '编程', 1, 'admin', 0);

-- 4. 评论表 comment
CREATE TABLE IF NOT EXISTS comment(
  id INT PRIMARY KEY AUTO_INCREMENT,
  article_id INT NOT NULL,
  username VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. 音乐歌单表 music
CREATE TABLE IF NOT EXISTS music(
  id INT PRIMARY KEY AUTO_INCREMENT,
  playlist_id VARCHAR(50) NOT NULL,
  name VARCHAR(100),
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO music (playlist_id, name) VALUES ('7033890099', '我的收藏');

-- 6. 给已有用户设置默认昵称
UPDATE user SET nickname = username WHERE nickname = '' OR nickname IS NULL;

-- ============================================
-- 执行完毕！
-- 管理员账号：admin / 123456
-- ============================================
