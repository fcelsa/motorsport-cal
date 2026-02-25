const THEME_STORAGE_KEY = 'motorsport-theme-preference';
const TAB_STORAGE_KEY = 'motorsport-selected-tab';
const VISIT_STORAGE_KEY = 'motorsport-has-visited';
const INSTALL_DISMISSED_KEY = 'motorsport-install-dismissed';
const IOS_GUIDE_DISMISSED_KEY = 'motorsport-ios-guide-dismissed';
const NEXT_EVENT_API_BASE_URL = 'https://motorsportscalendar.com/api/next-event.php?series=';
const ICAL_FEED_URLS = {
	f1: './f1.ics',
	motogp: './motogp.ics'
};

const themeToggleEl = document.getElementById('theme-toggle');
const themeIconEl = document.getElementById('theme-icon');
const widgetTabEls = Array.from(document.querySelectorAll('.widget-tab'));
const widgetPanelEls = Array.from(document.querySelectorAll('[data-tab-panel]'));
const widgetStackEls = Array.from(document.querySelectorAll('.widget-fade-stack'));
const calendarPrevEl = document.getElementById('calendar-prev');
const calendarNextEl = document.getElementById('calendar-next');
const calendarMonthLabelEl = document.getElementById('calendar-month-label');
const calendarGridEl = document.getElementById('calendar-grid');
const monthEventsListEl = document.getElementById('month-events-list');
const installPanel = document.getElementById('install-panel');
const installCopyEl = document.getElementById('install-copy');
const installActionEl = document.getElementById('install-action');
const installDismissEl = document.getElementById('install-dismiss');

let deferredInstallPrompt = null;

const WIDGET_TAB_VALUES = ['f1', 'motogp', 'others', 'calendar'];
const NEXT_EVENT_SERIES = ['f1', 'motogp'];
const CALENDAR_SERIES = ['f1', 'motogp'];
const ICAL_CACHE_TTL_MS = 10 * 60 * 1000;

const icalEventsCache = {
	f1: {
		fetchedAt: 0,
		events: []
	},
	motogp: {
		fetchedAt: 0,
		events: []
	}
};

let currentCalendarMonthDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let monthlyCalendarEvents = [];

const nextEventElements = {
	f1: {
		titleEl: document.getElementById('next-event-f1-title'),
		metaEl: document.getElementById('next-event-f1-meta'),
		timeEl: document.getElementById('next-event-f1-time'),
		linkEl: document.getElementById('next-event-f1-link')
	},
	motogp: {
		titleEl: document.getElementById('next-event-motogp-title'),
		metaEl: document.getElementById('next-event-motogp-meta'),
		timeEl: document.getElementById('next-event-motogp-time'),
		linkEl: document.getElementById('next-event-motogp-link')
	}
};

const getSystemTheme = () => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const getStoredThemePreference = () => {
	const storedPreference = localStorage.getItem(THEME_STORAGE_KEY);
	if (storedPreference === 'light' || storedPreference === 'dark' || storedPreference === 'auto') {
		return storedPreference;
	}

	return 'auto';
};

const applyThemePreference = (themePreference) => {
	const resolvedTheme = themePreference === 'auto' ? getSystemTheme() : themePreference;
	document.body.dataset.theme = resolvedTheme;

	if (themeToggleEl && themeIconEl) {
		const iconByPreference = {
			auto: '◐',
			light: '☀',
			dark: '☾'
		};

		const labelByPreference = {
			auto: 'Tema automatico',
			light: 'Tema giorno',
			dark: 'Tema notte'
		};

		themeIconEl.textContent = iconByPreference[themePreference] || '◐';
		themeToggleEl.setAttribute('aria-label', labelByPreference[themePreference] || 'Tema automatico');
		themeToggleEl.title = labelByPreference[themePreference] || 'Tema automatico';
	}

	return resolvedTheme;
};

const setupTheme = () => {
	const preference = getStoredThemePreference();
	applyThemePreference(preference);

	if (themeToggleEl) {
		themeToggleEl.addEventListener('click', () => {
			const preferenceOrder = ['auto', 'light', 'dark'];
			const currentPreference = getStoredThemePreference();
			const currentIndex = preferenceOrder.indexOf(currentPreference);
			const nextPreference = preferenceOrder[(currentIndex + 1) % preferenceOrder.length];

			localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
			applyThemePreference(nextPreference);
		});
	}

	window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
		if (getStoredThemePreference() !== 'auto') {
			return;
		}

		applyThemePreference('auto');
		loadNextEventCards();
	});
};

const parseApiDateTime = (rawValue) => {
	if (!rawValue) {
		return null;
	}

	const normalizedValue = rawValue.trim().replace(' ', 'T');
	const utcDate = new Date(`${normalizedValue}Z`);
	if (!Number.isNaN(utcDate.getTime())) {
		return utcDate;
	}

	const localDate = new Date(normalizedValue);
	if (!Number.isNaN(localDate.getTime())) {
		return localDate;
	}

	return null;
};

const parseIcalDateValue = (rawValue) => {
	if (!rawValue) {
		return null;
	}

	if (/^\d{8}$/.test(rawValue)) {
		const year = Number(rawValue.slice(0, 4));
		const month = Number(rawValue.slice(4, 6)) - 1;
		const day = Number(rawValue.slice(6, 8));
		return new Date(year, month, day, 0, 0, 0);
	}

	if (/^\d{8}T\d{6}Z$/.test(rawValue)) {
		const year = Number(rawValue.slice(0, 4));
		const month = Number(rawValue.slice(4, 6)) - 1;
		const day = Number(rawValue.slice(6, 8));
		const hours = Number(rawValue.slice(9, 11));
		const minutes = Number(rawValue.slice(11, 13));
		const seconds = Number(rawValue.slice(13, 15));
		return new Date(Date.UTC(year, month, day, hours, minutes, seconds));
	}

	if (/^\d{8}T\d{6}$/.test(rawValue)) {
		const year = Number(rawValue.slice(0, 4));
		const month = Number(rawValue.slice(4, 6)) - 1;
		const day = Number(rawValue.slice(6, 8));
		const hours = Number(rawValue.slice(9, 11));
		const minutes = Number(rawValue.slice(11, 13));
		const seconds = Number(rawValue.slice(13, 15));
		return new Date(year, month, day, hours, minutes, seconds);
	}

	return null;
};

const getTimeZoneDateParts = (dateValue, timeZone) => {
	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hour12: false,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	});

	const parts = formatter.formatToParts(dateValue);
	const map = {};
	parts.forEach((part) => {
		if (part.type !== 'literal') {
			map[part.type] = part.value;
		}
	});

	return {
		year: Number(map.year),
		month: Number(map.month),
		day: Number(map.day),
		hour: Number(map.hour),
		minute: Number(map.minute),
		second: Number(map.second)
	};
};

const parseIcalDateTimeWithTimeZone = (rawValue, timeZone) => {
	if (!rawValue || !/^\d{8}T\d{6}$/.test(rawValue) || !timeZone) {
		return parseIcalDateValue(rawValue);
	}

	const year = Number(rawValue.slice(0, 4));
	const month = Number(rawValue.slice(4, 6)) - 1;
	const day = Number(rawValue.slice(6, 8));
	const hours = Number(rawValue.slice(9, 11));
	const minutes = Number(rawValue.slice(11, 13));
	const seconds = Number(rawValue.slice(13, 15));

	const utcGuess = Date.UTC(year, month, day, hours, minutes, seconds);
	const zoneParts = getTimeZoneDateParts(new Date(utcGuess), timeZone);
	const zonedAsUtc = Date.UTC(
		zoneParts.year,
		zoneParts.month - 1,
		zoneParts.day,
		zoneParts.hour,
		zoneParts.minute,
		zoneParts.second
	);

	const offsetMs = zonedAsUtc - utcGuess;
	return new Date(utcGuess - offsetMs);
};

const unfoldIcalLines = (rawIcal) => {
	const normalized = rawIcal.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	const lines = normalized.split('\n');
	const unfoldedLines = [];

	lines.forEach((line) => {
		if (!line) {
			return;
		}

		if ((line.startsWith(' ') || line.startsWith('\t')) && unfoldedLines.length) {
			unfoldedLines[unfoldedLines.length - 1] += line.trimStart();
			return;
		}

		unfoldedLines.push(line);
	});

	return unfoldedLines;
};

const parseIcalEventProperty = (line) => {
	const separatorIndex = line.indexOf(':');
	if (separatorIndex === -1) {
		return null;
	}

	const propertyBlock = line.slice(0, separatorIndex);
	const value = line.slice(separatorIndex + 1).replace(/\\,/g, ',').replace(/\\n/g, ' ');
	const [rawName, ...params] = propertyBlock.split(';');

	return {
		name: rawName.toUpperCase(),
		params: params.map((param) => param.toUpperCase()),
		value
	};
};

const isIcalEventForSeries = (summary, series) => {
	const safeSummary = (summary || '').toLowerCase();
	if (series === 'f1') {
		return safeSummary.includes('f1');
	}

	if (series === 'motogp') {
		return safeSummary.includes('motogp');
	}

	return true;
};

const extractIcalEventsForSeries = (rawIcal, series) => {
	const unfoldedLines = unfoldIcalLines(rawIcal);
	const extractedEvents = [];
	let calendarTimeZone = 'UTC';

	unfoldedLines.forEach((line) => {
		const property = parseIcalEventProperty(line);
		if (!property) {
			return;
		}

		if (property.name === 'X-WR-TIMEZONE' && property.value) {
			calendarTimeZone = property.value;
		}
	});

	let currentEvent = null;

	unfoldedLines.forEach((line) => {
		if (line === 'BEGIN:VEVENT') {
			currentEvent = {
				series,
				isAllDay: false,
				calendarTimeZone
			};
			return;
		}

		if (line === 'END:VEVENT') {
			if (currentEvent?.summary && currentEvent?.startDate && isIcalEventForSeries(currentEvent.summary, series)) {
				extractedEvents.push(currentEvent);
			}
			currentEvent = null;
			return;
		}

		if (!currentEvent) {
			return;
		}

		const property = parseIcalEventProperty(line);
		if (!property) {
			return;
		}

		if (property.name === 'SUMMARY') {
			currentEvent.summary = property.value;
		}

		if (property.name === 'LOCATION') {
			currentEvent.location = property.value;
		}

		if (property.name === 'DESCRIPTION') {
			currentEvent.description = property.value;
		}

		if (property.name === 'UID') {
			currentEvent.uid = property.value;
		}

		if (property.name === 'DTSTART') {
			const tzidParam = property.params.find((param) => param.startsWith('TZID='));
			const eventTimeZone = tzidParam ? tzidParam.slice(5) : currentEvent.calendarTimeZone;
			currentEvent.startDate = parseIcalDateTimeWithTimeZone(property.value, eventTimeZone);
			currentEvent.isAllDay = property.params.includes('VALUE=DATE') || /^\d{8}$/.test(property.value);
		}
	});

	const dedupedByUid = new Map();
	extractedEvents.forEach((eventItem) => {
		const dedupeKey = eventItem.uid || `${eventItem.series}-${eventItem.summary}-${eventItem.startDate?.toISOString?.() || ''}`;
		dedupedByUid.set(dedupeKey, eventItem);
	});

	return Array.from(dedupedByUid.values())
		.filter((eventItem) => eventItem.startDate instanceof Date)
		.sort((leftEvent, rightEvent) => leftEvent.startDate.getTime() - rightEvent.startDate.getTime());
};

const fetchIcalEventsForSeries = async (series, forceRefresh = false) => {
	const feedUrl = ICAL_FEED_URLS[series];
	if (!feedUrl) {
		return [];
	}

	const cacheEntry = icalEventsCache[series];
	const cacheAge = Date.now() - (cacheEntry?.fetchedAt || 0);
	if (!forceRefresh && cacheEntry && cacheEntry.events.length && cacheAge < ICAL_CACHE_TTL_MS) {
		return cacheEntry.events;
	}

	const response = await fetch(feedUrl);
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}

	const rawIcal = await response.text();
	const parsedEvents = extractIcalEventsForSeries(rawIcal, series);

	if (icalEventsCache[series]) {
		icalEventsCache[series].events = parsedEvents;
		icalEventsCache[series].fetchedAt = Date.now();
	}

	return parsedEvents;
};

const findNextEventFromIcal = (rawIcal, series) => {
	const now = new Date();
	const sortedEvents = extractIcalEventsForSeries(rawIcal, series);

	return sortedEvents.find((eventItem) => eventItem.startDate.getTime() >= now.getTime()) || null;
};

const getDateKey = (targetDate) => {
	const year = targetDate.getFullYear();
	const month = String(targetDate.getMonth() + 1).padStart(2, '0');
	const day = String(targetDate.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
};

const formatCalendarMonthLabel = (targetMonthDate) => new Intl.DateTimeFormat('it-IT', {
	month: 'long',
	year: 'numeric'
}).format(targetMonthDate);

const formatLocalDateOnly = (eventDate) => new Intl.DateTimeFormat('it-IT', {
	weekday: 'short',
	day: '2-digit',
	month: 'short',
	year: 'numeric',
	timeZone: getUserTimeZone()
}).format(eventDate);

const renderMonthlyEventsList = (eventsForMonth) => {
	if (!monthEventsListEl) {
		return;
	}

	monthEventsListEl.innerHTML = '';

	if (!eventsForMonth.length) {
		const emptyEl = document.createElement('li');
		emptyEl.textContent = 'Nessun evento disponibile per il mese selezionato.';
		monthEventsListEl.append(emptyEl);
		return;
	}

	eventsForMonth.forEach((eventItem) => {
		const itemEl = document.createElement('li');
		const dateLabel = eventItem.isAllDay ? `${formatLocalDateOnly(eventItem.startDate)} · all day` : formatLocalDateTime(eventItem.startDate);
		const seriesLabel = eventItem.series.toUpperCase();
		const locationLabel = eventItem.location ? ` · ${eventItem.location}` : '';
		itemEl.textContent = `${dateLabel} · ${seriesLabel} · ${eventItem.summary}${locationLabel}`;
		monthEventsListEl.append(itemEl);
	});
};

const renderMonthlyCalendar = () => {
	if (!calendarGridEl || !calendarMonthLabelEl) {
		return;
	}

	calendarMonthLabelEl.textContent = formatCalendarMonthLabel(currentCalendarMonthDate);
	calendarGridEl.innerHTML = '';

	const weekdayLabels = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
	weekdayLabels.forEach((label) => {
		const weekdayEl = document.createElement('div');
		weekdayEl.className = 'calendar-weekday';
		weekdayEl.textContent = label;
		calendarGridEl.append(weekdayEl);
	});

	const monthYear = currentCalendarMonthDate.getFullYear();
	const monthIndex = currentCalendarMonthDate.getMonth();
	const firstDayOfMonth = new Date(monthYear, monthIndex, 1);
	const startOffset = (firstDayOfMonth.getDay() + 6) % 7;
	const gridStartDate = new Date(monthYear, monthIndex, 1 - startOffset);

	const eventsByDateKey = monthlyCalendarEvents.reduce((acc, eventItem) => {
		const eventKey = getDateKey(eventItem.startDate);
		acc[eventKey] = (acc[eventKey] || 0) + 1;
		return acc;
	}, {});

	for (let index = 0; index < 42; index += 1) {
		const dayDate = new Date(gridStartDate.getFullYear(), gridStartDate.getMonth(), gridStartDate.getDate() + index);
		const dayEl = document.createElement('div');
		dayEl.className = 'calendar-day';
		dayEl.textContent = String(dayDate.getDate());

		if (dayDate.getMonth() !== monthIndex) {
			dayEl.classList.add('is-outside');
		}

		if (eventsByDateKey[getDateKey(dayDate)]) {
			dayEl.classList.add('has-event');
		}

		calendarGridEl.append(dayEl);
	}

	const eventsForMonth = monthlyCalendarEvents
		.filter((eventItem) => eventItem.startDate.getFullYear() === monthYear && eventItem.startDate.getMonth() === monthIndex)
		.sort((leftEvent, rightEvent) => leftEvent.startDate.getTime() - rightEvent.startDate.getTime());

	renderMonthlyEventsList(eventsForMonth);
};

const addMonths = (sourceDate, deltaMonths) => new Date(sourceDate.getFullYear(), sourceDate.getMonth() + deltaMonths, 1);

const setupMonthlyCalendarControls = () => {
	if (!calendarPrevEl || !calendarNextEl) {
		return;
	}

	calendarPrevEl.addEventListener('click', () => {
		currentCalendarMonthDate = addMonths(currentCalendarMonthDate, -1);
		renderMonthlyCalendar();
	});

	calendarNextEl.addEventListener('click', () => {
		currentCalendarMonthDate = addMonths(currentCalendarMonthDate, 1);
		renderMonthlyCalendar();
	});
};

const loadMonthlyCalendarData = async (forceRefresh = false) => {
	const settledResults = await Promise.allSettled(
		CALENDAR_SERIES.map((series) => fetchIcalEventsForSeries(series, forceRefresh))
	);

	monthlyCalendarEvents = settledResults
		.flatMap((result) => result.status === 'fulfilled' ? result.value : [])
		.filter((eventItem) => eventItem.startDate instanceof Date);

	renderMonthlyCalendar();
};

const getUserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const formatLocalDateTime = (eventDate) => {
	if (!eventDate) {
		return 'Data non disponibile';
	}

	const timeZone = getUserTimeZone();
	const datePart = new Intl.DateTimeFormat('it-IT', {
		weekday: 'short',
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		timeZone
	}).format(eventDate);

	const timePart = new Intl.DateTimeFormat('it-IT', {
		hour: '2-digit',
		minute: '2-digit',
		timeZone,
		hour12: false
	}).format(eventDate);

	return `${datePart}, ${timePart} (${timeZone})`;
};

const buildEventUrl = (eventData) => {
	if (!eventData || !eventData.class || !eventData.slug || !eventData.date) {
		return 'https://motorsportscalendar.com/';
	}

	const eventYear = new Date(eventData.date).getFullYear();
	const slugSuffix = eventData.slug.startsWith(`${eventData.class}-`)
		? eventData.slug.slice(eventData.class.length + 1)
		: eventData.slug;

	if (!eventYear || Number.isNaN(eventYear)) {
		return `https://motorsportscalendar.com/event/${eventData.slug}`;
	}

	return `https://motorsportscalendar.com/event/${eventData.class}-${eventYear}-${slugSuffix}`;
};

const buildIcalSearchUrl = (eventData) => {
	const query = encodeURIComponent(eventData?.summary || 'motorsport event');
	return `https://motorsportscalendar.com/?q=${query}`;
};

const updateNextEventCard = (series, eventData) => {
	const targetElements = nextEventElements[series];
	if (!targetElements || !targetElements.titleEl || !targetElements.metaEl || !targetElements.timeEl || !targetElements.linkEl) {
		return;
	}

	if (!eventData) {
		targetElements.titleEl.textContent = 'Evento non disponibile';
		targetElements.metaEl.textContent = 'Nessun dato ricevuto dal provider';
		targetElements.timeEl.textContent = 'Data non disponibile';
		targetElements.linkEl.href = 'https://motorsportscalendar.com/';
		return;
	}

	const eventDate = parseApiDateTime(eventData.countdown_date || eventData.date);
	targetElements.titleEl.textContent = eventData.title || 'Prossimo evento';
	targetElements.metaEl.textContent = [eventData.session_name, eventData.circuit].filter(Boolean).join(' · ');
	targetElements.timeEl.textContent = formatLocalDateTime(eventDate);
	targetElements.linkEl.href = buildEventUrl(eventData);
};

const updateNextEventCardFromIcal = (series, icalEvent) => {
	const targetElements = nextEventElements[series];
	if (!targetElements || !targetElements.titleEl || !targetElements.metaEl || !targetElements.timeEl || !targetElements.linkEl) {
		return;
	}

	if (!icalEvent) {
		updateNextEventCard(series, null);
		return;
	}

	targetElements.titleEl.textContent = icalEvent.summary || 'Prossimo evento';
	targetElements.metaEl.textContent = [icalEvent.location, icalEvent.description].filter(Boolean).join(' · ');
	targetElements.timeEl.textContent = formatLocalDateTime(icalEvent.startDate);
	targetElements.linkEl.href = buildIcalSearchUrl(icalEvent);
};

const loadNextEventFromIcal = async (series) => {
	if (!ICAL_FEED_URLS[series]) {
		return false;
	}

	try {
		const events = await fetchIcalEventsForSeries(series);
		const now = new Date();
		const nextIcalEvent = events.find((eventItem) => eventItem.startDate.getTime() >= now.getTime()) || null;
		if (!nextIcalEvent) {
			return false;
		}

		updateNextEventCardFromIcal(series, nextIcalEvent);
		return true;
	} catch (error) {
		return false;
	}
};

const loadNextEventForSeries = async (series) => {
	const targetElements = nextEventElements[series];
	if (!targetElements || !targetElements.titleEl) {
		return;
	}

	targetElements.titleEl.textContent = 'Caricamento…';
	targetElements.metaEl.textContent = '';
	targetElements.timeEl.textContent = '';

	const loadedFromIcal = await loadNextEventFromIcal(series);
	if (loadedFromIcal) {
		return;
	}

	try {
		const response = await fetch(`${NEXT_EVENT_API_BASE_URL}${encodeURIComponent(series)}`);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		const payload = await response.json();
		if (!payload.success || !payload.data) {
			updateNextEventCard(series, null);
			return;
		}

		updateNextEventCard(series, payload.data);
	} catch (error) {
		updateNextEventCard(series, null);
	}
};

const loadNextEventCards = () => {
	NEXT_EVENT_SERIES.forEach((series) => {
		loadNextEventForSeries(series);
	});
};

const setActiveWidgetTab = (target) => {
	const safeTarget = WIDGET_TAB_VALUES.includes(target) ? target : 'f1';
	localStorage.setItem(TAB_STORAGE_KEY, safeTarget);

	widgetTabEls.forEach((tabEl) => {
		const isActive = tabEl.dataset.tabTarget === safeTarget;
		tabEl.setAttribute('aria-selected', String(isActive));
		tabEl.tabIndex = isActive ? 0 : -1;
	});

	widgetPanelEls.forEach((panelEl) => {
		panelEl.hidden = panelEl.dataset.tabPanel !== safeTarget;
	});

	if (safeTarget === 'calendar') {
		renderMonthlyCalendar();
	}

	syncWidgetStackHeights();
};

const syncWidgetStackHeights = () => {
	widgetStackEls.forEach((stackEl) => {
		const hostEls = Array.from(stackEl.querySelectorAll('.widget-host'));
		const maxHeight = hostEls.reduce((height, hostEl) => {
			const contentHeight = Math.max(hostEl.scrollHeight, hostEl.offsetHeight, 0);
			return Math.max(height, contentHeight);
		}, 0);

		if (maxHeight > 0) {
			stackEl.style.minHeight = `${maxHeight}px`;
		}
	});
};

const setupWidgetStackResize = () => {
	if (!widgetStackEls.length) {
		return;
	}

	syncWidgetStackHeights();
	setTimeout(syncWidgetStackHeights, 500);
	setTimeout(syncWidgetStackHeights, 1500);
	setTimeout(syncWidgetStackHeights, 3000);

	if ('ResizeObserver' in window) {
		const resizeObserver = new ResizeObserver(() => {
			syncWidgetStackHeights();
		});

		widgetStackEls.forEach((stackEl) => {
			const hostEls = stackEl.querySelectorAll('.widget-host');
			hostEls.forEach((hostEl) => resizeObserver.observe(hostEl));
		});
	}
};

const setupWidgetTabs = () => {
	if (!widgetTabEls.length || !widgetPanelEls.length) {
		return;
	}

	widgetTabEls.forEach((tabEl) => {
		tabEl.addEventListener('click', () => {
			const target = tabEl.dataset.tabTarget;
			if (!target) {
				return;
			}

			setActiveWidgetTab(target);
		});

		tabEl.addEventListener('keydown', (event) => {
			const currentIndex = widgetTabEls.indexOf(tabEl);
			if (currentIndex === -1) {
				return;
			}

			if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
				event.preventDefault();
				const offset = event.key === 'ArrowRight' ? 1 : -1;
				const nextIndex = (currentIndex + offset + widgetTabEls.length) % widgetTabEls.length;
				const nextTabEl = widgetTabEls[nextIndex];
				nextTabEl.focus();
				setActiveWidgetTab(nextTabEl.dataset.tabTarget || 'f1');
			}

			if (event.key === 'Home' || event.key === 'End') {
				event.preventDefault();
				const nextTabEl = event.key === 'Home' ? widgetTabEls[0] : widgetTabEls[widgetTabEls.length - 1];
				nextTabEl.focus();
				setActiveWidgetTab(nextTabEl.dataset.tabTarget || 'f1');
			}

			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				setActiveWidgetTab(tabEl.dataset.tabTarget || 'f1');
			}
		});
	});

	const storedTab = localStorage.getItem(TAB_STORAGE_KEY);
	const initialTab = WIDGET_TAB_VALUES.includes(storedTab) ? storedTab : 'f1';
	setActiveWidgetTab(initialTab);
};

const isStandaloneMode = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

const isIosSafari = () => {
	const userAgent = window.navigator.userAgent;
	const isIosDevice = /iPhone|iPad|iPod/i.test(userAgent);
	const isSafariBrowser = /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS/i.test(userAgent);

	return isIosDevice && isSafariBrowser;
};

const hideInstallPanel = () => {
	if (!installPanel) {
		return;
	}

	installPanel.hidden = true;
};

const showInstallPanel = ({ copy, actionLabel, onAction, onDismiss }) => {
	if (!installPanel || !installCopyEl || !installActionEl || !installDismissEl) {
		return;
	}

	installCopyEl.textContent = copy;
	installActionEl.textContent = actionLabel;
	installPanel.hidden = false;

	installActionEl.onclick = onAction;
	installDismissEl.onclick = onDismiss;
};

const setupInstallExperience = () => {
	if (isStandaloneMode()) {
		hideInstallPanel();
		return;
	}

	const hasVisited = localStorage.getItem(VISIT_STORAGE_KEY) === 'true';
	if (!hasVisited) {
		localStorage.setItem(VISIT_STORAGE_KEY, 'true');
	}

	const installDismissed = localStorage.getItem(INSTALL_DISMISSED_KEY) === 'true';
	const iosGuideDismissed = localStorage.getItem(IOS_GUIDE_DISMISSED_KEY) === 'true';

	if (isIosSafari() && !hasVisited && !iosGuideDismissed) {
		showInstallPanel({
			copy: 'Su iPhone/iPad: tocca Condividi e scegli “Aggiungi a Home”.',
			actionLabel: 'Ho capito',
			onAction: () => {
				localStorage.setItem(IOS_GUIDE_DISMISSED_KEY, 'true');
				hideInstallPanel();
			},
			onDismiss: () => {
				localStorage.setItem(IOS_GUIDE_DISMISSED_KEY, 'true');
				hideInstallPanel();
			}
		});
		return;
	}

	if (!deferredInstallPrompt || hasVisited || installDismissed) {
		hideInstallPanel();
		return;
	}

	showInstallPanel({
		copy: 'Installa Motorsport Countdown per aprire gli eventi con un tap.',
		actionLabel: 'Installa ora',
		onAction: async () => {
			deferredInstallPrompt.prompt();
			const result = await deferredInstallPrompt.userChoice;
			if (result.outcome !== 'accepted') {
				localStorage.setItem(INSTALL_DISMISSED_KEY, 'true');
			}
			deferredInstallPrompt = null;
			hideInstallPanel();
		},
		onDismiss: () => {
			localStorage.setItem(INSTALL_DISMISSED_KEY, 'true');
			hideInstallPanel();
		}
	});
};

const setupInstallPromptEvents = () => {
	window.addEventListener('beforeinstallprompt', (event) => {
		event.preventDefault();
		deferredInstallPrompt = event;
		setupInstallExperience();
	});

	window.addEventListener('appinstalled', () => {
		deferredInstallPrompt = null;
		hideInstallPanel();
	});
};

const registerServiceWorker = async () => {
	if (!('serviceWorker' in navigator)) {
		return;
	}

	try {
		await navigator.serviceWorker.register('service-worker.js');
	} catch (error) {
		console.error('Service worker registration failed', error);
	}
};

setupTheme();
setupWidgetTabs();
setupWidgetStackResize();
setupMonthlyCalendarControls();
loadMonthlyCalendarData();
setInterval(() => {
	loadMonthlyCalendarData(true);
}, 600000);
loadNextEventCards();
setInterval(loadNextEventCards, 600000);
setupInstallPromptEvents();
setupInstallExperience();
registerServiceWorker();
