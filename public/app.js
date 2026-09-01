const state = {
  user: null,
  users: [],
  requests: [],
  logs: [],
  reports: [],
  bylaws: [],
  projects: [],
  leaves: [],
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
  const adminSections = ['users', 'admins', 'requests', 'content', 'reports', 'bylaws', 'projects', 'leaves', 'activity'];

  document.querySelectorAll('.nav-link').forEach((button) => {
    const restricted = adminSections.includes(button.dataset.section) && !isAdminLike;
    button.style.display = restricted ? 'none' : 'block';
    button.classList.toggle('active', !restricted && button.dataset.section === state.activeSection);
  });

  document.querySelectorAll('.section-panel').forEach((panel) => {
    const key = panel.id.replace('Section', '');
    const restricted = adminSections.includes(key) && !isAdminLike;
    panel.classList.toggle('hidden-panel', restricted || panel.id !== `${state.activeSection}Section`);
    panel.classList.toggle('active-panel', !restricted && panel.id === `${state.activeSection}Section`);
  });
}

function renderUsersTable() {
  const rowTarget = $('#usersTableBody');
  rowTarget.innerHTML = '';

  state.users.forEach((user) => {
    const row = document.createElement('tr');
    const canManage = state.user && (state.user.role === 'super_admin' || state.user.role === 'admin');
    const actionCell = canManage && user.role === 'user'
      ? `<td><button class="approve-btn" data-user-action="approve" data-user-id="${user.id}">Approve</button><button class="reject-btn" data-user-action="reject" data-user-id="${user.id}">Reject</button></td>`
      : '<td>—</td>';

    row.innerHTML = `
      <td>${user.name}</td>
      <td>${user.email}</td>
      <td><span class="badge ${user.role === 'super_admin' ? 'role-super' : user.role === 'admin' ? 'role-admin' : 'role-user'}">${user.role}</span></td>
      <td><span class="badge ${user.status === 'approved' || user.status === 'active' ? 'status-approved' : user.status === 'rejected' ? 'status-rejected' : 'status-pending'}">${user.status || 'pending'}</span></td>
      ${actionCell}
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

function renderReportsTable() {
  const rowTarget = $('#reportsTableBody');
  rowTarget.innerHTML = '';

  if (!state.reports.length) {
    rowTarget.innerHTML = '<tr><td colspan="4">No financial reports uploaded yet.</td></tr>';
    return;
  }

  state.reports.forEach((report) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${report.title}</td>
      <td>${report.type || 'pdf'}</td>
      <td>${report.uploadedBy || 'Admin'}</td>
      <td><a href="${report.fileUrl || '#'}" target="_blank" rel="noopener noreferrer">Open</a></td>
    `;
    rowTarget.appendChild(row);
  });
}

function renderBylawsList() {
  const target = $('#bylawsList');
  target.innerHTML = '';

  if (!state.bylaws.length) {
    target.innerHTML = '<div class="resource-card">No bylaws have been uploaded yet.</div>';
    return;
  }

  state.bylaws.forEach((bylaw) => {
    const card = document.createElement('div');
    card.className = 'resource-card';
    card.innerHTML = `
      <h4>${bylaw.title}</h4>
      <p>${bylaw.description || 'No description provided.'}</p>
      <a href="${bylaw.fileUrl}" target="_blank" rel="noopener noreferrer">Open document</a>
      <div class="muted">Uploaded by ${bylaw.uploadedBy || 'Admin'}</div>
    `;
    target.appendChild(card);
  });
}

function renderProjectsBoard() {
  const target = $('#projectsBoard');
  target.innerHTML = '';

  if (!state.projects.length) {
    target.innerHTML = '<div class="project-card">No projects have been added yet.</div>';
    return;
  }

  state.projects.forEach((project) => {
    const card = document.createElement('div');
    card.className = 'project-card';
    const statusLabel = project.status ? project.status.replace('-', ' ') : 'Coming Soon';
    const evaluations = (project.evaluations || []).map((item) => `
      <div class="evaluation-item">
        <strong>${item.memberName || 'Member'}</strong> — ${Number(item.rating || 0)}/5<br>
        ${item.feedback || item.comments || 'No feedback provided.'}
      </div>
    `).join('');

    const evaluationForm = project.status === 'fully-done' ? `
      <form class="project-evaluation-form" data-project-id="${project.id}">
        <div class="inline-inputs">
          <input type="text" name="memberName" placeholder="Member name" required />
          <input type="number" name="rating" min="1" max="5" value="5" required />
        </div>
        <textarea name="feedback" rows="2" placeholder="Feedback / comments for this project" required></textarea>
        <button type="submit" class="primary-btn">Save evaluation</button>
      </form>
    ` : '';

    card.innerHTML = `
      <h4>${project.title}</h4>
      <p>${project.description || 'No description provided.'}</p>
      <div class="badge status-${project.status === 'fully-done' ? 'approved' : project.status === 'in-progress' ? 'pending' : 'rejected'}">${statusLabel}</div>
      <div class="progress-bar"><span style="width: ${Math.min(100, Math.max(0, Number(project.progress || 0)))}%"></span></div>
      <div>Progress: ${project.progress || 0}%</div>
      <div class="evaluation-list">${evaluations || '<div class="evaluation-item">No evaluation yet.</div>'}</div>
      ${evaluationForm}
    `;
    target.appendChild(card);
  });
}

function renderLeavesTable() {
  const rowTarget = $('#leavesTableBody');
  rowTarget.innerHTML = '';

  if (!state.leaves.length) {
    rowTarget.innerHTML = '<tr><td colspan="5">No officer leave records found.</td></tr>';
    return;
  }

  state.leaves.forEach((entry) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${entry.officerName || 'N/A'}</td>
      <td>${entry.position || 'N/A'}</td>
      <td>${entry.leaveType || 'Leave'}</td>
      <td><span class="badge status-${entry.status === 'approved' ? 'approved' : entry.status === 'rejected' ? 'rejected' : 'pending'}">${entry.status || 'pending'}</span></td>
      <td>${entry.startDate || '—'}${entry.endDate ? ' to ' + entry.endDate : ''}</td>
    `;
    rowTarget.appendChild(row);
  });
}

function renderContent(content) {
  const editor = $('#announcementEditor');
  editor.replaceChildren();
  (content.announcements || []).forEach((announcement, index) => {
    const card = document.createElement('div');
    card.className = 'announcement-editor-card';
    card.dataset.index = index;
    card.dataset.published = announcement.published === false ? 'false' : 'true';
    const attachmentRows = (announcement.attachments || []).map((attachment) => `
      <div class="attachment-row">
        <input data-field="attachmentLabel" value="${attachment.label || ''}" placeholder="Attachment label" />
        <select data-field="attachmentType">
          <option value="link" ${attachment.type === 'link' ? 'selected' : ''}>Link</option>
          <option value="image" ${attachment.type === 'image' ? 'selected' : ''}>Image</option>
          <option value="pdf" ${attachment.type === 'pdf' ? 'selected' : ''}>PDF</option>
          <option value="drive" ${attachment.type === 'drive' ? 'selected' : ''}>Google Drive</option>
          <option value="form" ${attachment.type === 'form' ? 'selected' : ''}>Google Form</option>
        </select>
        <input data-field="attachmentUrl" value="${attachment.url || ''}" placeholder="https://..." />
      </div>
    `).join('') || `
      <div class="attachment-row">
        <input data-field="attachmentLabel" value="" placeholder="Attachment label" />
        <select data-field="attachmentType">
          <option value="link">Link</option>
          <option value="image">Image</option>
          <option value="pdf">PDF</option>
          <option value="drive">Google Drive</option>
          <option value="form">Google Form</option>
        </select>
        <input data-field="attachmentUrl" value="" placeholder="https://..." />
      </div>
    `;

    card.innerHTML = `
      <label>Title<input data-field="title" value=""></label>
      <label>Message<textarea data-field="message" rows="3"></textarea></label>
      <label>Category<input data-field="category" value=""></label>
      <div class="attachment-list"><h4>Attachments</h4>${attachmentRows}</div>
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
    state.reports = [];
    state.bylaws = [];
    state.projects = [];
    state.leaves = [];
    renderUsersTable();
    renderAdminsTable();
    renderRequestsTable();
    renderActivityTable();
    renderReportsTable();
    renderBylawsList();
    renderProjectsBoard();
    renderLeavesTable();
    try {
      const ownRequests = await api('/api/admin-requests');
      renderRequestStatus(ownRequests.requests || []);
      const reports = await api('/api/financial-reports');
      const bylaws = await api('/api/bylaws');
      const projects = await api('/api/projects');
      const leaves = await api('/api/officer-leaves');
      state.reports = reports.reports || [];
      state.bylaws = bylaws.bylaws || [];
      state.projects = projects.projects || [];
      state.leaves = leaves.leaves || [];
      renderReportsTable();
      renderBylawsList();
      renderProjectsBoard();
      renderLeavesTable();
    } catch (error) {
      renderRequestStatus([]);
    }
    return;
  }

  try {
    const [dashboard, usersResponse, requestsResponse, auditResponse, contentResponse, reportsResponse, bylawsResponse, projectsResponse, leavesResponse] = await Promise.all([
      api('/api/dashboard'),
      api('/api/users'),
      api('/api/admin-requests'),
      api('/api/audit-logs'),
      api('/api/site-content'),
      api('/api/financial-reports'),
      api('/api/bylaws'),
      api('/api/projects'),
      api('/api/officer-leaves')
    ]);

    state.users = usersResponse.users || [];
    state.requests = requestsResponse.requests || [];
    state.logs = auditResponse.logs || [];
    state.reports = reportsResponse.reports || [];
    state.bylaws = bylawsResponse.bylaws || [];
    state.projects = projectsResponse.projects || [];
    state.leaves = leavesResponse.leaves || [];

    renderOverview(dashboard);
    renderUsersTable();
    renderAdminsTable();
    renderRequestsTable();
    renderActivityTable();
    renderContent(contentResponse.content || {});
    renderReportsTable();
    renderBylawsList();
    renderProjectsBoard();
    renderLeavesTable();
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
    card.innerHTML = `
      <label>Title<input data-field="title" required></label>
      <label>Message<textarea data-field="message" rows="3" required></textarea></label>
      <label>Category<input data-field="category" value="Update"></label>
      <div class="attachment-list">
        <h4>Attachments</h4>
        <div class="attachment-row">
          <input data-field="attachmentLabel" value="" placeholder="Attachment label" />
          <select data-field="attachmentType">
            <option value="link">Link</option>
            <option value="image">Image</option>
            <option value="pdf">PDF</option>
            <option value="drive">Google Drive</option>
            <option value="form">Google Form</option>
          </select>
          <input data-field="attachmentUrl" value="" placeholder="https://..." />
        </div>
      </div>
      <span class="badge status-pending">draft</span>
      <div class="content-actions">
        <button type="button" class="primary-btn" data-content-action="publish">Publish</button>
        <button type="button" class="reject-btn" data-content-action="delete">Delete</button>
      </div>`;
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
          : entry.dataset.published !== 'false',
        attachments: [...entry.querySelectorAll('.attachment-row')]
          .map((attachmentRow) => {
            const label = attachmentRow.querySelector('[data-field="attachmentLabel"]').value.trim();
            const type = attachmentRow.querySelector('[data-field="attachmentType"]').value;
            const url = attachmentRow.querySelector('[data-field="attachmentUrl"]').value.trim();
            return label || url ? { label: label || type, type, url } : null;
          })
          .filter(Boolean)
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
      const response = await approveAdminRequest(id, action, action === 'approve' ? 'Approved by Admin Team' : 'Rejected by Admin Team');
      showToast(response.message || 'Request updated.');
      await refreshDashboard();
    } catch (error) {
      showToast(error.message || 'Unable to update request.');
    }
  });

  $('#usersTableBody').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-user-action]');
    if (!button) return;

    const userId = button.dataset.userId;
    const action = button.dataset.userAction;
    const status = action === 'approve' ? 'approved' : 'rejected';

    try {
      await api(`/api/users/${userId}`, {
        method: 'PATCH',
        body: { status }
      });
      showToast(`Member ${status}.`);
      await refreshDashboard();
    } catch (error) {
      showToast(error.message || 'Unable to update member status.');
    }
  });

  $('#projectsBoard').addEventListener('submit', async (event) => {
    const form = event.target.closest('.project-evaluation-form');
    if (!form) return;
    event.preventDefault();

    const projectId = form.dataset.projectId;
    const memberName = form.querySelector('[name="memberName"]').value.trim();
    const rating = Number(form.querySelector('[name="rating"]').value || 0);
    const feedback = form.querySelector('[name="feedback"]').value.trim();

    try {
      await api(`/api/projects/${projectId}`, {
        method: 'PATCH',
        body: {
          evaluation: { memberName, rating, feedback }
        }
      });
      showToast('Project evaluation saved.');
      await refreshDashboard();
    } catch (error) {
      showToast(error.message || 'Unable to save evaluation.');
    }
  });
}

function bindResourceForms() {
  $('#reportClearFileBtn').addEventListener('click', () => {
    $('#reportFile').value = '';
  });

  $('#financialReportForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = $('#reportTitle').value.trim();
    const description = $('#reportDescription').value.trim();
    const type = $('#reportType').value.trim() || 'file';
    const reportUrl = $('#reportUrl').value.trim();
    const reportFile = $('#reportFile').files[0];

    if (!title || (!reportUrl && !reportFile)) {
      showToast('Please add a title and either a file upload or a valid link.');
      return;
    }

    try {
      let fileData = '';
      let fileName = '';

      if (reportFile) {
        fileName = reportFile.name;
        fileData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Unable to read the selected file.'));
          reader.readAsDataURL(reportFile);
        });
      }

      await api('/api/financial-reports', {
        method: 'POST',
        body: {
          title,
          description,
          type,
          fileUrl: reportUrl,
          fileData,
          fileName
        }
      });
      $('#financialReportForm').reset();
      showToast('Financial report saved.');
      await refreshDashboard();
    } catch (error) {
      showToast(error.message || 'Unable to save financial report.');
    }
  });

  $('#bylawClearFileBtn').addEventListener('click', () => {
    $('#bylawFile').value = '';
  });

  $('#bylawForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = $('#bylawTitle').value.trim();
    const description = $('#bylawDescription').value.trim();
    const bylawUrl = $('#bylawUrl').value.trim();
    const bylawFile = $('#bylawFile').files[0];

    if (!title || (!bylawUrl && !bylawFile)) {
      showToast('Please add a title and either a file upload or a valid link.');
      return;
    }

    try {
      let fileData = '';
      let fileName = '';

      if (bylawFile) {
        fileName = bylawFile.name;
        fileData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Unable to read the selected file.'));
          reader.readAsDataURL(bylawFile);
        });
      }

      await api('/api/bylaws', {
        method: 'POST',
        body: {
          title,
          description,
          type: 'document',
          fileUrl: bylawUrl,
          fileData,
          fileName
        }
      });
      $('#bylawForm').reset();
      showToast('Bylaw saved.');
      await refreshDashboard();
    } catch (error) {
      showToast(error.message || 'Unable to save bylaw.');
    }
  });

  $('#projectForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/api/projects', {
        method: 'POST',
        body: {
          title: $('#projectTitle').value,
          description: $('#projectDescription').value,
          status: $('#projectStatus').value,
          progress: Number($('#projectProgress').value || 0)
        }
      });
      $('#projectForm').reset();
      showToast('Project saved.');
      await refreshDashboard();
    } catch (error) {
      showToast(error.message || 'Unable to save project.');
    }
  });

  $('#leaveForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/api/officer-leaves', {
        method: 'POST',
        body: {
          officerName: $('#leaveOfficerName').value,
          position: $('#leavePosition').value,
          leaveType: $('#leaveType').value,
          startDate: $('#leaveStartDate').value,
          endDate: $('#leaveEndDate').value,
          status: $('#leaveStatus').value,
          notes: $('#leaveNotes').value
        }
      });
      $('#leaveForm').reset();
      showToast('Leave record saved.');
      await refreshDashboard();
    } catch (error) {
      showToast(error.message || 'Unable to save leave record.');
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
  bindResourceForms();
  bindLogout();
  checkSession();
});
