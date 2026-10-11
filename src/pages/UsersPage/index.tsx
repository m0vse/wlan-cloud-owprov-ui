import React from 'react';
import UserTable from './Table';
import { useAuth } from 'contexts/AuthProvider';

const UsersPage = () => {
  const { user } = useAuth();
  return user?.userRole === 'root' ? <UserTable /> : <p>User administration requires full administrator access.</p>;
};

export default UsersPage;
