const express = require('express');
const cors = require('cors');
const pool = require('./db');
const { hashPassword, isHashed, verifyPassword, signToken, verifyToken } = require('./auth');
const { rateLimit } = require('./security');

const app = express();
const port = process.env.PORT || 3000;

// CORS 白名单：同源请求不带 Origin；本地开发放行 localhost / 127.0.0.1
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || origin === 'null') return cb(null, true);
      if (ALLOWED_ORIGINS.length > 0) return cb(null, ALLOWED_ORIGINS.includes(origin));
      return cb(null, /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin));
    },
  })
);
app.use(express.json());
app.use(express.static('./'));

// 根路径返回首页
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// ========== 认证中间件 ==========
function readToken(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function requireAuth(req, res, next) {
  const payload = verifyToken(readToken(req));
  if (!payload) {
    return res.status(401).json({ code: 401, msg: '未登录或登录已过期，请重新登录' });
  }
  // 改过密码后，旧令牌（签发时间早于 token_valid_after）立即失效
  pool
    .query('SELECT token_valid_after FROM user WHERE id = ?', [payload.uid])
    .then(([rows]) => {
      if (rows.length === 0) {
        return res.status(401).json({ code: 401, msg: '账号不存在，请重新登录' });
      }
      const validAfter = rows[0].token_valid_after
        ? Math.floor(new Date(rows[0].token_valid_after).getTime() / 1000)
        : 0;
      if ((payload.iat || 0) < validAfter) {
        return res.status(401).json({ code: 401, msg: '密码已修改，请重新登录' });
      }
      req.user = payload;
      next();
    })
    .catch(err => {
      console.error('鉴权查询失败:', err);
      res.status(500).json({ code: 500, msg: '鉴权失败，请稍后再试' });
    });
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ code: 403, msg: '无管理员权限' });
    }
    next();
  });
}

// 工具：参数校验
function requireFields(body, fields) {
  for (const f of fields) {
    if (!body[f] || String(body[f]).trim() === '') return `缺少必填字段: ${f}`;
  }
  return null;
}

// ========== 用户注册 ==========
app.post('/api/register', rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: '注册过于频繁' }), async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ code: 400, msg: '用户名和密码不能为空' });
  if (username.length < 2 || username.length > 20) return res.json({ code: 400, msg: '用户名长度需2-20个字符' });
  if (!/^[\w\u4e00-\u9fa5-]+$/.test(username)) return res.json({ code: 400, msg: '用户名只能包含中文、字母、数字、下划线或短横线' });
  if (password.length < 6) return res.json({ code: 400, msg: '密码至少6位' });
  if (password.length > 72) return res.json({ code: 400, msg: '密码不能超过72位' });
  try {
    const [exist] = await pool.query('SELECT id FROM user WHERE username = ?', [username]);
    if (exist.length > 0) return res.json({ code: 400, msg: '用户名已被注册' });
    await pool.query('INSERT INTO user (username, password, role) VALUES (?, ?, ?)', [
      username,
      hashPassword(password),
      'user',
    ]);
    res.json({ code: 200, msg: '注册成功，请登录' });
  } catch (err) {
    console.error('注册失败:', err);
    res.json({ code: 500, msg: '注册失败，请稍后再试' });
  }
});

// ========== 用户登录 ==========
app.post('/api/login', rateLimit({ windowMs: 10 * 60 * 1000, max: 10, message: '登录尝试过多' }), async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ code: 400, msg: '用户名和密码不能为空' });
  try {
    const [rows] = await pool.query(
      'SELECT id, username, password, role, nickname, avatar_url FROM user WHERE username = ?',
      [username]
    );
    // 统一提示，避免暴露“用户名是否存在”
    if (rows.length === 0) return res.json({ code: 401, msg: '用户名或密码错误' });

    const user = rows[0];
    const result = verifyPassword(password, user.password);
    if (!result.ok) return res.json({ code: 401, msg: '用户名或密码错误' });

    // 历史明文密码：登录成功后立刻升级为哈希
    if (result.legacy) {
      await pool.query('UPDATE user SET password = ? WHERE id = ?', [hashPassword(password), user.id]);
      console.log(`[auth] 已升级明文密码为哈希: user_id=${user.id}`);
    }

    const token = signToken(user);
    res.json({
      code: 200,
      msg: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          nickname: user.nickname,
          avatar_url: user.avatar_url,
        },
      },
    });
  } catch (err) {
    console.error('登录失败:', err);
    res.json({ code: 500, msg: '登录失败，请稍后再试' });
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

// ========== 新增文章（作者取自令牌） ==========
app.post('/api/blogs', requireAuth, async (req, res) => {
  const { title, content, category, tags } = req.body;
  if (!title || !title.trim()) return res.json({ code: 400, msg: '标题不能为空' });
  if (title.length > 100) return res.json({ code: 400, msg: '标题不能超过100字' });
  if (!content || !content.trim()) return res.json({ code: 400, msg: '内容不能为空' });
  try {
    await pool.query(
      'INSERT INTO blog (title, content, category, tags, author_id, author_name) VALUES (?, ?, ?, ?, ?, ?)',
      [title.trim(), content.trim(), category || '未分类', tags || '', req.user.uid, req.user.name]
    );
    res.json({ code: 200, msg: '发布成功' });
  } catch (err) {
    res.json({ code: 500, msg: '发布失败: ' + err.message });
  }
});

// ========== 修改文章（仅作者或管理员） ==========
app.put('/api/blogs/:id', requireAuth, async (req, res) => {
  const { title, content, category, tags } = req.body;
  if (!title || !title.trim()) return res.json({ code: 400, msg: '标题不能为空' });
  if (!content || !content.trim()) return res.json({ code: 400, msg: '内容不能为空' });
  try {
    const [rows] = await pool.query('SELECT author_id FROM blog WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.json({ code: 404, msg: '文章不存在' });
    const isOwner = Number(rows[0].author_id) === Number(req.user.uid);
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ code: 403, msg: '只能修改自己的文章' });
    }
    await pool.query(
      'UPDATE blog SET title = ?, content = ?, category = ?, tags = ? WHERE id = ?',
      [title.trim(), content.trim(), category || '未分类', tags || '', req.params.id]
    );
    res.json({ code: 200, msg: '修改成功' });
  } catch (err) {
    res.json({ code: 500, msg: '修改失败: ' + err.message });
  }
});

// ========== 删除文章（仅作者或管理员） ==========
app.delete('/api/blogs/:id', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT author_id FROM blog WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.json({ code: 404, msg: '文章不存在' });
    const isOwner = Number(rows[0].author_id) === Number(req.user.uid);
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ code: 403, msg: '只能删除自己的文章' });
    }
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

app.post('/api/comments', requireAuth, async (req, res) => {
  const { article_id, content } = req.body;
  if (!article_id) return res.json({ code: 400, msg: '缺少文章ID' });
  if (!content || !content.trim()) return res.json({ code: 400, msg: '评论内容不能为空' });
  if (content.length > 500) return res.json({ code: 400, msg: '评论不能超过500字' });
  try {
    await pool.query('INSERT INTO comment (article_id, username, content) VALUES (?, ?, ?)', [
      article_id,
      req.user.name,
      content.trim(),
    ]);
    res.json({ code: 200, msg: '评论成功' });
  } catch (err) {
    res.json({ code: 500, msg: '评论失败: ' + err.message });
  }
});

app.delete('/api/comments/:id', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT username FROM comment WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.json({ code: 404, msg: '评论不存在' });
    if (rows[0].username !== req.user.name && req.user.role !== 'admin') {
      return res.status(403).json({ code: 403, msg: '只能删除自己的评论' });
    }
    await pool.query('DELETE FROM comment WHERE id = ?', [req.params.id]);
    res.json({ code: 200, msg: '评论已删除' });
  } catch (err) {
    res.json({ code: 500, msg: '删除失败: ' + err.message });
  }
});

// ========== 个人资料（只看/改自己；管理员可看他人） ==========
app.get('/api/user/profile', requireAuth, async (req, res) => {
  const target = parseInt(req.query.user_id) || req.user.uid;
  if (target !== Number(req.user.uid) && req.user.role !== 'admin') {
    return res.status(403).json({ code: 403, msg: '只能查看自己的资料' });
  }
  try {
    const [rows] = await pool.query(
      'SELECT id, username, nickname, avatar_url, bio, create_time FROM user WHERE id = ?',
      [target]
    );
    if (rows.length === 0) return res.json({ code: 404, msg: '用户不存在' });
    res.json({ code: 200, msg: '查询成功', data: rows[0] });
  } catch (err) {
    res.json({ code: 500, msg: '查询失败: ' + err.message });
  }
});

app.put('/api/user/profile', requireAuth, async (req, res) => {
  const { nickname, bio, avatar_url } = req.body;
  if (nickname && nickname.length > 20) return res.json({ code: 400, msg: '昵称不能超过20字' });
  if (bio && bio.length > 200) return res.json({ code: 400, msg: '简介不能超过200字' });
  try {
    await pool.query('UPDATE user SET nickname = ?, bio = ?, avatar_url = ? WHERE id = ?', [
      nickname,
      bio,
      avatar_url,
      req.user.uid,
    ]);
    res.json({ code: 200, msg: '资料更新成功' });
  } catch (err) {
    res.json({ code: 500, msg: '更新失败: ' + err.message });
  }
});

// ========== 修改密码（校验旧密码，改后旧令牌失效） ==========
app.post('/api/user/password', requireAuth, async (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password) return res.json({ code: 400, msg: '请填写原密码与新密码' });
  if (new_password.length < 6) return res.json({ code: 400, msg: '新密码至少6位' });
  if (new_password.length > 72) return res.json({ code: 400, msg: '新密码不能超过72位' });
  if (old_password === new_password) return res.json({ code: 400, msg: '新密码不能与原密码相同' });
  try {
    const [rows] = await pool.query('SELECT id, password FROM user WHERE id = ?', [req.user.uid]);
    if (rows.length === 0) return res.json({ code: 404, msg: '用户不存在' });
    const check = verifyPassword(old_password, rows[0].password);
    if (!check.ok) return res.json({ code: 400, msg: '原密码不正确' });
    await pool.query(
      'UPDATE user SET password = ?, token_valid_after = DATE_ADD(NOW(), INTERVAL 1 SECOND) WHERE id = ?',
      [hashPassword(new_password), req.user.uid]
    );
    res.json({ code: 200, msg: '密码已修改，请重新登录' });
  } catch (err) {
    console.error('修改密码失败:', err);
    res.json({ code: 500, msg: '修改失败，请稍后再试' });
  }
});

// ========== 查看他人主页（公开资料+文章列表） ==========
app.get('/api/user/:id', async (req, res) => {
  try {
    const [userRows] = await pool.query(
      'SELECT id, username, nickname, avatar_url, bio, create_time FROM user WHERE id = ?',
      [req.params.id]
    );
    if (userRows.length === 0) return res.json({ code: 404, msg: '用户不存在' });
    const [articleRows] = await pool.query('SELECT * FROM blog WHERE author_id = ? ORDER BY create_time DESC', [req.params.id]);
    res.json({ code: 200, msg: '查询成功', data: { user: userRows[0], articles: articleRows } });
  } catch (err) {
    res.json({ code: 500, msg: '查询失败: ' + err.message });
  }
});

// ========== 管理员接口 ==========
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, nickname, avatar_url, bio, role, create_time FROM user ORDER BY id'
    );
    res.json({ code: 200, msg: '查询成功', data: rows });
  } catch (err) {
    res.json({ code: 500, msg: '查询失败: ' + err.message });
  }
});

app.get('/api/admin/articles', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM blog ORDER BY create_time DESC');
    res.json({ code: 200, msg: '查询成功', data: rows });
  } catch (err) {
    res.json({ code: 500, msg: '查询失败: ' + err.message });
  }
});

app.delete('/api/admin/articles/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM blog WHERE id = ?', [req.params.id]);
    res.json({ code: 200, msg: '文章已删除' });
  } catch (err) {
    res.json({ code: 500, msg: '删除失败: ' + err.message });
  }
});

app.get('/api/admin/comments', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM comment ORDER BY create_time DESC');
    res.json({ code: 200, msg: '查询成功', data: rows });
  } catch (err) {
    res.json({ code: 500, msg: '查询失败: ' + err.message });
  }
});

app.delete('/api/admin/comments/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM comment WHERE id = ?', [req.params.id]);
    res.json({ code: 200, msg: '评论已删除' });
  } catch (err) {
    res.json({ code: 500, msg: '删除失败: ' + err.message });
  }
});

// ========== 音乐歌单 ==========
app.get('/api/music', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM music ORDER BY create_time DESC');
    res.json({ code: 200, msg: '查询成功', data: rows });
  } catch (err) {
    res.json({ code: 500, msg: '查询失败: ' + err.message });
  }
});

app.post('/api/music', requireAdmin, async (req, res) => {
  const { playlist_id, name } = req.body;
  if (!playlist_id) return res.json({ code: 400, msg: '歌单ID不能为空' });
  try {
    await pool.query('INSERT INTO music (playlist_id, name) VALUES (?, ?)', [playlist_id, name || '我的歌单']);
    res.json({ code: 200, msg: '添加成功' });
  } catch (err) {
    res.json({ code: 500, msg: '添加失败: ' + err.message });
  }
});

app.delete('/api/music/:id', requireAdmin, async (req, res) => {
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
