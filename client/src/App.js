import React from "react";
import { BrowserRouter as Router, Route } from "react-router-dom";
import "./App.css";
import Navigation from "./components/Navigation";
import Footer from "./components/Footer";
import Dashboard from "./pages/Dashboard";

function App() {
  return (
    <Router>
      <div>
        <Navigation />
        <Dashboard />
        <Route exact path="/Dashboard" component={Dashboard} />
        <Footer />
      </div>
    </Router>
  );
}

export default App;
