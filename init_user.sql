-- 在DBeaver中执行，创建user表（如果还没有的话）
USE blog_db;

CREATE TABLE IF NOT EXISTS user(
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(100) NOT NULL
);

-- 插入一个测试管理员账号
INSERT IGNORE INTO user(username, password) VALUES('admin', '123456');
