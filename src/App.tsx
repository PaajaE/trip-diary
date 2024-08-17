import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import './App.css'
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import SupabaseLogin from './components/SupabaseLogin'
// import SignUp from './components/SignUp'
import TripList from './components/TripList'
import Map from './components/Map'

import { type Session } from '@supabase/supabase-js'
import CreateTrip from './components/CreateTrip';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <Router>
    <div className="min-h-screen bg-gray-100 flex flex-col justify-center items-center">
      {!session ? (
        <Routes>
          <Route path="/signin" element={<SupabaseLogin />} />
          {/* <Route path="/signup" element={<SignUp />} /> */}
          <Route path="*" element={<Navigate to="/signin" replace />} />
        </Routes>
      ) : (
        <Routes>
          <Route path="/trips/add" element={<ProtectedRoute user={session.user}><CreateTrip session={session} /></ProtectedRoute>} />
          <Route path="/trips" element={<ProtectedRoute user={session.user}><TripList session={session} /></ProtectedRoute>} />
          <Route path="/map" element={<ProtectedRoute user={session.user}><Map session={session} /></ProtectedRoute>}  />
          <Route path="*" element={<Navigate to="/trips" replace />} />
        </Routes>
      )}
    </div>
  </Router>
  )
}

export default App