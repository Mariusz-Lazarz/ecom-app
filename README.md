# Ecom App

A modern e-commerce application built with [Next.js](https://nextjs.org), featuring user authentication, product catalog, and shopping cart functionality.

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript
- **Styling**: Tailwind CSS 4, shadcn components
- **Database**: PostgreSQL
- **Authentication**: Auth.js (next-auth v5 beta)
- **Validation**: Zod
- **Testing**: Vitest, Playwright (E2E)

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL (or use Docker Compose)

### Setup

1. Clone the repository and install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env.local
```

3. Start PostgreSQL:
```bash
docker compose up -d
```

4. Run database migrations:
```bash
npm run db:migrate
```

5. Start the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run test` - Run unit tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:e2e` - Run end-to-end tests
- `npm run db:migrate` - Run database migrations

## Project Structure

```
src/
├── app/              # Next.js app directory and API routes
├── components/       # Reusable React components
│   ├── ui/          # Base UI components (input, button, etc.)
│   ├── auth/        # Authentication forms and components
│   └── home/        # Home page sections
├── lib/             # Utility functions and helpers
└── auth.ts          # Authentication configuration
```

## Contributing

See [AGENTS.md](./AGENTS.md) for agent-specific documentation.
