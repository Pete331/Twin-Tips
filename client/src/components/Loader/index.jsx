import CircularProgress from '@mui/material/CircularProgress';
import useStyles from './style';

const Loader = () =>{
    const classes = useStyles();

    return (
        <div className={classes.progress}>
            <CircularProgress color="secondary" />
        </div>
    )
}

export default Loader;