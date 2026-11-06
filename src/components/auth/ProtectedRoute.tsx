import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

type Props = {
  children: React.ReactNode;
  requiredRole?: string;
};

function ProtectedRoute({ children, requiredRole }: Props) {
  const { isLoggedIn, user } = useAuth();

  console.log("ProtectedRoute-Status:", {
    isLoggedIn,
    username: user?.username ?? null,
  });

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default ProtectedRoute;
