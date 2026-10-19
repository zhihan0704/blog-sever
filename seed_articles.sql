-- 插入3篇面试展示用文章
INSERT INTO blog (title, content, category, tags, author_id, author_name, views) VALUES
('基于Node.js+Express的个人博客系统设计与实现', 
'本项目是一个全栈个人博客系统，后端采用Node.js + Express框架，数据库使用MySQL，前端为原生HTML/CSS/JavaScript单页应用。\n\n核心功能包括：\n1. 用户注册登录（Session持久化）\n2. 文章CRUD、分页查询、关键词搜索\n3. 文章分类与标签筛选\n4. 评论系统\n5. 管理员后台（用户/文章/评论管理）\n6. 个人主页与头像上传\n\n技术亮点：\n- 使用连接池优化数据库性能\n- 前后端参数双重校验\n- XSS防护：输出转义\n- 角色权限控制（admin/user）\n- 响应式布局设计',
'项目实战', 'node.js,express,mysql,全栈', 1, 'admin', 128),

('MySQL数据库优化笔记',
'在开发博客系统过程中，我对MySQL数据库优化做了一些实践总结：\n\n1. 连接池配置\n使用mysql2/promise连接池，避免频繁创建销毁连接，提高并发性能。\n\n2. 索引优化\n为文章表的title、category、tags字段建立索引，加速查询。\n\n3. 分页查询优化\n使用LIMIT offset, pageSize实现分页，大数据量下考虑游标分页。\n\n4. 字符集问题\n数据库统一使用utf8mb4字符集，支持emoji表情和生僻字。\n\n5. 常见坑点\n- 字段名与保留字冲突需要加反引号\n- 时间字段用DATETIME还是TIMESTAMP的选择\n- 重复执行ALTER TABLE会报Duplicate column错误',
'学习笔记', 'mysql,数据库,优化', 1, 'admin', 86),

('从0到1搭建全栈项目的踩坑记录',
'第一次独立搭建全栈项目，踩了不少坑，记录一下：\n\n1. 环境配置\nNode.js版本兼容性问题，从v24降级到v20 LTS解决。\n\n2. 文件路径问题\nWindows隐藏文件后缀导致app.js变成app.js.txt，折腾了半天才发现。\n\n3. 跨域问题\n前后端分离开发时用cors中间件解决跨域。\n\n4. 权限控制\n后端通过JWT/Session验证身份，前端路由守卫控制页面访问。\n\n5. 部署上线\n使用cpolar内网穿透实现公网访问，后续计划部署到云服务器。\n\n总结：全栈开发不仅要写代码，环境配置、数据库、部署都要懂，踩坑也是学习的一部分。',
'随笔', '全栈,踩坑,经验', 1, 'admin', 203);
