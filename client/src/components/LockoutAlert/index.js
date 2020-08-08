import React from "react";

const LockoutAlert = ({ lockout }) => {
  return (
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
  );
};

export default LockoutAlert;
