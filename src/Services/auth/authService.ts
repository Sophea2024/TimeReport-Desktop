/*
export async function login(username: string, password: string) {
  const user = await window.database.getUserByUsername(username);

  if (!user) {
    return null;
  }

  if (user.password !== password) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  };
}*/

export async function login(username: string, password: string) {
  if (!username.trim() || !password) {
    return null;
  }

  return window.database.authenticateUser(username, password);
}
