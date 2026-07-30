# KTIP Setup Guide

This guide will walk you through setting up and testing your KTIP application.

## ✅ What's Complete

Your KTIP application now includes:

### 1. **Complete Authentication System**
- Email/password authentication
- Google OAuth integration
- Microsoft OAuth integration
- Protected routes
- User profile management

### 2. **Layout Components**
- Responsive navbar with navigation
- User menu with profile dropdown
- Mobile-friendly hamburger menu
- Footer with links and social media
- Consistent layout wrapper

### 3. **Projects Module (Full CRUD)**
- ✅ Projects listing page with filters (category, phase, search)
- ✅ Project detail page
- ✅ Create project form with validation
- ✅ Project cards with beautiful design
- ✅ Database schema for projects, likes, and comments
- ✅ Custom hooks for project management
- ✅ Phase tracking (Concept → Prototype → Funding → Launch)

## 🚀 Setup Instructions

### Step 1: Set Up Supabase (15 minutes)

#### 1.1 Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in
3. Click **"New Project"**
4. Fill in details:
   - **Name**: `ktip-production`
   - **Database Password**: Generate and save securely
   - **Region**: `us-east-1` (or closest to Caribbean)
5. Wait ~2 minutes for provisioning

#### 1.2 Get Your Credentials

1. Go to **Settings** > **API**
2. Copy **Project URL** and **anon/public key**
3. Update `/Users/roystonemmanuel/Desktop/ktip/.env`:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

#### 1.3 Run Database Migrations

In your Supabase Dashboard, go to **SQL Editor** and run these migrations **in order**:

**First: Create Profiles Table**
```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  country TEXT,
  roles TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (TRUE);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
```

**Second: Create Projects Tables**

Copy and run the entire contents of:
```
/Users/roystonemmanuel/Desktop/ktip/supabase/migrations/001_create_projects_table.sql
```

This will create:
- `projects` table
- `project_likes` table
- `project_comments` table
- All necessary indexes
- Row Level Security policies
- Helper functions for likes and comments

#### 1.4 Enable OAuth Providers (Optional)

1. Go to **Authentication** > **Providers**
2. **Email** should already be enabled
3. **Google** (optional):
   - Create OAuth credentials at [Google Cloud Console](https://console.cloud.google.com)
   - Add redirect URI: `https://your-project-ref.supabase.co/auth/v1/callback`
   - Copy Client ID and Secret to Supabase
4. **Azure (Microsoft)** (optional):
   - Create app in [Azure Portal](https://portal.azure.com)
   - Add redirect URI
   - Copy credentials to Supabase

### Step 2: Configure Outbound Email

KTIP sends collaboration invitations, secondary-address verification emails,
and secondary-address password recovery emails through Resend.

Set these server-side variables in `.env` for local development and in the
Vercel project's environment variables for each deployed environment:

```env
RESEND_API_KEY=re_...
EMAIL_FROM=KTIP <admin@oecsinnovation.org>
SITE_URL=https://your-public-ktip-domain.example
```

- `EMAIL_FROM` must use a domain verified in the Resend dashboard.
- `SITE_URL` is the public origin placed in email links. Do not include a
  trailing slash. Local development can use `http://localhost:5173`.
- Restart `npm run dev` after changing `.env`; Vite loads these values when the
  development server starts.
- Add `${SITE_URL}/reset-password` to **Supabase > Authentication > URL
  Configuration > Redirect URLs**. Otherwise Supabase may replace the requested
  recovery redirect with the project's configured Site URL.

For reliable delivery, publish the records Resend provides for DKIM and its
`send` return-path subdomain. Also publish DMARC on the sending domain. The
current `oecsinnovation.org` configuration uses this monitoring policy:

```dns
Type  Name     Value
TXT   _dmarc   v=DMARC1; p=none; rua=mailto:dmarc@oecsinnovation.org; fo=1; adkim=r; aspf=r
```

Keep `p=none` while checking aggregate reports and confirming all legitimate
senders pass and align. Move to `p=quarantine`, then optionally `p=reject`, only
after that validation. The address in `rua` must be able to receive reports.

To verify a received message, inspect its original/raw headers and confirm:

```text
spf=pass
dkim=pass
dmarc=pass
```

Resend's `delivered` event means the receiving server accepted the message; it
does not guarantee inbox placement. New domains still need gradual, low-volume
sending and recipient engagement to establish reputation. Avoid test-shaped
content and localhost links when evaluating production inbox placement.

### Step 3: Start Development Server

```bash
cd ~/Desktop/ktip
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### Step 4: Test Authentication

1. Click **"Sign up"**
2. Create an account:
   - Name: Your Name
   - Email: test@example.com
   - Password: At least 6 characters
   - Role: Select any role (Student, Mentor, etc.)
3. You'll be redirected to the Discover page
4. Click your avatar in the navbar to see the user menu
5. Try signing out and logging back in

### Step 5: Test Projects Module

#### 5.1 Create a Project

1. Click **"Projects"** in the navbar
2. Click **"Create Project"** button
3. Fill in the form:
   - **Title**: "Smart Agriculture Platform"
   - **Description**: "An IoT solution for monitoring crop health using sensors and AI"
   - **Category**: Technology
   - **Phase**: Concept
   - **Hashtags**: Add "IoT", "agriculture", "AI"
   - **Visibility**: Keep "Public" checked
4. Click **"Create Project"**
5. You'll be redirected to your project's detail page

#### 5.2 View Projects

1. Go to **Projects** page
2. You should see your newly created project
3. Try the filters:
   - Search for keywords
   - Filter by category
   - Filter by phase
4. Click on a project card to view details

#### 5.3 Edit a Project (Future)

The edit functionality is referenced but not yet implemented. To add it, you'll need to:
- Create `EditProjectPage.tsx`
- Add a route at `/projects/:id/edit`
- Use the `useUpdateProject` hook

## 🎨 Features Available

### Navigation
- ✅ Responsive navbar
- ✅ Search bar (UI only, search works in filters)
- ✅ User menu with dropdown
- ✅ Mobile hamburger menu
- ✅ Footer with links

### Projects
- ✅ View all projects
- ✅ Filter by category, phase, search
- ✅ Create new projects
- ✅ View project details
- ✅ Beautiful project cards
- ✅ Phase badges
- ✅ Hashtag support
- ⏳ Edit projects (hook created, page needed)
- ⏳ Delete projects (hook created, UI needed)
- ⏳ Like projects (table created, UI needed)
- ⏳ Comment on projects (table created, UI needed)

### Coming Soon (Placeholders Added)
- 📅 Events Module
- 💰 Grants Module
- 💬 Messaging System
- 👥 Forums

## 📁 Project Structure

```
ktip/
├── src/
│   ├── components/
│   │   ├── ui/              # Base components (Button, Card, Input, etc.)
│   │   ├── layout/          # Navbar, Footer, MainLayout
│   │   ├── projects/        # ProjectCard
│   │   └── ProtectedRoute.tsx
│   ├── contexts/
│   │   └── AuthContext.tsx  # Authentication state
│   ├── hooks/
│   │   └── useProjects.ts   # Project CRUD hooks
│   ├── lib/
│   │   ├── supabase.ts      # Supabase client
│   │   ├── validation.ts    # Zod schemas
│   │   ├── utils.ts         # Helper functions
│   │   └── constants.ts     # App constants
│   ├── pages/
│   │   ├── auth/            # Login, Signup
│   │   ├── discover/        # Home page
│   │   └── projects/        # Projects, ProjectDetail, CreateProject
│   ├── types/               # TypeScript types
│   └── App.tsx              # Routing
├── supabase/
│   └── migrations/
│       └── 001_create_projects_table.sql
├── .env                     # Your Supabase credentials
└── README.md
```

## 🔧 Customization

### Add Project Categories

Edit `/Users/roystonemmanuel/Desktop/ktip/src/lib/constants.ts`:

```typescript
export const PROJECT_CATEGORIES = [
  { value: 'technology', label: 'Technology', icon: '💻' },
  { value: 'your_category', label: 'Your Category', icon: '🎯' },
  // Add more...
]
```

### Change Color Theme

Edit `/Users/roystonemmanuel/Desktop/ktip/tailwind.config.js`:

```javascript
colors: {
  'ktip-ocean': {
    DEFAULT: '#0066cc',  // Change primary color
    // ...
  },
}
```

## 🐛 Troubleshooting

### Projects not loading?
- Check that you ran both SQL migrations (profiles, then projects)
- Verify your `.env` has correct Supabase credentials
- Check browser console for errors
- Ensure RLS policies are enabled

### Authentication errors?
- Verify Supabase project is active
- Check that email provider is enabled in Supabase
- Clear browser cookies and try again

### Can't create projects?
- Ensure you're logged in
- Check that `profiles` table has your user
- Verify RLS policies allow inserts

## 📊 Database Structure

### Tables Created

1. **profiles**
   - User profile information
   - Roles, bio, avatar, country

2. **projects**
   - Project details
   - Title, description, category, phase
   - Owner relationship to profiles

3. **project_likes**
   - Track which users liked which projects
   - Unique constraint (one like per user per project)

4. **project_comments**
   - Comments on projects
   - User can edit/delete own comments

## 🎯 Next Steps

### Immediate Enhancements

1. **Implement Project Editing**
   - Create `EditProjectPage.tsx`
   - Pre-fill form with existing data
   - Use `useUpdateProject` hook

2. **Add Likes Functionality**
   - Create `useLikes` hook
   - Add like button to project cards
   - Show like count

3. **Add Comments System**
   - Create comment components
   - Add comment form to project detail page
   - Show comment list with replies

### Build More Modules

4. **Events Module**
   - Similar structure to Projects
   - RSVP system
   - Calendar view

5. **Grants Module**
   - Grant directory
   - Application forms
   - Deadline tracking

6. **Real-Time Features**
   - Messaging with Supabase Realtime
   - Live project updates
   - Notifications

## 🎓 Learning Resources

- [SolidJS Documentation](https://www.solidjs.com/docs/latest)
- [Supabase Docs](https://supabase.com/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)

## 💡 Pro Tips

1. **Use Supabase Studio**: The visual interface makes it easy to view and edit data
2. **Check RLS Policies**: If queries fail, check RLS policies in Supabase
3. **Use TypeScript**: The types catch errors before runtime
4. **Test on Mobile**: The responsive design works great on mobile browsers
5. **Read the Code**: All components are well-documented and follow best practices

---

**Ready to innovate? Your KTIP platform is ready to connect Caribbean innovators! 🌊**
