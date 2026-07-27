# KTIP - Knowledge, Technology and Innovation Platform

> A comprehensive web application for fostering innovation and collaboration in the Caribbean region, built with SolidJS.

## 🎉 What's Been Built

This project foundation includes:

- ✅ **SolidJS** with TypeScript and Vite
- ✅ **Caribbean Modern Design System** with Tailwind CSS
- ✅ **Supabase Authentication** (Email/Password + Google/Microsoft OAuth)
- ✅ **Protected Routes** and Auth Context
- ✅ **Base UI Components** (Button, Input, Card, Badge, Modal, Textarea)
- ✅ **Login and Signup Pages** with form validation
- ✅ **Project Structure** organized for scalability

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd ktip
npm install
```

### 2. Set Up Supabase

#### Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in
3. Click **"New Project"**
4. Fill in project details:
   - Name: `ktip-production`
   - Database Password: (generate a strong password and save it)
   - Region: Choose closest to Caribbean (e.g., `us-east-1`)
5. Wait for project to provision (~2 minutes)

#### Get Your Credentials

1. Go to **Settings** > **API**
2. Copy your **Project URL** and **anon/public key**
3. Update `.env` file:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

#### Set Up Database Tables

In your Supabase Dashboard, go to **SQL Editor** and run this SQL:

```sql
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles table
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  bio text,
  avatar_url text,
  country text,
  roles text[] default array[]::text[],
  is_verified boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Enable Row Level Security
alter table profiles enable row level security;

-- RLS Policies for profiles
create policy "Public profiles are viewable by everyone"
  on profiles for select
  using (true);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert
  with check (auth.uid() = id);
```

#### Enable OAuth Providers

1. Go to **Authentication** > **Providers**
2. Enable **Email** provider (should be on by default)
3. Enable **Google** provider:
   - Follow the setup instructions to create Google OAuth credentials
   - Add authorized redirect URI: `https://your-project-ref.supabase.co/auth/v1/callback`
4. Enable **Azure** (Microsoft) provider:
   - Follow the setup instructions to create Azure AD app
   - Add authorized redirect URI

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 4. Test Authentication

1. Navigate to [http://localhost:5173](http://localhost:5173)
2. You'll be redirected to `/login`
3. Click **"Sign up"** to create an account
4. Fill in your details and select a role
5. After signing up, you'll be redirected to the Discover page
6. Try signing out and logging back in

## 📁 Project Structure

```
ktip/
├── src/
│   ├── assets/              # Static assets
│   ├── components/          # Reusable components
│   │   ├── ui/              # Base UI components (Button, Card, Input, etc.)
│   │   ├── layout/          # Layout components (to be built)
│   │   ├── projects/        # Project components (to be built)
│   │   └── ...
│   ├── contexts/            # SolidJS contexts
│   │   └── AuthContext.tsx  # Authentication state management
│   ├── lib/                 # Utilities
│   │   ├── supabase.ts      # Supabase client
│   │   ├── validation.ts    # Zod schemas for form validation
│   │   ├── utils.ts         # Utility functions
│   │   └── constants.ts     # App constants
│   ├── pages/               # Page components
│   │   ├── auth/            # Login and Signup pages
│   │   ├── discover/        # Discover/Home page
│   │   └── ...              # Other pages (to be built)
│   ├── types/               # TypeScript types
│   │   ├── database.ts      # Database types
│   │   └── index.ts         # Custom types
│   ├── App.tsx              # Root component with routing
│   ├── index.tsx            # Entry point
│   └── index.css            # Global styles
├── .env                     # Environment variables (update with your Supabase credentials)
├── .env.example             # Example environment variables
├── tailwind.config.js       # Tailwind configuration (Caribbean Modern design)
├── tsconfig.json            # TypeScript configuration
├── vite.config.ts           # Vite configuration
└── package.json             # Dependencies
```

## 🎨 Design System

KTIP uses a custom **Caribbean Modern** design system with:

- **Colors:**
  - Ocean Blue (`ktip-ocean`): Primary brand color
  - Tropical Green (`ktip-tropical`): Success and growth
  - Sand (`ktip-sand`): Neutral tones
  - Cream/Canvas (`ktip-cream`, `ktip-canvas`): Backgrounds

- **Typography:**
  - Display Font: **Sora** (headings)
  - Body Font: **Inter** (text)

- **Components:**
  - All components follow the Caribbean Modern aesthetic
  - Smooth animations and transitions
  - Accessible and responsive by default

## 🛠 Available Scripts

### Development

```bash
npm run dev       # Start development server
```

### Build

```bash
npm run build     # Build for production
npm run preview   # Preview production build
```

## 🔜 Next Steps

The foundation is complete! Here's what to build next:

### Phase 1: Core Features

1. **Projects Module**
   - Create project listing page
   - Project detail page with comments and likes
   - Create/edit project form
   - Set up projects table in Supabase

2. **Events Module**
   - Events listing page
   - Event detail with RSVP functionality
   - Create event form
   - Set up events table in Supabase

3. **Grants Module**
   - Grants directory
   - Grant detail page
   - Application form
   - Set up grants table in Supabase

### Phase 2: Advanced Features

4. **Real-Time Messaging**
   - Conversation list
   - Chat window with real-time updates
   - Set up messages tables in Supabase

5. **Collaborative Whiteboard**
   - Integrate tldraw
   - Real-time collaboration with Supabase Realtime
   - Attach whiteboards to projects

6. **Forums**
   - Discussion boards
   - Thread creation and replies
   - Moderation tools

### Phase 3: Polish & Launch

7. **Additional Features**
   - AI assistant (OpenAI integration)
   - Internationalization (i18n)
   - Progressive Web App (PWA) features
   - User profiles and settings

8. **Deployment**
   - Deploy to Vercel (configured)
   - Set up Supabase Edge Functions
   - Configure production environment

## 📚 Learn More

- [SolidJS Documentation](https://solidjs.com)
- [Supabase Documentation](https://supabase.com/docs)
- [Tailwind CSS](https://tailwindcss.com)
- [Vite](https://vitejs.dev)

## 🤝 Contributing

This is the foundation of KTIP. Continue building features following the plan in `/Users/roystonemmanuel/.claude/plans/typed-dancing-bunny.md`.

## 📄 License

Copyright © 2024-2025 OECS. All rights reserved.

---

**Built with ❤️ by the OECS Software Development Team**
