(() => {
  'use strict';

  const DAY_ORDER = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const cityButtons = Array.from(document.querySelectorAll('[data-city]'));
  const results = document.getElementById('results');
  const resultList = document.getElementById('resultList');
  const stylePicker = document.getElementById('stylePicker');
  const styleChoices = document.getElementById('styleChoices');
  const calendarMonth = document.getElementById('calendarMonth');
  const calendarDays = document.getElementById('calendarDays');
  const selected = new Set();
  const selectedStyles = new Set();
  let events = [];
  let logoMap = { logos: {}, patterns: [] };
  let visibleDates = [];
  let activeDate = null;
  let dateObserver = null;
  let styleObserver = null;

  Promise.all([
    loadEvents(),
    fetch('../../logo-map.json').then(checkResponse).then((response) => response.json()).catch(() => ({ logos: {}, patterns: [] }))
  ]).then(([eventData, mapData]) => {
    events = Array.isArray(eventData) ? eventData : [];
    logoMap = mapData || logoMap;
    if (selected.size) render();
  }).catch(() => { events = []; });

  window.addEventListener('resize', updateStyleRouteOrigin);

  cityButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const city = button.dataset.city;
      if (selected.has(city)) selected.delete(city);
      else selected.add(city);
      render();
    });
  });

  function checkResponse(response) {
    if (!response.ok) throw new Error('Data unavailable');
    return response;
  }

  async function loadEvents() {
    const config = window.DANCE_EVENT_VIEWER_SUPABASE;
    if (config?.enabled && config.url && config.publishableKey && config.table) {
      try {
        const fields = 'key,name,style,type,day_of_week,monthly_rule,exclude_monthly_rules,exclude_dates,start_date,end_date,start_time,end_time,venue,state,cost,source_url,unverified,verified_on,flyer_url';
        const response = await fetch(`${config.url}/rest/v1/${config.table}?select=${fields}&order=key.asc&limit=1000`, {
          headers: { apikey: config.publishableKey },
          cache: 'no-store'
        });
        return await checkResponse(response).json();
      } catch (error) {
        console.warn('Supabase unavailable; using the generated fallback.', error);
      }
    }
    const response = await fetch('../../../dance_events.json', { cache: 'no-store' });
    const data = await checkResponse(response).json();
    return Array.isArray(data.events) ? data.events : [];
  }

  function render() {
    cityButtons.forEach((button) => button.setAttribute('aria-pressed', String(selected.has(button.dataset.city))));
    if (!selected.size) {
      selectedStyles.clear();
      stylePicker.hidden = true;
      styleChoices.replaceChildren();
      results.hidden = true;
      resultList.replaceChildren();
      calendarDays.replaceChildren();
      calendarMonth.textContent = '';
      if (dateObserver) dateObserver.disconnect();
      return;
    }

    const today = atMidnight(new Date());
    const decoratedForCities = events
      .filter((event) => Array.from(selected).some((city) => new RegExp(`\\b${city}\\b`, 'i').test(event.venue || '')))
      .map((event) => ({ event, date: nextOccurrence(event, today) }))
      .filter((item) => item.date)
      .sort((a, b) => a.date - b.date || (a.event.start_time || '').localeCompare(b.event.start_time || ''));

    const availableStyles = Array.from(new Set(decoratedForCities.map((item) => item.event.style).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    Array.from(selectedStyles).forEach((style) => { if (!availableStyles.includes(style)) selectedStyles.delete(style); });
    stylePicker.hidden = false;
    renderStyleChoices(availableStyles);
    updateStyleRouteOrigin();

    const decorated = selectedStyles.size
      ? decoratedForCities.filter((item) => selectedStyles.has(item.event.style))
      : decoratedForCities;

    const groups = new Map();
    decorated.forEach((item) => {
      const key = isoDate(item.date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item.event);
    });

    resultList.replaceChildren();
    const upcomingDays = Array.from(groups.entries()).slice(0, 10);
    visibleDates = upcomingDays.map(([date]) => date);
    if (!upcomingDays.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No upcoming dances are listed for this selection yet.';
      resultList.appendChild(empty);
    } else {
      upcomingDays.forEach(([date, dayEvents], index) => resultList.appendChild(makeDateBlock(date, dayEvents, index)));
      activeDate = upcomingDays[0][0];
      renderCalendar(activeDate);
      observeDateBlocks();
    }

    results.hidden = false;
    results.classList.remove('reveal');
    void results.offsetWidth;
    results.classList.add('reveal');
  }

  function renderStyleChoices(styles) {
    const existing = Array.from(styleChoices.querySelectorAll('.style-choice')).map((button) => button.dataset.style);
    if (existing.length === styles.length && existing.every((style, index) => style === styles[index])) {
      styleChoices.querySelectorAll('.style-choice').forEach((button) => button.setAttribute('aria-pressed', String(selectedStyles.has(button.dataset.style))));
      return;
    }

    if (styleObserver) styleObserver.disconnect();
    styleChoices.replaceChildren();
    styles.forEach((style, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'style-choice';
      button.dataset.style = style;
      button.style.setProperty('--style-index', index);
      button.setAttribute('aria-pressed', String(selectedStyles.has(style)));
      button.textContent = style;
      button.addEventListener('click', () => {
        if (selectedStyles.has(style)) selectedStyles.delete(style);
        else selectedStyles.add(style);
        render();
      });
      styleChoices.appendChild(button);
    });
    observeStyleChoices();
  }

  function updateStyleRouteOrigin() {
    const active = cityButtons.find((button) => selected.has(button.dataset.city));
    if (!active) return;
    const desired = active.offsetLeft + active.offsetWidth * .82;
    const run = window.innerWidth <= 560 ? 76 : 118;
    const maximum = Math.max(74, stylePicker.clientWidth - run - (window.innerWidth <= 560 ? 154 : 240));
    stylePicker.style.setProperty('--route-origin', `${Math.round(Math.min(desired, maximum))}px`);
  }

  function observeStyleChoices() {
    const buttons = Array.from(styleChoices.querySelectorAll('.style-choice'));
    if (!('IntersectionObserver' in window)) {
      buttons.forEach((button) => button.classList.add('is-visible'));
      return;
    }
    styleObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .12 });
    buttons.forEach((button) => styleObserver.observe(button));
  }

  function makeDateBlock(date, dayEvents, index) {
    const block = document.createElement('section');
    block.className = 'date-block';
    block.id = `event-date-${date}`;
    block.dataset.date = date;
    block.style.setProperty('--row-index', index);
    const heading = document.createElement('h2');
    heading.className = 'date-heading';
    heading.textContent = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${date}T12:00:00`));
    const grid = document.createElement('div');
    grid.className = 'day-events';
    dayEvents.forEach((event) => grid.appendChild(makeEventTile(event)));
    block.append(heading, grid);
    return block;
  }

  function renderCalendar(dateString) {
    const active = new Date(`${dateString}T12:00:00`);
    const year = active.getFullYear();
    const month = active.getMonth();
    calendarMonth.textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(active);
    calendarDays.replaceChildren();
    const firstDay = new Date(year, month, 1).getDay();
    for (let index = 0; index < firstDay; index++) {
      const blank = document.createElement('span');
      blank.className = 'calendar-blank';
      blank.setAttribute('aria-hidden', 'true');
      calendarDays.appendChild(blank);
    }
    const monthDays = daysInMonth(year, month);
    for (let day = 1; day <= monthDays; day++) {
      const date = isoDate(new Date(year, month, day));
      const hasEvents = visibleDates.includes(date);
      const cell = document.createElement(hasEvents ? 'button' : 'span');
      cell.className = `calendar-day${hasEvents ? ' has-events' : ''}${date === dateString ? ' is-active' : ''}`;
      cell.textContent = String(day);
      if (hasEvents) {
        cell.type = 'button';
        cell.setAttribute('aria-label', `Jump to ${new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(new Date(`${date}T12:00:00`))}`);
        cell.addEventListener('click', () => document.getElementById(`event-date-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }
      calendarDays.appendChild(cell);
    }
  }

  function observeDateBlocks() {
    if (dateObserver) dateObserver.disconnect();
    dateObserver = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (!visible.length) return;
      const date = visible[0].target.dataset.date;
      if (!date || date === activeDate) return;
      activeDate = date;
      renderCalendar(date);
    }, { rootMargin: '-10% 0px -70% 0px', threshold: 0 });
    resultList.querySelectorAll('.date-block').forEach((block) => dateObserver.observe(block));
  }

  function makeEventTile(event) {
    const tile = document.createElement('article');
    tile.className = 'event-tile';
    if (event.style) tile.dataset.style = event.style;
    const flyer = document.createElement('div');
    flyer.className = 'flyer-wrap';
    const flyerUrl = logoFor(event.key);
    if (flyerUrl) {
      const image = document.createElement('img');
      image.className = 'event-flyer';
      image.src = resolveLogo(flyerUrl);
      image.alt = `${event.name || 'Dance event'} flyer`;
      image.loading = 'lazy';
      flyer.appendChild(image);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'flyer-placeholder';
      const placeholderLabel = document.createElement('span');
      placeholderLabel.className = 'flyer-placeholder-label';
      placeholderLabel.textContent = event.style || 'Flyer not available';
      const uploadLink = document.createElement('a');
      uploadLink.className = 'flyer-upload-link';
      const uploadUrl = new URL('../../submit-event.html', window.location.href);
      if (event.key) uploadUrl.searchParams.set('event', event.key);
      uploadUrl.searchParams.set('purpose', 'flyer');
      uploadLink.href = uploadUrl.href;
      uploadLink.textContent = 'Upload a flyer';
      uploadLink.setAttribute('aria-label', `Upload a flyer for ${event.name || 'this dance event'}`);
      placeholder.append(placeholderLabel, uploadLink);
      flyer.appendChild(placeholder);
    }

    const name = document.createElement('h3');
    name.className = 'event-name';
    name.textContent = event.name || 'Dance event';

    const venue = splitVenue(event.venue || 'Location not listed');
    const venueBox = document.createElement('div');
    venueBox.className = 'venue-block';
    const venueName = document.createElement('p');
    venueName.className = 'venue-name';
    venueName.textContent = venue.name;
    const address = document.createElement('p');
    address.className = 'venue-address';
    address.textContent = venue.address || 'Address not listed';
    venueBox.append(venueName, address);

    const details = document.createElement('p');
    details.className = 'event-details';
    const time = document.createElement('strong');
    time.textContent = timeRange(event) || 'Time not listed';
    details.append(time);
    const extra = [event.style, event.cost].filter(Boolean).join(' · ');
    if (extra) details.append(document.createTextNode(` · ${extra}`));

    tile.append(flyer, name, venueBox, details);
    return tile;
  }

  function splitVenue(value) {
    const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
    return { name: parts.shift() || value, address: parts.join(', ') };
  }

  function logoFor(key) {
    if (!key) return null;
    if (logoMap.logos && logoMap.logos[key]) return logoMap.logos[key];
    const match = Array.isArray(logoMap.patterns) ? logoMap.patterns.find((item) => item && key.includes(item.contains)) : null;
    return match ? match.logo : null;
  }

  function resolveLogo(path) {
    if (/^https?:/i.test(path)) return path;
    return new URL(`../../${path}`, window.location.href).href;
  }

  function atMidnight(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
  function parseISO(value) {
    const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
  }
  function isoDate(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
  function daysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }
  function monthlyRuleParts(rule) {
    if (typeof rule !== 'string') return null;
    const match = /(first|1st|second|2nd|third|3rd|fourth|4th)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i.exec(rule);
    if (!match) return null;
    const nth = { first:1,'1st':1,second:2,'2nd':2,third:3,'3rd':3,fourth:4,'4th':4 }[match[1].toLowerCase()];
    return { nth, dow: DAY_ORDER.findIndex((day) => day.toLowerCase() === match[2].toLowerCase()) };
  }
  function monthlyDateOfMonth(rule) {
    const match = typeof rule === 'string' && /^\s*(\d{1,2})(?:st|nd|rd|th)?\s*$/i.exec(rule);
    const day = match ? Number(match[1]) : 0;
    return day >= 1 && day <= 31 ? day : null;
  }
  function isExcluded(event, date) {
    if (Array.isArray(event.exclude_dates) && event.exclude_dates.includes(isoDate(date))) return true;
    if (!Array.isArray(event.exclude_monthly_rules)) return false;
    const nth = Math.floor((date.getDate() - 1) / 7) + 1;
    return event.exclude_monthly_rules.some((rule) => { const parsed = monthlyRuleParts(rule); return parsed && parsed.dow === date.getDay() && parsed.nth === nth; });
  }
  function nextOccurrence(event, today) {
    const start = parseISO(event.start_date);
    const end = parseISO(event.end_date);
    if (event.type === 'one_time' || event.type === 'tentative') {
      if (!start || (end || start) < today) return null;
      return start >= today ? start : today;
    }
    if (event.type === 'weekly_recurring') {
      const target = DAY_ORDER.indexOf(event.day_of_week);
      if (target < 0) return null;
      let date = new Date(today);
      date.setDate(date.getDate() + ((target - date.getDay()) + 7) % 7);
      if (start && date < start) {
        date = new Date(start);
        date.setDate(date.getDate() + ((target - date.getDay()) + 7) % 7);
      }
      for (let guard=0; guard<60 && isExcluded(event,date); guard++) date.setDate(date.getDate()+7);
      return end && date > end ? null : date;
    }
    if (event.type === 'monthly_recurring') {
      const rule = monthlyRuleParts(event.monthly_rule);
      const calendarDay = rule ? null : monthlyDateOfMonth(event.monthly_rule);
      if (!rule && !calendarDay) return null;
      for (let offset=0; offset<3; offset++) {
        const first = new Date(today.getFullYear(), today.getMonth()+offset, 1);
        let date;
        if (rule) {
          date = new Date(first);
          date.setDate(1 + ((rule.dow-first.getDay())+7)%7 + (rule.nth-1)*7);
        } else {
          if (calendarDay > daysInMonth(first.getFullYear(),first.getMonth())) continue;
          date = new Date(first.getFullYear(),first.getMonth(),calendarDay);
        }
        if (date >= today && (!start || date >= start) && (!end || date <= end)) return date;
      }
    }
    return null;
  }
  function formatTime(value) {
    if (!value) return '';
    const [hour,minute] = value.split(':').map(Number);
    return `${hour%12||12}:${String(minute||0).padStart(2,'0')} ${hour>=12?'PM':'AM'}`;
  }
  function timeRange(event) {
    const start = formatTime(event.start_time), end = formatTime(event.end_time);
    return start && end ? `${start}–${end}` : start || end;
  }
})();
