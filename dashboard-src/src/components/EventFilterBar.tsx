import { Box, Button, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from "@mui/material";

export type RelationshipFilter = "all" | "needs_review" | "unlinked" | "linked";
export type LocalArea = "Pensacola area" | "Mobile area";
export const PUBLIC_STYLE_ORDER = ["West Coast Swing", "Country Swing", "Ballroom", "Mixed", "Latin", "Argentine Tango", "Other"] as const;
export function publicStyleCategory(value: string | null | undefined): string {
  const style = value?.trim().toLowerCase();
  if (!style) return "Other";
  if (style === "salsa") return "Latin";
  return PUBLIC_STYLE_ORDER.find(category => category.toLowerCase() === style) ?? "Other";
}

interface EventFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  styles: string[];
  style: string;
  onStyleChange: (value: string) => void;
  states: string[];
  state: string;
  onStateChange: (value: string) => void;
  availableDaysOfWeek: string[];
  selectedDayOfWeek: string;
  onSelectedDayOfWeekChange: (value: string) => void;
  areas: Set<LocalArea>;
  onAreasChange: (value: Set<LocalArea>) => void;
  relationship: RelationshipFilter;
  onRelationshipChange: (value: RelationshipFilter) => void;
  counts: { all: number; needs_review: number; unlinked: number; linked: number };
  shown: number;
  onReset: () => void;
}

const chipSx = {
  minHeight: 34,
  px: 1.25,
  py: 0.5,
  borderRadius: 999,
  border: "1px solid",
  borderColor: "divider",
  color: "text.secondary",
  bgcolor: "transparent",
  whiteSpace: "nowrap",
  flex: "0 0 auto",
  minWidth: "max-content",
  fontWeight: 600,
  "&:hover": { borderColor: "secondary.main", bgcolor: "action.hover" },
  "&[aria-pressed='true']": { borderColor: "secondary.main", bgcolor: "rgba(57,216,192,.14)", color: "text.primary" },
  "&:focus-visible": { outline: "2px solid", outlineColor: "secondary.main", outlineOffset: 2 },
} as const;

function FilterChip({ label, pressed, onClick }: { label: string; pressed: boolean; onClick: () => void }) {
  return <Button size="small" variant="text" aria-pressed={pressed} onClick={onClick} sx={chipSx}>{pressed ? `✓ ${label}` : label}</Button>;
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "112px minmax(0, 1fr)" }, gap: { xs: 0.75, sm: 1.5 }, alignItems: "start" }}>
      <Typography variant="caption" color="text.secondary" fontWeight={800} sx={{ pt: { sm: 0.75 }, letterSpacing: ".04em", textTransform: "uppercase" }}>{label}</Typography>
      {children}
    </Box>
  );
}

const scrollRowSx = { display: "flex", gap: 1, flexWrap: { xs: "nowrap", md: "wrap" }, overflowX: { xs: "auto", md: "visible" }, pb: 0.5, minWidth: 0 } as const;

export default function EventFilterBar(props: EventFilterBarProps) {
  const toggleArea = (area: LocalArea) => {
    const next = new Set(props.areas);
    if (next.has(area)) next.delete(area); else next.add(area);
    props.onAreasChange(next);
  };
  return (
    <Stack spacing={1.25} mt={2} aria-label="Event filters">
      <TextField label="Search events" placeholder="Search by name, venue, or city…" value={props.search} onChange={event => props.onSearchChange(event.target.value)} fullWidth />
      <FilterRow label="Events"><Box sx={scrollRowSx} role="group" aria-label="Event relationship status">
        <FilterChip label={`All events (${props.counts.all})`} pressed={props.relationship === "all"} onClick={() => props.onRelationshipChange("all")} />
        <FilterChip label={`Needs review (${props.counts.needs_review})`} pressed={props.relationship === "needs_review"} onClick={() => props.onRelationshipChange("needs_review")} />
        <FilterChip label={`Unlinked (${props.counts.unlinked})`} pressed={props.relationship === "unlinked"} onClick={() => props.onRelationshipChange("unlinked")} />
        <FilterChip label={`Linked (${props.counts.linked})`} pressed={props.relationship === "linked"} onClick={() => props.onRelationshipChange("linked")} />
      </Box></FilterRow>
      <FilterRow label="Dance style"><Box sx={scrollRowSx} role="group" aria-label="Dance style">
        <FilterChip label="All styles" pressed={!props.style} onClick={() => props.onStyleChange("")} />
        {props.styles.map(value => <FilterChip key={value} label={value} pressed={props.style === value} onClick={() => props.onStyleChange(value)} />)}
      </Box></FilterRow>
      <FilterRow label="Day"><FormControl sx={{ minWidth: { xs: "100%", md: 180 } }}>
        <InputLabel id="experimental-day-filter-label">Day of week</InputLabel>
        <Select labelId="experimental-day-filter-label" label="Day of week" value={props.selectedDayOfWeek} onChange={event => props.onSelectedDayOfWeekChange(event.target.value)} sx={{ minHeight: 44, "& .MuiSelect-select": { minHeight: "44px !important", boxSizing: "border-box", display: "flex", alignItems: "center" } }}>
          <MenuItem value="">All days</MenuItem>{props.availableDaysOfWeek.map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}
        </Select>
      </FormControl></FilterRow>
      <FilterRow label="Location"><Stack direction={{ xs: "column", md: "row" }} gap={1.25} alignItems={{ md: "center" }}>
        <Box sx={scrollRowSx} role="group" aria-label="Local area">
          <FilterChip label="Everywhere" pressed={!props.areas.size} onClick={() => props.onAreasChange(new Set())} />
          <FilterChip label="Pensacola" pressed={props.areas.has("Pensacola area")} onClick={() => toggleArea("Pensacola area")} />
          <FilterChip label="Mobile" pressed={props.areas.has("Mobile area")} onClick={() => toggleArea("Mobile area")} />
        </Box>
        <FormControl sx={{ minWidth: { xs: "100%", md: 150 } }}>
          <InputLabel id="experimental-state-filter-label">State</InputLabel>
          <Select labelId="experimental-state-filter-label" label="State" value={props.state} onChange={event => props.onStateChange(event.target.value)} sx={{ minHeight: 44, "& .MuiSelect-select": { minHeight: "44px !important", boxSizing: "border-box", display: "flex", alignItems: "center" } }}>
            <MenuItem value="">All states</MenuItem>{props.states.map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}
          </Select>
        </FormControl>
      </Stack></FilterRow>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
        <Typography variant="caption" color="text.secondary">{`${props.shown} shown of ${props.counts.all} events`}</Typography>
        <Button size="small" onClick={props.onReset}>Reset</Button>
      </Stack>
    </Stack>
  );
}
