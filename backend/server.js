const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-session-secret-change-me';
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TOKEN_TTL = process.env.REFRESH_TOKEN_TTL || '30d';
const MAX_ACTIVE_REFRESH_TOKENS = Math.max(1, Number.parseInt(process.env.MAX_ACTIVE_REFRESH_TOKENS || '10', 10));
const DB_PATH = path.join(__dirname, 'db.json');
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';
const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${PORT}`;
const STEAM_API_KEY = process.env.STEAM_API_KEY || '';
const PLACEHOLDER_APP_SECRETS = new Set([
  'dev-secret-change-me',
  'dev-session-secret-change-me',
  'change-me',
  'changeme',
  'your-secret',
  'your_jwt_secret',
  'your_session_secret'
]);
const PLACEHOLDER_STEAM_KEYS = new Set([
  'your-steam-web-api-key',
  'your_steam_web_api_key',
  'replace-with-your-steam-web-api-key',
  'change-me',
  'changeme'
]);
function isSafeSecret(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return Boolean(normalized) && !PLACEHOLDER_APP_SECRETS.has(normalized);
}

const STEAM_KEY_NORMALIZED = STEAM_API_KEY.trim().toLowerCase();
const IS_STEAM_CONFIGURED =
  Boolean(STEAM_KEY_NORMALIZED) && !PLACEHOLDER_STEAM_KEYS.has(STEAM_KEY_NORMALIZED);
const IS_JWT_SECRET_SAFE = isSafeSecret(JWT_SECRET);
const IS_SESSION_SECRET_SAFE = isSafeSecret(SESSION_SECRET);

if (!IS_JWT_SECRET_SAFE || !IS_SESSION_SECRET_SAFE) {
  const warningMessage =
    'Небезопасные секреты: обновите JWT_SECRET и SESSION_SECRET в backend/.env перед продакшеном.';

  if (process.env.NODE_ENV === 'production') {
    console.error(warningMessage);
    process.exit(1);
  }

  console.warn(warningMessage);
}

function normalizeOrigin(origin) {
  return String(origin || '').trim().replace(/\/+$/, '');
}

function parseAllowedOrigins() {
  const configuredOrigins = [
    FRONTEND_URL,
    ...(process.env.CORS_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  ];

  return new Set(configuredOrigins.map(normalizeOrigin).filter(Boolean));
}

const allowedOrigins = parseAllowedOrigins();

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false
  })
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = normalizeOrigin(origin);
      if (allowedOrigins.has(normalizedOrigin)) {
        return callback(null, true);
      }

      return callback(new Error('CORS origin denied'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(express.json({ limit: '20kb' }));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: 'cspro.sid',
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: IS_PRODUCTION,
      maxAge: 1000 * 60 * 60 * 24
    }
  })
);
app.use(passport.initialize());
app.use(passport.session());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Слишком много попыток. Попробуйте позже' }
});

const refreshLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Слишком много запросов обновления сессии. Попробуйте позже' }
});

function asyncHandler(handler) {
  return function wrappedHandler(req, res, next) {
    return Promise.resolve(handler(req, res, next)).catch(next);
  };
}

async function readDb() {
  const raw = await fs.readFile(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function writeDb(db) {
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

function createSeedFromString(value) {
  const input = String(value || 'seed');
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed) {
  let current = seed >>> 0;
  return function seededRandom() {
    current += 0x6d2b79f5;
    let temp = Math.imul(current ^ (current >>> 15), current | 1);
    temp ^= temp + Math.imul(temp ^ (temp >>> 7), temp | 61);
    return ((temp ^ (temp >>> 14)) >>> 0) / 4294967296;
  };
}

function pickFrom(items, random) {
  return items[Math.floor(random() * items.length)];
}

function formatRecentMatchDate(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() - offsetDays);
  return `${date.getDate()} ${new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(date).replace('.', '')}`;
}

function buildDefaultStats(user) {
  const dayKey = new Date().toISOString().slice(0, 10);
  const userKey = `${user?.id || 'guest'}-${user?.steamId || user?.email || 'local'}-${dayKey}`;
  const random = createSeededRandom(createSeedFromString(userKey));

  const matchesPlayed = 480 + Math.floor(random() * 280);
  const winRate = 56 + Math.floor(random() * 24);
  const matchesWon = Math.round((matchesPlayed * winRate) / 100);
  const matchesLost = matchesPlayed - matchesWon;
  const kills = 11000 + Math.floor(random() * 7000);
  const kdTarget = 1.2 + random() * 0.85;
  const deaths = Math.max(1, Math.round(kills / kdTarget));
  const headshots = Math.round(kills * (0.48 + random() * 0.22));
  const roundsPlayed = 10000 + Math.floor(random() * 7000);

  const kdRatio = Number((kills / deaths).toFixed(2));
  const rating = Number((1.18 + random() * 0.75).toFixed(2));
  const hsPercent = Number(((headshots / kills) * 100).toFixed(1));
  const accuracy = Number((54 + random() * 18).toFixed(1));
  const adr = 84 + Math.floor(random() * 38);
  const damageDealt = roundsPlayed * adr;
  const bombsPlanted = 1800 + Math.floor(random() * 2600);
  const playTimeMinutesTotal = 25000 + Math.floor(random() * 28000);
  const playTimeHours = Math.floor(playTimeMinutesTotal / 60);
  const playTimeMinutes = playTimeMinutesTotal % 60;

  const maps = ['Dust2', 'Mirage', 'Inferno', 'Nuke', 'Tuscan', 'Train', 'Overpass', 'Ancient'];
  const recentMatches = Array.from({ length: 3 }).map((_, index) => {
    const won = random() > 0.42;
    const scoreLeft = won ? 16 : 10 + Math.floor(random() * 6);
    const scoreRight = won ? Math.floor(random() * 14) : 16;
    const matchKills = 14 + Math.floor(random() * 16);
    const matchDeaths = 7 + Math.floor(random() * 14);
    const matchAssists = 3 + Math.floor(random() * 7);

    return {
      map: pickFrom(maps, random),
      kd: `${matchKills}/${matchDeaths}/${matchAssists}`,
      score: `${scoreLeft}:${scoreRight}`,
      result: won ? 'win' : 'loss',
      resultLabel: won ? 'Победа' : 'Поражение',
      dateLabel: formatRecentMatchDate(index + 1)
    };
  });

  return {
    kdRatio,
    rating,
    winRate,
    matchesPlayed,
    matchesWon,
    matchesLost,
    accuracy,
    hsPercent,
    kills,
    deaths,
    headshots,
    hsRatio: hsPercent,
    adr,
    damageDealt,
    roundsPlayed,
    bombsPlanted,
    playTimeHours,
    playTimeMinutes,
    recentMatches,
    generatedAtDay: dayKey
  };
}

function createToken(payload, expiresIn) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function hashToken(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function normalizeRefreshTokens(user) {
  const now = Date.now();
  const source = Array.isArray(user?.refreshTokens) ? user.refreshTokens : [];

  const sanitized = source
    .filter((entry) => {
      if (!entry || typeof entry.tokenHash !== 'string' || typeof entry.expiresAt !== 'string') {
        return false;
      }

      const expiresAtMs = Date.parse(entry.expiresAt);
      return Number.isFinite(expiresAtMs) && expiresAtMs > now;
    })
    .slice(-MAX_ACTIVE_REFRESH_TOKENS);

  user.refreshTokens = sanitized;
  return sanitized;
}

function createAccessTokenForUser(user) {
  const tokenVersion = Number.isInteger(user?.tokenVersion) ? user.tokenVersion : 0;
  return createToken(
    {
      id: user.id,
      email: user.email,
      tokenVersion,
      tokenType: 'access'
    },
    ACCESS_TOKEN_TTL
  );
}

function createRefreshTokenForUser(user, tokenId) {
  const tokenVersion = Number.isInteger(user?.tokenVersion) ? user.tokenVersion : 0;
  return createToken(
    {
      id: user.id,
      email: user.email,
      tokenVersion,
      tokenType: 'refresh',
      tokenId
    },
    REFRESH_TOKEN_TTL
  );
}

function issueAuthTokensForUser(user, context = {}) {
  normalizeRefreshTokens(user);

  const tokenId = crypto.randomUUID();
  const refreshToken = createRefreshTokenForUser(user, tokenId);
  const accessToken = createAccessTokenForUser(user);
  const decodedRefresh = jwt.decode(refreshToken);
  const expiresAt =
    typeof decodedRefresh?.exp === 'number'
      ? new Date(decodedRefresh.exp * 1000).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  user.refreshTokens.push({
    tokenId,
    tokenHash: hashToken(refreshToken),
    createdAt: new Date().toISOString(),
    expiresAt,
    ip: String(context.ip || '').slice(0, 80),
    userAgent: String(context.userAgent || '').slice(0, 220)
  });
  normalizeRefreshTokens(user);

  return {
    accessToken,
    refreshToken
  };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidNickname(value) {
  return typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 32;
}

function isValidPassword(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 72;
}

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

if (IS_STEAM_CONFIGURED) {
  passport.use(
    new SteamStrategy(
      {
        returnURL: `${BACKEND_URL}/api/auth/steam/callback`,
        realm: BACKEND_URL,
        apiKey: STEAM_API_KEY,
        profile: true
      },
      (identifier, profile, done) => {
        done(null, {
          steamId: profile?.id || identifier,
          nickname: profile?.displayName || 'SteamUser',
          avatar: profile?.photos?.[2]?.value || profile?.photos?.[0]?.value || ''
        });
      }
    )
  );
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Не авторизован' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Неверный токен' });
  }

  if (decoded?.tokenType && decoded.tokenType !== 'access') {
    return res.status(401).json({ message: 'Неверный тип токена' });
  }

  try {
    const db = await readDb();
    const user = db.users.find((entry) => entry.id === decoded.id);

    if (!user) {
      return res.status(401).json({ message: 'Пользователь не найден' });
    }

    const userTokenVersion = Number.isInteger(user.tokenVersion) ? user.tokenVersion : 0;
    const decodedTokenVersion = Number.isInteger(decoded.tokenVersion) ? decoded.tokenVersion : 0;

    if (decodedTokenVersion !== userTokenVersion) {
      return res.status(401).json({ message: 'Сессия завершена. Войдите снова' });
    }

    req.user = decoded;
    req.authUser = user;
    return next();
  } catch {
    return res.status(500).json({ message: 'Ошибка проверки сессии' });
  }
}

app.get('/api/health', (_, res) => {
  res.json({
    ok: true,
    service: 'cs-pro-platform-backend',
    steamConfigured: IS_STEAM_CONFIGURED,
    secureSecrets: IS_JWT_SECRET_SAFE && IS_SESSION_SECRET_SAFE
  });
});

app.get('/api/auth/steam/config', (_, res) => {
  res.json({ configured: IS_STEAM_CONFIGURED });
});

app.get('/api/auth/steam', (req, res, next) => {
  if (!IS_STEAM_CONFIGURED) {
    return res.status(503).json({
      message: 'Steam OAuth не настроен. Добавьте STEAM_API_KEY в backend environment.'
    });
  }

  return passport.authenticate('steam', { failureRedirect: `${FRONTEND_URL}/index.html` })(req, res, next);
});

app.get('/api/auth/steam/callback', (req, res, next) => {
  if (!IS_STEAM_CONFIGURED) {
    return res.redirect(`${FRONTEND_URL}/index.html?steamError=not-configured`);
  }

  return passport.authenticate('steam', async (error, steamUser) => {
    if (error || !steamUser) {
      return res.redirect(`${FRONTEND_URL}/index.html?steamError=auth-failed`);
    }

    try {
      const db = await readDb();
      let user = db.users.find((entry) => entry.steamId === steamUser.steamId);

      if (!user) {
        user = {
          id: Date.now(),
          nickname: steamUser.nickname,
          email: `steam_${steamUser.steamId}@csfamily.local`,
          steamId: steamUser.steamId,
          provider: 'steam',
          avatar: steamUser.avatar,
          tokenVersion: 0,
          createdAt: new Date().toISOString()
        };

        db.users.push(user);
        await writeDb(db);
      }

      const { accessToken, refreshToken } = issueAuthTokensForUser(user, {
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      await writeDb(db);
      const payload = encodeURIComponent(
        JSON.stringify({
          id: user.id,
          nickname: user.nickname,
          email: user.email,
          provider: 'steam',
          steamId: user.steamId,
          avatar: user.avatar || ''
        })
      );

      return res.redirect(
        `${FRONTEND_URL}/auth-callback.html?token=${encodeURIComponent(accessToken)}&refreshToken=${encodeURIComponent(refreshToken)}&user=${payload}`
      );
    } catch {
      return res.redirect(`${FRONTEND_URL}/index.html?steamError=server-error`);
    }
  })(req, res, next);
});

app.post('/api/auth/register', authLimiter, asyncHandler(async (req, res) => {
  const { nickname, email, password } = req.body || {};

  if (!isValidNickname(nickname)) {
    return res.status(400).json({ message: 'nickname должен быть от 2 до 32 символов' });
  }

  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ message: 'Некорректный email' });
  }

  if (!isValidPassword(password)) {
    return res.status(400).json({ message: 'Пароль должен быть от 8 до 72 символов' });
  }

  const db = await readDb();
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
    tokenVersion: 0,
    createdAt: new Date().toISOString()
  };

  db.users.push(user);
  const { accessToken, refreshToken } = issueAuthTokensForUser(user, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  await writeDb(db);

  return res.status(201).json({
    token: accessToken,
    refreshToken,
    user: {
      id: user.id,
      nickname: user.nickname,
      email: user.email
    }
  });
}));

app.post('/api/auth/login', authLimiter, asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};

  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail) || typeof password !== 'string') {
    return res.status(400).json({ message: 'Заполните корректные email и password' });
  }

  const db = await readDb();
  const user = db.users.find((entry) => entry.email === normalizedEmail);

  if (!user || !user.passwordHash) {
    return res.status(401).json({ message: 'Неверный email или пароль' });
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    return res.status(401).json({ message: 'Неверный email или пароль' });
  }

  const { accessToken, refreshToken } = issueAuthTokensForUser(user, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  await writeDb(db);

  return res.json({
    token: accessToken,
    refreshToken,
    user: {
      id: user.id,
      nickname: user.nickname,
      email: user.email
    }
  });
}));

app.post('/api/auth/refresh', refreshLimiter, asyncHandler(async (req, res) => {
  const { refreshToken } = req.body || {};

  if (typeof refreshToken !== 'string' || !refreshToken.trim()) {
    return res.status(400).json({ message: 'refreshToken обязателен' });
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Неверный refresh token' });
  }

  if (decoded?.tokenType !== 'refresh') {
    return res.status(401).json({ message: 'Неверный тип refresh token' });
  }

  const db = await readDb();
  const userIndex = db.users.findIndex((entry) => entry.id === decoded.id);

  if (userIndex === -1) {
    return res.status(401).json({ message: 'Пользователь не найден' });
  }

  const user = db.users[userIndex];
  normalizeRefreshTokens(user);

  const userTokenVersion = Number.isInteger(user.tokenVersion) ? user.tokenVersion : 0;
  const decodedTokenVersion = Number.isInteger(decoded.tokenVersion) ? decoded.tokenVersion : 0;
  if (userTokenVersion !== decodedTokenVersion) {
    return res.status(401).json({ message: 'Сессия завершена. Войдите снова' });
  }

  const refreshTokenHash = hashToken(refreshToken);
  const tokenIndex = user.refreshTokens.findIndex(
    (entry) => entry.tokenHash === refreshTokenHash && entry.tokenId === decoded.tokenId
  );

  if (tokenIndex === -1) {
    return res.status(401).json({ message: 'Refresh token не найден или уже использован' });
  }

  user.refreshTokens.splice(tokenIndex, 1);
  const { accessToken, refreshToken: nextRefreshToken } = issueAuthTokensForUser(user, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  await writeDb(db);

  return res.json({
    token: accessToken,
    refreshToken: nextRefreshToken
  });
}));

app.get('/api/auth/me', authMiddleware, asyncHandler(async (req, res) => {
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
}));

app.post('/api/auth/logout-all', authMiddleware, asyncHandler(async (req, res) => {
  const db = await readDb();
  const index = db.users.findIndex((entry) => entry.id === req.user.id);

  if (index === -1) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }

  const currentTokenVersion = Number.isInteger(db.users[index].tokenVersion) ? db.users[index].tokenVersion : 0;
  db.users[index].tokenVersion = currentTokenVersion + 1;
  db.users[index].refreshTokens = [];
  await writeDb(db);

  return res.json({ ok: true, message: 'Все сессии завершены' });
}));

app.post('/api/auth/logout-others', authMiddleware, asyncHandler(async (req, res) => {
  const db = await readDb();
  const index = db.users.findIndex((entry) => entry.id === req.user.id);

  if (index === -1) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }

  const currentTokenVersion = Number.isInteger(db.users[index].tokenVersion) ? db.users[index].tokenVersion : 0;
  db.users[index].tokenVersion = currentTokenVersion + 1;
  db.users[index].refreshTokens = [];

  const { accessToken, refreshToken } = issueAuthTokensForUser(db.users[index], {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  await writeDb(db);

  return res.json({
    ok: true,
    message: 'Другие сессии завершены',
    token: accessToken,
    refreshToken
  });
}));

app.get('/api/profile/stats', authMiddleware, asyncHandler(async (req, res) => {
  const db = await readDb();
  const index = db.users.findIndex((entry) => entry.id === req.user.id);

  if (index === -1) {
    return res.status(404).json({ message: 'Профиль не найден' });
  }

  const todayKey = new Date().toISOString().slice(0, 10);

  if (!db.users[index].stats || db.users[index].stats.generatedAtDay !== todayKey) {
    db.users[index].stats = buildDefaultStats(db.users[index]);
    await writeDb(db);
  }

  return res.json(db.users[index].stats);
}));

app.get('/api/news', asyncHandler(async (_, res) => {
  const db = await readDb();
  return res.json(db.news);
}));

app.get('/api/news/:slug', asyncHandler(async (req, res) => {
  const db = await readDb();
  const article = db.news.find((entry) => entry.slug === req.params.slug);

  if (!article) {
    return res.status(404).json({ message: 'Новость не найдена' });
  }

  return res.json(article);
}));

app.get('/api/players/top', asyncHandler(async (_, res) => {
  const db = await readDb();
  return res.json(db.topPlayers);
}));

app.get('/api/profile/me', authMiddleware, asyncHandler(async (req, res) => {
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
    country: user.country || 'Украина',
    provider: user.provider || 'password',
    steamId: user.steamId || null,
    avatar: user.avatar || ''
  });
}));

app.patch('/api/profile/me', authMiddleware, asyncHandler(async (req, res) => {
  const { nickname, bio, country } = req.body || {};
  const db = await readDb();
  const index = db.users.findIndex((entry) => entry.id === req.user.id);

  if (index === -1) {
    return res.status(404).json({ message: 'Профиль не найден' });
  }

  const trimmedNickname = typeof nickname === 'string' ? nickname.trim() : '';
  const trimmedCountry = typeof country === 'string' ? country.trim() : '';
  const safeBio = typeof bio === 'string' ? bio.trim().slice(0, 300) : db.users[index].bio;

  if (nickname !== undefined && !isValidNickname(trimmedNickname)) {
    return res.status(400).json({ message: 'nickname должен быть от 2 до 32 символов' });
  }

  if (country !== undefined && (!trimmedCountry || trimmedCountry.length > 56)) {
    return res.status(400).json({ message: 'country должен быть от 1 до 56 символов' });
  }

  db.users[index] = {
    ...db.users[index],
    nickname: trimmedNickname || db.users[index].nickname,
    bio: safeBio,
    country: trimmedCountry || db.users[index].country
  };

  await writeDb(db);

  return res.json({
    id: db.users[index].id,
    nickname: db.users[index].nickname,
    email: db.users[index].email,
    bio: db.users[index].bio || '',
    country: db.users[index].country || 'Украина',
    provider: db.users[index].provider || 'password',
    steamId: db.users[index].steamId || null,
    avatar: db.users[index].avatar || ''
  });
}));

app.use((_, res) => {
  res.status(404).json({ message: 'Маршрут не найден' });
});

app.use((error, req, res, next) => {
  if (error?.message === 'CORS origin denied') {
    return res.status(403).json({ message: 'CORS: origin запрещён' });
  }

  console.error('Unhandled API error:', error);
  return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
