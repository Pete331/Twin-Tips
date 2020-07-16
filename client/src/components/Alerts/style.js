import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles((theme) => ({
    root: {
        width: '100%',
        '& > * + *': {
        marginTop: theme.spacing(2),
        }, 
    },
    topMargin: {
        marginTop: "1rem"
    }
}));

export default useStyles;