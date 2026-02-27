const express = require('express');
const cors = require('cors');
const fs = require('node:fs/promises');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const DB_PATH = path.join(__dirname, 'db.json');

app.use(cors());
app.use(express.json());

async function readDb() {
  const raw = await fs.readFile(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function writeDb(db) {
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Не авторизован' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Неверный токен' });
  }
}

app.get('/api/health', (_, res) => {
  res.json({ ok: true, service: 'cs-pro-platform-backend' });
});

app.post('/api/auth/register', async (req, res) => {
  const { nickname, email, password } = req.body || {};

  if (!nickname || !email || !password) {
    return res.status(400).json({ message: 'Заполните nickname, email и password' });
  }

  const db = await readDb();
  const normalizedEmail = email.toLowerCase().trim();
  const exists = db.users.find((user) => user.email === normalizedEmail);

  if (exists) {
    return res.status(409).json({ message: 'Пользователь с таким email уже существует' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: Date.now(),
    nickname: nickname.trim(),
    email: normalizedEmail,
    passwordHash,
    createdAt: new Date().toISOString()
  };

  db.users.push(user);
  await writeDb(db);

  const token = createToken({ id: user.id, email: user.email });
  return res.status(201).json({
    token,
    user: {
      id: user.id,
      nickname: user.nickname,
      email: user.email
    }
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Заполните email и password' });
  }

  const db = await readDb();
  const normalizedEmail = email.toLowerCase().trim();
  const user = db.users.find((entry) => entry.email === normalizedEmail);

  if (!user) {
    return res.status(401).json({ message: 'Неверный email или пароль' });
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    return res.status(401).json({ message: 'Неверный email или пароль' });
  }

  const token = createToken({ id: user.id, email: user.email });
  return res.json({
    token,
    user: {
      id: user.id,
      nickname: user.nickname,
      email: user.email
    }
  });
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  const db = await readDb();
  const user = db.users.find((entry) => entry.id === req.user.id);

  if (!user) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }

  return res.json({
    id: user.id,
    nickname: user.nickname,
    email: user.email,
    createdAt: user.createdAt
  });
});

app.get('/api/news', async (_, res) => {
  const db = await readDb();
  return res.json(db.news);
});

app.get('/api/news/:slug', async (req, res) => {
  const db = await readDb();
  const article = db.news.find((entry) => entry.slug === req.params.slug);

  if (!article) {
    return res.status(404).json({ message: 'Новость не найдена' });
  }

  return res.json(article);
});

app.get('/api/players/top', async (_, res) => {
  const db = await readDb();
  return res.json(db.topPlayers);
});

app.get('/api/profile/me', authMiddleware, async (req, res) => {
  const db = await readDb();
  const user = db.users.find((entry) => entry.id === req.user.id);

  if (!user) {
    return res.status(404).json({ message: 'Профиль не найден' });
  }

  return res.json({
    id: user.id,
    nickname: user.nickname,
    email: user.email,
    bio: user.bio || '',
    country: user.country || 'Украина'
  });
});

app.patch('/api/profile/me', authMiddleware, async (req, res) => {
  const { nickname, bio, country } = req.body || {};
  const db = await readDb();
  const index = db.users.findIndex((entry) => entry.id === req.user.id);

  if (index === -1) {
    return res.status(404).json({ message: 'Профиль не найден' });
  }

  db.users[index] = {
    ...db.users[index],
    nickname: typeof nickname === 'string' && nickname.trim() ? nickname.trim() : db.users[index].nickname,
    bio: typeof bio === 'string' ? bio : db.users[index].bio,
    country: typeof country === 'string' && country.trim() ? country.trim() : db.users[index].country
  };

  await writeDb(db);

  return res.json({
    id: db.users[index].id,
    nickname: db.users[index].nickname,
    email: db.users[index].email,
    bio: db.users[index].bio || '',
    country: db.users[index].country || 'Украина'
  });
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
