import React from "react";
import Tooltip from "@material-ui/core/Tooltip";

const LockoutAlert = ({ lockout }) => {
  return (
    <Tooltip
      title="If a lockout is enforced, the round has started and you can no longer enter or edit your tips."
      enterDelay={500}
      leaveDelay={200}
      placement="bottom-start"
    >
      <div>
        {lockout ? (
          <h4>
            Lockout:{" "}
            <span
              style={{
                color: "red",
              }}
            >
              Yes
            </span>
          </h4>
        ) : (
          <h4>
            Lockout:{" "}
            <span
              style={{
                color: "green",
              }}
            >
              No
            </span>
          </h4>
        )}
      </div>
    </Tooltip>
  );
};

export default LockoutAlert;
