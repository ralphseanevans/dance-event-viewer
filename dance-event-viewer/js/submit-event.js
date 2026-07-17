/* Submit an Event — client-side form logic.
 * Posts to a private Apps Script web app (SUBMIT_ENDPOINT below). Nothing here
 * ever touches dance_events.json/wcs_events.json — this just files a row in a
 * private "Submissions" sheet for Sean to review later.
 *
 * SUBMIT_ENDPOINT points at the deployed Apps Script web app (see
 * Submission_AppsScript_Code.gs in the Daily Operating System project,
 * Apps Script project "Dance Event Viewer - Submission Intake"). If it's
 * ever blank, the form explains that submissions aren't live yet rather
 * than silently failing.
 */
"use strict";

const SUBMIT_ENDPOINT = "https://script.google.com/macros/s/AKfycbwtL7anIfkIv7XBkR7AwDKKc13DBPrEghmcEEZiURWR_NLZI3s8CdayU6VQzelK9VMn6w/exec";

const MAX_FLYER_BYTES = 8 * 1024 * 1024; // 8MB — plenty for a phone photo, keeps requests reasonable

function $(sel, root) { return (root || document).querySelector(sel); }
function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

document.addEventListener("DOMContentLoaded", () => {
  const form = $("#submit-form");
  if (!form) return;

  const methodRadios = $all('input[name="intake_method"]');
  const sectionFlyer = $("#section-flyer");
  const sectionSourceForm = $("#section-source-form");
  const sectionSourceLink = $("#section-source-link");
  const sectionDetails = $("#section-details");

  function syncMethod() {
    const method = (methodRadios.find(r => r.checked) || {}).value || "flyer";
    sectionFlyer.hidden = method !== "flyer";
    sectionSourceForm.hidden = method !== "form";
    sectionSourceLink.hidden = method !== "link";
    // Flyer path: AI drafts the details, so the manual details section is optional/hidden —
    // submitter only needs to upload the image plus contact info.
    sectionDetails.hidden = method === "flyer";
  }
  methodRadios.forEach(r => r.addEventListener("change", syncMethod));
  syncMethod();

  // Style "Other" reveal.
  const styleSelect = $("#event-style");
  const styleOther = $("#event-style-other");
  styleSelect.addEventListener("change", () => {
    styleOther.hidden = styleSelect.value !== "Other";
    if (styleOther.hidden) styleOther.value = "";
  });

  // Schedule kind toggle (recurring vs one-time).
  const scheduleRecurring = $("#schedule-recurring");
  const scheduleOneTime = $("#schedule-one-time");
  $all('input[name="schedule_kind"]').forEach(r => r.addEventListener("change", () => {
    const kind = (document.querySelector('input[name="schedule_kind"]:checked') || {}).value;
    scheduleRecurring.hidden = kind !== "recurring";
    scheduleOneTime.hidden = kind !== "one_time";
  }));

  // Recurring sub-toggle (weekly / monthly-Nth-weekday / monthly-specific-date / biweekly).
  const recurWeekly = $("#recur-weekly");
  const recurMonthlyNth = $("#recur-monthly-nth");
  const recurMonthlyDate = $("#recur-monthly-date");
  const recurBiweekly = $("#recur-biweekly");
  $all('input[name="recur_kind"]').forEach(r => r.addEventListener("change", () => {
    const kind = (document.querySelector('input[name="recur_kind"]:checked') || {}).value;
    recurWeekly.hidden = kind !== "weekly";
    recurMonthlyNth.hidden = kind !== "monthly_nth";
    recurMonthlyDate.hidden = kind !== "monthly_date";
    recurBiweekly.hidden = kind !== "biweekly";
  }));

  // Flyer preview.
  const flyerInput = $("#flyer-input");
  const flyerPreview = $("#flyer-preview");
  const flyerButton = $("#flyer-button");
  const flyerButtonText = $("#flyer-button-text");
  const FLYER_BTN_DEFAULT = flyerButtonText ? flyerButtonText.textContent : "";
  function resetFlyerButton() {
    if (flyerButtonText) flyerButtonText.textContent = FLYER_BTN_DEFAULT;
    if (flyerButton) flyerButton.classList.remove("has-file");
  }
  let flyerDataUrl = null;
  flyerInput.addEventListener("change", () => {
    const file = flyerInput.files && flyerInput.files[0];
    flyerDataUrl = null;
    if (!file) { flyerPreview.hidden = true; resetFlyerButton(); return; }
    if (file.size > MAX_FLYER_BYTES) {
      setStatus("That photo is a bit large — try a smaller image (under 8MB).", true);
      flyerInput.value = "";
      flyerPreview.hidden = true;
      resetFlyerButton();
      return;
    }
    if (flyerButtonText) flyerButtonText.textContent = file.name;
    if (flyerButton) flyerButton.classList.add("has-file");
    const reader = new FileReader();
    reader.onload = () => {
      flyerDataUrl = reader.result;
      flyerPreview.src = flyerDataUrl;
      flyerPreview.hidden = false;
    };
    reader.readAsDataURL(file);
  });

  const statusEl = $("#submit-status");
  function setStatus(msg, isError, isSuccess) {
    statusEl.textContent = msg;
    statusEl.classList.toggle("error", !!isError);
    statusEl.classList.toggle("success", !!isSuccess);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus("", false, false);

    const method = (document.querySelector('input[name="intake_method"]:checked') || {}).value || "flyer";
    const payload = { intake_method: method, action: "submit" };

    // Contact info (always required: at least one of name/email/phone).
    payload.contact_name = $("#contact-name").value.trim();
    payload.contact_email = $("#contact-email").value.trim();
    payload.contact_phone = $("#contact-phone").value.trim();
    if (!payload.contact_name && !payload.contact_email && !payload.contact_phone) {
      setStatus("Please give us at least one way to reach you (name, email, or phone).", true);
      return;
    }

    if (method === "flyer") {
      if (!flyerInput.files || !flyerInput.files[0]) {
        setStatus("Please choose a flyer photo to upload.", true);
        return;
      }
      if (!flyerDataUrl) {
        setStatus("Still reading that photo — try again in a moment.", true);
        return;
      }
      const [, mimeAndB64] = flyerDataUrl.split("data:");
      const mime = mimeAndB64.split(";")[0];
      const base64 = flyerDataUrl.split(",")[1];
      payload.flyer_mime = mime;
      payload.flyer_base64 = base64;
    } else {
      // Form / Link paths share the same required details.
      if (method === "form") {
        payload.source_note = $("#source-note").value.trim();
        if (!payload.source_note) {
          setStatus("Please tell us how you know about this event.", true);
          return;
        }
      } else {
        payload.source_url = $("#source-url").value.trim();
        if (!/^https?:\/\//i.test(payload.source_url)) {
          setStatus("Please paste a valid link (starting with http:// or https://).", true);
          return;
        }
      }

      payload.name = $("#event-name").value.trim();
      payload.style = styleSelect.value;
      payload.style_other = styleOther.hidden ? "" : styleOther.value.trim();
      const address = $("#event-address").value.trim();
      const building = $("#event-building").value.trim();
      payload.venue = building ? `${building}, ${address}` : address;
      payload.organizer = $("#event-organizer").value.trim();
      payload.cost = $("#event-cost").value.trim();

      if (!payload.name) { setStatus("Please enter the event name.", true); return; }
      if (!payload.style) { setStatus("Please choose a style of dance.", true); return; }
      if (payload.style === "Other" && !payload.style_other) {
        setStatus("Please describe the style since you chose “Other.”", true); return;
      }
      if (!address) { setStatus("Please enter the event's address.", true); return; }

      const scheduleKind = (document.querySelector('input[name="schedule_kind"]:checked') || {}).value;
      if (scheduleKind === "recurring") {
        const recurKind = (document.querySelector('input[name="recur_kind"]:checked') || {}).value;
        if (recurKind === "weekly") {
          payload.type = "weekly_recurring";
          payload.day_of_week = $("#day-of-week").value;
          if (!payload.day_of_week) { setStatus("Please choose a day of the week.", true); return; }
        } else if (recurKind === "monthly_nth") {
          payload.type = "monthly_recurring";
          const nth = $("#monthly-nth").value, dow = $("#monthly-dow").value;
          payload.monthly_rule = `${nth} ${dow}`;
        } else if (recurKind === "monthly_date") {
          payload.type = "monthly_recurring";
          const dom = $("#monthly-date").value;
          const domNum = Number(dom);
          if (!dom || !Number.isInteger(domNum) || domNum < 1 || domNum > 31) {
            setStatus("Please enter a day of the month (1-31).", true); return;
          }
          payload.monthly_rule = String(domNum);
        } else {
          // biweekly
          payload.type = "biweekly_recurring";
          payload.day_of_week = $("#biweekly-dow").value;
          payload.start_date = $("#biweekly-anchor-date").value;
          if (!payload.day_of_week) { setStatus("Please choose a day of the week.", true); return; }
          if (!payload.start_date) {
            setStatus("Please give us one date this actually happens, so we know which weeks.", true); return;
          }
        }
        payload.start_time = $("#recur-start-time").value;
        payload.end_time = $("#recur-end-time").value;
        if (!payload.start_time) { setStatus("Please enter a start time.", true); return; }
      } else {
        payload.type = "one_time";
        payload.start_date = $("#event-date").value;
        if (!payload.start_date) { setStatus("Please choose a date.", true); return; }
        payload.start_time = $("#onetime-start-time").value;
        payload.end_time = $("#onetime-end-time").value;
        if (!payload.start_time) { setStatus("Please enter a start time.", true); return; }
      }
    }

    if (!SUBMIT_ENDPOINT) {
      setStatus("Submissions aren't quite live yet — check back soon! (Sean: SUBMIT_ENDPOINT isn't set.)", true);
      return;
    }

    const submitBtn = $("#submit-btn");
    submitBtn.disabled = true;
    setStatus("Sending…", false);
    try {
      const res = await fetch(SUBMIT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain" }, // avoids a CORS preflight against Apps Script
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (data && data.ok) {
        form.reset();
        flyerPreview.hidden = true;
        flyerDataUrl = null;
        resetFlyerButton();
        syncMethod();
        setStatus("Thanks! Your submission is in for review.", false, true);
      } else {
        setStatus((data && data.error) || "Something went wrong — please try again.", true);
      }
    } catch (err) {
      setStatus("Couldn't reach the submission service — please try again in a moment.", true);
    } finally {
      submitBtn.disabled = false;
    }
  });
});
