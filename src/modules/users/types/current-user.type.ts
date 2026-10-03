import { Role } from "@prisma/client";

export interface TCurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}
