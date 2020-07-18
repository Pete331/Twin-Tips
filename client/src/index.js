import React from 'react';
import ReactDOM from 'react-dom';
import App from './components/App';
import AuthProvider from '../src/utils/AuthContext';

ReactDOM.render(
  <React.Fragment>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.Fragment>,
document.getElementById('root')
);

// </React.StrictMode>, change fragment to this to do some checks