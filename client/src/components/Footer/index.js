import React from 'react';
import Typography from '@material-ui/core/Typography';
import { Link } from 'react-router-dom';

const Footer = () => {
    return (
        <footer>
            <Typography variant="body2" color="textSecondary" align="center">
                {'Copyright © '}
                <Link to="/">Your Website</Link>
                {` ${new Date().getFullYear()}.`}
            </Typography>
        </footer>
    )
}

export default Footer;