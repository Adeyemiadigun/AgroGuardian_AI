declare global {
  namespace Express {
    interface User {
      _id?: any;
      userId?: string;
      email?: string;
      role?: string;
      firstName?: string;
      lastName?: string;
      profilePicture?: string;
      authProvider?: string;
      isEmailVerified?: boolean;
      [key: string]: any;
    }
  }
}
