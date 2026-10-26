import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';

const deriveKey = promisify(scrypt);
const sha = value => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('base64url');
const publicUser = user => ({ id: user.id, name: user.name, email: user.email, phone: user.phone });

export function registrationError(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Informe os dados do cadastro.';
  if (typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 120) return 'Informe seu nome (até 120 caracteres).';
  if (typeof data.email !== 'string' || data.email.length > 254 || !/^\S+@\S+\.\S+$/.test(data.email.trim())) return 'Informe um e-mail válido.';
  if (typeof data.password !== 'string' || data.password.length < 12 || data.password.length > 128) return 'Use uma senha com 12 a 128 caracteres.';
  if (data.password !== data.passwordConfirmation) return 'A confirmação da senha deve ser igual à senha.';
  return null;
}

export async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  const key = await deriveKey(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

// A derivação mantém compatibilidade com os hashes das contas existentes.
const dummyHash = `${'0'.repeat(32)}:${'0'.repeat(128)}`;
export async function passwordValid(password, stored) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const validFormat = typeof stored === 'string' && /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored);
  const [salt, hex] = (validFormat ? stored : dummyHash).split(':');
  const actual = await deriveKey(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hex, 'hex')) && validFormat;
}

export function googleConfiguration(env = process.env) {
  const clientId = env.GOOGLE_CLIENT_ID || '';
  const clientSecret = env.GOOGLE_CLIENT_SECRET || '';
  const origin = env.OFERTA_ORIGIN || `http://127.0.0.1:${env.PORT || 3000}`;
  const url = new URL(origin);
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('OFERTA_ORIGIN deve conter somente a origem do aplicativo.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Autenticação requer HTTPS fora do ambiente local.');
  return { clientId, clientSecret, origin: url.origin, redirectUri: `${url.origin}/auth/google/callback`, enabled: Boolean(clientId && clientSecret), secure: url.protocol === 'https:' };
}

export class AuthFlowError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export function createAuthentication({ db, vault, config, clientFactory, clock = () => Date.now() }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_identities (
      provider TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      verified_email TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(provider,subject), UNIQUE(user_id,provider)
    );
    CREATE TABLE IF NOT EXISTS oauth_attempts (
      state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, verifier TEXT NOT NULL, nonce_hash TEXT NOT NULL,
      intent TEXT NOT NULL, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO migrations VALUES(2,datetime('now'));
  `);
  function client() {
    if (!config.enabled) throw new AuthFlowError('google_unavailable');
    return clientFactory ? clientFactory() : new OAuth2Client({ clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri,transporterOptions:{timeout:15000} });
  }
  function cookie(name, value, maxAge) {
    return `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${config.secure ? '; Secure' : ''}`;
  }
  function session(user, oldToken) {
    const token = random();
    db.exec('BEGIN IMMEDIATE');
    try {
      if (oldToken) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(oldToken));
      db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(sha(token), user.id, new Date(clock() + 7 * 86400000).toISOString());
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return { user: publicUser(user), cookie: cookie('oferta_session', token, 604800) };
  }
  async function begin(intent = 'login', userId = null) {
    if (!['login', 'register', 'link'].includes(intent) || (intent === 'link' && !userId)) throw new AuthFlowError('invalid_request');
    const oauth = client();
    const state = random(), browser = random(), nonce = random();
    const { codeVerifier, codeChallenge } = await oauth.generateCodeVerifierAsync();
    db.prepare('DELETE FROM oauth_attempts WHERE expires_at<=?').run(clock());
    db.prepare('INSERT INTO oauth_attempts VALUES(?,?,?,?,?,?,?)').run(sha(state), sha(browser), vault.encrypt(codeVerifier), sha(nonce), intent, userId, clock() + 10 * 60000);
    const url = oauth.generateAuthUrl({ scope: ['openid', 'email', 'profile'], response_type: 'code', access_type: 'online', prompt: 'select_account', state, nonce, code_challenge: codeChallenge, code_challenge_method: CodeChallengeMethod.S256 });
    return { url, cookie: cookie('oferta_oauth', browser, 600) };
  }
  async function complete({ state, browser, code, error, currentUserId = null }) {
    if (typeof state !== 'string' || state.length > 100 || typeof browser !== 'string' || browser.length > 100) throw new AuthFlowError('invalid_state');
    // Consumo atômico: a tentativa é vinculada ao navegador e só pode ser usada uma vez.
    const attempt = db.prepare('DELETE FROM oauth_attempts WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING *').get(sha(state), sha(browser), clock());
    if (!attempt) throw new AuthFlowError('invalid_state');
    if (attempt.intent === 'link' && attempt.user_id !== currentUserId) throw new AuthFlowError('invalid_state');
    if (error) throw new AuthFlowError('google_cancelled');
    if (typeof code !== 'string' || !code || code.length > 4096) throw new AuthFlowError('invalid_request');
    let payload;
    try {
      const oauth = client();
      const { tokens } = await oauth.getToken({ code, codeVerifier: vault.decrypt(attempt.verifier), redirect_uri: config.redirectUri });
      if (!tokens.id_token) throw new Error('Missing ID token');
      const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: config.clientId });
      payload = ticket.getPayload();
    } catch {
      // Não propagar erros do SDK: podem conter o código OAuth, tokens ou segredo.
      throw new AuthFlowError('google_failed');
    }
    if (!payload || !['https://accounts.google.com', 'accounts.google.com'].includes(payload.iss)
      || payload.aud !== config.clientId || (payload.azp && payload.azp !== config.clientId)
      || !Number.isFinite(payload.exp) || payload.exp * 1000 <= clock()
      || typeof payload.nonce !== 'string' || sha(payload.nonce) !== attempt.nonce_hash
      || payload.email_verified !== true || typeof payload.email !== 'string' || payload.email.length > 254 || !/^\S+@\S+\.\S+$/.test(payload.email)
      || typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255) throw new AuthFlowError('google_failed');
    const email = payload.email.trim().toLowerCase();
    const identity = db.prepare("SELECT user_id FROM auth_identities WHERE provider='google' AND subject=?").get(payload.sub);
    if (attempt.intent === 'link') {
      const user = db.prepare('SELECT * FROM users WHERE id=?').get(currentUserId);
      if (!user || user.email !== email || (identity && identity.user_id !== user.id)) throw new AuthFlowError('link_failed');
      const other = db.prepare("SELECT subject FROM auth_identities WHERE user_id=? AND provider='google'").get(user.id);
      if (other && other.subject !== payload.sub) throw new AuthFlowError('link_failed');
      db.prepare("INSERT OR IGNORE INTO auth_identities VALUES('google',?,?,?,?)").run(payload.sub, user.id, email, new Date(clock()).toISOString());
      return { user, linked: true };
    }
    if (identity) return { user: db.prepare('SELECT * FROM users WHERE id=?').get(identity.user_id) };
    // E-mail igual não vincula automaticamente uma conta local a um provedor externo.
    if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) throw new AuthFlowError('account_exists');
    if (attempt.intent !== 'register') throw new AuthFlowError('account_missing');
    const user = { id: randomBytes(12).toString('hex'), name: String(payload.name || email.split('@')[0]).slice(0,120), email, phone: '' };
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO users(id,name,email,phone,password_hash,created_at) VALUES(?,?,?,?,?,?)').run(user.id, user.name, email, '', '!google-only', new Date(clock()).toISOString());
      db.prepare("INSERT INTO auth_identities VALUES('google',?,?,?,?)").run(payload.sub, user.id, email, new Date(clock()).toISOString());
      db.exec('COMMIT');
    } catch { db.exec('ROLLBACK'); throw new AuthFlowError('google_failed'); }
    return { user, created: true };
  }
  return { begin, complete, session, cookie, providers: () => ({ google: { enabled: config.enabled } }), linked: userId => Boolean(db.prepare("SELECT 1 FROM auth_identities WHERE user_id=? AND provider='google'").get(userId)) };
}
