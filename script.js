// navigation functions and common utilities

const sharedNavItems = [
    { href: 'index.html', label: 'Главная' },
    { href: 'news.html', label: 'Новости' },
    { href: 'top-players.html', label: 'Топ игроки' },
    { href: 'profile.html', label: 'Профиль' },
    { href: 'settings.html', label: 'Настройки' }
];

function getCurrentPage() {
    const pathParts = window.location.pathname.split('/');
    const page = pathParts[pathParts.length - 1] || 'index.html';
    return page.split('?')[0].split('#')[0] || 'index.html';
}

function renderSharedNavigation() {
    const currentPage = getCurrentPage();
    const navElements = document.querySelectorAll('nav[data-shared-nav]');

    navElements.forEach((navElement) => {
        if (navElement.dataset.navReady === 'true') {
            return;
        }

        const mode = navElement.getAttribute('data-shared-nav');
        navElement.setAttribute('aria-label', 'Навигация по сайту');
        navElement.replaceChildren();

        if (mode === 'list') {
            const navList = document.createElement('ul');

            sharedNavItems.forEach((item) => {
                const listItem = document.createElement('li');
                const link = document.createElement('a');

                link.href = item.href;
                link.textContent = item.label;
                if (item.href === currentPage) {
                    link.setAttribute('aria-current', 'page');
                }

                listItem.appendChild(link);
                navList.appendChild(listItem);
            });

            navElement.appendChild(navList);
            navElement.dataset.navReady = 'true';
            return;
        }

        sharedNavItems.forEach((item) => {
            const link = document.createElement('a');
            link.href = item.href;
            link.textContent = item.label;
            if (item.href === currentPage) {
                link.setAttribute('aria-current', 'page');
            }

            navElement.appendChild(link);
        });

        navElement.dataset.navReady = 'true';
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderSharedNavigation);
} else {
    renderSharedNavigation();
}

// Function to scroll to a specific section
function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
    }
}

// Function to toggle a dropdown menu
function toggleDropdown(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (dropdown) {
        dropdown.classList.toggle('show');
    }
}

// Function to validate email format
function isValidEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

// Function to fetch data from an API
async function fetchData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return await response.json();
    } catch (error) {
        console.error('There has been a problem with your fetch operation:', error);
    }
}