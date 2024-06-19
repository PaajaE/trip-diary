import React, { useState } from 'react';
import { supabase } from '../supabaseClient'; // Ensure the import path is correct

interface SupabaseError {
  message: string;
  status: number;
  // Add other fields if necessary
}

/**
 * Component for handling user sign-in.
 */
const SignIn: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  /**
   * Handles form submission to sign in a user with email and password.
   * @param e - The event object from form submission.
   */
  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      console.log({ data })

      if (error) throw error;
      setMessage('Sign in successful!');
    } catch (err) {
      const error = err as SupabaseError;
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="space-y-6" onSubmit={handleSignIn}>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
        <input
          type="email"
          id="email"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
        <input
          type="password"
          id="password"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <button
        type="submit"
        className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${loading ? 'bg-gray-400' : 'bg-blue-500 hover:bg-blue-700'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
        disabled={loading}
      >
        {loading ? 'Loading...' : 'Sign In'}
      </button>
      {message && (
        <div className={`mt-4 text-center p-2 text-sm ${message.startsWith('Sign in successful') ? 'text-green-500' : 'text-red-500'}`}>
          {message}
        </div>
      )}
    </form>
  );
};

export default SignIn;
