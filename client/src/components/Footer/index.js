import React from 'react';
import Typography from '@material-ui/core/Typography';
import { Link } from 'react-router-dom';

const Footer = () => {
    return (
        <footer style={{ backgroundColor: "deepskyblue", height:'50px' }}>
            <Typography variant="body1" color="textSecondary" align="center" >
                {'Copyright © '}
                <Link to="/">Twin Tips</Link>
                {` ${new Date().getFullYear()}.`}
            </Typography>
        </footer>
    )
}

export default Footer;