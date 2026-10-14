# Pensacola keyword targets and public-page comparison

Reviewed 2026-10-13. These are the real Google autocomplete phrases supplied for
this task; this review does not claim a new autocomplete capture. Autocomplete
does not supply search volumes. **No volume data is available for these phrases**;
there are no volume estimates or ranking claims below.

Matches come from read-only inspection of `dance_events.json`, the generated
fallback, not new organizer verification or a live Supabase check. “Upcoming” uses
`SHARE_PAGES_TODAY=2026-10-13` and the share-page recurrence rules. Pensacola-area
matches require a venue/city mention of Pensacola, Gulf Breeze, Pace, Milton,
Cantonment, Navarre or Perdido. A series counts once. Targets below are generated
paths, not a claim that the pages are published yet.

| Google autocomplete phrase | Matching real listing keys and limits | Page to target |
|---|---|---|
| west coast swing pensacola | `bobe-st-studio-coaching-with-justin-tuesdays`; `west-coast-wednesdays-in-july-2026`; `wcs-garysusandance-thursdays-the-way-you-move`; `3rd-saturday-west-coast-swing-old-sacred-heart-2026-07-18`; `monday-night-west-coast-swing-dance-party-ragon-hall`; `wcs-social-dance-saturday-2026-10-24`; `ragon-hall-first-saturday-monthly-dance`; `wcs-social-dance-saturday-2026-11-28`. Eight upcoming listings; dates embedded in recurring keys do not determine whether a series has ended. | `/pensacola/west-coast-swing/` |
| line dancing pensacola tonight | No line dance occurrence on the review date (Tuesday). Recurring candidates on other days: `ttdgc-bayview-senior-center-monday`; `ttdgc-foe-pensacola-line-thursday`; `ttdgc-moonshine-saloon-thursday`; `wild-gregs-honky-tonk-line-lessons-thursdays`. | **no page: not enough listings** for that evening. `/pensacola/line-dancing/` targets the broader intent without same-evening copy. |
| line dancing pensacola adults | `wild-gregs-honky-tonk-line-lessons-thursdays` has a cost note mentioning no cover for 21+. `ttdgc-bayview-senior-center-monday` names a senior center but gives no admission ages. Other line dance listings do not specify ages; do not infer adult-only admission. | **no page: not enough listings** with explicit ages for an adults-specific page. Use `/pensacola/line-dancing/` for general discovery. |
| line dancing lessons pensacola fl | `ttdgc-bayview-senior-center-monday` names classes; `wild-gregs-honky-tonk-line-lessons-thursdays` names beginner/improver lessons. Related programming: `ttdgc-foe-pensacola-line-thursday` (beginner/advanced dances); `ttdgc-moonshine-saloon-thursday` (line dancing). | `/pensacola/line-dancing/`; direct lesson links go to the corresponding `/e/KEY.html` pages. |
| line dancing bar pensacola | `ttdgc-moonshine-saloon-thursday`; `wild-gregs-honky-tonk-line-lessons-thursdays`. Both name saloon venues. Archived, not upcoming: `eventbrite-line-dance-bree-mbc-2026-09-08` at Mathieson Brewing Company. | `/pensacola/line-dancing/`; no separate bar hub needed. |
| country dancing pensacola fl | `country-swing-lesson-social-thursday`; `ttdgc-wild-gregs-country-swing-friday`. Both list Country Swing. Archived, not upcoming: `good-ole-social-dance-country-night-2026-10-02`. Country Swing is not automatically line dancing. | `/pensacola/line-dancing/`, whose copy explicitly includes country/western listings and preserves each event's style. |
| line dancing near pensacola fl | `ttdgc-bayview-senior-center-monday`; `ttdgc-foe-pensacola-line-thursday`; `ttdgc-moonshine-saloon-thursday`; `wild-gregs-honky-tonk-line-lessons-thursdays`. All four venues mention Pensacola; no additional nearby-town line dance listings were found in this snapshot. | `/pensacola/line-dancing/` |
| bachata pensacola | Explicit upcoming bachata: `sensual-sundays-bachata-pensacola-coastals` in Cantonment. Supporting upcoming Latin: `latin-night-social-dance-2026-11-07`; `latin-night-social-dance-2026-12-05` in Pensacola. Those two do not explicitly promise bachata. Archived explicit bachata: `summer-salsa-bachata-social-2026-07-17`. | `/pensacola/latin-bachata/` as a combined hub; `/e/sensual-sundays-bachata-pensacola-coastals.html` for the explicit bachata series. **no page: not enough listings** for a bachata-only hub. |

The builder selects all three proposed hubs at this pinned date: West Coast Swing
(8), line dance/country (6), Latin/bachata (3). None is skipped. It skips and reports
any hub with fewer than two upcoming listings on later builds and removes only
that hub's generated `index.html` in the chosen output directory. Past one-time
events remain event-page archives, not hub-count support.

## Competitor comparison

Public pages were checked through web search/fetch and direct HTML title/navigation
inspection on 2026-10-13. Search-cached extracts can differ from current HTML;
these observations describe checked pages, not rankings. Competitor event details
were not copied into our data.

| Site and checked pages | Titles | Event details shown | Navigation and comparison |
|---|---|---|---|
| [Pensacola Swing Dance Society home](https://pensacolaswingdancesociety.com/) and [schedule](https://pensacolaswingdancesociety.com/schedule) | Home: “West Coast Swing Pensacola \| Pensacola Swing Dance Society”. Schedule: “West Coast Swing Schedule \| Pensacola Swing Dance Society&lt;br/&gt; — Pensacola Swing Dance Society” (raw HTML includes a literal `<br/>` in the title). | Schedule has calendar images and readable weekly Monday and first/third Saturday descriptions, venues, and Monday lesson/social hours. Home explains beginner options and lesson hours. | HTML navigation includes Schedule, FAQ, Blog, PCDA and special-event links. Strong local/style relevance and beginner guidance. Our hub adds dated links across sources; this schedule verifies only PSDS events. |
| [Somo Pensacola Latin Salsa Festival](https://somo.social/e/pensacola-latin-salsa-festival-926) and [home](https://somo.social/) | Search title: “Pensacola Latin Salsa Festival 2026: Havana Nights – 2026-09-26”. English home fetch: “Somo – Discover events near you”; direct HTML returned “Somo – Hitta något att göra nära dig”, so locale affects the title. | Festival search extract shows an ended-event notice, date, time range, Community Maritime Park, Eventbrite link, description, and a disclaimer that Somo is not the organizer. | Festival extract offers similar events and a map. Home has search, city discovery and date filters. Broad discovery; our hub groups local styles and recurring series explicitly. Direct festival fetch failed; its current HTML title and full navigation still need browser checking. |
| [World Dance Registry home](https://www.worlddanceregistry.com/) and [archived event example](https://www.worlddanceregistry.com/event.aspx?euid=8eca5c68-d2b2-4f5c-a92a-f7231d001401) | Home: “World Dance Registry”. Indexed example: “The Open 2019 - World Dance Registry”. | Home describes registration, scoring and event-management services. Archived example shows dates, styles, venue/address, host information and an event website. It is a 2019 Burbank event, not a Pensacola listing. | Home links to ticketing, scoring, reports, pricing and account access; example offers calendar addition and the host site. Useful event-detail structure. No Pensacola-specific public page was verified; local coverage and current event-page navigation still need checking. |
| [Seville Quarter home](https://sevillequarter.com/) and [event list](https://sevillequarter.com/events/list/) | Home: “Seville Quarter - The Gulf Coast’s Entertainment Destination since 1967”. Web-fetched list: “Seville QuarterEvents from September 6 - October 4”. | List shows dated start/end times, named rooms, descriptions and detail links for country and Latin nights among broader entertainment. Home presents a daily schedule. | List has keyword search, List/Week views and date selection. Site navigation includes Calendar, room pages, Admission, Membership and food/private-event links. Strong venue detail; our hub spans venues and selects by dance style. Cached title dates and listed dates differed; recheck the changing calendar title before relying on it. |

The practical opportunity is readable, dated, cross-venue local/style lists linking
to existing event pages and the full viewer. Tie lesson, age and bachata claims to
explicit listing fields. There is no evidence here for comparative traffic, keyword
volume or current ranking positions.
