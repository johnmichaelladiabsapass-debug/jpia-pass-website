function safeResourceUrl(value) {
  const candidate = String(value || '').trim();
  if (/^data:(?:application\/(?:pdf|msword|vnd\.[^;,]+|zip|octet-stream)|image\/(?:png|jpeg)|text\/(?:plain|csv));base64,/i.test(candidate)) {
    return candidate;
  }

  try {
    const url = new URL(candidate, window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch (error) {
    return '';
  }
}

function renderPublicResources(targetSelector, resources, kind) {
  const target = document.querySelector(targetSelector);
  target.replaceChildren();
  if (!resources.length) {
    const empty = document.createElement('p');
    empty.className = 'public-resource-empty';
    empty.textContent = `No ${kind} have been shared yet.`;
    target.appendChild(empty);
    return;
  }

  resources.forEach((resource) => {
    const card = document.createElement('article');
    card.className = 'public-resource-card';
    const title = document.createElement('h4');
    title.textContent = resource.title || `Untitled ${kind.slice(0, -1)}`;
    card.appendChild(title);

    if (resource.description) {
      const description = document.createElement('p');
      description.textContent = resource.description;
      card.appendChild(description);
    }

    const href = safeResourceUrl(resource.fileUrl);
    const link = document.createElement(href ? 'a' : 'span');
    link.className = href ? 'public-resource-link' : 'public-resource-link unavailable';
    link.textContent = href
      ? `${resource.source === 'upload' ? 'Download' : 'Open'} ${resource.fileName || 'document'}`
      : 'File link unavailable';
    if (href) {
      link.href = href;
      if (href.startsWith('data:')) {
        link.download = String(resource.fileName || 'chapter-document').split(/[\\/]/).pop();
      } else {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
    }
    card.appendChild(link);
    target.appendChild(card);
  });
}

async function loadMemberResources() {
  const notice = document.querySelector('#resourceAccessNotice');
  if (!notice) return;

  try {
    const sessionResponse = await fetch('/api/me', { credentials: 'same-origin' });
    if (!sessionResponse.ok) {
      notice.hidden = false;
      renderPublicResources('#publicReportsList', [], 'reports');
      renderPublicResources('#publicBylawsList', [], 'bylaws');
      return;
    }

    const [reportsResponse, bylawsResponse] = await Promise.all([
      fetch('/api/financial-reports', { credentials: 'same-origin' }),
      fetch('/api/bylaws', { credentials: 'same-origin' })
    ]);
    if (!reportsResponse.ok || !bylawsResponse.ok) throw new Error('Resources unavailable');
    const [reports, bylaws] = await Promise.all([reportsResponse.json(), bylawsResponse.json()]);
    notice.hidden = true;
    renderPublicResources('#publicReportsList', reports.reports || [], 'reports');
    renderPublicResources('#publicBylawsList', bylaws.bylaws || [], 'bylaws');
  } catch (error) {
    notice.hidden = false;
    renderPublicResources('#publicReportsList', [], 'reports');
    renderPublicResources('#publicBylawsList', [], 'bylaws');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  document.querySelectorAll('.btn').forEach((button) => {
    button.addEventListener('click', () => {
      button.classList.add('clicked');
      setTimeout(() => button.classList.remove('clicked'), 180);
    });
  });

  const portalUrl = '/portal';
  const portalButtons = ['Log In', 'Register', 'Become a Member', 'View Portal', 'Join Now'];
  document.querySelectorAll('.btn, button').forEach((button) => {
    if (portalButtons.includes(button.textContent.trim())) {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        window.location.href = portalUrl;
      });
    }
  });

  const contentUrl = '/api/site-content';
  const loadPublicAnnouncements = () => fetch(contentUrl)
    .then((response) => response.ok ? response.json() : Promise.reject(new Error('Content unavailable')))
    .then(({ content }) => {
      const list = document.querySelector('.announcement-list');
      if (!list || !content || !Array.isArray(content.announcements)) return;
      if (content.announcements.length === 0) {
        const empty = document.createElement('article');
        empty.className = 'announcement-item';
        empty.textContent = 'No published announcements right now.';
        list.replaceChildren(empty);
        return;
      }
      list.replaceChildren(...content.announcements.map((announcement) => {
        const article = document.createElement('article');
        article.className = 'announcement-item';
        const category = document.createElement('span');
        category.className = 'pill neutral';
        category.textContent = announcement.category || 'Update';
        const title = document.createElement('h3');
        title.textContent = announcement.title;
        const message = document.createElement('p');
        message.textContent = announcement.message;
        article.append(category, title, message);
        const attachments = Array.isArray(announcement.attachments) ? announcement.attachments : [];
        const attachmentLinks = attachments.map((attachment) => {
          const href = safeResourceUrl(attachment.url);
          if (!href) return null;
          const link = document.createElement('a');
          link.className = 'attachment-link';
          link.href = href;
          link.textContent = attachment.label || 'Open attachment';
          if (href.startsWith('data:')) {
            link.download = String(attachment.label || 'announcement-attachment').split(/[\\/]/).pop();
          } else {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
          }
          return link;
        }).filter(Boolean);
        if (attachmentLinks.length) {
          const attachmentList = document.createElement('div');
          attachmentList.className = 'announcement-attachments';
          attachmentLinks.forEach((link) => attachmentList.appendChild(link));
          article.appendChild(attachmentList);
        }
        return article;
      }));
    })
    .catch(() => {});

  loadPublicAnnouncements();
  loadMemberResources();
  setInterval(loadPublicAnnouncements, 10000);
  setInterval(() => {
    if (!document.hidden) loadMemberResources();
  }, 60000);
});
