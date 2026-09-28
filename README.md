# PG Management System

Complete multi-role PG management web application with:

- Frontend: React + Vite + Tailwind CSS
- Backend: Hono on Cloudflare Workers
- DB: Neon PostgreSQL + Drizzle ORM
- File storage: Cloudflare R2 (Aadhaar + receipts)
- Notifications: Fast2SMS
- Auth: JWT with role-based access

## Project Structure

- backend
- frontend
- database

## Backend Coverage

Implemented API modules:

- Auth: login, register (superadmin), me, admin list, admin delete
- Rooms: get all, create, update, delete, available
- Persons: get all, get one, create, update, delete, upload Aadhaar
- Payments: get all, get by person, monthly list, generate, mark paid, upload receipt
- Notifications: logs, manual trigger
- Cron: monthly payment generation on 1st + daily reminder scheduler based on tenant payment_day

All responses follow:

- success: boolean
- data: any
- message: string

## Important Data Note

To support tenant-specific due dates (for example 6th or 25th), persons include:

- payment_day (1-28)

Reminders are sent relative to payment_day:

- day 0: reminder_1
- day +6: reminder_2
- day +14: reminder_3

## Database Migration

Run SQL from:

- database/migration.sql

### Neon Steps

1. Create a Neon project and copy connection string.
2. Open SQL Editor in Neon.
3. Paste full SQL from migration file and execute.
4. Insert an initial superadmin user (password must be bcrypt hash).

Example hash generation:

- Use an online bcrypt generator for testing or generate from Node script.

## Environment Setup

### Backend

1. Copy backend/.dev.vars.example to backend/.dev.vars
2. Fill all values.
3. Confirm backend/wrangler.toml vars are set for deploy.

### Frontend

1. Copy frontend/.env.example to frontend/.env
2. Update VITE_API_URL.

## Dependencies

### Backend dependencies

- @aws-sdk/client-s3
- @neondatabase/serverless
- bcryptjs
- drizzle-orm
- hono
- jose
- zod

### Backend devDependencies

- @cloudflare/workers-types
- drizzle-kit
- typescript
- wrangler

### Frontend dependencies

- axios
- clsx
- lucide-react
- react
- react-dom
- react-hot-toast
- react-router-dom

### Frontend devDependencies

- @types/react
- @types/react-dom
- @vitejs/plugin-react
- autoprefixer
- postcss
- tailwindcss
- typescript
- vite

## Run Locally

### 1) Backend

1. Open terminal in backend
2. Install packages:
   - npm install
3. Run worker locally:
   - npm run dev
4. API default local URL:
   - http://127.0.0.1:8787

### 2) Frontend

1. Open terminal in frontend
2. Install packages:
   - npm install
3. Start Vite:
   - npm run dev
4. Open URL shown by Vite (usually http://localhost:5173)

## Deploy Steps

### Backend to Cloudflare Workers

1. Authenticate Cloudflare:
   - npx wrangler login
2. Set production secrets (recommended):
   - npx wrangler secret put DATABASE_URL
   - npx wrangler secret put JWT_SECRET
   - npx wrangler secret put FAST2SMS_API_KEY
   - npx wrangler secret put R2_ACCESS_KEY_ID
   - npx wrangler secret put R2_SECRET_ACCESS_KEY
3. Configure non-secret vars in wrangler.toml (bucket name, public URL, account id, etc.)
4. Deploy:
   - npm run deploy
5. Save worker URL and set as frontend VITE_API_URL.

### Frontend deploy (Cloudflare Pages, Vercel, or Netlify)

1. Build frontend:
   - npm run build
2. Deploy dist folder using your target platform.
3. Ensure VITE_API_URL points to deployed worker API base + /api.

## Fast2SMS Testing

1. Create a Fast2SMS account and generate an API key.
2. Set FAST2SMS_API_KEY in backend secrets or backend/.dev.vars.
3. Store tenant phone as +91XXXXXXXXXX or 10-digit Indian mobile number.
4. Mark a payment paid to test confirmation SMS.
5. Use notifications trigger API for manual reminder testing.

## Route Summary

- POST /api/auth/login
- POST /api/auth/register
- GET /api/auth/me
- GET /api/auth/admins
- DELETE /api/auth/admins/:id

- GET /api/rooms
- POST /api/rooms
- PUT /api/rooms/:id
- DELETE /api/rooms/:id
- GET /api/rooms/available

- GET /api/persons
- POST /api/persons
- GET /api/persons/:id
- PUT /api/persons/:id
- DELETE /api/persons/:id
- POST /api/persons/:id/aadhaar

- GET /api/payments
- GET /api/payments/:personId
- POST /api/payments/generate
- PUT /api/payments/:id/mark-paid
- POST /api/payments/:id/receipt
- GET /api/payments/month/:month/:year

- GET /api/notifications/logs
- POST /api/notifications/trigger

## Security and Validation

Implemented:

- JWT required on all routes except login
- Role checks for admin/superadmin and strict superadmin routes
- Password hashing with bcryptjs
- File type and size validation for uploads
- CORS handling for frontend origin
- Proper try/catch error responses across routes

## Suggested First-Time Bootstrap

1. Run migration SQL in Neon.
2. Insert superadmin user in users table with bcrypt password.
3. Create rooms.
4. Add tenants with room + payment_day.
5. Generate monthly payments.
6. Mark payments as paid and upload receipts.
7. Verify reminder/confirmation SMS delivery in Fast2SMS logs.

To view this project live use this link 
https://pg-management-frontend-bhz.pages.dev/#/login
