import { UserRole } from '../enums/role.enum';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: UserRole;
  staffBusinessId?: string | null;
  permissions?: string[];
}
