import CircularProgress from '@mui/material/CircularProgress';
import useStyles from './style';

const Loader = () =>{
    const classes = useStyles();

    return (
        <div className={classes.progress}>
            {/* CircularProgress renders role="progressbar" with nothing to
                announce, so a screen reader met a progress bar it could not
                name. This is the whole page while it loads. */}
            <CircularProgress color="secondary" aria-label="Loading" />
        </div>
    )
}

export default Loader;