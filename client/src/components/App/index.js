import React from "react";
import { BrowserRouter, Switch, Route } from "react-router-dom";
import LoginPage from "../../pages/LoginPage";
import RegisterPage from "../../pages/RegisterPage";
import Dashboard from "../../pages/DashboardPage";
import NotFoundPage from "../../pages/NotFoundPage";
import PrivateRoute from "../../utils/PrivateRoute";
import ForgotPassword from "../../pages/ForgotPassword";
import ResetPassword from "../../pages/ResetPassword";

import "./global.css";
import TipsPage from "../../pages/TipsPage";

function App() {
  return (
    <>
      <BrowserRouter>
        <Switch>
          <Route exact path="/" component={LoginPage} />
          <Route path="/login" component={LoginPage} />
          <Route path="/register" component={RegisterPage} />
          <Route path="/forgot" component={ForgotPassword} />
          <PrivateRoute path="/tipspage" component={TipsPage} />
          <Route path="/reset/:token" component={ResetPassword} />
          <PrivateRoute path="/dashboard" component={Dashboard} />
          <Route path="*" component={NotFoundPage} />
        </Switch>
      </BrowserRouter>
    </>
  );
}

export default App;