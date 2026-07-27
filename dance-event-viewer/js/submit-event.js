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

const MAX_FLYER_BYTES = 8 * 1024 * 1024;        // 8MB per photo — plenty for a phone photo
const MAX_FLYER_COUNT = 5;                      // photos of the SAME flyer (front/back/close-ups)
const MAX_FLYER_TOTAL_BYTES = 20 * 1024 * 1024; // combined cap keeps the POST well under Apps Script limits

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
    // Highlight the active tab via a class too, so it doesn't rely on :has()
    // (unsupported on older mobile Safari) — the tab-vs-button confusion this
    // whole redesign fixes was precisely a missing active-tab indicator.
    methodRadios.forEach(r => {
      const tab = r.closest(".method-tab");
      if (tab) tab.classList.toggle("is-active", r.checked);
    });
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

  // Flyer photos (multiple allowed — all photos of the SAME flyer/event; they feed
  // one submission, with the first photo used as the event's card image).
  const flyerInput = $("#flyer-input");
  const flyerPreviews = $("#flyer-previews");
  const flyerButton = $("#flyer-button");
  const flyerButtonText = $("#flyer-button-text");
  const FLYER_BTN_DEFAULT = flyerButtonText ? flyerButtonText.textContent : "";
  function resetFlyerButton() {
    if (flyerButtonText) flyerButtonText.textContent = FLYER_BTN_DEFAULT;
    if (flyerButton) flyerButton.classList.remove("has-file");
  }
  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
  let flyerImages = []; // [{ mime, base64 }] in the order chosen
  function clearFlyerImages() {
    flyerImages = [];
    if (flyerPreviews) { flyerPreviews.hidden = true; flyerPreviews.innerHTML = ""; }
    resetFlyerButton();
  }
  flyerInput.addEventListener("change", async () => {
    const files = Array.from(flyerInput.files || []);
    clearFlyerImages();
    if (!files.length) return;
    if (files.length > MAX_FLYER_COUNT) {
      setStatus(`That's a lot of photos — please pick up to ${MAX_FLYER_COUNT} (of the same flyer).`, true);
      flyerInput.value = "";
      return;
    }
    let total = 0;
    for (const f of files) {
      total += f.size;
      if (f.size > MAX_FLYER_BYTES) {
        setStatus(`"${f.name}" is a bit large — each photo needs to be under 8MB.`, true);
        flyerInput.value = "";
        return;
      }
    }
    if (total > MAX_FLYER_TOTAL_BYTES) {
      setStatus("Those photos add up to too much — please keep the total under 20MB.", true);
      flyerInput.value = "";
      return;
    }
    try {
      const dataUrls = await Promise.all(files.map(readAsDataUrl));
      flyerImages = dataUrls.map((u) => ({
        mime: u.split("data:")[1].split(";")[0],
        base64: u.split(",")[1],
      }));
      if (flyerButtonText) {
        flyerButtonText.textContent = files.length === 1 ? files[0].name : `${files.length} photos selected`;
      }
      if (flyerButton) flyerButton.classList.add("has-file");
      if (flyerPreviews) {
        flyerPreviews.innerHTML = "";
        dataUrls.forEach((u, i) => {
          const img = document.createElement("img");
          img.src = u;
          img.alt = `Flyer photo ${i + 1} preview`;
          flyerPreviews.appendChild(img);
        });
        flyerPreviews.hidden = false;
      }
      setStatus("", false, false);
    } catch (readErr) {
      clearFlyerImages();
      flyerInput.value = "";
      setStatus("Couldn't read one of those photos — please try again.", true);
    }
  });

  // Optional flyer on the Fill Out Details path (single image; becomes the event's
  // card image — instantly for a trusted submitter, after approval otherwise).
  const formFlyerInput = $("#form-flyer-input");
  const formFlyerPreview = $("#form-flyer-preview");
  const formFlyerButton = $("#form-flyer-button");
  const formFlyerButtonText = $("#form-flyer-button-text");
  const FORM_FLYER_BTN_DEFAULT = formFlyerButtonText ? formFlyerButtonText.textContent : "";
  let formFlyerImage = null; // { mime, base64 } or null
  function clearFormFlyer() {
    formFlyerImage = null;
    if (formFlyerPreview) { formFlyerPreview.hidden = true; formFlyerPreview.removeAttribute("src"); }
    if (formFlyerButtonText) formFlyerButtonText.textContent = FORM_FLYER_BTN_DEFAULT;
    if (formFlyerButton) formFlyerButton.classList.remove("has-file");
  }
  if (formFlyerInput) formFlyerInput.addEventListener("change", async () => {
    const file = formFlyerInput.files && formFlyerInput.files[0];
    clearFormFlyer();
    if (!file) return;
    if (file.size > MAX_FLYER_BYTES) {
      setStatus("That flyer image is a bit large — try a smaller image (under 8MB).", true);
      formFlyerInput.value = "";
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      formFlyerImage = { mime: dataUrl.split("data:")[1].split(";")[0], base64: dataUrl.split(",")[1] };
      if (formFlyerButtonText) formFlyerButtonText.textContent = file.name;
      if (formFlyerButton) formFlyerButton.classList.add("has-file");
      if (formFlyerPreview) { formFlyerPreview.src = dataUrl; formFlyerPreview.hidden = false; }
      setStatus("", false, false);
    } catch (readErr) {
      clearFormFlyer();
      formFlyerInput.value = "";
      setStatus("Couldn't read that image — please try again.", true);
    }
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
        setStatus("Please choose at least one flyer photo to upload.", true);
        return;
      }
      if (!flyerImages.length) {
        setStatus("Still reading those photos — try again in a moment.", true);
        return;
      }
      // First photo keeps the original field names so an older backend still works;
      // any additional photos of the same flyer ride along in flyers_extra.
      payload.flyer_mime = flyerImages[0].mime;
      payload.flyer_base64 = flyerImages[0].base64;
      if (flyerImages.length > 1) {
        payload.flyers_extra = flyerImages.slice(1).map((f) => ({ mime: f.mime, base64: f.base64 }));
      }
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

      // Optional flyer image on the details path — becomes the event's card image.
      if (method === "form" && formFlyerImage) {
        payload.flyer_mime = formFlyerImage.mime;
        payload.flyer_base64 = formFlyerImage.base64;
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
        clearFlyerImages();
        clearFormFlyer();
        syncMethod();
        setStatus(data.published
          ? "Thanks! Your event is live — it'll show on the calendar in a minute or two."
          : "Thanks! Your submission is in for review.", false, true);
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
