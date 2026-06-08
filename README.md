# PropFlow AI 🏠

> AI-powered property management SaaS — multi-tenant, real-time, production-grade.

![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?style=flat-square&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7.x-2D3748?style=flat-square&logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.x-000000?style=flat-square&logo=express&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?style=flat-square&logo=socket.io&logoColor=white)

---

## 📌 Overview

PropFlow AI is a full-stack property management platform built for landlords, property managers, and tenants. It features multi-tenant architecture, role-based access control (RBAC), real-time notifications via Socket.IO, AI-powered conversations, and support for both global (Stripe) and Bangladesh-local (bKash, Nagad, SSLCommerz) payment gateways.

---

## 🏗️ Project Structure

```
propflow-ai/
├── backend/          # Node.js + Express + Prisma API
└── frontend/         # React + Next.js (coming soon)
```

---

## ⚙️ Tech Stack

### Backend
| Layer | Technology |
|---|---|
| Runtime | Node.js 22.x |
| Language | TypeScript 5.x |
| Framework | Express 5.x |
| ORM | Prisma 7.x |
| Database | PostgreSQL (Neon cloud) |
| Auth | JWT (Access + Refresh tokens) |
| Real-time | Socket.IO 4.x |
| Validation | Zod 4.x |
| Email | Nodemailer (Gmail SMTP) |
| File Upload | Cloudinary |
| AI | Groq SDK (LLaMA 3) |
| Payments | Stripe, SSLCommerz, bKash, Nagad |
| Logging | Winston |
| Rate Limiting | express-rate-limit |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm 9+
- Neon PostgreSQL account (or any PostgreSQL instance)

### 1. Clone the repository

```bash
git clone https://github.com/saikatkumarmondal/propflow-ai.git
cd propflow-ai
```

### 2. Install backend dependencies

```bash
cd backend
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Fill in your values in `.env` (see [Environment Variables](#-environment-variables) below).

### 4. Push database schema

```bash
# Set DATABASE_URL in your shell first (Windows PowerShell)
$env:DATABASE_URL="your_neon_connection_string"
npx prisma db push
```

### 5. Generate Prisma client

```bash
npx prisma generate
```

### 6. Start development server

```bash
npm run dev
```

Server runs at `http://localhost:5000`

---

## 🔐 Environment Variables

Create `backend/.env` with the following:

```env
# App
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:5173

# Database (Neon PostgreSQL)
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"

# JWT
JWT_ACCESS_SECRET=your_access_secret_here
JWT_REFRESH_SECRET=your_refresh_secret_here
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Email (Nodemailer)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
EMAIL_FROM="PropFlow AI <noreply@propflow.ai>"

# Groq AI
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama3-8b-8192

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# SSLCommerz (Bangladesh)
SSLCOMMERZ_STORE_ID=your_store_id
SSLCOMMERZ_STORE_PASS=your_store_pass
SSLCOMMERZ_IS_LIVE=false

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

---

## 📡 API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/auth/register` | Register + create organization |
| GET | `/api/v1/auth/verify-email` | Verify email with token |
| POST | `/api/v1/auth/login` | Login |
| POST | `/api/v1/auth/refresh-token` | Refresh access token |
| POST | `/api/v1/auth/logout` | Logout |
| POST | `/api/v1/auth/forgot-password` | Send reset email |
| POST | `/api/v1/auth/reset-password` | Reset password |
| GET | `/api/v1/auth/me` | Get current user |

### Organization
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/organizations` | Get organization |
| PATCH | `/api/v1/organizations` | Update organization |
| GET | `/api/v1/organizations/members` | List members |
| POST | `/api/v1/organizations/members/invite` | Invite member |
| PATCH | `/api/v1/organizations/members/:userId/role` | Update member role |
| DELETE | `/api/v1/organizations/members/:userId` | Remove member |

### Properties
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/properties` | Create property |
| GET | `/api/v1/properties` | List properties |
| GET | `/api/v1/properties/vacancy-summary` | Vacancy stats |
| GET | `/api/v1/properties/:propertyId` | Get property |
| PATCH | `/api/v1/properties/:propertyId` | Update property |
| DELETE | `/api/v1/properties/:propertyId` | Delete property |

### Buildings & Floors
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/properties/:propertyId/buildings` | Create building |
| GET | `/api/v1/properties/:propertyId/buildings` | List buildings |
| PATCH | `/api/v1/properties/:propertyId/buildings/:buildingId` | Update building |
| DELETE | `/api/v1/properties/:propertyId/buildings/:buildingId` | Delete building |
| POST | `/api/v1/properties/:propertyId/buildings/:buildingId/floors` | Create floor |
| GET | `/api/v1/properties/:propertyId/buildings/:buildingId/floors` | List floors |
| DELETE | `/api/v1/properties/:propertyId/buildings/:buildingId/floors/:floorId` | Delete floor |

### Units
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/properties/:propertyId/units` | Create unit |
| GET | `/api/v1/properties/:propertyId/units` | List units (filter by `?status=VACANT`) |
| GET | `/api/v1/properties/:propertyId/units/:unitId` | Get unit |
| PATCH | `/api/v1/properties/:propertyId/units/:unitId` | Update unit |
| DELETE | `/api/v1/properties/:propertyId/units/:unitId` | Delete unit |

### Users
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/users/dashboard` | Dashboard stats |
| PATCH | `/api/v1/users/profile` | Update profile |
| PATCH | `/api/v1/users/change-password` | Change password |
| GET | `/api/v1/users/:userId` | Get user by ID |

---

## 👥 Roles & Permissions

| Role | Description |
|---|---|
| `SUPER_ADMIN` | Full system access |
| `PROPERTY_OWNER` | Manages their organization |
| `PROPERTY_MANAGER` | Manages properties and units |
| `LEASING_AGENT` | Handles leads and leases |
| `ACCOUNTANT` | Manages invoices and payments |
| `MAINTENANCE_MANAGER` | Manages maintenance requests |
| `TECHNICIAN` | Handles assigned maintenance tasks |
| `TENANT` | Views own lease and submits requests |

---

## 🗄️ Database Schema

Key models: `Organization` → `User` → `Property` → `Building` → `Floor` → `Unit` → `Tenant` → `Lease` → `Invoice` → `Payment` → `MaintenanceRequest` → `AiConversation` → `Notification` → `AuditLog`

Run Prisma Studio to explore:
```bash
npx prisma studio
```

---

## 📦 Scripts

```bash
npm run dev          # Start dev server with ts-node-dev
npm run build        # Compile TypeScript
npm run start        # Run compiled output
npm run db:push      # Push schema to database
npm run db:generate  # Generate Prisma client
npm run db:studio    # Open Prisma Studio
```

---

## 🛡️ Security

- JWT access tokens (15m) + refresh tokens (7d)
- bcrypt password hashing (12 rounds)
- Rate limiting on auth endpoints
- Helmet.js security headers
- CORS configured for frontend origin
- Zod input validation on all endpoints
- Audit logging for sensitive actions

---

## 📬 Contact

**Saikat Mondal** — Full Stack Developer
- GitHub: [@saikatkumarmondal](https://github.com/saikatkumarmondal)
- LinkedIn: [linkedin.com/in/saikatkumar421](https://linkedin.com/in/saikatkumar421/)
- Portfolio: [mondalsaikat.netlify.app](https://mondalsaikat.netlify.app)

---

> Built with ❤️ in Khulna, Bangladesh
