import { createContext, useContext, useState, ReactNode } from "react";

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: string;
};

type AuthContextType = {
  user: AuthUser | null;
  isLoggedIn: boolean;
  username: string;
  login: (user: AuthUser) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const storedUser = localStorage.getItem("authUser");

    if (!storedUser) {
      return null;
    }

    try {
      return JSON.parse(storedUser) as AuthUser;
    } catch {
      localStorage.removeItem("authUser");
      return null;
    }
  });

  function login(user: AuthUser) {
    setUser(user);
    localStorage.setItem("authUser", JSON.stringify(user));
  }

  function logout() {
    setUser(null);
    localStorage.removeItem("authUser");
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoggedIn: user !== null,
        username: user?.username ?? "",
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth muss innerhalb von AuthProvider verwendet werden.",
    );
  }

  return context;
}
