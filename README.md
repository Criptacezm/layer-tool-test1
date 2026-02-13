# Layer Web App

A collaborative web application with AI integration powered by Gemini API and Supabase.

## Features

- Real-time collaboration
- AI-powered chat and assistance
- Space management
- Document editing
- Theme support

## Environment Setup

1. Copy `.env.example` to `.env`
2. Fill in your environment variables:

```bash
# Gemini API Key
VITE_GEMINI_API_KEY=AIzaSyA27N-WdSixkBZRJl43BZtH6HTtR1BaCoo

# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

## Deployment

### Vercel Deployment

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Set environment variables in Vercel dashboard:
   - `VITE_GEMINI_API_KEY`: `AIzaSyA27N-WdSixkBZRJl43BZtH6HTtR1BaCoo`
   - `VITE_SUPABASE_URL`: Your Supabase URL
   - `VITE_SUPABASE_ANON_KEY`: Your Supabase anon key

4. Deploy - Vercel will automatically build and deploy

### Manual Git Setup

If Git is not installed, install it first:
- Windows: Download from [git-scm.com](https://git-scm.com/)
- macOS: `brew install git`
- Linux: `sudo apt-get install git`

Then run:
```bash
git init
git add .
git commit -m "Initial commit with secure API key setup"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

## Security Notes

- API keys are stored in environment variables
- `.env` file is included in `.gitignore` to prevent accidental exposure
- Use `.env.example` as a template for required variables
- Never commit actual API keys to version control

## Technology Stack

- Frontend: HTML, CSS, JavaScript (ES6+)
- Build Tool: Vite
- Database: Supabase
- AI: Google Gemini API
- Deployment: Vercel
