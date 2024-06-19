import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import SignIn from './components/SignIn';
import SignUp from './components/SignUp';
import TripList from './components/TripList';
import { supabase } from './supabaseClient';  // Make sure the path is correct
import { User } from '@supabase/supabase-js';
import ProtectedRoute from './components/ProtectedRoute';
import CreateTrip from './components/CreateTrip';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      setLoading(true);
      const { data, error } = await supabase.auth.getUser();
      if (!error && data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
      setLoading(false);
    };

    checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <div>Loading...</div>; // Show a loading indicator until the user is fetched
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-100 flex flex-col justify-center items-center">
        {!user ? (
          <Routes>
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="*" element={<Navigate to="/signin" replace />} />
          </Routes>
        ) : (
          <Routes>
            <Route path="/trips/add" element={<CreateTrip />} />  // Assuming CreateTrip is the component for adding trips
            <Route path="/trips" element={<ProtectedRoute user={user}><TripList userId={user.id} /></ProtectedRoute>} />
            <Route path="/trips" element={<TripList userId={user.id} />} />
            <Route path="*" element={<Navigate to="/trips" replace />} />
          </Routes>
        )}
      </div>
    </Router>
  );
};

export default App;
