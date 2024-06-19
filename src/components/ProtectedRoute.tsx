import { User } from '@supabase/supabase-js';
import React from 'react';
import { Navigate } from 'react-router-dom';

const ProtectedRoute: React.FC<{ user: User | null, children: React.ReactNode }> = ({ user, children }) => {
    if (!user) {
        return <Navigate to="/signin" replace />;
    }

    return <>{children}</>;
};

export default ProtectedRoute;
