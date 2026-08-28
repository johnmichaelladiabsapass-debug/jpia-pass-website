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

  const portalUrl = 'https://d48fe22e95f2e8.lhr.life/';
  const portalButtons = ['Log In', 'Register', 'Become a Member', 'View Portal', 'Join Now'];
  document.querySelectorAll('.btn, button').forEach((button) => {
    if (portalButtons.includes(button.textContent.trim())) {
      button.addEventListener('click', () => {
        window.location.href = portalUrl;
      });
    }
  });

  const contentUrl = 'https://d48fe22e95f2e8.lhr.life/api/site-content';
  const loadPublicAnnouncements = () => fetch(contentUrl)
    .then((response) => response.ok ? response.json() : Promise.reject(new Error('Content unavailable')))
    .then(({ content }) => {
      const list = document.querySelector('.announcement-list');
      if (!list || !content || !Array.isArray(content.announcements) || content.announcements.length === 0) return;
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
        return article;
      }));
    })
    .catch(() => {});

  loadPublicAnnouncements();
  setInterval(loadPublicAnnouncements, 10000);
});
