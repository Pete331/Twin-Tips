import React from "react";
import { withStyles } from '../../utils/muiStyles';
import { Menu } from "@mui/material";
import IconButton from "@mui/material/IconButton";
import MenuIcon from "@mui/icons-material/Menu";

const styles = theme => ({
  buttonCollapse: {
    [theme.breakpoints.up("sm")]: {
      display: "none"
    },
    margin: "10px",
    boxShadow: "none"
  }
});

class ButtonAppBarCollapse extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      anchorEl: null
    };
    this.handleMenu = this.handleMenu.bind(this);
  }
  handleMenu = event => {
    this.setState({ anchorEl: event.currentTarget });
  };
  handleClose = () => {
    this.setState({ anchorEl: null });
  };
  render() {
    const { classes } = this.props;
    const { anchorEl } = this.state;
    const open = Boolean(anchorEl);

    return (
      <div className={classes.buttonCollapse}>
        {/* The button's only content is an icon, so without a label a screen
            reader announces it as "button" and nothing more. aria-haspopup and
            aria-expanded say that it opens a menu, and whether that menu is
            open right now. */}
        <IconButton
          onClick={this.handleMenu}
          aria-label="Open navigation menu"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? "menu-appbar" : undefined}
        >
          <MenuIcon style={{color:"white"}}/>
        </IconButton>
        {/* onClose covers the backdrop and Escape, but not a click on an item
            - MUI leaves that to the item, because plenty of menus have items
            that should not dismiss them. Every item here navigates, so all of
            them should. MenuListProps catches the click as it bubbles up the
            list, which keeps the handler in one place rather than on each of
            the six items and whatever gets added later.

            slotProps.list, not MenuListProps - v9 dropped the MenuListProps
            prop entirely, and a prop MUI no longer reads fails silently: the
            handler simply never ran.

            Without it the menu stayed open on top of the page you had just
            navigated to. */}
        <Menu
          id="menu-appbar"
          anchorEl={anchorEl}
          anchorOrigin={{
            vertical: "top",
            horizontal: "right"
          }}
          transformOrigin={{
            vertical: "top",
            horizontal: "right"
          }}
          open={open}
          onClose={this.handleClose}
          slotProps={{ list: { onClick: this.handleClose } }}
        >
          {this.props.children}
        </Menu>
      </div>
    );
  }
}
export default withStyles(styles)(ButtonAppBarCollapse);
