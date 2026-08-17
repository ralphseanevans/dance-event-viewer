(() => {
  'use strict';

  const calendar = document.querySelector('.calendar-sticky');
  const calendarMonth = document.getElementById('calendarMonth');
  const calendarDays = document.getElementById('calendarDays');
  const resultList = document.getElementById('resultList');

  if (!calendar || !calendarMonth || !calendarDays || !resultList) return;

  let displayedMonth = null;
  let manualNavigation = false;
  let applying = false;

  const controls = document.createElement('div');
  controls.className = 'calendar-month-controls';

  const previous = makeButton('previous', 'Previous month');
  const next = makeButton('next', 'Next month');
  controls.append(previous, next);
  calendar.appendChild(controls);

  previous.addEventListener('click', () => changeMonth(-1));
  next.addEventListener('click', () => changeMonth(1));

  function makeButton(direction, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `calendar-month-button calendar-month-${direction}`;
    button.setAttribute('aria-label', label);
    button.title = label;
    const triangle = document.createElement('span');
    triangle.className = 'calendar-month-triangle';
    triangle.setAttribute('aria-hidden', 'true');
    button.appendChild(triangle);
    return button;
  }

  function changeMonth(offset) {
    if (!displayedMonth) displayedMonth = monthFromCurrentCalendar() || new Date();
    displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + offset, 1);
    manualNavigation = true;
    renderDisplayedMonth();
  }

  function monthFromCurrentCalendar() {
    const text = calendarMonth.textContent.trim();
    if (!text) return null;
    const parsed = new Date(`${text} 1, 12:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), 1);
  }

  function activeDateString() {
    return resultList.querySelector('.date-block')?.dataset.date || null;
  }

  function eventDates() {
    return new Set(Array.from(resultList.querySelectorAll('.date-block[data-date]')).map((block) => block.dataset.date));
  }

  function isoDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  function renderDisplayedMonth() {
    if (!displayedMonth) return;
    applying = true;
    try {
      const year = displayedMonth.getFullYear();
      const month = displayedMonth.getMonth();
      const activeDate = activeDateString();
      const datesWithEvents = eventDates();

      calendarMonth.textContent = new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric'
      }).format(displayedMonth);

      calendarDays.replaceChildren();
      const firstDay = new Date(year, month, 1).getDay();
      for (let index = 0; index < firstDay; index += 1) {
        const blank = document.createElement('span');
        blank.className = 'calendar-blank';
        blank.setAttribute('aria-hidden', 'true');
        calendarDays.appendChild(blank);
      }

      for (let day = 1; day <= daysInMonth(year, month); day += 1) {
        const date = isoDate(new Date(year, month, day));
        const hasEvents = datesWithEvents.has(date);
        const cell = document.createElement(hasEvents ? 'button' : 'span');
        cell.className = `calendar-day${hasEvents ? ' has-events' : ''}${date === activeDate ? ' is-active' : ''}`;
        cell.textContent = String(day);

        if (hasEvents) {
          cell.type = 'button';
          cell.setAttribute('aria-label', `Jump to ${new Intl.DateTimeFormat('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
          }).format(new Date(`${date}T12:00:00`))}`);
          cell.addEventListener('click', () => {
            document.getElementById(`event-date-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        }
        calendarDays.appendChild(cell);
      }
    } finally {
      applying = false;
    }
  }

  const monthObserver = new MutationObserver(() => {
    if (applying) return;
    const appMonth = monthFromCurrentCalendar();
    if (!appMonth) return;

    if (!displayedMonth || !manualNavigation) {
      displayedMonth = appMonth;
      return;
    }

    // If scrolling moves to an event in another month, follow that event again.
    if (appMonth.getFullYear() !== displayedMonth.getFullYear() || appMonth.getMonth() !== displayedMonth.getMonth()) {
      const active = activeDateString();
      if (active && active.startsWith(`${appMonth.getFullYear()}-${String(appMonth.getMonth() + 1).padStart(2, '0')}`)) {
        displayedMonth = appMonth;
        manualNavigation = false;
      } else {
        requestAnimationFrame(renderDisplayedMonth);
      }
    }
  });

  monthObserver.observe(calendarMonth, { childList: true, characterData: true, subtree: true });

  const resultsObserver = new MutationObserver(() => {
    if (manualNavigation) requestAnimationFrame(renderDisplayedMonth);
    else displayedMonth = monthFromCurrentCalendar() || displayedMonth;
  });
  resultsObserver.observe(resultList, { childList: true, subtree: true });

  displayedMonth = monthFromCurrentCalendar();
})();
