import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, Link } from 'react-router-dom';
import { supabase } from './supabaseClient';  // Ensure correct import path
import Register from './components/Register';
import Login from './components/Login';
import CreateTrip from './components/CreateTrip';
import AddSpeciesObservation from './components/AddSpeciesObservation';

const App: React.FC = (): JSX.Element => {
  / Initialize user from the current session
  const [user, setUser] = useState(supabase.auth.session()?.user || null);

  useEffect(() => {
    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);  // Update user state based on session info
    });

    // Clean up the subscription when the component unmounts
    return () => {
      authListener.unsubscribe();
    };
  }, []);

  return (
    <Router>
      <div className="min-h-screen bg-gray-100 flex flex-col justify-center items-center">
        <nav className="mb-8">
          <Link to="/register" className="text-blue-500 hover:underline mr-4">Register</Link>
          <Link to="/login" className="text-blue-500 hover:underline mr-4">Login</Link>
          {user && (
            <>
              <Link to="/create-trip" className="text-blue-500 hover:underline mr-4">Create Trip</Link>
              <Link to="/add-observation" className="text-blue-500 hover:underline">Add Observation</Link>
            </>
          )}
        </nav>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/create-trip" element={user ? <CreateTrip /> : <Navigate to="/login" />} />
          <Route path="/add-observation/:tripId" element={user ? <AddSpeciesObservation /> : <Navigate to="/login" />} />
          <Route path="*" element={
            <div className="text-center">
              <h1 className="text-3xl font-bold mb-4">Welcome to Trip Map Diary</h1>
              <p>Select an option above to get started.</p>
            </div>
          } />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
