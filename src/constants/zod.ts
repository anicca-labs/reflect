import * as z from 'zod';

const PASSWORDS_MISMATCH_ERROR = 'Passwords do not match';

const baseSchema = {
  email: z.string().email('Please enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
};

const loginSchema = z.object({ ...baseSchema });

const signUpSchema = z
  .object({
    ...baseSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: PASSWORDS_MISMATCH_ERROR,
    path: ['confirmPassword'],
  });

const forgotPasswordSchema = z.object({ email: baseSchema.email });

const resetPasswordSchema = z
  .object({
    password: baseSchema.password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: PASSWORDS_MISMATCH_ERROR,
    path: ['confirmPassword'],
  });

export { loginSchema, signUpSchema, forgotPasswordSchema, resetPasswordSchema };
