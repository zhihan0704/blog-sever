# 📝 Full-Stack Blog 全栈个人博客

基于 **原生 JS + Node.js/Express + MySQL** 的个人博客系统。实现了用户注册登录、文章与评论管理、音乐板块以及管理员后台，前端为单页应用，后端提供 RESTful API。

> 技术栈：原生 HTML/CSS/JavaScript ｜ Fetch API ｜ Node.js ｜ Express ｜ MySQL（mysql2 连接池）｜ RESTful API

---

## 🖥 界面预览

> 以下截图来自完整版前端（Vue3 + Element Plus 版本），当前仓库内置的是原生 JS 单页版本，视觉细节略有差异。

### 首页 · 文章列表

![首页](docs/home.png)

文章卡片流，支持关键词搜索、按分类（学习笔记 / 随笔 / 项目实战）筛选，展示作者、标签、阅读量与评论数。

### 🎵 音乐板块

![音乐](docs/music.png)

通过网易云歌单 ID 一键嵌入歌单播放器，在线浏览与播放收藏音乐，支持管理自己的歌单。

### 🛠 管理后台

![管理后台](docs/admin.png)

基于角色的权限管理：管理员登录后可进入后台，集中管理全站**用户、文章、评论**；普通用户无权限入口。

---

## ✨ 核心功能

### 用户与权限
- 用户注册 / 登录，登录态保存在浏览器本地（`localStorage`）
- 密码当前为**演示用明文存储**，接口未做哈希处理
- **角色区分**：`user` 表中 `role` 字段区分 `admin` 与普通用户，后台接口按传入的 `role` 判断权限

### 文章模块
- 文章发布、编辑、删除、查看（完整 CRUD）
- 分类管理、话题标签、阅读量统计、评论数统计
- 关键词搜索 + 分类筛选

### 评论模块
- 登录用户发表评论，后台可审核 / 删除违规评论

### 音乐板块
- 接入网易云歌单，通过歌单 ID 嵌入官方播放器
- 管理个人收藏歌单

### 管理后台
- 用户管理：查看所有注册用户及其角色
- 文章管理：查看 / 删除全站文章
- 评论管理：查看 / 删除全站评论

---

## 🛠 技术栈

| 端 | 技术 |
| --- | --- |
| 前端 | 原生 HTML / CSS / JavaScript 单页（`index.html`）、Fetch API、`localStorage` |
| 后端 | Node.js、Express 5、cors、mysql2 连接池 |
| 数据库 | MySQL（库名 `blog_db`，utf8mb4） |
| 工程化 | Git / GitHub、SQL 初始化与种子脚本 |

---

## 🚀 快速启动

```bash
# 1. 安装依赖
npm install

# 2. 初始化数据库（默认库名 blog_db，连接配置见 db.js）
mysql -u root -p < init.sql

# 3. 启动服务（前端页面与接口同一端口）
node app.js
```

启动后访问 <http://localhost:3000>，接口前缀为 `/api`。

> 数据库连接信息在 `db.js` 中配置（host / user / password / database）；
> 示例文章可通过 `seed_articles.sql` 导入。

---

## 🗺 Roadmap

- [ ] 用户个人主页与头像上传
- [ ] 作者本人权限校验（仅作者可编辑自己文章）
- [ ] 引入 bcrypt 哈希 + 服务端会话/JWT，替换明文密码与 `role` 参数鉴权
- [ ] 深浅主题切换
- [ ] XSS 防护与表单双重校验

---

## 📄 License

MIT
