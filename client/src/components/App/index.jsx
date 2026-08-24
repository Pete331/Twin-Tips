import React from "react";
import { BrowserRouter, Switch, Route } from "react-router-dom";
import LoginPage from "../../pages/LoginPage";
import RegisterPage from "../../pages/RegisterPage";
import Dashboard from "../../pages/DashboardPage";
import NotFoundPage from "../../pages/NotFoundPage";
import PrivateRoute from "../../utils/PrivateRoute";
import ForgotPassword from "../../pages/ForgotPassword";
import ResetPassword from "../../pages/ResetPassword";
import "fontsource-roboto";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import "./global.css";
import TipsPage from "../../pages/TipsPage";
import RulesPage from "../../pages/RulesPage";
import SettingsPage from "../../pages/SettingsPage";
import Leaderboard from "../../pages/Leaderboard";

function App() {
  return (
    <div>
      <BrowserRouter>
        <Navbar />
        <Switch>
          <Route exact path="/" component={LoginPage} />
          <Route path="/login" component={LoginPage} />
          <Route path="/register" component={RegisterPage} />
          <Route path="/forgot" component={ForgotPassword} />
          <Route path="/rulespage" component={RulesPage} />
          <PrivateRoute path="/tipspage" component={TipsPage} />
          <PrivateRoute path="/leaderboard" component={Leaderboard} />
          <Route path="/reset/:token" component={ResetPassword} />
          <PrivateRoute path="/dashboard" component={Dashboard} />
          <PrivateRoute path="/settings" component={SettingsPage} />
          <Route path="*" component={NotFoundPage} />
        </Switch>
        <Footer />
      </BrowserRouter>
    </div>
  );
}

export default App;
