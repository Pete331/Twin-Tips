import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";

// Shown where content should have been, when it could not be fetched.
//
// The alternative it replaces was worse than nothing: a page whose data failed
// to arrive rendered its empty state, so the tips page announced "No games for
// that round." That is a statement about the round, and it was false - the
// round was fine, the server was unreachable. Someone reading it would go
// looking for the missing fixtures rather than trying again.
//
// In the flow rather than a toast. A toast is right for something you just
// did; this is about the thing you are looking at, and it has to sit where the
// thing should have been.
const LoadFailure = ({
  title = "That did not load",
  message,
  onRetry,
  action = "Try again",
}) => (
  <Alert
    severity="error"
    variant="outlined"
    // Politely: the page has already rendered around it, so this is new
    // information arriving rather than something to interrupt for.
    role="status"
    aria-live="polite"
    sx={{ my: 2 }}
    action={
      onRetry ? (
        <Button color="inherit" size="small" onClick={onRetry}>
          {action}
        </Button>
      ) : null
    }
  >
    <AlertTitle>{title}</AlertTitle>
    {message}
  </Alert>
);

export default LoadFailure;
