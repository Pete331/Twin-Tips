import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';

const Loader = () =>{
    return (
        <Box
            sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                minHeight: "100vh",
            }}
        >
            {/* CircularProgress renders role="progressbar" with nothing to
                announce, so a screen reader met a progress bar it could not
                name. This is the whole page while it loads. */}
            <CircularProgress color="secondary" aria-label="Loading" />
        </Box>
    )
}

export default Loader;