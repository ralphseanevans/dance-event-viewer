export type DashboardRole = "owner_admin" | "volunteer_admin" | "volunteer";

export interface DashboardProfile {
  id: string;
  email: string;
  display_name: string | null;
  role: DashboardRole;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DashboardEvent {
  id: string;
  event_key: string;
  name: string;
  style: string;
  event_type: "one_time" | "weekly_recurring" | "monthly_recurring" | "tentative";
  day_of_week: string | null;
  monthly_rule: string | null;
  exclude_monthly_rules: unknown;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  venue: string;
  state: string | null;
  cost: string | null;
  source_url: string | null;
  notes: string;
  last_confirmed: string;
  flyer_url: string | null;
  exclude_dates: unknown;
  record_status: "active" | "draft" | "cancelled" | "archived";
  version: number;
  created_at: string;
  updated_at: string;
  source_type?: string;
  source_detail?: string;
  source_skill?: string | null;
  first_seen?: string;
  added_to_calendar?: boolean;
  calendar_event_id?: string | null;
  in_wcs_list?: boolean;
  research_batch?: string | null;
  research_confidence?: string | null;
}

export interface EventAssignment {
  id: string;
  event_id: string;
  user_id: string;
  assigned_by: string | null;
  active: boolean;
  assigned_at: string;
  ended_at: string | null;
  note: string | null;
}

export interface ActivityEntry {
  id: string;
  entity_type: string;
  entity_id: string | null;
  event_id: string | null;
  action: string;
  actor_user_id: string | null;
  actor_kind: string;
  changed_fields: string[];
  request_id: string | null;
  occurred_at: string;
}

export interface SourceHistoryEntry {
  id: string;
  event_id: string;
  crawler_run_id: string | null;
  source_type: string;
  source_detail: string;
  source_url: string | null;
  source_native_id: string | null;
  source_skill: string | null;
  first_seen: string;
  last_seen: string;
  confidence: string | null;
  review_status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export type DashboardSection = "overview" | "events" | "people" | "assignments" | "activity" | "sources" | "crawlers" | "experimental";
