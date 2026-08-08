import { Box, Button, Tooltip, Typography } from "@mui/material";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";

export default function ExperimentalShortcut({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <Tooltip title="Experimental Dashboard — Live experimental test">
      <Button
        size="small"
        color="secondary"
        variant={active ? "contained" : "outlined"}
        startIcon={<ScienceOutlinedIcon />}
        onClick={onClick}
        aria-label="Open Experimental Dashboard. Status: Live experimental test."
        aria-current={active ? "page" : undefined}
        sx={{ minHeight: 44, px: { xs: 1, sm: 1.5 }, whiteSpace: "nowrap" }}
      >
        <Typography component="span" variant="button" sx={{ display: { xs: "none", sm: "inline" }, mr: 0.75 }}>
          Experimental
        </Typography>
        <Box component="span" aria-hidden="true" sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: "#42a5f5", mr: 0.6 }} />
        <Typography component="span" variant="caption" fontWeight={850}>Live</Typography>
      </Button>
    </Tooltip>
  );
}

