const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('./'));

// 根路径返回首页
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// 工具：参数校验
function requireFields(body, fields) {
  for (const f of fields) {
    if (!body[f] || String(body[f]).trim() === '') return `缺少必填字段: ${f}`;
  }
  return null;
}

// ========== 用户注册 ==========
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ code: 400, msg: '用户名和密码不能为空' });
  if (username.length < 2 || username.length > 20) return res.json({ code: 400, msg: '用户名长度需2-20个字符' });
  if (password.length < 6) return res.json({ code: 400, msg: '密码至少6位' });
  try {
    const [exist] = await pool.query('SELECT * FROM user WHERE username = ?', [username]);
    if (exist.length > 0) return res.json({ code: 400, msg: '用户名已被注册' });
    await pool.query('INSERT INTO user (username, password) VALUES (?, ?)', [username, password]);
    res.json({ code: 200, msg: '注册成功，请登录' });
  } catch (err) {
    res.json({ code: 500, msg: '注册失败: ' + err.message });
  }
});

// ========== 用户登录 ==========
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ code: 400, msg: '用户名和密码不能为空' });
  try {
    const [rows] = await pool.query('SELECT * FROM user WHERE username = ? AND password = ?', [username, password]);
    if (rows.length === 0) return res.json({ code: 401, msg: '用户名或密码错误' });
    res.json({ code: 200, msg: '登录成功', data: { id: rows[0].id, username: rows[0].username, role: rows[0].role } });
  } catch (err) {
    res.json({ code: 500, msg: '登录失败: ' + err.message });
  }
});

// ========== 文章列表（分页+搜索+分类+标签） ==========
app.get('/api/blogs', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 5;
    const keyword = req.query.keyword || '';
    const category = req.query.category || '';
    const tag = req.query.tag || '';
    const offset = (page - 1) * pageSize;

    let where = [];
    let params = [];

    if (keyword) {
      where.push('(title LIKE ? OR content LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (category && category !== '全部') {
      where.push('category = ?');
      params.push(category);
    }
    if (tag) {
      where.push('tags LIKE ?');
      params.push(`%${tag}%`);
    }

    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM blog ${whereSql}`, params);
    const total = countResult[0].total;

    const [rows] = await pool.query(
      `SELECT * FROM blog ${whereSql} ORDER BY create_time DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({ code: 200, msg: '查询成功', data: rows, total: total, page: page, pageSize: pageSize });
  } catch (err) {
    console.error('数据库错误:', err);
    res.json({ code: 500, msg: '查询失败: ' + err.message + ' | ' + err.code });
  }
});

// ========== 所有分类 ==========
app.get('/api/categories', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT DISTINCT category FROM blog ORDER BY category');
    res.json({ code: 200, msg: '查询成功', data: rows.map(r => r.category) });
  } catch (err) {
    res.json({ code: 500, msg: '查询失败: ' + err.message });
  }
});

// ========== 单篇文章详情（阅读量+1） ==========
app.get('/api/blogs/:id', async (req, res) => {
  try {
    await pool.query('UPDATE blog SET views = views + 1 WHERE id = ?', [req.params.id]);
    const [rows] = await pool.query('SELECT * FROM blog WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.json({ code: 404, msg: '文章不存在' });
    res.json({ code: 200, msg: '查询成功', data: rows[0] });
  } catch (err) {
    res.json({ code: 500, msg: '查询失败: ' + err.message });
  }
});

// ========== 新增文章 ==========
app.post('/api/blogs', async (req, res) => {
  const { title, content, category, tags, author_id, author_name } = req.body;
  if (!title || !title.trim()) return res.json({ code: 400, msg: '标题不能为空' });
  if (title.length > 100) return res.json({ code: 400, msg: '标题不能超过100字' });
  if (!content || !content.trim()) return res.json({ code: 400, msg: '内容不能为空' });
  if (!author_id) return res.json({ code: 401, msg: '请先登录' });
  try {
    await pool.query(
      'INSERT INTO blog (title, content, category, tags, author_id, author_name) VALUES (?, ?, ?, ?, ?, ?)',
      [title.trim(), content.trim(), category || '未分类', tags || '', author_id, author_name || '匿名']
    );
    res.json({ code: 200, msg: '发布成功' });
  } catch (err) {
    res.json({ code: 500, msg: '发布失败: ' + err.message });
  }
});

// ========== 修改文章（作者校验） ==========
app.put('/api/blogs/:id', async (req, res) => {
  const { title, content, category, tags, author_id } = req.body;
  if (!title || !title.trim()) return res.json({ code: 400, msg: '标题不能为空' });
  if (!content || !content.trim()) return res.json({ code: 400, msg: '内容不能为空' });
  try {
    const [rows] = await pool.query('SELECT author_id FROM blog WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.json({ code: 404, msg: '文章不存在' });
    if (rows[0].author_id !== author_id) return res.json({ code: 403, msg: '只能修改自己的文章' });
    await pool.query(
      'UPDATE blog SET title = ?, content = ?, category = ?, tags = ? WHERE id = ?',
      [title.trim(), content.trim(), category || '未分类', tags || '', req.params.id]
    );
    res.json({ code: 200, msg: '修改成功' });
  } catch (err) {
    res.json({ code: 500, msg: '修改失败: ' + err.message });
  }
});

// ========== 删除文章（作者校验） ==========
app.delete('/api/blogs/:id', async (req, res) => {
  const author_id = req.query.author_id;
  try {
    const [rows] = await pool.query('SELECT author_id FROM blog WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.json({ code: 404, msg: '文章不存在' });
    if (rows[0].author_id !== parseInt(author_id)) return res.json({ code: 403, msg: '只能删除自己的文章' });
    await pool.query('DELETE FROM blog WHERE id = ?', [req.params.id]);
    res.json({ code: 200, msg: '删除成功' });
  } catch (err) {
    res.json({ code: 500, msg: '删除失败: ' + err.message });
  }
});

// ========== 评论 ==========
app.get('/api/comments/:articleId', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM comment WHERE article_id = ? ORDER BY create_time DESC', [req.params.articleId]);
    res.json({ code: 200, msg: '查询成功', data: rows });
  } catch (err) {
    res.json({ code: 500, msg: '查询失败: ' + err.message });
  }
});

app.post('/api/comments', async (req, res) => {
  const { article_id, username, content } = req.body;
  if (!article_id || !username) return res.json({ code: 401, msg: '请先登录' });
  if (!content || !content.trim()) return res.json({ code: 400, msg: '评论内容不能为空' });
  if (content.length > 500) return res.json({ code: 400, msg: '评论不能超过500字' });
  try {
    await pool.query('INSERT INTO comment (article_id, username, content) VALUES (?, ?, ?)', [article_id, username, content.trim()]);
    res.json({ code: 200, msg: '评论成功' });
  } catch (err) {
    res.json({ code: 500, msg: '评论失败: ' + err.message });
  }
});

app.delete('/api/comments/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM comment WHERE id = ?', [req.params.id]);
    res.json({ code: 200, msg: '评论已删除' });
  } catch (err) {
    res.json({ code: 500, msg: '删除失败: ' + err.message });
  }
});

// ========== 获取个人资料 ==========
app.get('/api/user/profile', async (req, res) => {
  const userId = req.query.user_id;
  if (!userId) return res.json({ code: 401, msg: '请先登录' });
  try {
    const [rows] = await pool.query('SELECT id, username, nickname, avatar_url, bio, create_time FROM user WHERE id = ?', [userId]);
    if (rows.length === 0) return res.json({ code: 404, msg: '用户不存在' });
    res.json({ code: 200, msg: '查询成功', data: rows[0] });
  } catch (err) {
    res.json({ code: 500, msg: '查询失败: ' + err.message });
  }
});

// ========== 修改个人资料 ==========
app.put('/api/user/profile', async (req, res) => {
  const { user_id, nickname, bio, avatar_url } = req.body;
  if (!user_id) return res.json({ code: 401, msg: '请先登录' });
  if (nickname && nickname.length > 20) return res.json({ code: 400, msg: '昵称不能超过20字' });
  if (bio && bio.length > 200) return res.json({ code: 400, msg: '简介不能超过200字' });
  try {
    await pool.query(
      'UPDATE user SET nickname = ?, bio = ?, avatar_url = ? WHERE id = ?',
      [nickname, bio, avatar_url, user_id]
    );
    res.json({ code: 200, msg: '资料更新成功' });
  } catch (err) {
    res.json({ code: 500, msg: '更新失败: ' + err.message });
  }
});

// ========== 查看他人主页（公开资料+文章列表） ==========
app.get('/api/user/:id', async (req, res) => {
  try {
    const [userRows] = await pool.query('SELECT id, username, nickname, avatar_url, bio, create_time FROM user WHERE id = ?', [req.params.id]);
    if (userRows.length === 0) return res.json({ code: 404, msg: '用户不存在' });
    const [articleRows] = await pool.query('SELECT * FROM blog WHERE author_id = ? ORDER BY create_time DESC', [req.params.id]);
    res.json({ code: 200, msg: '查询成功', data: { user: userRows[0], articles: articleRows } });
  } catch (err) {
    res.json({ code: 500, msg: '查询失败: ' + err.message });
  }
});

// ========== 管理员：获取所有用户 ==========
app.get('/api/admin/users', async (req, res) => {
  const role = req.query.role;
  if (role !== 'admin') return res.json({ code: 403, msg: '无管理员权限' });
  try {
    const [rows] = await pool.query('SELECT id, username, nickname, avatar_url, bio, role, create_time FROM user ORDER BY id');
    res.json({ code: 200, msg: '查询成功', data: rows });
  } catch (err) {
    res.json({ code: 500, msg: '查询失败: ' + err.message });
  }
});

// ========== 管理员：获取所有文章 ==========
app.get('/api/admin/articles', async (req, res) => {
  const role = req.query.role;
  if (role !== 'admin') return res.json({ code: 403, msg: '无管理员权限' });
  try {
    const [rows] = await pool.query('SELECT * FROM blog ORDER BY create_time DESC');
    res.json({ code: 200, msg: '查询成功', data: rows });
  } catch (err) {
    res.json({ code: 500, msg: '查询失败: ' + err.message });
  }
});

// ========== 管理员：删除任意文章 ==========
app.delete('/api/admin/articles/:id', async (req, res) => {
  const role = req.query.role;
  if (role !== 'admin') return res.json({ code: 403, msg: '无管理员权限' });
  try {
    await pool.query('DELETE FROM blog WHERE id = ?', [req.params.id]);
    res.json({ code: 200, msg: '文章已删除' });
  } catch (err) {
    res.json({ code: 500, msg: '删除失败: ' + err.message });
  }
});

// ========== 管理员：获取所有评论 ==========
app.get('/api/admin/comments', async (req, res) => {
  const role = req.query.role;
  if (role !== 'admin') return res.json({ code: 403, msg: '无管理员权限' });
  try {
    const [rows] = await pool.query('SELECT * FROM comment ORDER BY create_time DESC');
    res.json({ code: 200, msg: '查询成功', data: rows });
  } catch (err) {
    res.json({ code: 500, msg: '查询失败: ' + err.message });
  }
});

// ========== 管理员：删除任意评论 ==========
app.delete('/api/admin/comments/:id', async (req, res) => {
  const role = req.query.role;
  if (role !== 'admin') return res.json({ code: 403, msg: '无管理员权限' });
  try {
    await pool.query('DELETE FROM comment WHERE id = ?', [req.params.id]);
    res.json({ code: 200, msg: '评论已删除' });
  } catch (err) {
    res.json({ code: 500, msg: '删除失败: ' + err.message });
  }
});

// ========== 音乐歌单列表 ==========
app.get('/api/music', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM music ORDER BY create_time DESC');
    res.json({ code: 200, msg: '查询成功', data: rows });
  } catch (err) {
    res.json({ code: 500, msg: '查询失败: ' + err.message });
  }
});

// 添加歌单（管理员）
app.post('/api/music', async (req, res) => {
  const { playlist_id, name } = req.body;
  if (!playlist_id) return res.json({ code: 400, msg: '歌单ID不能为空' });
  try {
    await pool.query('INSERT INTO music (playlist_id, name) VALUES (?, ?)', [playlist_id, name || '我的歌单']);
    res.json({ code: 200, msg: '添加成功' });
  } catch (err) {
    res.json({ code: 500, msg: '添加失败: ' + err.message });
  }
});

// 删除歌单
app.delete('/api/music/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM music WHERE id = ?', [req.params.id]);
    res.json({ code: 200, msg: '删除成功' });
  } catch (err) {
    res.json({ code: 500, msg: '删除失败: ' + err.message });
  }
});

app.listen(port, () => {
  console.log(`服务运行在 http://localhost:${port}`);
});
