import React, { useEffect } from "react";
import API from "../utils/API";

function Dashboard() {
  //   useEffect(() => {
  //     getOdds();
  //   }, []);

  function getFixture() {
    // dispatch({ type: LOADING });
    API.getFixture()
      .then((results) => {
        console.log(results.data);
        // dispatch({
        //   type: UPDATE_POSTS,
        //   posts: results.data
        // });
      })
      .catch((err) => console.log(err));
  }

  return (
    <div>
      <button className="btn btn-primary" onClick={getFixture}>
        Download Fixtures
      </button>
      <button onClick={getFixture} className="btn btn-primary">
        Download Teams
      </button>
      <button className="btn btn-primary">Download Standings</button>
      <button className="btn btn-primary">Winning Teams</button>
      <button className="btn btn-primary">Fixtures with team details</button>
    </div>
  );
}
export default Dashboard;
