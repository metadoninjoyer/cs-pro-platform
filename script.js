// navigation functions and common utilities

const sharedNavItems = [
    { href: 'index.html', label: 'Главная' },
    { href: 'top-players.html', label: 'Топ игроки' },
    { href: 'news.html', label: 'Новости' },
    { href: 'profile.html', label: 'Профиль', requiresAuth: true }
];

const protectedPages = new Set(['profile.html', 'settings.html', 'admin.html']);
const SETTINGS_ENTRY_KEY = 'settingsEntryAllowedAt';

function getStoredUser() {
    try {
        return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
        return {};
    }
}

function isAdminUser(user) {
    return String(user?.role || '').toLowerCase() === 'admin';
}

function getNavigationItems() {
    const user = getStoredUser();
    const authenticated = isAuthenticated();
    const items = sharedNavItems.filter((item) => !item.requiresAuth || authenticated);
    if (authenticated && isAdminUser(user)) {
        items.push({ href: 'admin.html', label: 'Админ', requiresAuth: true, requiresAdmin: true });
    }
    return items;
}

function getCurrentPage() {
    const pathname = window.location.pathname || '';
    const normalizedPath = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const pathParts = normalizedPath.split('/');
    const page = pathParts[pathParts.length - 1] || 'index.html';
    return page.split('?')[0].split('#')[0] || 'index.html';
}

function getAuthGatewayHref(targetPage) {
    const safeTarget = String(targetPage || 'profile.html').split('?')[0].split('#')[0];
    return `index.html?auth=required&next=${encodeURIComponent(safeTarget)}#formsSection`;
}

function isAuthenticated() {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true' || sessionStorage.getItem('isLoggedIn') === 'true';
    const hasToken = Boolean(localStorage.getItem('authToken') || sessionStorage.getItem('authToken'));
    return isLoggedIn || hasToken;
}

function getNavHref(item) {
    if (item.requiresAuth && !isAuthenticated()) {
        return getAuthGatewayHref(item.href);
    }

    return item.href;
}

function renderSharedNavigation(force = false) {
    const currentPage = getCurrentPage();
    const navElements = document.querySelectorAll('nav[data-shared-nav]');
    const navItems = getNavigationItems();

    navElements.forEach((navElement) => {
        if (!force && navElement.dataset.navReady === 'true') {
            return;
        }

        const mode = navElement.getAttribute('data-shared-nav');
        navElement.setAttribute('aria-label', 'Навигация по сайту');
        navElement.replaceChildren();

        if (mode === 'list') {
            const navList = document.createElement('ul');

            navItems.forEach((item) => {
                const listItem = document.createElement('li');
                const link = document.createElement('a');

                link.href = getNavHref(item);
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

        navItems.forEach((item) => {
            const link = document.createElement('a');
            link.href = getNavHref(item);
            link.textContent = item.label;
            if (item.href === currentPage) {
                link.setAttribute('aria-current', 'page');
            }

            navElement.appendChild(link);
        });

        navElement.dataset.navReady = 'true';
    });
}

function bindQuickProfileMenus() {
    const menus = document.querySelectorAll('[data-quick-profile-menu]');
    const authenticated = isAuthenticated();
    const authOnlyBlocks = document.querySelectorAll('[data-auth-only]');
    const guestOnlyBlocks = document.querySelectorAll('[data-guest-only]');
    authOnlyBlocks.forEach((block) => {
        block.style.display = authenticated ? '' : 'none';
    });
    guestOnlyBlocks.forEach((block) => {
        block.style.display = authenticated ? 'none' : '';
    });

    if (!menus.length) {
        return;
    }

    const user = getStoredUser();

    menus.forEach((menu) => {
        menu.style.display = authenticated ? '' : 'none';
        if (!authenticated) {
            menu.classList.remove('is-open');
            return;
        }

        if (menu.dataset.menuBound === 'true') {
            return;
        }

        const toggle = menu.querySelector('[data-menu-toggle]');
        const avatar = menu.querySelector('[data-menu-avatar]');
        const profileAction = menu.querySelector('[data-menu-action="profile"]');
        const settingsAction = menu.querySelector('[data-menu-action="settings"]');
        const logoutAction = menu.querySelector('[data-menu-action="logout"]');

        if (avatar && typeof user.avatar === 'string' && user.avatar.trim()) {
            avatar.src = user.avatar.trim();
        }

        const setOpen = (isOpen) => {
            menu.classList.toggle('is-open', isOpen);
            if (toggle) {
                toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            }
        };

        toggle?.addEventListener('click', (event) => {
            event.stopPropagation();
            const isOpen = menu.classList.contains('is-open');
            setOpen(!isOpen);
        });

        document.addEventListener('click', (event) => {
            if (!menu.contains(event.target)) {
                setOpen(false);
            }
        });

        profileAction?.addEventListener('click', () => {
            window.location.href = isAuthenticated() ? 'profile.html' : getAuthGatewayHref('profile.html');
        });

        settingsAction?.addEventListener('click', () => {
            sessionStorage.setItem('settingsEntryAllowedAt', Date.now().toString());
            window.location.href = isAuthenticated() ? 'settings.html' : getAuthGatewayHref('settings.html');
        });

        logoutAction?.addEventListener('click', () => {
            if (window.CSAuth) {
                window.CSAuth.clearAuthSession();
            }
            window.location.href = 'index.html';
        });

        menu.dataset.menuBound = 'true';
    });

    if (document.body?.dataset.quickMenuEscBound !== 'true') {
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') {
                return;
            }

            document.querySelectorAll('[data-quick-profile-menu].is-open').forEach((menu) => {
                menu.classList.remove('is-open');
                const toggle = menu.querySelector('[data-menu-toggle]');
                toggle?.setAttribute('aria-expanded', 'false');
            });
        });
        document.body.dataset.quickMenuEscBound = 'true';
    }
}

function bindProtectedRouteGuard() {
    if (document.body?.dataset.protectedGuardBound === 'true') {
        return;
    }

    document.addEventListener('click', (event) => {
        if (isAuthenticated()) {
            return;
        }

        const link = event.target?.closest?.('a[href]');
        if (!link) {
            return;
        }

        if (
            event.defaultPrevented
            || event.button !== 0
            || event.metaKey
            || event.ctrlKey
            || event.shiftKey
            || event.altKey
        ) {
            return;
        }

        const href = link.getAttribute('href') || '';
        if (!href || href.startsWith('http') || href.startsWith('#')) {
            return;
        }

        const page = href.split('?')[0].split('#')[0];
        if (!protectedPages.has(page)) {
            return;
        }

        event.preventDefault();
        window.location.href = getAuthGatewayHref(page);
    }, true);

    document.body.dataset.protectedGuardBound = 'true';
}

function initializeSharedUi() {
    renderSharedNavigation();
    bindQuickProfileMenus();
    bindProtectedRouteGuard();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSharedUi);
} else {
    initializeSharedUi();
}

const authStorageKeys = [
    'authToken',
    'accessToken',
    'refreshToken',
    'user',
    'userId',
    'isLoggedIn'
];

const API_BASE_URL = localStorage.getItem('apiBaseUrl') || 'http://localhost:4000/api';
let refreshRequestPromise = null;

function setAuthSession(user, token = null, refreshToken = null) {
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('user', JSON.stringify(user));
    if (token) {
        localStorage.setItem('authToken', token);
    }
    if (refreshToken) {
        localStorage.setItem('refreshToken', refreshToken);
    }
    renderSharedNavigation(true);
    bindQuickProfileMenus();
}

function clearAuthSession() {
    authStorageKeys.forEach((key) => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
    });
    renderSharedNavigation(true);
    bindQuickProfileMenus();
}

function loginWithSteam() {
    window.location.href = `${API_BASE_URL}/auth/steam`;
}

async function apiRequest(path, options = {}) {
    const { allowRefresh = true, ...requestOptions } = options;
    const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
    const headers = {
        ...(requestOptions.body ? { 'Content-Type': 'application/json' } : {}),
        ...(requestOptions.headers || {})
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...requestOptions,
        headers
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const canRetryWithRefresh =
            response.status === 401
            && allowRefresh
            && path !== '/auth/refresh'
            && path !== '/auth/login'
            && path !== '/auth/register';

        if (canRetryWithRefresh) {
            try {
                await refreshAccessToken();
                return await apiRequest(path, { ...requestOptions, allowRefresh: false });
            } catch {
                clearAuthSession();
                throw new Error('Сессия истекла. Войдите снова');
            }
        }

        if (response.status === 401) {
            clearAuthSession();
        }
        throw new Error(data.message || 'Ошибка API');
    }

    return data;
}

async function refreshAccessToken() {
    if (refreshRequestPromise) {
        return refreshRequestPromise;
    }

    const refreshToken = localStorage.getItem('refreshToken') || sessionStorage.getItem('refreshToken');
    if (!refreshToken) {
        throw new Error('Refresh token не найден');
    }

    refreshRequestPromise = (async () => {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refreshToken })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.message || 'Не удалось обновить сессию');
        }

        const user = getStoredUser();
        setAuthSession(user, data.token, data.refreshToken);
        return data.token;
    })();

    try {
        return await refreshRequestPromise;
    } finally {
        refreshRequestPromise = null;
    }
}

async function loginWithPassword(email, password) {
    const data = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
    });

    setAuthSession(data.user, data.token, data.refreshToken);
    return data.user;
}

async function registerWithPassword(nickname, email, password) {
    const data = await apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ nickname, email, password })
    });

    setAuthSession(data.user, data.token, data.refreshToken);
    return data.user;
}

window.CSAuth = {
    setAuthSession,
    clearAuthSession,
    isAuthenticated,
    isAdminUser,
    loginWithSteam,
    loginWithPassword,
    registerWithPassword,
    apiRequest,
    API_BASE_URL
};

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
