import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

type Props = {
  children: React.ReactNode;
};

function AdminRoute({ children }: Props) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== "Administrator") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default AdminRoute;
