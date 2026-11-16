export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  createdAt: string;
  phone?: string;
  birthDate?: string;
  profilePhoto?: string | null;
};
export type AuthDialogMode = "login" | "register";
