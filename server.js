const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

const sessions = new Map();

function makeSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
}

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(STORE_FILE)) {
    const superSalt = makeSalt();
    const memberSalt = makeSalt();
    const adminSalt = makeSalt();

    const store = {
      users: [
        {
          id: 'user-superadmin',
          name: 'John Michael M. Ladia',
          email: 'johnmichaelladia.bsa.pass@gmail.com',
          passwordHash: hashPassword('23-02365', superSalt),
          salt: superSalt,
          role: 'super_admin',
          status: 'active',
          emailVerified: true,
          twoFactorEnabled: false,
          createdAt: new Date().toISOString(),
          lastLoginAt: null
        },
        {
          id: 'user-member',
          name: 'Regular User',
          email: 'member@jpia.local',
          passwordHash: hashPassword('Member#2026!', memberSalt),
          salt: memberSalt,
          role: 'user',
          status: 'approved',
          emailVerified: true,
          twoFactorEnabled: false,
          createdAt: new Date().toISOString(),
          lastLoginAt: null
        },
        {
          id: 'user-admin',
          name: 'Approved Admin',
          email: 'admin@jpia.local',
          passwordHash: hashPassword('Admin#2026!', adminSalt),
          salt: adminSalt,
          role: 'admin',
          status: 'active',
          emailVerified: true,
          twoFactorEnabled: false,
          createdAt: new Date().toISOString(),
          lastLoginAt: null
        }
      ],
      roles: [
        { id: 'role-super-admin', name: 'super_admin', permissions: ['all'] },
        { id: 'role-admin', name: 'admin', permissions: ['dashboard:view', 'users:view', 'requests:view', 'requests:approve', 'activity:view'] },
        { id: 'role-user', name: 'user', permissions: ['profile:view', 'request:admin'] }
      ],
      permissions: [
        { id: 'perm-all', name: 'all', description: 'Full system access' },
        { id: 'perm-dashboard', name: 'dashboard:view', description: 'View the dashboard' },
        { id: 'perm-users', name: 'users:view', description: 'View user records' },
        { id: 'perm-requests', name: 'requests:view', description: 'View admin access requests' },
        { id: 'perm-approve', name: 'requests:approve', description: 'Approve or reject admin requests' },
        { id: 'perm-activity', name: 'activity:view', description: 'View activity logs' },
        { id: 'perm-profile', name: 'profile:view', description: 'View your profile' },
        { id: 'perm-request-admin', name: 'request:admin', description: 'Submit admin access request' }
      ],
      adminRequests: [],
      financialReports: [],
      bylaws: [],
      projects: [],
      officerLeaves: [],
      auditLogs: [
        {
          id: 'audit-seed-1',
          userId: 'user-superadmin',
          action: 'system_init',
          details: 'System initialized with the default Super Admin account.',
          createdAt: new Date().toISOString()
        }
      ],
      emailNotifications: []
    };

    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
  }

  const store = loadStore();
  
  // Ensure super admin account always exists
  const superAdminExists = store.users && store.users.some(u => u.email === 'johnmichaelladia.bsa.pass@gmail.com' && u.role === 'super_admin');
  if (!superAdminExists) {
    const superSalt = makeSalt();
    store.users = store.users || [];
    store.users.unshift({
      id: 'user-superadmin',
      name: 'John Michael M. Ladia',
      email: 'johnmichaelladia.bsa.pass@gmail.com',
      passwordHash: hashPassword('23-02365', superSalt),
      salt: superSalt,
      role: 'super_admin',
      status: 'active',
      emailVerified: true,
      twoFactorEnabled: false,
      createdAt: new Date().toISOString(),
      lastLoginAt: null
    });
    saveStore(store);
  }
  
  if (!store.siteContent) {
    store.siteContent = {
      announcements: [
        { title: 'Chapter General Assembly and Orientation', message: 'All members are required to attend the orientation on Friday, 5:00 PM in the auditorium.', category: 'Urgent' },
        { title: 'Scholarship Opportunities for Accounting Students', message: 'Several private and government scholarship opportunities are now open for eligible members.', category: 'Academic' },
        { title: 'CPA Review Seminar Registration Open', message: 'Secure your slot for the next intensive CPA review session.', category: 'Event' }
      ],
      updatedAt: new Date().toISOString()
    };
    saveStore(store);
  }
}

function loadStore() {
  return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
}

function saveStore(store) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(header = '') {
  return header.split(';').reduce((acc, pair) => {
    const [key, ...rest] = pair.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

function getCurrentUser(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const sessionToken = cookies.session;
  if (!sessionToken) return null;

  const session = sessions.get(sessionToken);
  if (!session) return null;

  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionToken);
    return null;
  }

  const store = loadStore();
  const user = store.users.find((entry) => entry.id === session.userId);
  if (!user) return null;

  session.expiresAt = Date.now() + SESSION_TIMEOUT_MS;
  return user;
}

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, salt, ...safeUser } = user;
  return safeUser;
}

function setSessionCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TIMEOUT_MS / 1000)}`
  );
}

function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TIMEOUT_MS });
  setSessionCookie(res, token);
  return token;
}

function logAuditAction(action, userId, details, store = loadStore()) {
  store.auditLogs.unshift({
    id: `audit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    userId,
    action,
    details,
    createdAt: new Date().toISOString()
  });
  saveStore(store);
}

function createAuditRecord(action, userId, details) {
  const store = loadStore();
  logAuditAction(action, userId, details, store);
}

function createNotification(userId, type, title, message) {
  const store = loadStore();
  store.emailNotifications.unshift({
    id: `notif-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    userId,
    type,
    title,
    message,
    createdAt: new Date().toISOString(),
    sent: true
  });
  saveStore(store);
}

function notifyMembers(store, type, title, message) {
  const activeUsers = store.users.filter((entry) => entry.role === 'user' || entry.role === 'admin' || entry.role === 'super_admin');
  activeUsers.forEach((user) => {
    store.emailNotifications.unshift({
      id: `notif-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      userId: user.id,
      type,
      title,
      message,
      createdAt: new Date().toISOString(),
      sent: true
    });
  });
  saveStore(store);
}

function requireAuthMiddleware(req, res) {
  const user = getCurrentUser(req);
  if (!user) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ message: 'Authentication required.' }));
    return null;
  }

  return user;
}

function requireRole(req, res, allowedRoles) {
  const user = requireAuthMiddleware(req, res);
  if (!user) return null;

  if (!allowedRoles.includes(user.role)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ message: 'You do not have permission to perform this action.' }));
    return null;
  }

  return user;
}

function resolveRoute(req, res) {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);
  const allowedOrigins = [
    'http://192.168.5.171:8000',
    'https://a7afe5c43c9357.lhr.life',
    'https://jpia-pass-public.onrender.com',
    'https://06e9dec96f1737.lhr.life'
  ];
  const requestOrigin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', allowedOrigins.includes(requestOrigin) ? requestOrigin : 'null');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (pathname === '/api/register') {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end(JSON.stringify({ message: 'Method not allowed.' }));
      return;
    }

    readBody(req)
      .then((body) => {
        const { name, email, password } = body;

        if (!name || !email || !password) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'Name, email, and password are required.' }));
          return;
        }

        const store = loadStore();
        const normalizedEmail = String(email).trim().toLowerCase();
        const duplicate = store.users.find((user) => user.email.toLowerCase() === normalizedEmail);
        if (duplicate) {
          res.statusCode = 409;
          res.end(JSON.stringify({ message: 'An account with this email already exists.' }));
          return;
        }

        const salt = makeSalt();
        const user = {
          id: `user-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          name: String(name).trim(),
          email: normalizedEmail,
          passwordHash: hashPassword(String(password), salt),
          salt,
          role: 'user',
          status: 'active',
          emailVerified: true,
          twoFactorEnabled: false,
          createdAt: new Date().toISOString(),
          lastLoginAt: null
        };

        store.users.push(user);
        createAuditRecord('user_registered', user.id, `New account registered for ${user.email}.`);
        createNotification(user.id, 'account_created', 'Account Created', 'Your account has been created successfully.');
        saveStore(store);

        res.statusCode = 201;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ message: 'Registration successful.', user: sanitizeUser(user) }));
      })
      .catch((error) => {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ message: error.message || 'Registration failed.' }));
      });
    return;
  }

  if (pathname === '/api/login') {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end(JSON.stringify({ message: 'Method not allowed.' }));
      return;
    }

    readBody(req)
      .then((body) => {
        const { email, password, otp } = body;
        if (!email || !password) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'Email and password are required.' }));
          return;
        }

        const store = loadStore();
        const user = store.users.find((entry) => entry.email.toLowerCase() === String(email).trim().toLowerCase());
        if (!user) {
          res.statusCode = 401;
          res.end(JSON.stringify({ message: 'Invalid email or password.' }));
          return;
        }

        const expectedHash = hashPassword(String(password), user.salt);
        if (expectedHash !== user.passwordHash) {
          res.statusCode = 401;
          res.end(JSON.stringify({ message: 'Invalid email or password.' }));
          return;
        }

        const isApprovedUser = ['active', 'approved'].includes(user.status) || user.role === 'admin' || user.role === 'super_admin';
        if (!isApprovedUser) {
          res.statusCode = 403;
          res.end(JSON.stringify({ message: 'Your account is pending approval or has been rejected.' }));
          return;
        }

        if (user.twoFactorEnabled) {
          const validOtp = String(otp || '').trim() === '123456';
          if (!validOtp) {
            res.statusCode = 401;
            res.end(JSON.stringify({
              message: 'Two-factor authentication required.',
              requires2fa: true,
              demoCode: '123456'
            }));
            return;
          }
        }

        const token = createSession(user.id, res);
        user.lastLoginAt = new Date().toISOString();
        saveStore(store);
        createAuditRecord('login_success', user.id, `${user.email} signed in successfully.`);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ message: 'Login successful.', user: sanitizeUser(user), token }));
      })
      .catch((error) => {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ message: error.message || 'Login failed.' }));
      });
    return;
  }

  if (pathname === '/api/logout') {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end(JSON.stringify({ message: 'Method not allowed.' }));
      return;
    }

    const cookies = parseCookies(req.headers.cookie || '');
    if (cookies.session) {
      sessions.delete(cookies.session);
    }
    res.setHeader('Set-Cookie', 'session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ message: 'Logged out successfully.' }));
    return;
  }

  if (pathname === '/api/me') {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end(JSON.stringify({ message: 'Method not allowed.' }));
      return;
    }

    const user = requireAuthMiddleware(req, res);
    if (!user) return;

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ user: sanitizeUser(user) }));
    return;
  }

  if (pathname === '/api/site-content') {
    if (req.method === 'GET') {
      const store = loadStore();
      const currentUser = getCurrentUser(req);
      const isAdmin = currentUser && (currentUser.role === 'super_admin' || currentUser.role === 'admin');
      const publicContent = {
        ...(store.siteContent || { announcements: [] }),
        announcements: isAdmin
          ? (store.siteContent?.announcements || [])
          : (store.siteContent?.announcements || []).filter((announcement) => announcement.published !== false)
      };
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ content: publicContent }));
      return;
    }

    const user = requireRole(req, res, ['super_admin', 'admin']);
    if (!user) return;
    if (req.method !== 'PUT') {
      res.statusCode = 405;
      res.end(JSON.stringify({ message: 'Method not allowed.' }));
      return;
    }

    readBody(req)
      .then((body) => {
        if (!Array.isArray(body.announcements)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'Announcements must be an array.' }));
          return;
        }
        const store = loadStore();
        store.siteContent = {
          announcements: body.announcements.slice(0, 20).map((announcement) => ({
            title: String(announcement.title || '').trim().slice(0, 120),
            message: String(announcement.message || '').trim().slice(0, 500),
            category: String(announcement.category || 'Update').trim().slice(0, 40),
            published: announcement.published !== false,
            attachments: Array.isArray(announcement.attachments)
              ? announcement.attachments.slice(0, 5).map((attachment) => ({
                  label: String(attachment.label || 'Attachment').trim().slice(0, 80),
                  type: String(attachment.type || 'link').trim().slice(0, 30),
                  url: String(attachment.url || '').trim().slice(0, 500)
                })).filter((attachment) => attachment.url)
              : []
          })).filter((announcement) => announcement.title && announcement.message),
          updatedAt: new Date().toISOString()
        };
        saveStore(store);
        logAuditAction('site_content_updated', user.id, `${user.email} updated public announcements.`, store);
        notifyMembers(store, 'announcement_update', 'New JPIA Announcement', 'A new announcement has been posted by the admins.');
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ message: 'Website content saved.', content: store.siteContent }));
      })
      .catch((error) => {
        res.statusCode = 400;
        res.end(JSON.stringify({ message: error.message || 'Unable to save website content.' }));
      });
    return;
  }

  if (pathname === '/api/dashboard') {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end(JSON.stringify({ message: 'Method not allowed.' }));
      return;
    }

    const user = requireRole(req, res, ['super_admin', 'admin']);
    if (!user) return;

    const store = loadStore();
    const totalUsers = store.users.length;
    const totalAdmins = store.users.filter((entry) => entry.role === 'admin' || entry.role === 'super_admin').length;
    const pendingRequests = store.adminRequests.filter((request) => request.status === 'pending').length;
    const recentActivity = store.auditLogs.slice(0, 8);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      totalUsers,
      totalAdmins,
      pendingRequests,
      recentActivity,
      user: sanitizeUser(user)
    }));
    return;
  }

  if (pathname === '/api/financial-reports') {
    const user = requireAuthMiddleware(req, res);
    if (!user) return;

    if (req.method === 'GET') {
      const store = loadStore();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ reports: store.financialReports || [] }));
      return;
    }

    if (user.role !== 'super_admin' && user.role !== 'admin') {
      res.statusCode = 403;
      res.end(JSON.stringify({ message: 'Only admins may manage financial reports.' }));
      return;
    }

    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end(JSON.stringify({ message: 'Method not allowed.' }));
      return;
    }

    readBody(req)
      .then((body) => {
        const store = loadStore();
        const fileData = typeof body.fileData === 'string' ? body.fileData.trim() : '';
        const fileUrl = String(body.fileUrl || '').trim();
        const fileName = String(body.fileName || '').trim();
        const report = {
          id: `report-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          title: String(body.title || '').trim(),
          description: String(body.description || '').trim(),
          type: String(body.type || (fileData ? 'file' : 'link')).trim(),
          fileUrl: fileUrl || fileData || '',
          fileName: fileName || (fileUrl ? 'external-link' : 'uploaded-file'),
          uploadedBy: user.email,
          createdAt: new Date().toISOString(),
          visibleToMembers: body.visibleToMembers !== false,
          source: fileData ? 'upload' : 'link'
        };

        if (!report.title || (!report.fileUrl && !fileData)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'Title and a valid file or link are required.' }));
          return;
        }

        store.financialReports.unshift(report);
        saveStore(store);
        notifyMembers(store, 'financial_report', 'Financial Report Updated', `${user.name} uploaded a new financial report.`);
        createAuditRecord('financial_report_updated', user.id, `${user.email} updated financial reports.`);
        res.statusCode = 201;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ message: 'Financial report saved.', report }));
      })
      .catch((error) => {
        res.statusCode = 400;
        res.end(JSON.stringify({ message: error.message || 'Unable to save financial report.' }));
      });
    return;
  }

  if (pathname === '/api/bylaws') {
    const user = requireAuthMiddleware(req, res);
    if (!user) return;

    if (req.method === 'GET') {
      const store = loadStore();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ bylaws: store.bylaws || [] }));
      return;
    }

    if (user.role !== 'super_admin' && user.role !== 'admin') {
      res.statusCode = 403;
      res.end(JSON.stringify({ message: 'Only admins may manage bylaws.' }));
      return;
    }

    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end(JSON.stringify({ message: 'Method not allowed.' }));
      return;
    }

    readBody(req)
      .then((body) => {
        const store = loadStore();
        const fileData = typeof body.fileData === 'string' ? body.fileData.trim() : '';
        const fileUrl = String(body.fileUrl || '').trim();
        const fileName = String(body.fileName || '').trim();
        const bylaw = {
          id: `bylaw-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          title: String(body.title || '').trim(),
          description: String(body.description || '').trim(),
          fileUrl: fileUrl || fileData || '',
          fileName: fileName || (fileUrl ? 'external-link' : 'uploaded-file'),
          type: String(body.type || (fileData ? 'document' : 'link')).trim(),
          uploadedBy: user.email,
          createdAt: new Date().toISOString(),
          source: fileData ? 'upload' : 'link'
        };

        if (!bylaw.title || (!bylaw.fileUrl && !fileData)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'Title and a valid document or link are required.' }));
          return;
        }

        store.bylaws.unshift(bylaw);
        saveStore(store);
        notifyMembers(store, 'bylaw_update', 'Bylaws Updated', `${user.name} added a new bylaw or governing document.`);
        createAuditRecord('bylaw_updated', user.id, `${user.email} updated the bylaws.`);
        res.statusCode = 201;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ message: 'Bylaw saved.', bylaw }));
      })
      .catch((error) => {
        res.statusCode = 400;
        res.end(JSON.stringify({ message: error.message || 'Unable to save bylaw.' }));
      });
    return;
  }

  if (pathname === '/api/projects') {
    const user = requireAuthMiddleware(req, res);
    if (!user) return;

    if (req.method === 'GET') {
      const store = loadStore();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ projects: store.projects || [] }));
      return;
    }

    if (user.role !== 'super_admin' && user.role !== 'admin') {
      res.statusCode = 403;
      res.end(JSON.stringify({ message: 'Only admins may manage JPIA projects.' }));
      return;
    }

    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end(JSON.stringify({ message: 'Method not allowed.' }));
      return;
    }

    readBody(req)
      .then((body) => {
        const store = loadStore();
        const project = {
          id: `project-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          title: String(body.title || '').trim(),
          description: String(body.description || '').trim(),
          status: String(body.status || 'coming-soon').trim(),
          progress: Number(body.progress || 0),
          updatedBy: user.email,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          evaluations: Array.isArray(body.evaluations) ? body.evaluations : []
        };

        if (!project.title) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'Project title is required.' }));
          return;
        }

        store.projects.unshift(project);
        saveStore(store);
        notifyMembers(store, 'project_update', 'Project Update', `${user.name} updated a project status.`);
        createAuditRecord('project_updated', user.id, `${user.email} updated the project ${project.title}.`);
        res.statusCode = 201;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ message: 'Project saved.', project }));
      })
      .catch((error) => {
        res.statusCode = 400;
        res.end(JSON.stringify({ message: error.message || 'Unable to save project.' }));
      });
    return;
  }

  if (pathname.startsWith('/api/projects/')) {
    const user = requireAuthMiddleware(req, res);
    if (!user) return;
    if (user.role !== 'super_admin' && user.role !== 'admin') {
      res.statusCode = 403;
      res.end(JSON.stringify({ message: 'Only admins may update projects.' }));
      return;
    }

    if (req.method !== 'PATCH') {
      res.statusCode = 405;
      res.end(JSON.stringify({ message: 'Method not allowed.' }));
      return;
    }

    const projectId = pathname.split('/').pop();
    readBody(req)
      .then((body) => {
        const store = loadStore();
        const project = store.projects.find((entry) => entry.id === projectId);
        if (!project) {
          res.statusCode = 404;
          res.end(JSON.stringify({ message: 'Project not found.' }));
          return;
        }

        if (body.status) project.status = String(body.status);
        if (body.progress !== undefined) project.progress = Number(body.progress);
        if (body.description) project.description = String(body.description);
        if (body.title) project.title = String(body.title);
        if (Array.isArray(body.evaluations)) project.evaluations = body.evaluations;
        if (body.evaluation) {
          const evaluation = {
            memberName: String(body.evaluation.memberName || body.evaluation.name || 'Member').trim(),
            rating: Number(body.evaluation.rating || 0),
            feedback: String(body.evaluation.feedback || body.evaluation.comments || '').trim(),
            submittedBy: user.email,
            createdAt: new Date().toISOString()
          };
          project.evaluations = Array.isArray(project.evaluations) ? project.evaluations : [];
          project.evaluations.unshift(evaluation);
        }
        project.updatedAt = new Date().toISOString();
        project.updatedBy = user.email;
        saveStore(store);
        createAuditRecord('project_updated', user.id, `${user.email} updated project ${project.title}.`);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ message: 'Project updated.', project }));
      })
      .catch((error) => {
        res.statusCode = 400;
        res.end(JSON.stringify({ message: error.message || 'Unable to update project.' }));
      });
    return;
  }

  if (pathname === '/api/officer-leaves') {
    const user = requireAuthMiddleware(req, res);
    if (!user) return;

    if (req.method === 'GET') {
      const store = loadStore();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ leaves: store.officerLeaves || [] }));
      return;
    }

    if (user.role !== 'super_admin' && user.role !== 'admin') {
      res.statusCode = 403;
      res.end(JSON.stringify({ message: 'Only admins may manage officer leave records.' }));
      return;
    }

    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end(JSON.stringify({ message: 'Method not allowed.' }));
      return;
    }

    readBody(req)
      .then((body) => {
        const store = loadStore();
        const leaveRecord = {
          id: `leave-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          officerName: String(body.officerName || '').trim(),
          position: String(body.position || '').trim(),
          leaveType: String(body.leaveType || 'leave').trim(),
          startDate: String(body.startDate || '').trim(),
          endDate: String(body.endDate || '').trim(),
          status: String(body.status || 'pending').trim(),
          notes: String(body.notes || '').trim(),
          createdAt: new Date().toISOString(),
          recordedBy: user.email
        };

        if (!leaveRecord.officerName || !leaveRecord.position) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'Officer name and position are required.' }));
          return;
        }

        store.officerLeaves.unshift(leaveRecord);
        saveStore(store);
        notifyMembers(store, 'officer_update', 'Officer Update', `${leaveRecord.officerName} has a new leave update recorded.`);
        createAuditRecord('officer_leave_recorded', user.id, `${user.email} recorded a leave change for ${leaveRecord.officerName}.`);
        res.statusCode = 201;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ message: 'Officer leave record saved.', leaveRecord }));
      })
      .catch((error) => {
        res.statusCode = 400;
        res.end(JSON.stringify({ message: error.message || 'Unable to save officer leave record.' }));
      });
    return;
  }

  if (pathname === '/api/users') {
    const user = requireAuthMiddleware(req, res);
    if (!user) return;

    const store = loadStore();
    const visibleUsers = user.role === 'super_admin' || user.role === 'admin'
      ? store.users.map(sanitizeUser)
      : store.users.filter((entry) => entry.id === user.id).map(sanitizeUser);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ users: visibleUsers }));
    return;
  }

  if (pathname === '/api/admin-requests') {
    const user = requireAuthMiddleware(req, res);
    if (!user) return;

    if (req.method === 'GET') {
      const store = loadStore();
      if (user.role !== 'super_admin' && user.role !== 'admin') {
        const ownRequests = store.adminRequests
          .filter((request) => request.userId === user.id)
          .map((request) => ({ ...request }));
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ requests: ownRequests }));
        return;
      }

      const requests = store.adminRequests.map((request) => {
        const targetUser = store.users.find((entry) => entry.id === request.userId);
        return {
          ...request,
          userName: targetUser ? targetUser.name : 'Unknown user',
          userEmail: targetUser ? targetUser.email : request.email,
          createdAt: request.createdAt
        };
      });

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ requests }));
      return;
    }

    if (req.method === 'POST') {
      if (user.role !== 'user') {
        res.statusCode = 403;
        res.end(JSON.stringify({ message: 'Only regular users can submit admin requests.' }));
        return;
      }

      readBody(req)
        .then((body) => {
          const reason = String(body.reason || '').trim();
          const email = String(body.email || user.email).trim().toLowerCase();
          const store = loadStore();

          const existingAccount = store.users.find((entry) => entry.email.toLowerCase() === email);
          if (!existingAccount || existingAccount.id !== user.id) {
            res.statusCode = 400;
            res.end(JSON.stringify({ message: 'The submitted email must belong to your existing account.' }));
            return;
          }

          const existingRequest = store.adminRequests.find(
            (request) => request.userId === user.id && request.status === 'pending'
          );
          if (existingRequest) {
            res.statusCode = 409;
            res.end(JSON.stringify({ message: 'You already have a pending admin access request.' }));
            return;
          }

          const newRequest = {
            id: `req-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            userId: user.id,
            email,
            reason,
            status: 'pending',
            createdAt: new Date().toISOString(),
            reviewedBy: null,
            reviewedAt: null
          };

          store.adminRequests.unshift(newRequest);
          saveStore(store);

          createAuditRecord('admin_request_submitted', user.id, `Admin request submitted for ${user.email}.`);
          createNotification('user-superadmin', 'admin_request', 'New Admin Request', `${user.name} requested admin access.`);

          const superAdmin = store.users.find((entry) => entry.role === 'super_admin');
          if (superAdmin) {
            createNotification(superAdmin.id, 'admin_request', 'Pending Admin Request', `${user.name} (${user.email}) has submitted an admin access request.`);
          }

          res.statusCode = 201;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ message: 'Admin access request submitted successfully.', request: newRequest }));
        })
        .catch((error) => {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: error.message || 'Unable to submit request.' }));
        });
      return;
    }
  }

  if (pathname.startsWith('/api/admin-requests/')) {
    const user = requireRole(req, res, ['super_admin']);
    if (!user) return;

    const requestId = pathname.split('/').pop();
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end(JSON.stringify({ message: 'Method not allowed.' }));
      return;
    }

    readBody(req)
      .then((body) => {
        const action = body.action;
        if (!['approve', 'reject'].includes(action)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'Action must be approve or reject.' }));
          return;
        }

        const store = loadStore();
        const request = store.adminRequests.find((entry) => entry.id === requestId);
        if (!request) {
          res.statusCode = 404;
          res.end(JSON.stringify({ message: 'Admin request not found.' }));
          return;
        }

        const targetUser = store.users.find((entry) => entry.id === request.userId);
        if (!targetUser) {
          res.statusCode = 404;
          res.end(JSON.stringify({ message: 'The requesting user was not found.' }));
          return;
        }

        if (request.status !== 'pending') {
          res.statusCode = 409;
          res.end(JSON.stringify({ message: 'This admin request has already been decided.' }));
          return;
        }

        if (targetUser.id === user.id) {
          res.statusCode = 403;
          res.end(JSON.stringify({ message: 'Users cannot approve their own admin request.' }));
          return;
        }

        if (action === 'approve') {
          const previousRole = targetUser.role;
          targetUser.role = 'admin';
          request.status = 'approved';
          request.reviewedBy = user.id;
          request.reviewedAt = new Date().toISOString();
          createAuditRecord('admin_approved', user.id, `${targetUser.email} was approved as an admin by ${user.email}.`);
          createNotification(targetUser.id, 'admin_approved', 'Admin Access Approved', 'Your admin access request has been approved by the Super Admin.');
          createNotification(user.id, 'admin_decision', 'Approval Logged', `Admin request for ${targetUser.email} was approved.`);

          if (previousRole === 'super_admin') {
            res.statusCode = 400;
            res.end(JSON.stringify({ message: 'A Super Admin cannot be demoted through this flow.' }));
            return;
          }
        }

        if (action === 'reject') {
          request.status = 'rejected';
          request.reviewedBy = user.id;
          request.reviewedAt = new Date().toISOString();
          createAuditRecord('admin_rejected', user.id, `${targetUser.email} admin request was rejected by ${user.email}.`);
          createNotification(targetUser.id, 'admin_rejected', 'Admin Access Rejected', `Your admin access request was rejected. Reason: ${body.reason || 'No reason provided.'}`);
          createNotification(user.id, 'admin_decision', 'Rejection Logged', `Admin request for ${targetUser.email} was rejected.`);
        }

        saveStore(store);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ message: `Admin request ${action}d successfully.`, request }));
      })
      .catch((error) => {
        res.statusCode = 400;
        res.end(JSON.stringify({ message: error.message || 'Unable to process request.' }));
      });
    return;
  }

  if (pathname.startsWith('/api/users/')) {
    const user = requireAuthMiddleware(req, res);
    if (!user) return;

    const userId = pathname.split('/').pop();
    if (req.method === 'PATCH') {
      if (user.role !== 'super_admin' && user.role !== 'admin') {
        res.statusCode = 403;
        res.end(JSON.stringify({ message: 'Only admins may modify user roles or accounts.' }));
        return;
      }

      readBody(req)
        .then((body) => {
          const store = loadStore();
          const targetUser = store.users.find((entry) => entry.id === userId);
          if (!targetUser) {
            res.statusCode = 404;
            res.end(JSON.stringify({ message: 'User not found.' }));
            return;
          }

          if (targetUser.role === 'super_admin') {
            res.statusCode = 403;
            res.end(JSON.stringify({ message: 'The Super Admin account cannot be modified by other administrators.' }));
            return;
          }

          const role = body.role;
          if (role && role !== 'admin' && role !== 'user') {
            res.statusCode = 400;
            res.end(JSON.stringify({ message: 'Invalid role update.' }));
            return;
          }

          if (role) {
            targetUser.role = role;
            createAuditRecord('role_changed', user.id, `${targetUser.email} role updated to ${role}.`);
          }

          if (body.status) {
            if (!['pending', 'approved', 'rejected', 'active'].includes(String(body.status))) {
              res.statusCode = 400;
              res.end(JSON.stringify({ message: 'Invalid member status value.' }));
              return;
            }
            targetUser.status = String(body.status);
            createAuditRecord('account_status_changed', user.id, `${targetUser.email} account status changed to ${body.status}.`);
            if (targetUser.role === 'user' && String(body.status) === 'approved') {
              createNotification(targetUser.id, 'member_approved', 'Membership Approved', 'Your JPIA membership has been approved by the admin team.');
            }
            if (targetUser.role === 'user' && String(body.status) === 'rejected') {
              createNotification(targetUser.id, 'member_rejected', 'Membership Rejected', 'Your JPIA membership request was not approved.');
            }
          }

          if (body.twoFactorEnabled !== undefined) {
            targetUser.twoFactorEnabled = !!body.twoFactorEnabled;
            createAuditRecord('security_setting_updated', user.id, `${targetUser.email} 2FA updated to ${targetUser.twoFactorEnabled ? 'enabled' : 'disabled'}.`);
          }

          saveStore(store);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ message: 'User updated successfully.', user: sanitizeUser(targetUser) }));
        })
        .catch((error) => {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: error.message || 'Unable to update user.' }));
        });
      return;
    }
  }

  if (pathname === '/api/audit-logs') {
    const user = requireRole(req, res, ['super_admin', 'admin']);
    if (!user) return;

    const store = loadStore();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ logs: store.auditLogs.slice(0, 25) }));
    return;
  }

  if (pathname === '/api/email-notifications') {
    const user = requireRole(req, res, ['super_admin', 'admin']);
    if (!user) return;

    const store = loadStore();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ notifications: store.emailNotifications.slice(0, 25) }));
    return;
  }

  // Static files
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ message: 'Method not allowed.' }));
    return;
  }

  const relativePath = pathname === '/' ? '/index.html' : pathname;
  const safePath = path.normalize(relativePath).replace(/^\.+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.ico': 'image/x-icon'
    }[ext] || 'application/octet-stream';

    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  try {
    resolveRoute(req, res);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ message: 'Unexpected server error.', error: error.message }));
  }
});

ensureStore();
server.listen(PORT, HOST, () => {
  console.log(`Admin approval system is running at http://${HOST}:${PORT}`);
  console.log('Demo Super Admin credentials: johnmichaelladia.bsa.pass@gmail.com / SuperAdmin#2026!');
  console.log('Demo Regular User credentials: member@jpia.local / Member#2026!');
});
