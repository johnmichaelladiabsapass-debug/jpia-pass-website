const state = {
  user: null,
  users: [],
  requests: [],
  logs: [],
  activeSection: 'overview'
};

const $ = (selector) => document.querySelector(selector);

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add('hidden'), 2500);
}

async function api(path, options = {}) {
  const config = {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options
  };

  if (options.body && typeof options.body !== 'string') {
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(path, config);
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    throw new Error(typeof data === 'string' ? data : data.message || 'Request failed');
  }

  return data;
}

function setAuthView(isVisible) {
  $('#authView').classList.toggle('hidden', !isVisible);
  $('#dashboardView').classList.toggle('hidden', isVisible);
}

function renderUserStatus() {
  const user = state.user;
  $('#welcomeText').textContent = user ? `Welcome, ${user.name} (${user.role})` : 'Welcome';
  $('#portalTitle').textContent = user && (user.role === 'super_admin' || user.role === 'admin')
    ? 'Admin Control Panel'
    : 'Member Portal';
  $('#requestEmail').value = user ? user.email : '';
}

function renderSections() {
  const isAdminLike = state.user && (state.user.role === 'super_admin' || state.user.role === 'admin');

  document.querySelectorAll('.nav-link').forEach((button) => {
    const restricted = ['users', 'admins', 'requests', 'content', 'activity'].includes(button.dataset.section) && !isAdminLike;
    button.style.display = restricted ? 'none' : 'block';
    button.classList.toggle('active', !restricted && button.dataset.section === state.activeSection);
  });

  document.querySelectorAll('.section-panel').forEach((panel) => {
    const key = panel.id.replace('Section', '');
    const restricted = ['users', 'admins', 'requests', 'content', 'activity'].includes(key) && !isAdminLike;
    panel.classList.toggle('hidden-panel', restricted || panel.id !== `${state.activeSection}Section`);
    panel.classList.toggle('active-panel', !restricted && panel.id === `${state.activeSection}Section`);
  });
}

function renderUsersTable() {
  const rowTarget = $('#usersTableBody');
  rowTarget.innerHTML = '';

  state.users.forEach((user) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${user.name}</td>
      <td>${user.email}</td>
      <td><span class="badge ${user.role === 'super_admin' ? 'role-super' : user.role === 'admin' ? 'role-admin' : 'role-user'}">${user.role}</span></td>
      <td><span class="badge ${user.status === 'active' ? 'status-approved' : 'status-rejected'}">${user.status}</span></td>
    `;
    rowTarget.appendChild(row);
  });
}

function renderAdminsTable() {
  const rowTarget = $('#adminsTableBody');
  rowTarget.innerHTML = '';

  const admins = state.users.filter((user) => user.role === 'admin' || user.role === 'super_admin');
  admins.forEach((admin) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${admin.name}</td>
      <td>${admin.email}</td>
      <td><span class="badge ${admin.role === 'super_admin' ? 'role-super' : 'role-admin'}">${admin.role}</span></td>
      <td>${admin.twoFactorEnabled ? 'Enabled' : 'Disabled'}</td>
    `;
    rowTarget.appendChild(row);
  });
}

function renderRequestsTable() {
  const rowTarget = $('#requestsTableBody');
  rowTarget.innerHTML = '';

  if (!state.requests.length) {
    rowTarget.innerHTML = '<tr><td colspan="6">No admin requests found.</td></tr>';
    return;
  }

  state.requests.forEach((request) => {
    const row = document.createElement('tr');
    const actions = request.status === 'pending'
      ? '<button class="approve-btn" data-action="approve" data-id="' + request.id + '">Approve</button><button class="reject-btn" data-action="reject" data-id="' + request.id + '">Reject</button>'
      : '<span class="muted-action">Decision recorded</span>';
    row.innerHTML = `
      <td>${request.userName || 'Unknown'}</td>
      <td>${request.userEmail || request.email || 'N/A'}</td>
      <td>${new Date(request.createdAt).toLocaleDateString()}</td>
      <td>${request.reason || 'No reason provided.'}</td>
      <td><span class="badge status-${request.status}">${request.status}</span></td>
      <td class="action-cell">${actions}</td>
    `;
    rowTarget.appendChild(row);
  });
}

function renderActivityTable() {
  const rowTarget = $('#activityTableBody');
  rowTarget.innerHTML = '';

  state.logs.forEach((log) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${log.action}</td>
      <td>${log.userId || 'System'}</td>
      <td>${log.details}</td>
      <td>${new Date(log.createdAt).toLocaleString()}</td>
    `;
    rowTarget.appendChild(row);
  });
}

function renderOverview(data) {
  $('#totalUsersStat').textContent = data.totalUsers ?? 0;
  $('#totalAdminsStat').textContent = data.totalAdmins ?? 0;
  $('#pendingRequestsStat').textContent = data.pendingRequests ?? 0;
  $('#recentActivityStat').textContent = (data.recentActivity || []).length;
}

function renderContent(content) {
  const editor = $('#announcementEditor');
  editor.replaceChildren();
  (content.announcements || []).forEach((announcement, index) => {
    const card = document.createElement('div');
    card.className = 'announcement-editor-card';
    card.dataset.index = index;
    card.dataset.published = announcement.published === false ? 'false' : 'true';
    card.innerHTML = `
      <label>Title<input data-field="title" value=""></label>
      <label>Message<textarea data-field="message" rows="3"></textarea></label>
      <label>Category<input data-field="category" value=""></label>
      <span class="badge ${announcement.published === false ? 'status-pending' : 'status-approved'}">${announcement.published === false ? 'draft' : 'published'}</span>
      <div class="content-actions">
        <button type="button" class="primary-btn" data-content-action="publish">${announcement.published === false ? 'Publish' : 'Update'}</button>
        <button type="button" class="reject-btn" data-content-action="delete">Delete</button>
      </div>`;
    card.querySelector('[data-field="title"]').value = announcement.title || '';
    card.querySelector('[data-field="message"]').value = announcement.message || '';
    card.querySelector('[data-field="category"]').value = announcement.category || 'Update';
    editor.appendChild(card);
  });
}

function renderRequestStatus(requests) {
  const status = $('#requestStatus');
  if (!status) return;
  const latestRequest = requests[0];
  status.textContent = latestRequest
    ? `Current request: ${latestRequest.status}.`
    : 'No admin access request submitted yet.';
}

async function submitAdminRequest(email, reason) {
  return api('/api/admin-requests', {
    method: 'POST',
    body: { email, reason }
  });
}

async function approveAdminRequest(requestId, action, reason = 'Approved by Super Admin') {
  return api(`/api/admin-requests/${requestId}`, {
    method: 'POST',
    body: { action, reason }
  });
}

async function refreshDashboard() {
  if (!state.user) return;

  if (state.user.role === 'user') {
    $('#totalUsersStat').textContent = '—';
    $('#totalAdminsStat').textContent = '—';
    $('#pendingRequestsStat').textContent = '—';
    $('#recentActivityStat').textContent = '—';
    state.users = [];
    state.requests = [];
    state.logs = [];
    renderUsersTable();
    renderAdminsTable();
    renderRequestsTable();
    renderActivityTable();
    try {
      const ownRequests = await api('/api/admin-requests');
      renderRequestStatus(ownRequests.requests || []);
    } catch (error) {
      renderRequestStatus([]);
    }
    return;
  }

  try {
    const [dashboard, usersResponse, requestsResponse, auditResponse, contentResponse] = await Promise.all([
      api('/api/dashboard'),
      api('/api/users'),
      api('/api/admin-requests'),
      api('/api/audit-logs'),
      api('/api/site-content')
    ]);

    state.users = usersResponse.users || [];
    state.requests = requestsResponse.requests || [];
    state.logs = auditResponse.logs || [];

    renderOverview(dashboard);
    renderUsersTable();
    renderAdminsTable();
    renderRequestsTable();
    renderActivityTable();
    renderContent(contentResponse.content || {});
  } catch (error) {
    showToast(error.message || 'Could not load dashboard.');
  }
}

async function checkSession() {
  try {
    const response = await api('/api/me');
    state.user = response.user;
    setAuthView(false);
    renderUserStatus();
    renderSections();
    await refreshDashboard();
  } catch (error) {
    state.user = null;
    setAuthView(true);
    renderUserStatus();
  }
}

function bindTabs() {
  document.querySelectorAll('.tab').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab === button));
      document.querySelectorAll('.auth-form').forEach((form) => form.classList.toggle('active-form', form.id === `${button.dataset.tab}Form`));
    });
  });
}

function bindNav() {
  document.querySelectorAll('.nav-link').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeSection = button.dataset.section;
      renderSections();
    });
  });
}

function bindAuthForms() {
  $('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = $('#loginEmail').value.trim();
    const password = $('#loginPassword').value;
    const otp = $('#loginOtp').value.trim();

    try {
      const response = await api('/api/login', {
        method: 'POST',
        body: { email, password, otp }
      });

      if (response.requires2fa) {
        $('#otpField').classList.remove('hidden');
        showToast('2FA is required. Demo code: 123456');
        return;
      }

      state.user = response.user;
      setAuthView(false);
      renderUserStatus();
      renderSections();
      await refreshDashboard();
      showToast('Login successful.');
    } catch (error) {
      showToast(error.message || 'Login failed.');
    }
  });

  $('#registerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = $('#registerName').value.trim();
    const email = $('#registerEmail').value.trim();
    const password = $('#registerPassword').value;

    try {
      await api('/api/register', {
        method: 'POST',
        body: { name, email, password }
      });
      $('#registerForm').reset();
      document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === 'login'));
      document.querySelectorAll('.auth-form').forEach((form) => form.classList.toggle('active-form', form.id === 'loginForm'));
      showToast('Registration successful. Please log in.');
    } catch (error) {
      showToast(error.message || 'Registration failed.');
    }
  });
}

function bindRequestForm() {
  $('#requestAdminForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      const email = $('#requestEmail').value.trim();
      const reason = $('#requestReason').value.trim();
      const response = await submitAdminRequest(email, reason);
      showToast(response.message || 'Request submitted.');
      $('#requestReason').value = '';
      renderRequestStatus([response.request]);
      await refreshDashboard();
    } catch (error) {
      showToast(error.message || 'Could not submit request.');
    }
  });
}

function bindContentForm() {
  $('#addAnnouncementBtn').addEventListener('click', () => {
    const editor = $('#announcementEditor');
    const card = document.createElement('div');
    card.className = 'announcement-editor-card';
    card.dataset.published = 'false';
    card.innerHTML = '<label>Title<input data-field="title" required></label><label>Message<textarea data-field="message" rows="3" required></textarea></label><label>Category<input data-field="category" value="Update"></label><span class="badge status-pending">draft</span><div class="content-actions"><button type="button" class="primary-btn" data-content-action="publish">Publish</button><button type="button" class="reject-btn" data-content-action="delete">Delete</button></div>';
    editor.appendChild(card);
    card.querySelector('[data-field="title"]').focus();
  });

  $('#announcementEditor').addEventListener('click', async (event) => {
    const actionButton = event.target.closest('[data-content-action]');
    if (!actionButton) return;
    const card = actionButton.closest('.announcement-editor-card');
    let announcements = [...document.querySelectorAll('.announcement-editor-card')]
      .map((entry, index) => ({
        index,
        title: entry.querySelector('[data-field="title"]').value.trim(),
        message: entry.querySelector('[data-field="message"]').value.trim(),
        category: entry.querySelector('[data-field="category"]').value.trim() || 'Update',
        published: entry === card && actionButton.dataset.contentAction === 'publish'
          ? true
          : entry.dataset.published !== 'false'
      }))
      .filter((announcement) => announcement.title && announcement.message);
    if (actionButton.dataset.contentAction === 'delete') {
      announcements = announcements.filter((announcement) => announcement.index !== Number(card.dataset.index));
    }
    announcements = announcements.map(({ index, ...announcement }) => announcement);
    try {
      const response = await api('/api/site-content', { method: 'PUT', body: { announcements } });
      renderContent(response.content);
      showToast(actionButton.dataset.contentAction === 'delete' ? 'Announcement deleted.' : 'Announcement published.');
    } catch (error) {
      showToast(error.message || 'Could not update announcement.');
    }
  });
}

function bindDecisionButtons() {
  $('#requestsTableBody').addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-id]');
    if (!button) return;

    const { id, action } = button.dataset;
    try {
      const response = await approveAdminRequest(id, action, action === 'approve' ? 'Approved by Super Admin' : 'Rejected by Super Admin');
      showToast(response.message || 'Request updated.');
      await refreshDashboard();
    } catch (error) {
      showToast(error.message || 'Unable to update request.');
    }
  });
}

function bindLogout() {
  $('#logoutBtn').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    state.user = null;
    setAuthView(true);
    renderUserStatus();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  bindTabs();
  bindNav();
  bindAuthForms();
  bindRequestForm();
  bindContentForm();
  bindDecisionButtons();
  bindLogout();
  checkSession();
});
