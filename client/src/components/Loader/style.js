import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles((theme) => ({
    progress: {
        display: "flex",
        justifyContent: 'center',
        alignItems:'center',
        minHeight: "100vh"
    },
}));

export default useStyles;